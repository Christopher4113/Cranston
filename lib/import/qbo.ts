import { parseCsv } from "../csv";
import type { Books } from "../types";

export const REQUIRED_FILES = ["chart_of_accounts.csv", "general_ledger.csv"];

// QBO exports dates as MM/DD/YYYY and amounts with thousands separators; normalize both.
const date = (s: string) => {
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  return m ? `${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}` : s;
};
const money = (s: string) => {
  const x = Number((s || "0").replace(/[$,]/g, ""));
  if (!Number.isFinite(x)) throw new Error(`Bad amount: ${s}`);
  return x;
};

/** Parses QBO-shaped CSV exports (see docs/qbo-mapping.md). Statements are statement_<account #>.csv. */
export function parseQbo(files: Record<string, string>): Books {
  for (const f of REQUIRED_FILES) if (!files[f]) throw new Error(`Missing ${f}`);
  const accounts = parseCsv(files["chart_of_accounts.csv"]).map((r) => ({ num: r["Account #"], name: r["Account"], type: r["Type"], detail: r["Detail Type"] }));
  const known = new Set(accounts.map((a) => a.num));
  const lines = parseCsv(files["general_ledger.csv"]).map((r) => {
    const account = r["Account"].split(" ")[0];
    if (!known.has(account)) throw new Error(`GL account not in chart of accounts: ${r["Account"]}`);
    return {
      txnId: r["Txn ID"], date: date(r["Date"]), type: r["Transaction Type"], num: r["Num"], name: r["Name"],
      memo: r["Memo/Description"], account, split: r["Split"], debit: money(r["Debit"]), credit: money(r["Credit"]),
      serviceDate: date(r["Service Date"] ?? ""),
    };
  });
  const bank = Object.keys(files).flatMap((f) => {
    const m = f.match(/^statement_(\d+)\.csv$/);
    if (!m) return [];
    return parseCsv(files[f]).map((r) => ({ account: m[1], date: date(r["Date"]), description: r["Description"], amount: money(r["Amount"]), balance: money(r["Balance"]) }));
  });
  const vendors = files["vendors.csv"] ? parseCsv(files["vendors.csv"]).map((r) => r["Vendor"]) : [];
  return { accounts, vendors, lines, bank };
}
