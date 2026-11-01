// The LLM only explains a finding and drafts its entry; checks C1–C9 decide what a finding is.
import Anthropic from "@anthropic-ai/sdk";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { type Account, type EntryLine, type Explanation, type Finding, type Line, r2 } from "./types";
import { verify } from "./verify";

const MODEL = "claude-sonnet-5-5";
const CACHE = join(process.cwd(), "cache/explain");
const $ = (x: number) => `$${Math.abs(x).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const SCHEMA = {
  type: "object", additionalProperties: false, required: ["why", "proposed_entry"],
  properties: {
    why: { type: "string" },
    client_question: { type: "string" },
    proposed_entry: {
      type: "array",
      items: { type: "object", additionalProperties: false, required: ["account", "debit", "credit", "memo"], properties: { account: { type: "string" }, debit: { type: "number" }, credit: { type: "number" }, memo: { type: "string" } } },
    },
  },
};

const dc = (debit: string, credit: string, amt: number, memo: string): EntryLine[] => [
  { account: debit, debit: r2(amt), credit: 0, memo }, { account: credit, debit: 0, credit: r2(amt), memo },
];

/** Deterministic explainer used when no API key is set. Same schema, same verifier. */
export function templateExplain(f: Finding, name: (a: string) => string): Explanation {
  const x = f.facts, s = (k: string) => String(x[k]), n = (k: string) => Number(x[k]);
  switch (f.check_id) {
    case "C1": return {
      why: `${s("vendor")} was recorded to ${name(s("expense_account"))} in each of the prior months (about ${$(n("expected_amount"))} a month), but nothing was recorded this month. Nothing hit the bank, so the reconciliation can't see it.`,
      proposed_entry: dc(s("expense_account"), s("accrued_account"), n("expected_amount"), `Accrue ${s("vendor")} for the month`),
      client_question: `Did ${s("vendor")} bill you this month? We expected about ${$(n("expected_amount"))}.`,
    };
    case "C2": return {
      why: `${$(n("amount"))} was paid to "${s("vendor_a")}" and again to "${s("vendor_b")}" ${n("days_apart")} days later${s("invoice_num") ? ` for the same invoice ${s("invoice_num")}` : ""}. Both payments cleared, so they match the statement, but they look like one bill paid twice under two vendor names.`,
      proposed_entry: dc(s("refund_account"), s("expense_account"), n("amount"), `Duplicate payment ${s("invoice_num")}: refund due`),
      client_question: `Was ${s("invoice_num") || "this bill"} paid twice? If so, can you request a refund or credit from the vendor?`,
    };
    case "C3": return {
      why: `${s("vendor")} ${$(n("amount"))} is coded to ${name(s("current_account"))}. ${s("reasons")[0].toUpperCase()}${s("reasons").slice(1)}. Reclassifying moves the cost, not the cash.`,
      proposed_entry: dc(s("expected_account"), s("current_account"), n("amount"), `Reclass ${s("vendor")} to ${name(s("expected_account"))}`),
      ...(s("expected_account") === "3020" ? { client_question: `Was the ${s("vendor")} charge personal? If so we'll record it as an owner distribution.` }
        : s("expected_account") === "1500" ? { client_question: `Was the ${s("vendor")} purchase for the business, and will it be used for more than a year?` } : {}),
    };
    case "C4": return {
      why: `${s("vendor")} was paid ${$(n("paid"))} for a ${n("term_months")}-month term and expensed all at once. Spread evenly that is ${$(n("monthly"))} a month; ${n("months_remaining")} months (${$(n("reclass_amount"))}) belong to future periods.`,
      proposed_entry: dc(s("prepaid_account"), s("expense_account"), n("reclass_amount"), `Defer unexpired ${s("vendor")} premium`),
    };
    case "C5": return {
      why: `${s("vendor")} was accrued in each prior month, but not this month. Its invoice ${s("invoice_num")} for ${$(n("amount"))} is dated ${s("invoice_date")} and covers service through ${s("service_date")}, so the cost belongs in this period.`,
      proposed_entry: dc(s("expense_account"), s("accrued_account"), n("amount"), `Accrue ${s("vendor")} usage`),
    };
    case "C6": {
      const down = n("residual") < 0;
      return {
        why: `${name(s("account"))} was ${$(n("current"))} this month against a prior average of ${$(n("prior_average"))} (${n("pct")}%), while revenue moved ${n("revenue_change_pct")}%. No memo explains the ${down ? "drop" : "increase"}.`,
        proposed_entry: down && f.accounts.includes(s("accrued_account")) ? dc(s("account"), s("accrued_account"), Math.abs(n("residual")), "Estimated unrecorded purchases, pending client confirmation") : [],
        client_question: down ? `${name(s("account"))} is much lower than usual. Are there bills for this month that haven't been entered?` : `What drove the higher ${name(s("account"))} this month?`,
      };
    }
    case "C7": return {
      why: `A ${$(n("amount"))} manual journal entry was posted with these warning signs: ${s("signals")}. Entries like this often hide a plug or a misposting.`,
      proposed_entry: dc(s("credit_account"), s("debit_account"), n("amount"), "Reverse unsupported journal entry pending support"),
      client_question: `What was the ${$(n("amount"))} journal entry to ${name(s("debit_account"))} for? Do you have support for it?`,
    };
    case "C8": return {
      why: `${s("customer")} was invoiced ${$(n("amount"))} on ${s("posted")} for service on ${s("service_date")}. The revenue belongs in the month the service happens, not the month it was invoiced.`,
      proposed_entry: dc(s("account"), s("offset_account"), n("amount"), `Move ${s("customer")} revenue to the service month`),
    };
    case "C9": return {
      why: `${name(s("account"))} has a ${s("side")} balance of ${$(n("balance"))}, which it shouldn't.${x.unsupported_vendor ? ` ${s("unsupported_vendor")} (${$(n("unsupported_amount"))}) was coded here with no accrual behind it.` : ""}`,
      proposed_entry: x.suggested_account ? dc(s("suggested_account"), s("account"), n("unsupported_amount"), `Reclass ${s("unsupported_vendor")} to ${name(s("suggested_account"))}`) : [],
      ...(x.suggested_account ? {} : { client_question: `What were the payments coded to ${name(s("account"))} this month?` }),
    };
  }
  throw new Error(`no template for ${f.check_id}`);
}

