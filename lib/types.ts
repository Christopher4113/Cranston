export interface Account { num: string; name: string; type: string; detail: string }

/** One line of the QBO General Ledger export. A transaction is all lines sharing txnId. */
export interface Line {
  txnId: string; date: string; type: string; num: string; name: string; memo: string;
  account: string; split: string; debit: number; credit: number; serviceDate: string;
}

/** One row of a bank or card statement. Card amounts are positive for charges. */
export interface BankLine { account: string; date: string; description: string; amount: number; balance: number }

export interface Books { accounts: Account[]; vendors: string[]; lines: Line[]; bank: BankLine[] }

export interface Finding {
  id: string; check_id: string; title: string; amount: number; accounts: string[];
  cited_txn_ids: string[]; severity: "high" | "medium" | "low"; confidence: number;
  /** Deterministic facts the explainer may use (expected account, months remaining, ...). */
  facts: Record<string, string | number>;
}

export interface EntryLine { account: string; debit: number; credit: number; memo: string }
export interface Explanation { why: string; proposed_entry: EntryLine[]; client_question?: string }

export const PL_TYPES = ["Income", "Other Income", "Cost of Goods Sold", "Expenses"];
export const ASSET_TYPES = ["Bank", "Accounts receivable (A/R)", "Other Current Assets", "Fixed Assets"];
export const LIABILITY_TYPES = ["Accounts payable (A/P)", "Credit Card", "Other Current Liabilities"];
export const r2 = (x: number) => Math.round(x * 100) / 100;
