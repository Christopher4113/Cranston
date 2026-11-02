// One positive and one decoy per check, against the generated sample client. Run: npm test
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { test } from "node:test";
import { parseQbo } from "../import/qbo";
import { jaroWinkler } from "./checks";
import { runReview } from "./index";

const dir = "data/qbo";
const books = parseQbo(Object.fromEntries(readdirSync(dir).map((f) => [f, readFileSync(`${dir}/${f}`, "utf8")])));
const truth = JSON.parse(readFileSync("data/ground_truth.json", "utf8"));
const { reconciliations, findings } = runReview(books);
const txns = (id: string) => [...truth.plants, ...truth.decoys].find((x: { id: string }) => x.id === id).txn_ids as string[];
const flagged = (check: string, ids: string[]) => findings.some((f) => f.check_id === check && f.cited_txn_ids.some((t) => ids.includes(t)));
const flaggedAccount = (check: string, account: string) => findings.some((f) => f.check_id === check && f.accounts.includes(account));

test("R0: every account reconciles to $0.00 at every month end", () => {
  assert.equal(reconciliations.length, 9);
  for (const r of reconciliations) assert.equal(r.difference, 0, `${r.account} ${r.month}`);
});

test("C1 missing recurring: rent flagged; one-off Hiscox and accrual vendor PG&E are not", () => {
  assert.ok(flaggedAccount("C1", "6000"));
  assert.ok(!findings.some((f) => f.check_id === "C1" && ["Hiscox", "PG&E"].includes(String(f.facts.vendor))));
});

test("C2 duplicate payment: BB-2287 flagged; equal Blue Bottle payments with different invoices (D1) and two espresso vendors (D2) are not", () => {
  assert.ok(flagged("C2", txns("P3")));
  assert.ok(!flagged("C2", txns("D1")));
  assert.ok(!flagged("C2", txns("D2")));
});

test("C3 wrong account: laptop flagged; Costco office run (D3) and bulk cups order (D4) are not", () => {
  assert.ok(flagged("C3", txns("P5")));
  assert.ok(!flagged("C3", txns("D3")));
  assert.ok(!flagged("C3", txns("D4")));
});

test("C4 prepaid: Hiscox annual flagged with 9 months remaining; 7shifts prepaid (D5) and monthly workers' comp (D6) are not", () => {
  const f = findings.find((f) => f.check_id === "C4" && f.cited_txn_ids.includes(txns("P8")[0]));
  assert.equal(f?.amount, 4500);
  assert.ok(!flagged("C4", txns("D5")) && !flagged("C4", txns("D6")));
});

test("C5 accrual: PG&E flagged from the October invoice; Comcast (no next-month invoice) is not", () => {
  assert.ok(flagged("C5", txns("P9")));
  assert.ok(!findings.some((f) => f.check_id === "C5" && f.facts.vendor === "Comcast Business"));
});

test("C6 flux: repairs flagged without citing the memo'd repair (D8); marketing campaign (D7) is not", () => {
  assert.ok(flagged("C6", txns("P10")));
  assert.ok(!flagged("C6", txns("D8")));
  assert.ok(!flaggedAccount("C6", "6750"));
});

test("C7 manual JE: $5,000 to Misc flagged; memo'd $3,000 grinder JE (D9) is not", () => {
  assert.ok(flagged("C7", txns("P12")));
  assert.ok(!flagged("C7", txns("D9")));
});

test("C8 cut-off: Oct 2 event in September flagged; Sep 29 event (D10) is not", () => {
  assert.ok(flagged("C8", txns("P13")));
  assert.ok(!flagged("C8", txns("D10")));
});

test("C9 balance sanity: Accrued Expenses debit balance flagged; card (normal credit balance) is not", () => {
  assert.ok(flaggedAccount("C9", "2200"));
  assert.ok(!flaggedAccount("C9", "2100"));
});

test("Jaro-Winkler separates near-duplicates from different names", () => {
  assert.equal(jaroWinkler("bluebottlesupply", "bluebottlesupply"), 1);
  assert.ok(jaroWinkler("bayareaespressotech", "bayareaespressosupply") >= 0.85); // why C2 also needs the invoice rule
  assert.ok(jaroWinkler("staples", "straus") < 0.85);
});
