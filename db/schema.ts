import { boolean, integer, jsonb, numeric, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

export const accounts = pgTable("accounts", { num: text("num").primaryKey(), name: text("name").notNull(), type: text("type").notNull(), detail: text("detail") });
export const vendors = pgTable("vendors", { name: text("name").primaryKey() });
export const transactions = pgTable("transactions", { id: text("id").primaryKey(), date: text("date").notNull(), type: text("type").notNull(), num: text("num"), name: text("name"), memo: text("memo") });
export const journalLines = pgTable("journal_lines", {
  id: serial("id").primaryKey(), txnId: text("txn_id").notNull().references(() => transactions.id), account: text("account").notNull().references(() => accounts.num),
  split: text("split"), debit: numeric("debit", { precision: 14, scale: 2 }).notNull(), credit: numeric("credit", { precision: 14, scale: 2 }).notNull(), serviceDate: text("service_date"),
});
export const bankLines = pgTable("bank_lines", {
  id: serial("id").primaryKey(), account: text("account").notNull().references(() => accounts.num), date: text("date").notNull(),
  description: text("description"), amount: numeric("amount", { precision: 14, scale: 2 }).notNull(), balance: numeric("balance", { precision: 14, scale: 2 }).notNull(),
});
export const findings = pgTable("findings", {
  id: text("id").primaryKey(), period: text("period").notNull(), checkId: text("check_id").notNull(), title: text("title").notNull(),
  amount: numeric("amount", { precision: 14, scale: 2 }).notNull(), accounts: jsonb("accounts").$type<string[]>().notNull(), citedTxnIds: jsonb("cited_txn_ids").$type<string[]>().notNull(),
  severity: text("severity").notNull(), confidence: numeric("confidence").notNull(), why: text("why"), clientQuestion: text("client_question"), verified: boolean("verified").notNull(),
});
export const proposedEntries = pgTable("proposed_entries", {
  id: serial("id").primaryKey(), findingId: text("finding_id").notNull().references(() => findings.id), lineNo: integer("line_no").notNull(),
  account: text("account").notNull().references(() => accounts.num), debit: numeric("debit", { precision: 14, scale: 2 }).notNull(), credit: numeric("credit", { precision: 14, scale: 2 }).notNull(), memo: text("memo"),
});
export const reviewActions = pgTable("review_actions", {
  id: serial("id").primaryKey(), findingId: text("finding_id").notNull(), action: text("action").notNull(), at: timestamp("at").defaultNow().notNull(),
});
