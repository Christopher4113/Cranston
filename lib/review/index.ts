import type { Books, Finding } from "../types";
import { c1, c2, c3, c4, c5, c6, c7, c8, c9 } from "./checks";
import { type Rules, loadRules, makeCtx } from "./context";
import { reconcile } from "./r0";

export function runReview(books: Books, rules: Rules = loadRules()) {
  const ctx = makeCtx(books, rules);
  const accrual = c5(ctx);
  const drafts = [...c1(ctx, accrual.map((f) => String(f.facts.vendor))), ...c2(ctx), ...c3(ctx), ...c4(ctx), ...accrual, ...c7(ctx), ...c8(ctx), ...c9(ctx)];
  // Flux runs last so swings already explained by a finding don't double-count. For a duplicate, only the second payment is the excess.
  drafts.push(...c6(ctx, new Set(drafts.flatMap((f) => (f.check_id === "C2" ? f.cited_txn_ids.slice(1) : f.cited_txn_ids)))));
  const findings: Finding[] = drafts.map((f, i) => ({ ...f, id: `${f.check_id}-${String(i + 1).padStart(2, "0")}` }));
  return { ctx, reconciliations: reconcile(ctx), findings };
}
