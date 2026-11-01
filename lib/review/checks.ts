// Deterministic review checks C1–C9. Only these create findings; the LLM never does.
import { type Finding, type Line, r2 } from "../types";
import { type Ctx, monthName, PURCHASE_TYPES } from "./context";

type Draft = Omit<Finding, "id">;
const $ = (x: number) => `$${Math.abs(x).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const sev = (amt: number): Finding["severity"] => (amt >= 1000 ? "high" : amt >= 100 ? "medium" : "low");
const ym = (l: Line) => l.date.slice(0, 7);
const days = (a: string, b: string) => Math.abs(Date.parse(a) - Date.parse(b)) / 864e5;
const sum = (ls: Line[], f: (l: Line) => number) => r2(ls.reduce((s, l) => s + f(l), 0));
const ids = (ls: Line[]) => [...new Set(ls.map((l) => l.txnId))];

/** Expense lines of purchases (bills, checks, card charges): the side that says what was bought. */
const purchaseLines = (ctx: Ctx) => ctx.books.lines.filter((l) => ctx.inWindow(l) && PURCHASE_TYPES.includes(l.type) && l.name && l.debit > 0 && ctx.isExpense(l.account));

/** C5 Accrual: recurring vendor with no expense this month, and a next-month invoice whose service date is this month. */
export function c5(ctx: Ctx): Draft[] {
  const out: Draft[] = [];
  for (const bill of ctx.books.lines.filter((l) => ctx.afterEnd(l.date) && l.serviceDate.slice(0, 7) === ctx.month && l.debit > 0 && l.name)) {
    const vendorPL = ctx.books.lines.filter((l) => l.name === bill.name && ctx.isExpense(l.account) && l.debit > 0);
    const priorHits = ctx.prior.map((m) => vendorPL.filter((l) => ym(l) === m));
    if (priorHits.some((h) => !h.length) || vendorPL.some((l) => ym(l) === ctx.month)) continue;
    const expense = priorHits[priorHits.length - 1][0].account;
    out.push({
      check_id: "C5", title: `${monthName(ctx.month)} ${bill.name} usage was never accrued`, amount: bill.debit,
      accounts: [expense, ctx.rules.accrued_account], cited_txn_ids: [...ids(priorHits.flat()), bill.txnId], severity: sev(bill.debit), confidence: 0.9,
      facts: { vendor: bill.name, expense_account: expense, accrued_account: ctx.rules.accrued_account, invoice_num: bill.num, invoice_date: bill.date, service_date: bill.serviceDate, amount: bill.debit },
    });
  }
  return out;
}

/** C1 Missing recurring: vendor+account present every prior month at a similar amount, absent this month. */
export function c1(ctx: Ctx, skipVendors: string[] = []): Draft[] {
  const r = ctx.rules.c1_missing_recurring, out: Draft[] = [];
  const pl = ctx.books.lines.filter((l) => l.name && ctx.isExpense(l.account) && l.debit > 0 && !skipVendors.includes(l.name));
  for (const key of new Set(pl.map((l) => `${l.name}|${l.account}`))) {
    const [vendor, account] = key.split("|");
    const mine = pl.filter((l) => l.name === vendor && l.account === account);
    const totals = ctx.prior.map((m) => sum(mine.filter((l) => ym(l) === m), (l) => l.debit));
    const lo = Math.min(...totals), hi = Math.max(...totals);
    if (lo < r.min_monthly_amount || hi / lo - 1 > r.amount_tolerance || mine.some((l) => ym(l) === ctx.month)) continue;
    const expected = r2(totals.reduce((a, b) => a + b, 0) / totals.length);
    out.push({
      check_id: "C1", title: `${ctx.name(account)} for ${monthName(ctx.month)} was never recorded (${vendor})`, amount: expected,
      accounts: [account], cited_txn_ids: ids(mine.filter((l) => ctx.prior.includes(ym(l)))), severity: sev(expected), confidence: 0.85,
      facts: { vendor, expense_account: account, accrued_account: ctx.rules.accrued_account, expected_amount: expected },
    });
  }
  return out;
}

const norm = (s: string) => s.toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9 ]/g, "").split(/\s+/)
  .filter((t) => t && !["and", "co", "inc", "llc", "corp", "company", "the"].includes(t)).join("");

export function jaroWinkler(a: string, b: string): number {
  if (a === b) return 1;
  const win = Math.max(0, Math.floor(Math.max(a.length, b.length) / 2) - 1);
  const ma = new Array(a.length).fill(false), mb = new Array(b.length).fill(false);
  let m = 0;
  for (let i = 0; i < a.length; i++)
    for (let j = Math.max(0, i - win); j < Math.min(b.length, i + win + 1); j++)
      if (!mb[j] && a[i] === b[j]) { ma[i] = mb[j] = true; m++; break; }
  if (!m) return 0;
  let t = 0, k = 0;
  for (let i = 0; i < a.length; i++) if (ma[i]) { while (!mb[k]) k++; if (a[i] !== b[k++]) t++; }
  const jaro = (m / a.length + m / b.length + (m - t / 2) / m) / 3;
  let p = 0;
  while (p < 4 && a[p] === b[p]) p++;
  return jaro + p * 0.1 * (1 - jaro);
}

/** C2 Duplicate payment: similar vendor names AND (same invoice # OR same amount within the window, unless invoice #s differ). */
export function c2(ctx: Ctx): Draft[] {
  const r = ctx.rules.c2_duplicate_payment, out: Draft[] = [];
  const ls = purchaseLines(ctx);
  for (let i = 0; i < ls.length; i++) for (let j = i + 1; j < ls.length; j++) {
    const [a, b] = [ls[i], ls[j]];
    if (a.txnId === b.txnId || jaroWinkler(norm(a.name), norm(b.name)) < r.name_similarity) continue;
    const sameInv = !!a.num && a.num === b.num;
    const sameAmt = Math.abs(a.debit - b.debit) < 0.005 && days(a.date, b.date) <= r.window_days && !(a.num && b.num && a.num !== b.num);
    if (!sameInv && !sameAmt) continue;
    out.push({
      check_id: "C2", title: sameInv ? `Invoice ${a.num} paid twice under two vendor names` : `Same ${$(a.debit)} paid twice to near-identical vendors`,
      amount: b.debit, accounts: [b.account, ctx.rules.refund_account], cited_txn_ids: [a.txnId, b.txnId], severity: sev(b.debit), confidence: sameInv ? 0.95 : 0.8,
      facts: { vendor_a: a.name, vendor_b: b.name, invoice_num: a.num || b.num, expense_account: b.account, refund_account: ctx.rules.refund_account, amount: b.debit, days_apart: days(a.date, b.date) },
    });
  }
  return out;
}

/** C3 Wrong account: keyword rules, the vendor's usual account, and the capitalization threshold. */
export function c3(ctx: Ctx): Draft[] {
  const r = ctx.rules.c3_wrong_account, out: Draft[] = [];
  const all = purchaseLines(ctx);
  for (const l of all) {
    const text = `${l.name} ${l.memo}`, reasons: string[] = [];
    let expected = "";
    const kw = r.keyword_rules.find((k) => new RegExp(k.pattern, "i").test(text));
    if (kw && kw.account !== l.account) { expected = kw.account; reasons.push(`"${text.match(new RegExp(kw.pattern, "i"))![0]}" usually belongs in ${ctx.name(kw.account)}`); }
    const hist = all.filter((h) => h.name === l.name && h.txnId !== l.txnId);
    if (hist.length >= r.usual_min_history) {
      const counts = new Map<string, number>();
      for (const h of hist) counts.set(h.account, (counts.get(h.account) ?? 0) + 1);
      const [top, c] = [...counts].sort((x, y) => y[1] - x[1])[0];
      if (top !== l.account && c / hist.length >= r.usual_share) { expected ||= top; reasons.push(`${l.name} is coded to ${ctx.name(top)} on ${c} of ${hist.length} other lines`); }
    }
    if (r.capex_candidate_accounts.includes(l.account) && l.debit >= r.capitalization_threshold) {
      expected ||= ctx.rules.fixed_asset_account; reasons.push(`${$(l.debit)} is over the ${$(r.capitalization_threshold)} capitalization threshold`);
    }
    if (!expected) continue;
    out.push({
      check_id: "C3", title: `${l.name} ${$(l.debit)} coded to ${ctx.name(l.account)}; likely ${ctx.name(expected)}`, amount: l.debit,
      accounts: [l.account, expected], cited_txn_ids: [l.txnId], severity: sev(l.debit), confidence: reasons.length > 1 ? 0.9 : 0.75,
      facts: { vendor: l.name, current_account: l.account, expected_account: expected, reasons: reasons.join("; "), amount: l.debit, capitalization_threshold: r.capitalization_threshold },
    });
  }
  return out;
}

/** C4 Prepaid: a single large expense whose memo or vendor implies a term, expensed at once. */
export function c4(ctx: Ctx): Draft[] {
  const r = ctx.rules.c4_prepaid, out: Draft[] = [];
  for (const l of purchaseLines(ctx).filter((l) => l.debit >= r.min_amount)) {
    const termy = new RegExp(r.term_pattern, "i").test(l.memo) || r.insurer_vendors.includes(l.name);
    if (!termy || new RegExp(r.not_term_pattern, "i").test(l.memo)) continue;
    const term = r.default_term_months;
    const elapsed = (+ctx.month.slice(0, 4) - +l.date.slice(0, 4)) * 12 + +ctx.month.slice(5) - +l.date.slice(5, 7) + 1;
    const remaining = Math.max(0, term - elapsed), reclass = r2((l.debit * remaining) / term);
    if (!reclass) continue;
    out.push({
      check_id: "C4", title: `${l.name} ${$(l.debit)} term payment expensed at once in ${monthName(ym(l))}`, amount: reclass,
      accounts: [l.account, ctx.rules.prepaid_account], cited_txn_ids: [l.txnId], severity: sev(reclass), confidence: 0.85,
      facts: { vendor: l.name, expense_account: l.account, prepaid_account: ctx.rules.prepaid_account, paid: l.debit, term_months: term, months_elapsed: elapsed, months_remaining: remaining, monthly: r2(l.debit / term), reclass_amount: reclass },
    });
  }
  return out;
}

/** C6 Flux: P&L account vs prior-month average, ignoring lines other findings already cite and lines with a new explanatory memo. */
export function c6(ctx: Ctx, citedElsewhere: Set<string>): Draft[] {
  const r = ctx.rules.c6_flux, out: Draft[] = [];
  const pl = ctx.books.lines.filter((l) => ctx.isPL(l.account) && !citedElsewhere.has(l.txnId));
  const rev = (m: string) => sum(ctx.books.lines.filter((l) => ym(l) === m && ctx.isIncome(l.account)), ctx.nat);
  const revAvg = ctx.prior.reduce((s, m) => s + rev(m), 0) / ctx.prior.length;
  for (const account of new Set(pl.map((l) => l.account))) {
    const mine = pl.filter((l) => l.account === account);
    const avg = r2(ctx.prior.reduce((s, m) => s + sum(mine.filter((l) => ym(l) === m), ctx.nat), 0) / ctx.prior.length);
    const cur = mine.filter((l) => ym(l) === ctx.month);
    const current = sum(cur, ctx.nat);
    const priorMemos = new Set(mine.filter((l) => ctx.prior.includes(ym(l))).map((l) => l.memo));
    const explained = cur.filter((l) => l.memo && !priorMemos.has(l.memo));
    const delta = current - avg;
    const residual = r2(delta > 0 ? Math.max(0, delta - sum(explained, ctx.nat)) : delta);
    if (avg <= 0 || Math.abs(residual) < r.min_amount || Math.abs(residual) / avg < r.min_pct) continue;
    const pct = Math.round((residual / avg) * 100);
    out.push({
      check_id: "C6", title: `${ctx.name(account)} ${pct > 0 ? "up" : "down"} ${Math.abs(pct)}% vs ${ctx.prior.map(monthName).map((m) => m.slice(0, 3)).join("–")} average, unexplained`,
      amount: Math.abs(residual), accounts: [account, ...(residual < 0 && ctx.isExpense(account) ? [ctx.rules.accrued_account] : [])],
      cited_txn_ids: ids(residual > 0 ? cur.filter((l) => !explained.includes(l)) : cur), severity: sev(Math.abs(residual)), confidence: 0.6,
      facts: { account, prior_average: avg, current, residual, pct, revenue_change_pct: Math.round(((rev(ctx.month) - revAvg) / revAvg) * 100), accrued_account: ctx.rules.accrued_account },
    });
  }
  return out;
}

/** C7 Manual JE hygiene: round amount, suspense/misc account, missing memo (min_signals of 3). */
export function c7(ctx: Ctx): Draft[] {
  const r = ctx.rules.c7_manual_je, out: Draft[] = [];
  for (const [id, ls] of ctx.txns) {
    if (ls[0].type !== "Journal Entry" || !ctx.inWindow(ls[0])) continue;
    const amt = Math.max(...ls.map((l) => l.debit));
    const signals = [amt >= r.round_min && amt % 100 === 0 && "round amount", ls.some((l) => r.suspense_accounts.includes(l.account)) && "misc/suspense account", ls.every((l) => !l.memo) && "no memo"].filter(Boolean) as string[];
    if (signals.length < r.min_signals) continue;
    out.push({
      check_id: "C7", title: `${$(amt)} manual journal entry: ${signals.join(", ")}`, amount: amt, accounts: [...new Set(ls.map((l) => l.account))],
      cited_txn_ids: [id], severity: sev(amt), confidence: 0.7,
      facts: { signals: signals.join(", "), amount: amt, debit_account: ls.find((l) => l.debit)!.account, credit_account: ls.find((l) => l.credit)!.account },
    });
  }
  return out;
}

/** C8 Cut-off: a P&L line whose service date falls in a different month than its posting date. */
export function c8(ctx: Ctx): Draft[] {
  return ctx.books.lines.filter((l) => ctx.inWindow(l) && ctx.isPL(l.account) && l.serviceDate && l.serviceDate.slice(0, 7) !== ym(l)).map((l) => {
    const offset = ctx.txns.get(l.txnId)!.find((o) => o !== l)!.account;
    return {
      check_id: "C8", title: `${l.type} #${l.num} for ${l.serviceDate} recorded in ${monthName(ym(l))}`, amount: ctx.nat(l), accounts: [l.account, offset],
      cited_txn_ids: [l.txnId], severity: sev(ctx.nat(l)), confidence: 0.9,
      facts: { customer: l.name, account: l.account, offset_account: offset, posted: l.date, service_date: l.serviceDate, amount: ctx.nat(l) },
    };
  });
}

