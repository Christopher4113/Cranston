import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as s from "../db/schema";
import type { RunData } from "./pipeline";
import type { Books } from "./types";

/** null when DATABASE_URL is unset: replay mode runs without a database. */
export const db = process.env.DATABASE_URL ? drizzle(postgres(process.env.DATABASE_URL, { max: 3 }), { schema: s }) : null;

export async function importBooks(books: Books) {
  if (!db) throw new Error("DATABASE_URL is not set");
  await db.transaction(async (tx) => {
    for (const t of [s.reviewActions, s.proposedEntries, s.findings, s.bankLines, s.journalLines, s.transactions, s.vendors, s.accounts]) await tx.delete(t);
    await tx.insert(s.accounts).values(books.accounts);
    if (books.vendors.length) await tx.insert(s.vendors).values(books.vendors.map((name) => ({ name })));
    const txns = new Map(books.lines.map((l) => [l.txnId, { id: l.txnId, date: l.date, type: l.type, num: l.num, name: l.name, memo: l.memo }]));
    await tx.insert(s.transactions).values([...txns.values()]);
    for (let i = 0; i < books.lines.length; i += 500)
      await tx.insert(s.journalLines).values(books.lines.slice(i, i + 500).map((l) => ({ txnId: l.txnId, account: l.account, split: l.split, debit: String(l.debit), credit: String(l.credit), serviceDate: l.serviceDate })));
    await tx.insert(s.bankLines).values(books.bank.map((b) => ({ ...b, amount: String(b.amount), balance: String(b.balance) })));
  });
}

export async function saveRun(run: RunData) {
  if (!db) return;
  await db.transaction(async (tx) => {
    await tx.delete(s.proposedEntries);
    await tx.delete(s.findings);
    for (const f of run.findings) {
      await tx.insert(s.findings).values({ id: f.id, period: run.period, checkId: f.check_id, title: f.title, amount: String(f.amount), accounts: f.accounts, citedTxnIds: f.cited_txn_ids, severity: f.severity, confidence: String(f.confidence), why: f.why, clientQuestion: f.client_question, verified: f.verified });
      if (f.proposed_entry.length) await tx.insert(s.proposedEntries).values(f.proposed_entry.map((l, i) => ({ findingId: f.id, lineNo: i + 1, account: l.account, debit: String(l.debit), credit: String(l.credit), memo: l.memo })));
    }
  });
}