const client = process.env.ANTHROPIC_API_KEY ? new Anthropic() : null;

async function llmExplain(prompt: string): Promise<{ e: Explanation; usd: number }> {
  const res = await client!.messages.create({
    model: MODEL, max_tokens: 2000,
    output_config: { format: { type: "json_schema", schema: SCHEMA } },
    messages: [{ role: "user", content: prompt }],
  });
  const text = res.content.find((b) => b.type === "text");
  if (res.stop_reason === "refusal" || !text || text.type !== "text") throw new Error(`no output (${res.stop_reason})`);
  return { e: JSON.parse(text.text), usd: (res.usage.input_tokens * 2 + res.usage.output_tokens * 10) / 1e6 };
}

export interface Explained {
  explanation: Explanation | null; source: "llm" | "llm-cache" | "template"; verified: boolean;
  problems: string[]; attempts: number; ms: number; usd: number;
}

/** Explain, verify, retry once on failure. Never returns an unverified explanation. */
export async function explain(f: Finding, rows: Line[], accounts: Account[], txnIds: Set<string>): Promise<Explained> {
  const t0 = Date.now(), coa = new Set(accounts.map((a) => a.num));
  const name = (a: string) => accounts.find((x) => x.num === a)?.name ?? a;
  if (!client && !process.env.EXPLAIN_CACHE_ONLY) {
    const e = templateExplain(f, name), problems = verify(f, e, txnIds, rows, coa);
    return { explanation: problems.length ? null : e, source: "template", verified: !problems.length, problems, attempts: 1, ms: Date.now() - t0, usd: 0 };
  }
  const prompt = readFileSync(join(process.cwd(), "prompts/explain.md"), "utf8")
    .replace("{{finding}}", JSON.stringify({ ...f, id: undefined }, null, 1))
    .replace("{{rows}}", rows.map((l) => [l.txnId, l.date, l.type, l.num, l.name, l.memo, l.account, l.debit, l.credit, l.serviceDate].join(" | ")).join("\n"))
    .replace("{{accounts}}", accounts.map((a) => `${a.num} ${a.name} (${a.type})`).join("\n"));
  const file = join(CACHE, `${f.id}-${createHash("sha256").update(prompt).digest("hex").slice(0, 16)}.json`);
  let usd = 0, problems: string[] = [];
  for (let attempt = 1; attempt <= 2; attempt++) {
    let e: Explanation, source: Explained["source"] = "llm-cache";
    if (attempt === 1 && existsSync(file)) e = JSON.parse(readFileSync(file, "utf8"));
    else if (client) { const r = await llmExplain(prompt); e = r.e; usd += r.usd; source = "llm"; }
    else break;
    problems = verify(f, e, txnIds, rows, coa);
    if (!problems.length) {
      mkdirSync(CACHE, { recursive: true });
      writeFileSync(file, JSON.stringify(e, null, 2));
      return { explanation: e, source, verified: true, problems, attempts: attempt, ms: Date.now() - t0, usd };
    }
  }
  return { explanation: null, source: client ? "llm" : "llm-cache", verified: false, problems, attempts: 2, ms: Date.now() - t0, usd };
}
