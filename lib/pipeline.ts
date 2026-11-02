import { explain } from "./explain";
import { netIncome } from "./review/context";
import { runReview } from "./review";
import { type Books, type EntryLine, type Explanation, type Finding, type Line, r2 } from "./types";

export interface RunFinding extends Finding {
  why: string | null; proposed_entry: EntryLine[]; client_question: string | null;
  verified: boolean; source: string; ni_effect: number; evidence: (Line & { accountName: string })[];
}
export interface RunData {
  client: string; period: string; net_income: number;
  reconciliations: { account: string; name: string; month: string; statement_balance: number; ledger_balance: number; outstanding: number; difference: number }[];
  findings: RunFinding[]; accounts: { num: string; name: string }[];
  stats: { transactions: number; lines: number; llm_usd: number; ms: number; verified: number };
}

export async function runPipeline(books: Books, client = "Harbor & Pine Coffee Co., LLC"): Promise<RunData> {
  const t0 = Date.now();
  const { ctx, reconciliations, findings } = runReview(books);
  const txnIds = new Set(ctx.txns.keys());
  let usd = 0;
  const out: RunFinding[] = [];
  for (const f of findings) {
    const rows = f.cited_txn_ids.flatMap((id) => ctx.txns.get(id) ?? []);
    const ex = await explain(f, rows, books.accounts, txnIds);
    usd += ex.usd;
    const e: Explanation | null = ex.explanation;
    const entry = e?.proposed_entry ?? [];
    const focus = rows.filter((l) => f.accounts.includes(l.account));
    out.push({
      ...f, why: e?.why ?? null, proposed_entry: entry, client_question: e?.client_question || null, verified: ex.verified, source: ex.source,
      ni_effect: r2(entry.filter((l) => ctx.isPL(l.account)).reduce((s, l) => s + l.credit - l.debit, 0)),
      evidence: (focus.length ? focus : rows).map((l) => ({ ...l, accountName: ctx.name(l.account) })),
    });
  }
  return {
    client, period: ctx.month, net_income: netIncome(ctx),
    reconciliations: reconciliations.map((r) => ({ ...r, outstanding: r.outstanding.length })),
    findings: out, accounts: books.accounts.map((a) => ({ num: a.num, name: a.name })),
    stats: { transactions: txnIds.size, lines: books.lines.length, llm_usd: r2(usd * 10000) / 10000, ms: Date.now() - t0, verified: out.filter((f) => f.verified).length },
  };
}
