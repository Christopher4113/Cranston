// Synthetic books for Harbor & Pine Coffee Co., LLC (fictional). Jul–Sep 2026 plus early-October activity.
// Clean books first, plants and decoys inline (each recorded in ground truth), statements generated from the final ledger.
import { mkdirSync, writeFileSync } from "node:fs";
import { toCsv } from "../lib/csv";
import { type Line, r2 } from "../lib/types";

let seed = 20260930;
function rand() { // mulberry32
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const between = (a: number, b: number) => r2(a + rand() * (b - a));
const pick = <T,>(xs: T[]) => xs[Math.floor(rand() * xs.length)];

export const ACCOUNTS: [string, string, string, string][] = [
  ["1000", "Operating Checking", "Bank", "Checking"],
  ["1010", "Savings", "Bank", "Savings"],
  ["1100", "Accounts Receivable", "Accounts receivable (A/R)", "Accounts Receivable (A/R)"],
  ["1150", "Vendor Refunds Receivable", "Other Current Assets", "Other Current Assets"],
  ["1200", "Prepaid Expenses", "Other Current Assets", "Prepaid Expenses"],
  ["1500", "Equipment", "Fixed Assets", "Machinery & Equipment"],
  ["2000", "Accounts Payable", "Accounts payable (A/P)", "Accounts Payable (A/P)"],
  ["2100", "Chase Ink Card", "Credit Card", "Credit Card"],
  ["2200", "Accrued Expenses", "Other Current Liabilities", "Accrued Liabilities"],
  ["2300", "Sales Tax Payable", "Other Current Liabilities", "Sales Tax Payable"],
  ["3000", "Retained Earnings", "Equity", "Retained Earnings"],
  ["3010", "Owner Contributions", "Equity", "Partner Contributions"],
  ["3020", "Owner Distributions", "Equity", "Partner Distributions"],
  ["4000", "POS Sales", "Income", "Sales of Product Income"],
  ["4100", "Catering Revenue", "Income", "Service/Fee Income"],
  ["4900", "Interest Income", "Other Income", "Interest Earned"],
  ["5000", "COGS - Coffee Beans", "Cost of Goods Sold", "Supplies & Materials - COGS"],
  ["5010", "COGS - Milk & Dairy", "Cost of Goods Sold", "Supplies & Materials - COGS"],
  ["5020", "COGS - Cups & Packaging", "Cost of Goods Sold", "Supplies & Materials - COGS"],
  ["5030", "COGS - Bakery", "Cost of Goods Sold", "Supplies & Materials - COGS"],
  ["6000", "Rent", "Expenses", "Rent or Lease of Buildings"],
  ["6100", "Utilities", "Expenses", "Utilities"],
  ["6110", "Internet & Phone", "Expenses", "Utilities"],
  ["6200", "Payroll Expense", "Expenses", "Payroll Expenses"],
  ["6300", "Insurance", "Expenses", "Insurance"],
  ["6400", "Software Subscriptions", "Expenses", "Office/General Administrative Expenses"],
  ["6500", "Repairs & Maintenance", "Expenses", "Repair & Maintenance"],
  ["6600", "Meals", "Expenses", "Entertainment Meals"],
  ["6700", "Bank & Merchant Fees", "Expenses", "Bank Charges"],
  ["6750", "Marketing", "Expenses", "Advertising/Promotional"],
  ["6800", "Office Supplies", "Expenses", "Office/General Administrative Expenses"],
  ["6900", "Miscellaneous", "Expenses", "Other Miscellaneous Service Cost"],
  ["6950", "Professional Fees", "Expenses", "Legal & Professional Fees"],
];
const NAME = Object.fromEntries(ACCOUNTS.map(([n, name]) => [n, `${n} ${name}`]));

const day = (d: string, n: number) => new Date(Date.parse(d) + n * 864e5).toISOString().slice(0, 10);
const dow = (d: string) => new Date(d).getUTCDay();
const lastDay = (m: string) => day(`2026-${String(+m + 1).padStart(2, "0")}-01`, -1);

const lines: Line[] = [];
const lag: Record<string, number> = {}; // days until the bank posts it
let n = 0;
type Leg = [string, number]; // [account, +debit / -credit]
interface Opts { num?: string; memo?: string; serviceDate?: string; lag?: number }

function txn(date: string, type: string, name: string, legs: Leg[], o: Opts = {}) {
  const id = `T${String(++n).padStart(4, "0")}`;
  if (Math.abs(legs.reduce((s, [, a]) => s + a, 0)) > 0.001) throw new Error(`unbalanced ${id}`);
  for (const [account, amt] of legs) {
    const others = legs.filter(([a]) => a !== account);
    lines.push({
      txnId: id, date, type, num: o.num ?? "", name, memo: o.memo ?? "", account,
      split: others.length === 1 ? NAME[others[0][0]] : "-Split-",
      debit: amt > 0 ? r2(amt) : 0, credit: amt < 0 ? r2(-amt) : 0, serviceDate: o.serviceDate ?? "",
    });
  }
  lag[id] = o.lag ?? (type === "Check" ? 3 : 0);
  return id;
}
const FROM: Record<string, string> = { Expense: "1000", Check: "1000", "Credit Card Expense": "2100" };
const spend = (date: string, type: string, vendor: string, to: string, amt: number, o: Opts = {}) =>
  txn(date, type, vendor, [[to, amt], [FROM[type], -amt]], o);

const plants: Record<string, unknown>[] = [];
const decoys: Record<string, unknown>[] = [];
const plant = (p: Record<string, unknown>) => plants.push(p);
const decoy = (d: Record<string, unknown>) => decoys.push(d);

// ---- opening balances
txn("2026-06-30", "Journal Entry", "", [["1000", 42000], ["1010", 15000], ["1500", 38000], ["2200", -560], ["2300", -3120.55], ["3000", -91319.45]],
  { memo: "Opening balances at 6/30/2026" });

let check = 1040, bb = 2270, ppc = 5520, inv = 1036;
const MONTHS = ["07", "08", "09"];
const RESTAURANTS = ["Tartine Manufactory", "Souvla", "Zuni Cafe", "Nopalito", "Mensho Tokyo", "Pizzeria Delfina"];
const milkMissing = ["2026-09-16", "2026-09-23", "2026-09-30"];

// ---- daily / weekly activity
for (let d = "2026-07-01"; d <= "2026-09-30"; d = day(d, 1)) {
  const w = dow(d), weekend = w === 0 || w === 6;
  const gross = between(weekend ? 2050 : 1500, weekend ? 2400 : 1900), fee = r2(gross * 0.029);
  txn(d, "Deposit", "Square", [["1000", r2(gross - fee)], ["6700", fee], ["4000", -gross]], { memo: "Daily card sales", lag: 1 });
  if (w === 1) { const c = between(300, 600); txn(d, "Deposit", "", [["1000", c], ["4000", -c]], { memo: "Cash sales deposit" }); }
  if (w === 2) { // Blue Bottle weekly roast order
    let amt = between(1050, 1200), num = `BB-${++bb}`;
    if (d === "2026-08-04" || d === "2026-08-11") amt = 1240; // decoy D1: equal amounts, different invoices
    if (d === "2026-09-08") { amt = 1315.4; num = "BB-2287"; bb = 2287; }
    const id = spend(d, "Expense", "Blue Bottle Supply", "5000", amt, { num });
    if (d === "2026-08-11") decoy({ id: "D1", check: "C2", description: "Two equal $1,240.00 Blue Bottle payments, 7 days apart, different invoice numbers (BB-2274/BB-2275)", txn_ids: [lines.find((l) => l.date === "2026-08-04" && l.name === "Blue Bottle Supply")!.txnId, id] });
    if (d === "2026-09-08") {
      const dup = spend("2026-09-15", "Expense", "BlueBottle Supply Co", "5000", 1315.4, { num: "BB-2287" });
      plant({ id: "P3", type: "Duplicate payment", check: "C2", account: "5000", amount: 1315.4, txn_ids: [id, dup], description: "Invoice BB-2287 ($1,315.40) paid to 'Blue Bottle Supply' and again to 'BlueBottle Supply Co' 7 days later" });
    }
  }
  if (w === 3 && !milkMissing.includes(d)) spend(d, "Expense", "Straus Family Creamery", "5010", between(530, 590), { num: `SFC-${d.slice(5).replace("-", "")}` });
  if (w !== 0) spend(d, "Credit Card Expense", "Acme Bread Co", "5030", between(105, 145));
  if (w === 6) spend(d, "Credit Card Expense", "Good Eggs", "5030", between(80, 130));
  if (w === 0) {
    const g = between(600, 900), c = r2(g * 0.15);
    txn(d, "Deposit", "DoorDash", [["1000", r2(g - c)], ["6700", c], ["4000", -g]], { memo: "Weekly delivery payout", lag: 2 });
  }
  if (w === 1) spend(d, "Credit Card Expense", "Costco", "5020", between(60, 140));
  if (w === 4) {
    const office = d === "2026-09-17" || rand() < 0.3;
    const id = spend(d, "Credit Card Expense", "Costco", office ? "6800" : "5020", office ? between(60, 180) : between(90, 220));
    if (d === "2026-09-17") decoy({ id: "D3", check: "C3", description: "Costco charge coded to Office Supplies; Costco legitimately splits between cups/packaging and office supplies", txn_ids: [id] });
  }
}

// ---- monthly activity
for (const m of MONTHS) {
  const d = (dd: number) => `2026-${m}-${String(dd).padStart(2, "0")}`, end = lastDay(m);
  if (m !== "09") spend(d(1), "Check", "Harbor Street Properties", "6000", 4200, { num: String(++check), memo: "Monthly rent" });
  spend(d(1), "Credit Card Expense", "Google Workspace", "6400", 72);
  spend(d(1), "Credit Card Expense", "Meta Ads", "6750", 150);
  spend(d(3), "Credit Card Expense", "Soundtrack Your Brand", "6400", 39);
  if (m !== "09") spend(d(5), "Credit Card Expense", "Comcast Business", "6110", 189);
  const wc = spend(d(5), "Expense", "State Fund", "6300", 2048.17, { memo: `Monthly workers' comp premium – ${m}/2026` });
  if (m === "09") decoy({ id: "D6", check: "C4", description: "State Fund $2,048.17: insurer and over $2,000, but memo says monthly premium (not a prepayment)", txn_ids: [wc] });
  spend(d(10), "Credit Card Expense", "Adobe", "6400", 59.99);
  const prior = { "07": [560, "2026-06-30", "PGE-0626"], "08": [590, "2026-07-31", "PGE-0726"], "09": [612.4, "2026-08-31", "PGE-0826"] }[m] as [number, string, string];
  spend(d(14), "Expense", "PG&E", "2200", prior[0], { num: prior[2], serviceDate: prior[1], memo: "Pay PG&E bill (accrued)" });
  spend(d(20), "Credit Card Expense", "Recology", "6100", between(138, 146));
  for (const dd of [15, +end.slice(8)]) {
    const p = between(9000, 9400);
    txn(d(dd), "Journal Entry", "Gusto", [["6200", p], ["1000", -p]], { memo: `Gusto payroll ${+m}/${dd}` });
  }
  txn(d(28), "Transfer", "", [["1010", 1000], ["1000", -1000]], { memo: "Transfer to savings" });
  spend(end, "Expense", "Chase", "6700", 15, { memo: "Monthly service fee" });
  const int = between(1.8, 2.4);
  txn(end, "Deposit", "Chase", [["1010", int], ["4900", -int]], { memo: "Interest" });
  for (let i = 0; i < 3; i++) spend(d(3 + i * 9), "Credit Card Expense", pick(RESTAURANTS), "6600", between(35, 95));
  for (const dd of [8, 22]) spend(d(dd), "Credit Card Expense", "Staples", "6800", between(40, 140));
  if (m !== "09") {
    const acc = m === "07" ? 590 : 612.4;
    txn(end, "Journal Entry", "PG&E", [["6100", acc], ["2200", -acc]], { memo: `Accrue PG&E usage – ${m}/2026` });
  }
}

// ---- Pacific Paper & Cup (ACH, invoice # in Num)
for (const dt of ["2026-07-03", "2026-07-17", "2026-07-31", "2026-08-14", "2026-09-24"]) spend(dt, "Expense", "Pacific Paper & Cup", "5020", between(600, 700), { num: `PPC-${++ppc}` });
const bulk = spend("2026-08-28", "Expense", "Pacific Paper & Cup", "5020", 1650, { num: `PPC-${++ppc}`, memo: "Bulk order: fall cups & sleeves" });
decoy({ id: "D4", check: "C3", description: "$1,650 bulk cups order: over the $1,500 capitalization threshold, but inventory/COGS, not a fixed asset", txn_ids: [bulk] });
{
  const a = spend("2026-09-10", "Expense", "Pacific Paper & Cup", "5020", 684.2, { num: "PPC-5531" });
  const b = spend("2026-09-16", "Credit Card Expense", "Pacific Paper and Cup Co", "5020", 684.2);
  plant({ id: "P4", type: "Duplicate payment", check: "C2", account: "5020", amount: 684.2, txn_ids: [a, b], description: "PPC-5531 ($684.20) paid by ACH to 'Pacific Paper & Cup', then charged again on the card as 'Pacific Paper and Cup Co' 6 days later" });
}

// ---- catering (invoice → payment 10 days later)
const catering: [string, string, number, string?][] = [
  ["2026-07-09", "Linear Labs", 1240], ["2026-07-23", "Dogpatch Studios", 1080], ["2026-08-06", "Mission Bay Dental", 1320],
  ["2026-08-20", "Linear Labs", 980], ["2026-09-10", "Dogpatch Studios", 1280], ["2026-09-29", "Mission Bay Dental", 960],
  ["2026-09-30", "Linear Labs", 1850, "2026-10-02"],
];
for (const [dt, cust, amt, svc] of catering) {
  const num = String(++inv);
  const id = txn(dt, "Invoice", cust, [["1100", amt], ["4100", -amt]], { num, serviceDate: svc ?? dt, memo: "Catering order" });
  txn(day(dt, 10), "Payment", cust, [["1000", amt], ["1100", -amt]], { num, lag: 1 });
  if (svc) plant({ id: "P13", type: "Revenue cut-off", check: "C8", account: "4100", amount: amt, txn_ids: [id], description: "Catering invoice #1043 for an Oct 2 event dated Sep 30, pulling $1,850 of October revenue into September" });
  if (dt === "2026-09-29") decoy({ id: "D10", check: "C8", description: "Catering invoice dated Sep 29 for a Sep 29 event: correct period", txn_ids: [id] });
}

// ---- repairs: Jul 630, Aug 450; Sep has $2,376 unexplained plus a memo'd one-time repair
spend("2026-07-12", "Credit Card Expense", "Bay Plumbing & Drain", "6500", 180);
const d2a = spend("2026-07-28", "Expense", "Bay Area Espresso Tech", "6500", 450, { num: "BAET-118" });
const d2b = spend("2026-08-06", "Expense", "Bay Area Espresso Supply", "6500", 450, { num: "BAES-3302" });
decoy({ id: "D2", check: "C2", description: "$450 to 'Bay Area Espresso Tech' and $450 to 'Bay Area Espresso Supply' 9 days apart: similar names, same amount, but two different vendors with different invoice numbers", txn_ids: [d2a, d2b] });
const rep = [
  spend("2026-09-04", "Credit Card Expense", "Bay Area Espresso Tech", "6500", 610),
  spend("2026-09-19", "Credit Card Expense", "Bay Plumbing & Drain", "6500", 780),
  spend("2026-09-29", "Check", "Bay Area Espresso Tech", "6500", 986, { num: String(++check) }), // outstanding at 9/30
];
plant({ id: "P10", type: "Unusual swing", check: "C6", account: "6500", amount: 1836, txn_ids: rep, description: "Repairs & Maintenance up 340% vs the Jul–Aug average across three September charges with no memo" });
const d8 = spend("2026-09-11", "Credit Card Expense", "Bay Area Espresso Tech", "6500", 1450, { memo: "Group-head rebuild on La Marzocco after gasket failure (one-time)" });
decoy({ id: "D8", check: "C6", description: "One-time $1,450 espresso machine repair with an explanatory memo", txn_ids: [d8] });

// ---- marketing campaign with memo (decoy for flux)
const d7 = spend("2026-09-15", "Credit Card Expense", "Mission Printing", "6750", 1200, { memo: "Fall menu launch – posters & flyers (approved by owner)" });
decoy({ id: "D7", check: "C6", description: "Marketing up $1,200 in September for a fall menu launch, explained in the memo", txn_ids: [d7] });

// ---- 7shifts annual renewal, properly prepaid and amortized
const d5 = spend("2026-08-01", "Credit Card Expense", "7shifts", "1200", 2400, { memo: "Annual scheduling subscription 8/1/26–7/31/27" });
for (const dt of ["2026-08-31", "2026-09-30"]) txn(dt, "Journal Entry", "7shifts", [["6400", 200], ["1200", -200]], { memo: "Amortize 7shifts annual subscription" });
decoy({ id: "D5", check: "C4", description: "7shifts $2,400 annual renewal recorded to Prepaid and amortized $200/month", txn_ids: [d5] });

// ---- owner-contributed grinder (round JE, but memo'd and not Misc)
const d9 = txn("2026-08-20", "Journal Entry", "", [["1500", 3000], ["3010", -3000]], { memo: "Owner contributed Mahlkonig grinder purchased personally" });
decoy({ id: "D9", check: "C7", description: "$3,000 round-dollar journal entry, but with a memo and to Equipment/Owner Contributions", txn_ids: [d9] });

// ---- remaining plants
plant({ id: "P1", type: "Missing recurring bill", check: "C1", account: "6000", amount: 4200, txn_ids: [], description: "September rent ($4,200, Harbor Street Properties) not recorded and not yet paid" });
plant({ id: "P2", type: "Missing recurring bill", check: "C1", account: "6110", amount: 189, txn_ids: [], description: "September Comcast Business internet ($189) not recorded" });
plant({ id: "P5", type: "Wrong account", check: "C3", account: "6800", amount: 1899, txn_ids: [spend("2026-09-02", "Credit Card Expense", "Apple Store", "6800", 1899, { memo: "MacBook Air – back office" })], description: "$1,899 laptop coded to Office Supplies; should be Equipment" });
plant({ id: "P6", type: "Wrong account", check: "C3", account: "6600", amount: 214.36, txn_ids: [spend("2026-09-22", "Credit Card Expense", "Square", "6600", 214.36, { memo: "Processing fees – Sep statement" })], description: "Square processing fees coded to Meals; should be Bank & Merchant Fees" });
plant({ id: "P7", type: "Wrong account", check: "C3", account: "6400", amount: 22.99, txn_ids: [spend("2026-09-12", "Credit Card Expense", "Netflix", "6400", 22.99)], description: "Owner's personal Netflix charge coded to Software Subscriptions; should be Owner Distributions" });
plant({ id: "P8", type: "Prepaid expensed at once", check: "C4", account: "6300", amount: 6000, txn_ids: [spend("2026-07-01", "Check", "Hiscox", "6300", 6000, { num: String(++check), memo: "General liability + property policy 7/1/26–6/30/27" })], description: "Annual $6,000 Hiscox policy expensed fully in July instead of $500/month" });
plant({ id: "P11", type: "Unusual swing", check: "C6", account: "5010", amount: 1400, txn_ids: [], description: "Milk COGS down ~56% in September while revenue is flat: three Straus deliveries (Sep 16, 23, 30) never entered" });
plant({ id: "P12", type: "Manual JE hygiene", check: "C7", account: "6900", amount: 5000, txn_ids: [txn("2026-09-26", "Journal Entry", "", [["6900", 5000], ["3000", -5000]])], description: "$5,000 round-dollar journal entry to Miscellaneous with no memo" });
plant({ id: "P14", type: "Liability not cleared", check: "none", account: "2300", amount: 3120.55, txn_ids: [], description: "Q2 sales tax payable ($3,120.55) still on the books; never remitted. No check in the sample list ages liabilities, so this is expected to be missed." });
plant({ id: "P15", type: "Odd balance", check: "C9", account: "2200", amount: 750, txn_ids: [spend("2026-09-18", "Check", "Bay Area Bookkeeping", "2200", 750, { num: String(++check) })], description: "Bookkeeping fee coded to Accrued Expenses with no accrual behind it, leaving Accrued Expenses with a debit balance" });

// ---- October activity (books are closed mid-October)
spend("2026-10-01", "Check", "Harbor Street Properties", "6000", 4200, { num: String(++check), memo: "Monthly rent" });
const oct = txn("2026-10-12", "Bill", "PG&E", [["2200", 634.8], ["2000", -634.8]], { num: "PGE-0926", serviceDate: "2026-09-30", memo: "Service period 9/1–9/30" });
plant({ id: "P9", type: "Unrecorded accrual", check: "C5", account: "6100", amount: 634.8, txn_ids: [oct], description: "September PG&E usage ($634.80, billed Oct 12) not accrued at Sep 30, although Jul and Aug were" });

for (let d = "2026-10-01"; d <= "2026-10-15"; d = day(d, 1)) {
  const gross = between(1500, 2300), fee = r2(gross * 0.029);
  txn(d, "Deposit", "Square", [["1000", r2(gross - fee)], ["6700", fee], ["4000", -gross]], { memo: "Daily card sales", lag: 1 });
}

// ---- card payments: on the 26th, pay charges through the 20th
const bal = (acct: string, upTo: string, sign = 1) => r2(lines.filter((l) => l.account === acct && l.date <= upTo).reduce((s, l) => s + sign * (l.credit - l.debit), 0));
for (const m of MONTHS) {
  const owed = bal("2100", `2026-${m}-20`);
  txn(`2026-${m}-26`, "Credit Card Payment", "Chase", [["2100", owed], ["1000", -owed]], { memo: "Card payment" });
}

lines.sort((a, b) => a.date.localeCompare(b.date) || a.txnId.localeCompare(b.txnId));

// ---- write QBO-shaped exports
const out = "data/qbo";
mkdirSync(out, { recursive: true });
const money = (x: number) => (x ? x.toFixed(2) : "");
writeFileSync(`${out}/chart_of_accounts.csv`, toCsv([["Account #", "Account", "Type", "Detail Type"], ...ACCOUNTS.map(([n, nm, t, dt]) => [n, nm, t, dt])]));
const vendors = [...new Set(lines.filter((l) => l.name && !["Invoice", "Payment"].includes(l.type)).map((l) => l.name))].sort();
writeFileSync(`${out}/vendors.csv`, toCsv([["Vendor", "Company Name", "Open Balance"], ...vendors.map((v) => [v, v, v === "PG&E" ? "634.80" : "0.00"])]));
writeFileSync(`${out}/general_ledger.csv`, toCsv([
  ["Txn ID", "Date", "Transaction Type", "Num", "Name", "Memo/Description", "Account", "Split", "Debit", "Credit", "Service Date"],
  ...lines.map((l) => [l.txnId, l.date, l.type, l.num, l.name, l.memo, NAME[l.account], l.split, money(l.debit), money(l.credit), l.serviceDate]),
]));
const tb = ACCOUNTS.map(([num]) => [NAME[num], -bal(num, "2026-09-30")] as const).filter(([, b]) => Math.abs(b) > 0.001);
writeFileSync(`${out}/trial_balance.csv`, toCsv([["Account", "Debit", "Credit"], ...tb.map(([a, b]) => [a, money(b > 0 ? b : 0), money(b < 0 ? -b : 0)])]));

// Statements: every ledger cash/card line, posted after its bank lag, through 9/30.
for (const [acct, sign] of [["1000", 1], ["1010", 1], ["2100", -1]] as const) {
  const opening = lines.filter((l) => l.account === acct && l.date < "2026-07-01").reduce((s, l) => s + sign * (l.debit - l.credit), 0);
  const rows = lines.filter((l) => l.account === acct && l.date >= "2026-07-01")
    .map((l) => ({ posted: day(l.date, lag[l.txnId]), amount: r2(sign * (l.debit - l.credit)), l }))
    .filter((r) => r.posted <= "2026-09-30")
    .sort((a, b) => a.posted.localeCompare(b.posted) || a.l.txnId.localeCompare(b.l.txnId));
  let run = r2(opening);
  const desc = (l: Line) => (l.type === "Check" ? `CHECK ${l.num}` : `${(l.name || l.memo).toUpperCase()} ${l.type === "Deposit" ? "DEPOSIT" : l.num}`.trim());
  writeFileSync(`${out}/statement_${acct}.csv`, toCsv([
    ["Date", "Description", "Amount", "Balance"],
    ["2026-07-01", "BEGINNING BALANCE", "0.00", run.toFixed(2)],
    ...rows.map((r) => { run = r2(run + r.amount); return [r.posted, desc(r.l), r.amount.toFixed(2), run.toFixed(2)]; }),
  ]));
}

writeFileSync("data/ground_truth.json", JSON.stringify({
  client: "Harbor & Pine Coffee Co., LLC (fictional)", period: "2026-09",
  plants: plants.sort((a, b) => +String(a.id).slice(1) - +String(b.id).slice(1)), decoys: decoys.sort((a, b) => +String(a.id).slice(1) - +String(b.id).slice(1)),
}, null, 2));
console.log(`${new Set(lines.map((l) => l.txnId)).size} transactions, ${lines.length} lines, ${plants.length} plants, ${decoys.length} decoys`);
