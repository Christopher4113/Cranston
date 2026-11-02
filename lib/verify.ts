import type { Explanation, Finding, Line } from "./types";

/**
 * Verifies an explanation against the ledger. Returns a list of problems; empty means verified.
 * 1. every cited txn exists  2. every $ amount in `why` is in the cited rows or the finding's facts
 * 3. the entry balances and only uses chart-of-accounts accounts
 */
export function verify(f: Finding, e: Explanation, txnIds: Set<string>, rows: Line[], accounts: Set<string>): string[] {
  const problems: string[] = [];
  for (const id of f.cited_txn_ids) if (!txnIds.has(id)) problems.push(`cited txn ${id} does not exist`);
  const known = new Set<number>([f.amount, ...rows.flatMap((l) => [l.debit, l.credit]), ...Object.values(f.facts).filter((v): v is number => typeof v === "number").map(Math.abs)].map((x) => Math.round(x * 100)));
  for (const m of e.why.matchAll(/\$([\d,]+(?:\.\d{1,2})?)/g)) {
    if (!known.has(Math.round(Number(m[1].replace(/,/g, "")) * 100))) problems.push(`amount $${m[1]} is not in the cited rows`);
  }
  let dr = 0, cr = 0;
  for (const l of e.proposed_entry) {
    if (!accounts.has(l.account)) problems.push(`account ${l.account} is not in the chart of accounts`);
    if (l.debit < 0 || l.credit < 0) problems.push("negative amount in entry");
    dr += l.debit; cr += l.credit;
  }
  if (Math.abs(dr - cr) > 0.005) problems.push(`entry does not balance (${dr.toFixed(2)} vs ${cr.toFixed(2)})`);
  if (!e.proposed_entry.length && !e.client_question) problems.push("no entry and no client question");
  return problems;
}
