# QuickBooks Online export → Close Review mapping

Close Review imports CSVs shaped like QuickBooks Online report exports (`lib/import/qbo.ts`). Dates may be `YYYY-MM-DD` or QBO's `MM/DD/YYYY`; amounts may include `$` and thousands separators.

| File | QBO source | Column → field |
|---|---|---|
| `chart_of_accounts.csv` (required) | Chart of Accounts → Export | `Account #` → `accounts.num`, `Account` → `name`, `Type` → `type` (QBO account type: Bank, Expenses, …), `Detail Type` → `detail` |
| `vendors.csv` | Vendor Contact List | `Vendor` → `vendors.name` (`Company Name`, `Open Balance` ignored) |
| `general_ledger.csv` (required) | General Ledger / Transaction Detail by Account, with the **Txn ID** and **Service Date** columns added via *Customize → Rows/Columns* | `Txn ID` → `transactions.id` (lines sharing it are one transaction), `Date`, `Transaction Type` → `type`, `Num` (check # or vendor invoice #), `Name` (vendor/customer), `Memo/Description` → `memo`, `Account` (`"6000 Rent"`; the leading number is the key) → `journal_lines.account`, `Split`, `Debit`, `Credit`, `Service Date` → `service_date` |
| `trial_balance.csv` | Trial Balance (as of period end) | Not imported; reference only. `npm run import:sample` recomputes and checks debits = credits. |
| `statement_<account #>.csv` | Bank/card statement download | `Date` (posted), `Description`, `Amount`, `Balance` → `bank_lines`. First row `BEGINNING BALANCE` carries the opening balance. Card statements use positive amounts for charges. |

**Why Txn ID and Service Date:** every finding cites transactions by ID, so the export must carry one. Service date is how C5 (accrual) and C8 (cut-off) know which period a bill or invoice belongs to.

**Accounts the checks rely on** are set in `config/review-rules.yaml` (accrued expenses, prepaid, fixed assets, vendor refunds receivable, suspense). Change them to fit another chart of accounts.
