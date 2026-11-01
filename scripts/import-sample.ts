// npm run import:sample — loads data/qbo/*.csv into Postgres and checks the trial balance.
import { readdirSync, readFileSync } from "node:fs";
import { sql } from "drizzle-orm";
import { db, importBooks } from "../lib/db";
import { parseQbo } from "../lib/import/qbo";

const dir = "data/qbo";
const books = parseQbo(Object.fromEntries(readdirSync(dir).map((f) => [f, readFileSync(`${dir}/${f}`, "utf8")])));
importBooks(books).then(async () => {
  const [tb] = await db!.execute<{ debits: string; credits: string }>(sql`select sum(debit) as debits, sum(credit) as credits from journal_lines`);
  const [counts] = await db!.execute<{ txns: string; lines: string; bank: string }>(sql`select (select count(*) from transactions) as txns, (select count(*) from journal_lines) as lines, (select count(*) from bank_lines) as bank`);
  console.log(`Imported ${counts.txns} transactions, ${counts.lines} journal lines, ${counts.bank} statement lines. Debits ${tb.debits} = credits ${tb.credits}: ${tb.debits === tb.credits ? "OK" : "MISMATCH"}`);
  process.exit(tb.debits === tb.credits ? 0 : 1);
});
