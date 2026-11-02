# Demo brief

- Audience: CPA-firm reviewers and the Cranston team.
- Problem they recognize: every bank and card account reconciles, yet the books can still be wrong.
- One task to show: run the close review and approve a fix.
- Visible result that proves it worked: Adjusted net income changes from $14,323.96 to $15,639.36 after approving the duplicate-payment entry.
- Why the result matters: reconciled doesn't mean right; the duplicate payment cleared the bank, so reconciliation can't see it.
- Destination and length: README GIF and a ~30–45 s MP4.
- What the viewer should do next: open the repo and read results/findings.md.

Demo data: the fictional Harbor & Pine Coffee Co. sample shipped in the repo, replayed from
public/demo/run.json (produced by `npm run eval`). Nothing is mocked beyond replay: the queue,
amounts and entry are the real pipeline output. The app is stateless in replay mode (no database,
no keys), so each take starts from the same page; no reset is needed. Requires `npm run build` first.

Numbers in captions: 15 items = results/metrics.json close_review.findings; net income before/after
= public/demo/run.json net_income and C2-03 ni_effect (+$1,315.40).

From the repo root:

    reshoot preview demo/reshoot.toml
    reshoot run demo/reshoot.toml
