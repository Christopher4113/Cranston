import Link from "next/link";

// Static, illustrative example only. Not built out; not tax advice.
const rows: [string, string, string, string?][] = [
  ["4000 POS Sales + 4100 Catering Revenue", "Line 1a Gross receipts", "$58,914"],
  ["5000–5030 COGS", "Line 2 Cost of goods sold (Form 1125-A)", "$13,622"],
  ["6200 Payroll Expense", "Line 8 Salaries and wages", "$18,421"],
  ["6000 Rent", "Line 11 Rents", "$4,200"],
  ["6600 Meals", "Line 19 Other deductions", "$402", "Book $402 → deductible $201. 50% limit, IRC §274(n)."],
  ["6900 Miscellaneous: late-filing penalty", "Not deductible", "$250", "Fines and penalties paid to a government are not deductible, IRC §162(f)."],
  ["1500 Equipment (book straight-line)", "Line 14 Depreciation (Form 4562)", "$683", "Placeholder: book depreciation vs MACRS would be reconciled on Schedule M-1."],
];

export default function WhatsNext() {
  return (
    <main className="mx-auto w-full max-w-4xl flex-1 bg-paper p-4 sm:p-8">
      <Link href="/" className="text-sm text-ring hover:underline">← Back to close</Link>
      <p className="mt-6 text-sm text-subtle-text">What&apos;s next · illustrative</p>
      <h1 className="font-serif text-3xl text-heading sm:text-4xl">Books → 1120-S bridge</h1>
      <p className="mt-2 max-w-2xl text-sm text-subtle-text">
        Once the close is reviewed, map the trial balance to S-corp return lines and flag book-tax differences, connecting bookkeeping to the tax product.
        A static example with made-up figures; this screen is not built out and is not tax advice.
      </p>
      <div className="mt-6 overflow-x-auto rounded-lg border bg-background">
        <table className="w-full text-sm">
          <thead className="border-b text-left text-subtle-text"><tr><th className="p-3 font-medium">Trial balance</th><th className="p-3 font-medium">1120-S line</th><th className="p-3 text-right font-medium">Amount</th></tr></thead>
          <tbody>
            {rows.map(([tb, line, amt, flag]) => (
              <tr key={tb} className={flag ? "bg-peach/20" : ""}>
                <td className="p-3 align-top">{tb}{flag && <span className="mt-1 block text-xs text-heading">⚑ {flag}</span>}</td>
                <td className="p-3 align-top">{line}</td>
                <td className="p-3 text-right align-top tabular-nums">{amt}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
