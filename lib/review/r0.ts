import { r2 } from "../types";
import type { Ctx } from "./context";

export interface Reconciliation {
  account: string; name: string; month: string; statement_balance: number; ledger_balance: number;
  outstanding: { txnId: string; date: string; amount: number }[]; unmatched_bank: number; difference: number;
}

/** R0: ledger vs statement for every statement account at each month end. Baseline only; it raises no findings. */
export function reconcile(ctx: Ctx): Reconciliation[] {
  const out: Reconciliation[] = [];
  for (const account of [...new Set(ctx.books.bank.map((b) => b.account))]) {
    const sign = ctx.isLiability(account) ? -1 : 1; // card statements show charges as positive
    const stmt = ctx.books.bank.filter((b) => b.account === account);
    const opening = stmt.find((b) => b.description === "BEGINNING BALANCE");
    const rows = stmt.filter((b) => b !== opening).map((b) => ({ ...b, used: false }));
    const ledger = ctx.books.lines.filter((l) => l.account === account).map((l) => ({ l, amount: r2(sign * (l.debit - l.credit)), posted: "" }));
    const start = opening?.date ?? "";
    for (const x of ledger.filter((x) => x.l.date >= start)) { // one-to-one: same amount, posted within 7 days
      const hit = rows.find((r) => !r.used && Math.abs(r.amount - x.amount) < 0.005 && r.date >= x.l.date && (Date.parse(r.date) - Date.parse(x.l.date)) / 864e5 <= 7);
      if (hit) { hit.used = true; x.posted = hit.date; }
    }
    for (const month of [...ctx.prior, ctx.month]) {
      const me = `${month}-32`;
      const upTo = stmt.filter((b) => b.date < me);
      const statement_balance = upTo.length ? upTo[upTo.length - 1].balance : 0;
      const ledger_balance = r2(ledger.filter((x) => x.l.date < me).reduce((s, x) => s + x.amount, 0));
      const outstanding = ledger.filter((x) => x.l.date < me && x.l.date >= start && (!x.posted || x.posted >= me)).map((x) => ({ txnId: x.l.txnId, date: x.l.date, amount: x.amount }));
      const unmatched_bank = rows.filter((r) => !r.used && r.date < me).length;
      const difference = r2(statement_balance - (ledger_balance - outstanding.reduce((s, o) => s + o.amount, 0)));
      out.push({ account, name: ctx.name(account), month, statement_balance, ledger_balance, outstanding, unmatched_bank, difference });
    }
  }
  return out;
}
