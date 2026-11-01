import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";
import { type Account, type Books, type Line, ASSET_TYPES, LIABILITY_TYPES, PL_TYPES, r2 } from "../types";

export interface Rules {
  period: string; prior_months: number;
  accrued_account: string; prepaid_account: string; fixed_asset_account: string; refund_account: string;
  c1_missing_recurring: { amount_tolerance: number; min_monthly_amount: number };
  c2_duplicate_payment: { name_similarity: number; window_days: number };
  c3_wrong_account: { usual_min_history: number; usual_share: number; capitalization_threshold: number; capex_candidate_accounts: string[]; keyword_rules: { pattern: string; account: string }[] };
  c4_prepaid: { min_amount: number; term_pattern: string; not_term_pattern: string; insurer_vendors: string[]; default_term_months: number };
  c6_flux: { min_pct: number; min_amount: number };
  c7_manual_je: { round_min: number; suspense_accounts: string[]; min_signals: number };
}

export const loadRules = (): Rules => parse(readFileSync(join(process.cwd(), "config/review-rules.yaml"), "utf8"));

const addMonths = (m: string, k: number) => {
  const d = new Date(Date.UTC(+m.slice(0, 4), +m.slice(5, 7) - 1 + k, 1));
  return d.toISOString().slice(0, 7);
};
export const monthName = (m: string) => new Date(`${m}-01T00:00:00Z`).toLocaleString("en-US", { month: "long", timeZone: "UTC" });
export const PURCHASE_TYPES = ["Expense", "Check", "Credit Card Expense", "Bill"];

export function makeCtx(books: Books, rules: Rules) {
  const month = rules.period;
  const prior = Array.from({ length: rules.prior_months }, (_, i) => addMonths(month, i - rules.prior_months));
  const acct = new Map<string, Account>(books.accounts.map((a) => [a.num, a]));
  const txns = new Map<string, Line[]>();
  for (const l of books.lines) txns.set(l.txnId, [...(txns.get(l.txnId) ?? []), l]);
  const type = (a: string) => acct.get(a)?.type ?? "";
  const isPL = (a: string) => PL_TYPES.includes(type(a));
  const isIncome = (a: string) => type(a).includes("Income");
  const isExpense = (a: string) => isPL(a) && !isIncome(a);
  const end = addMonths(month, 1) + "-00"; // sorts after every date in the month
  return {
    books, rules, month, prior, acct, txns, isPL, isIncome, isExpense,
    isAsset: (a: string) => ASSET_TYPES.includes(type(a)),
    isLiability: (a: string) => LIABILITY_TYPES.includes(type(a)),
    name: (a: string) => acct.get(a)?.name ?? a,
    /** Line amount in the account's natural direction (expense +debit, income +credit). */
    nat: (l: Line) => (isIncome(l.account) ? l.credit - l.debit : l.debit - l.credit),
    inWindow: (l: Line) => l.date.slice(0, 7) >= prior[0] && l.date < end,
    inMonth: (l: Line) => l.date.slice(0, 7) === month,
    end, afterEnd: (d: string) => d >= end,
    balance: (a: string) => r2(books.lines.filter((l) => l.account === a && l.date < end).reduce((s, l) => s + l.debit - l.credit, 0)),
  };
}
export type Ctx = ReturnType<typeof makeCtx>;

/** Net income for the review month, optionally after proposed entries. */
export function netIncome(ctx: Ctx) {
  return r2(ctx.books.lines.filter(ctx.inMonth).filter((l) => ctx.isPL(l.account)).reduce((s, l) => s + l.credit - l.debit, 0));
}