/** C9 Balance sanity: liabilities with a debit balance, assets with a credit balance, at period end. */
export function c9(ctx: Ctx): Draft[] {
  const out: Draft[] = [];
  for (const a of ctx.books.accounts) {
    const bal = ctx.balance(a.num);
    const wrong = (ctx.isLiability(a.num) && bal > 0.005) || (ctx.isAsset(a.num) && bal < -0.005);
    if (!wrong) continue;
    const moves = ctx.books.lines.filter((l) => l.account === a.num && ctx.inMonth(l) && (bal > 0 ? l.debit : l.credit) > 0);
    const credited = new Set(ctx.books.lines.filter((l) => l.account === a.num && (bal > 0 ? l.credit : l.debit) > 0).map((l) => l.name));
    const unsupported = moves.find((l) => l.name && !credited.has(l.name)); // e.g. a payment against an accrual that never existed
    const kw = unsupported && ctx.rules.c3_wrong_account.keyword_rules.find((k) => new RegExp(k.pattern, "i").test(`${unsupported.name} ${unsupported.memo}`));
    out.push({
      check_id: "C9", title: `${a.name} carries a ${bal > 0 ? "debit" : "credit"} balance of ${$(bal)}`, amount: Math.abs(bal),
      accounts: [a.num, ...(kw ? [kw.account] : [])], cited_txn_ids: ids(moves), severity: sev(Math.abs(bal)), confidence: 0.8,
      facts: { account: a.num, balance: Math.abs(bal), side: bal > 0 ? "debit" : "credit", ...(unsupported ? { unsupported_vendor: unsupported.name, unsupported_amount: Math.max(unsupported.debit, unsupported.credit), suggested_account: kw?.account ?? "" } : {}) },
    });
  }
  return out;
}
