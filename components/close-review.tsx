"use client";

import {
  ArrowRight, ArrowRightLeft, CalendarClock, CalendarX, Check, ChevronRight, Copy, FileCheck2, Inbox, LayoutGrid,
  Loader2, MessageCircleQuestion, PenLine, Receipt, Scale, Scissors, Settings, TrendingUp, Users, X,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { RunData, RunFinding } from "@/lib/pipeline";
import { cn } from "@/lib/utils";

type Run = RunData & { eval?: { planted: number; caught: number; decoys: number; decoys_flagged: number; other_false_alarms: number } };
type Decision = "approved" | "rejected";
type Phase = "idle" | "importing" | "reconciling" | "reviewing" | "done";
interface FeedItem { at: string; text: string; tone: "ok" | "warn" | "info" }

const CHECKS: Record<string, { label: string; icon: typeof Copy }> = {
  C1: { label: "Missing recurring bill", icon: CalendarX },
  C2: { label: "Duplicate payment", icon: Copy },
  C3: { label: "Wrong account", icon: ArrowRightLeft },
  C4: { label: "Prepaid expensed at once", icon: CalendarClock },
  C5: { label: "Unrecorded accrual", icon: Receipt },
  C6: { label: "Unusual swing", icon: TrendingUp },
  C7: { label: "Manual journal entry", icon: PenLine },
  C8: { label: "Revenue cut-off", icon: Scissors },
  C9: { label: "Odd balance", icon: Scale },
};
const TOUR = [["C2", "Duplicate vendor payment: two names, one invoice, both cleared the bank"], ["C1", "Missing recurring rent: nothing hit the bank, so nothing to reconcile"], ["C4", "Annual insurance expensed in one month: the cash is right, the timing isn't"]] as const;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const money = (x: number) => x.toLocaleString("en-US", { style: "currency", currency: "USD" });
const signed = (x: number) => `${x >= 0 ? "+" : "−"}${money(Math.abs(x))}`;
const short = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const now = () => new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", second: "2-digit" });
const monthLabel = (p: string) => new Date(`${p}-01T00:00:00Z`).toLocaleString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });

export function CloseReview() {
  const [data, setData] = useState<Run | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState(0);
  const [reconciled, setReconciled] = useState(0);
  const [shown, setShown] = useState(0);
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [decisions, setDecisions] = useState<Record<string, Decision>>({});
  const [openId, setOpenId] = useState<string | null>(null);
  const [tab, setTab] = useState("queue");
  const [tourStep, setTourStep] = useState<number | null>(null);
  const [panel, setPanel] = useState<"how" | "live" | null>(null);
  const token = useRef(0);

  useEffect(() => {
    fetch("/demo/run.json").then((r) => r.json()).then(setData);
    if (new URLSearchParams(location.search).get("record") === "1") document.documentElement.classList.add("record");
  }, []);

  const log = (text: string, tone: FeedItem["tone"] = "info") => setFeed((f) => [{ at: now(), text, tone }, ...f]);

  async function replay(run: Run) {
    const t = ++token.current, live = () => token.current === t;
    setDecisions({}); setOpenId(null); setFeed([]); setShown(0); setReconciled(0); setProgress(0); setTab("queue");
    setPhase("importing");
    for (let p = 0; p <= 100 && live(); p += 4) { setProgress(p); await sleep(35); }
    if (!live()) return;
    log(`Imported QuickBooks export: ${run.stats.transactions} transactions, ${run.stats.lines} ledger lines`);
    setPhase("reconciling");
    const recs = run.reconciliations.filter((r) => r.month === run.period);
    for (let i = 0; i < recs.length && live(); i++) {
      await sleep(550);
      setReconciled(i + 1);
      log(`${recs[i].name} reconciled: ${money(recs[i].difference)} difference${recs[i].outstanding ? `, ${recs[i].outstanding} outstanding` : ""}`, "ok");
    }
    setPhase("reviewing");
    for (let i = 0; i < run.findings.length && live(); i++) {
      await sleep(400);
      setShown(i + 1);
      log(`Close Review found: ${run.findings[i].title}`, "warn");
    }
    if (!live()) return;
    setPhase("done");
    const e = run.eval;
    log(e ? `Reconciled ✓. Close Review: ${e.planted} planted, ${e.caught} caught, ${e.decoys_flagged}/${e.decoys} decoys flagged, ${e.other_false_alarms} other false alarm${e.other_false_alarms === 1 ? "" : "s"}.` : `Reconciled ✓. Close Review: ${run.findings.length} items need review.`, "ok");
  }

  function decide(id: string, d: Decision | null) {
    setDecisions((x) => { const n = { ...x }; if (d) n[id] = d; else delete n[id]; return n; });
    fetch("/api/review-actions", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ findingId: id, action: d === "approved" ? "approve" : d === "rejected" ? "reject" : "undo" }) }).catch(() => {});
  }

  async function tour() {
    if (!data) return;
    if (phase !== "done") await replay(data);
    const t = token.current;
    for (let i = 0; i < TOUR.length && token.current === t; i++) {
      const f = data.findings.find((x) => x.check_id === TOUR[i][0]);
      if (!f) continue;
      setTourStep(i); setOpenId(f.id);
      await sleep(6000);
      if (token.current !== t) break;
      decide(f.id, "approved");
      log(`Approved: ${f.title} (${signed(f.ni_effect)} net income)`, "ok");
      await sleep(1200);
      setOpenId(null);
      await sleep(600);
    }
    setTourStep(null);
  }

  if (!data) return <div className="flex flex-1 items-center justify-center text-subtle-text"><Loader2 className="mr-2 size-4 animate-spin" />Loading…</div>;

  const visible = data.findings.slice(0, shown);
  const pending = visible.filter((f) => !decisions[f.id]);
  const approved = visible.filter((f) => decisions[f.id] === "approved");
  const rejected = visible.filter((f) => decisions[f.id] === "rejected");
  const adjusted = data.net_income + approved.reduce((s, f) => s + f.ni_effect, 0);
  const recs = data.reconciliations.filter((r) => r.month === data.period);
  const open = data.findings.find((f) => f.id === openId) ?? null;
  const running = phase !== "idle" && phase !== "done";
  const status = phase === "idle" ? "Not started" : running ? "Running…" : pending.length ? "In review" : "Ready to close";

  return (
    <div className="record-frame flex flex-1 bg-paper">
      <nav className="hidden w-14 shrink-0 flex-col items-center gap-5 border-r bg-background py-4 sm:flex" aria-label="App">
        <div className="flex size-8 items-center justify-center rounded-md bg-primary font-serif text-sm text-primary-foreground">CR</div>
        {[LayoutGrid, Users, FileCheck2, Inbox, Settings].map((I, i) => (
          <span key={i} className={cn("flex size-9 items-center justify-center rounded-md text-subtle-text", i === 2 && "bg-swiss-tan text-heading")}><I className="size-4" /></span>
        ))}
      </nav>

      <main className="flex min-w-0 flex-1 flex-col overflow-auto">
        <header className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b bg-background px-4 py-3 sm:px-6">
          <ol className="flex min-w-0 items-center gap-1 text-sm text-subtle-text">
            <li>Clients</li><ChevronRight className="size-3.5" /><li>Harbor &amp; Pine</li><ChevronRight className="size-3.5" />
            <li className="truncate text-foreground">{monthLabel(data.period)} close</li>
          </ol>
          <Badge variant="outline" className={cn("rounded-full", phase === "done" && !pending.length && "border-mint bg-mint/30")}>{status}</Badge>
          <div className="ml-auto flex items-center gap-3 text-sm">
            <button className="text-ring hover:underline" onClick={() => setPanel("how")}>How it works</button>
            <Link className="text-ring hover:underline" href="/whats-next">What&apos;s next</Link>
            <button className="text-subtle-text hover:text-foreground" onClick={() => setPanel("live")}>Live mode</button>
          </div>
        </header>

        <div className="flex flex-col gap-5 p-4 sm:p-6">
          <section className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="font-serif text-3xl text-heading sm:text-4xl">{monthLabel(data.period)} close</h1>
              <p className="mt-1 max-w-xl text-sm text-subtle-text">{data.client} (fictional). Every bank and card account reconciles. Close Review reads the ledger for what reconciliation can&apos;t see.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={tour} disabled={running || tourStep !== null}>Show me the gap</Button>
              <Button onClick={() => replay(data)} disabled={running || tourStep !== null}>{phase === "idle" ? "Run close review" : "Run again"} <ArrowRight /></Button>
            </div>
          </section>

          {phase === "importing" && (
            <div className="rounded-lg border bg-background p-4">
              <p className="mb-2 text-sm text-subtle-text">Importing QuickBooks export…</p>
              <Progress value={progress} />
            </div>
          )}

          <section className="grid gap-4 md:grid-cols-2">
            <div className="rounded-lg border bg-background p-5">
              <p className="text-sm text-subtle-text">Bank &amp; card reconciliation</p>
              <div className="mt-2 flex items-center gap-3">
                <span className="font-serif text-4xl text-heading">{phase === "idle" || phase === "importing" ? "—" : `${reconciled}/${recs.length}`}</span>
                {reconciled === recs.length && reconciled > 0 && <Badge className="rounded-full bg-mint text-heading"><Check /> Reconciled, {recs.length}/{recs.length} accounts</Badge>}
              </div>
              <ul className="mt-3 space-y-1 text-sm">
                {recs.map((r, i) => (
                  <li key={r.account} className="flex items-center gap-2">
                    <span className={cn("flex size-4 items-center justify-center rounded-full border", i < reconciled && "border-mint bg-mint")}>{i < reconciled && <Check className="size-3" />}</span>
                    <span className="flex-1">{r.name}</span>
                    <span className="tabular-nums text-subtle-text">{i < reconciled ? `${money(r.difference)} diff` : ""}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-lg border bg-background p-5">
              <p className="text-sm text-subtle-text">Close Review</p>
              <div className="mt-2 flex items-center gap-3">
                <span className="font-serif text-4xl text-heading">{phase === "idle" ? "—" : pending.length}</span>
                {shown > 0 && (pending.length
                  ? <Badge className="rounded-full bg-peach text-heading">{pending.length} item{pending.length === 1 ? "" : "s"} need review</Badge>
                  : <Badge className="rounded-full bg-mint text-heading"><Check /> All reviewed</Badge>)}
              </div>
              <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
                <div><dt className="text-subtle-text">{monthLabel(data.period).split(" ")[0]} net income</dt><dd className="font-serif text-xl text-heading tabular-nums">{money(data.net_income)}</dd></div>
                <div><dt className="text-subtle-text">Adjusted net income</dt>
                  <dd className="font-serif text-xl tabular-nums text-heading">{approved.length ? <>{money(adjusted)} <span className="font-sans text-xs text-subtle-text">({signed(adjusted - data.net_income)})</span></> : "—"}</dd></div>
              </dl>
            </div>
          </section>

          {phase === "done" && data.eval && (
            <p className="rounded-lg border border-stone bg-swiss-tan px-4 py-3 text-sm text-heading">
              Reconciled: ✓. Close Review: <b>{data.eval.planted}</b> planted errors, <b>{data.eval.caught}</b> caught, <b>{data.eval.decoys_flagged}/{data.eval.decoys}</b> decoys flagged, <b>{data.eval.other_false_alarms}</b> other false alarm{data.eval.other_false_alarms === 1 ? "" : "s"}.
            </p>
          )}

          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
            <section className="min-w-0 rounded-lg border bg-background shadow-[0_8px_30px_rgba(43,38,32,0.06)]">
              <Tabs value={tab} onValueChange={(v) => setTab(String(v))}>
                <div className="border-b px-3 py-2">
                  <TabsList>
                    <TabsTrigger value="queue">Needs review ({pending.length})</TabsTrigger>
                    <TabsTrigger value="approved">Approved entries ({approved.length})</TabsTrigger>
                    <TabsTrigger value="rejected" className="hidden sm:inline-flex">Rejected ({rejected.length})</TabsTrigger>
                  </TabsList>
                </div>
                <TabsContent value="queue"><Queue items={pending} empty={phase === "idle" ? "Run the close review to fill the queue." : running ? "Reviewing…" : "Nothing left to review."} onOpen={setOpenId} decide={decide} /></TabsContent>
                <TabsContent value="approved"><Approved items={approved} accounts={data.accounts} undo={(id) => decide(id, null)} /></TabsContent>
                <TabsContent value="rejected"><Queue items={rejected} empty="Nothing rejected." onOpen={setOpenId} decide={decide} /></TabsContent>
              </Tabs>
            </section>

            <aside className="rounded-lg border bg-background p-4">
              <h2 className="font-serif text-lg text-heading">Activity</h2>
              <ul className="mt-2 max-h-[420px] space-y-2 overflow-auto text-sm">
                {!feed.length && <li className="text-subtle-text">No activity yet.</li>}
                {feed.map((f, i) => (
                  <li key={feed.length - i} className="flex gap-2">
                    <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", f.tone === "ok" ? "bg-mint" : f.tone === "warn" ? "bg-peach" : "bg-stone")} />
                    <span className="min-w-0"><span className="block text-xs text-subtle-text tabular-nums">{f.at}</span>{f.text}</span>
                  </li>
                ))}
              </ul>
            </aside>
          </div>

          <p className="text-xs text-subtle-text">Synthetic client data. Review rules are an illustrative sample checklist, not accounting advice. Close Review drafts entries; a reviewer approves every one.</p>
        </div>
      </main>

      <Sheet open={!!open} onOpenChange={(o) => !o && setOpenId(null)}>
        <SheetContent initialFocus={false} className="w-full overflow-y-auto data-[side=right]:w-full sm:max-w-xl data-[side=right]:sm:max-w-xl">
          {open && <Drawer f={open} tour={tourStep !== null ? `Guided tour ${tourStep + 1}/3 · ${TOUR[tourStep][1]}` : null} decision={decisions[open.id]} accounts={data.accounts} period={data.period}
            decide={(d) => { decide(open.id, d); setOpenId(null); }} />}
        </SheetContent>
      </Sheet>

      <Sheet open={panel === "how"} onOpenChange={(o) => !o && setPanel(null)}>
        <SheetContent side="bottom" className="mx-auto max-w-4xl rounded-t-xl p-6">
          <SheetHeader className="p-0"><SheetTitle className="font-serif text-2xl font-normal text-heading">How it works</SheetTitle><SheetDescription>AI prepares, the firm approves.</SheetDescription></SheetHeader>
          <ol className="grid gap-3 sm:grid-cols-4">
            {[["QuickBooks export", "Chart of accounts, general ledger, statements (CSV)."], ["Reconcile", "Ledger vs statement for every bank and card account."], ["Review checks", "Nine deterministic checks find issues; an LLM only explains them and drafts the entry, which code verifies."], ["You approve", "Each finding cites its ledger rows and a balanced entry. Approve or reject."]].map(([t, d], i) => (
              <li key={t} className="relative rounded-lg border bg-paper p-4">
                <span className="text-xs text-subtle-text">Step {i + 1}</span>
                <p className="font-serif text-lg text-heading">{t}</p>
                <p className="mt-1 text-sm text-subtle-text">{d}</p>
                {i < 3 && <ArrowRight className="absolute top-1/2 -right-3 hidden size-4 -translate-y-1/2 bg-background text-subtle-text sm:block" />}
              </li>
            ))}
          </ol>
        </SheetContent>
      </Sheet>

      <LiveMode open={panel === "live"} onClose={() => setPanel(null)} onRun={(r) => { setPanel(null); setData(r); replay(r); }} />
    </div>
  );
}

function Queue({ items, empty, onOpen, decide }: { items: RunFinding[]; empty: string; onOpen: (id: string) => void; decide: (id: string, d: Decision) => void }) {
  if (!items.length) return <p className="px-4 py-10 text-center text-sm text-subtle-text">{empty}</p>;
  return (
    <Table>
      <TableHeader>
        <TableRow><TableHead className="pl-4">Finding</TableHead><TableHead className="text-right">Amount</TableHead><TableHead className="hidden xl:table-cell">Account</TableHead><TableHead className="hidden sm:table-cell">Confidence</TableHead><TableHead className="pr-4 text-right"><span className="sr-only">Actions</span></TableHead></TableRow>
      </TableHeader>
      <TableBody>
        {items.map((f) => {
          const I = CHECKS[f.check_id].icon;
          return (
            <TableRow key={f.id} className="cursor-pointer" onClick={() => onOpen(f.id)}>
              <TableCell className="w-full max-w-0 pl-4 whitespace-normal">
                <div className="flex items-start gap-2.5">
                  <span className="mt-0.5 hidden size-7 shrink-0 items-center justify-center rounded-md bg-swiss-tan text-heading sm:flex"><I className="size-3.5" /></span>
                  <span className="min-w-0"><span className="block font-medium leading-snug">{f.title}</span><span className="text-xs text-subtle-text">{f.check_id} · {CHECKS[f.check_id].label}</span></span>
                </div>
              </TableCell>
              <TableCell className="text-right tabular-nums">{money(f.amount)}</TableCell>
              <TableCell className="hidden text-subtle-text xl:table-cell">{f.evidence[0]?.accountName ?? f.accounts[0]}</TableCell>
              <TableCell className="hidden sm:table-cell"><Badge variant="outline" className="rounded-full text-subtle-text">{Math.round(f.confidence * 100)}%</Badge></TableCell>
              <TableCell className="pr-4 text-right">
                <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                  <Button size="sm" aria-label="Approve" onClick={() => decide(f.id, "approved")} disabled={!f.verified}><Check /><span className="hidden 2xl:inline">Approve</span></Button>
                  <Button size="sm" variant="outline" aria-label="Reject" onClick={() => decide(f.id, "rejected")}><X /><span className="hidden 2xl:inline">Reject</span></Button>
                </div>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

function EntryTable({ f, accounts }: { f: RunFinding; accounts: RunData["accounts"] }) {
  const name = (a: string) => `${a} ${accounts.find((x) => x.num === a)?.name ?? ""}`;
  const dr = f.proposed_entry.reduce((s, l) => s + l.debit, 0), cr = f.proposed_entry.reduce((s, l) => s + l.credit, 0);
  return (
    <Table>
      <TableHeader><TableRow><TableHead>Account</TableHead><TableHead className="text-right">Debit</TableHead><TableHead className="text-right">Credit</TableHead></TableRow></TableHeader>
      <TableBody>
        {f.proposed_entry.map((l, i) => (
          <TableRow key={i}><TableCell className="whitespace-normal">{name(l.account)}<span className="block text-xs text-subtle-text">{l.memo}</span></TableCell>
            <TableCell className="text-right tabular-nums">{l.debit ? money(l.debit) : ""}</TableCell><TableCell className="text-right tabular-nums">{l.credit ? money(l.credit) : ""}</TableCell></TableRow>
        ))}
        <TableRow className="font-medium"><TableCell>Total {Math.abs(dr - cr) < 0.005 && <Badge className="ml-1 rounded-full bg-mint text-heading"><Check /> Balanced</Badge>}</TableCell>
          <TableCell className="text-right tabular-nums">{money(dr)}</TableCell><TableCell className="text-right tabular-nums">{money(cr)}</TableCell></TableRow>
      </TableBody>
    </Table>
  );
}

function Drawer({ f, tour, decision, accounts, period, decide }: { f: RunFinding; tour: string | null; decision?: Decision; accounts: RunData["accounts"]; period: string; decide: (d: Decision) => void }) {
  const I = CHECKS[f.check_id].icon;
  const missing = f.check_id === "C1" || f.check_id === "C5";
  return (
    <div className="flex flex-col gap-5 p-5">
      {tour && <p className="rounded-md bg-peach/40 px-3 py-2 text-sm text-heading">{tour}</p>}
      <SheetHeader className="p-0">
        <p className="flex items-center gap-2 text-xs text-subtle-text"><I className="size-3.5" />{f.check_id} · {CHECKS[f.check_id].label} · {Math.round(f.confidence * 100)}% confidence</p>
        <SheetTitle className="font-serif text-2xl font-normal leading-tight text-heading">{f.title}</SheetTitle>
        <SheetDescription className="tabular-nums">{money(f.amount)}{decision && ` · ${decision}`}</SheetDescription>
      </SheetHeader>

      <section>
        <h3 className="mb-1 text-xs font-medium tracking-wide text-subtle-text uppercase">Why</h3>
        <p className="text-sm leading-relaxed">{f.verified && f.why ? f.why : "Explanation unavailable."}</p>
        {f.verified && f.client_question && (
          <p className="mt-3 flex gap-2 rounded-md border border-stone bg-swiss-tan p-3 text-sm"><MessageCircleQuestion className="mt-0.5 size-4 shrink-0 text-subtle-text" /><span><span className="text-subtle-text">Question for the client: </span>{f.client_question}</span></p>
        )}
      </section>

      <section>
        <h3 className="mb-1 text-xs font-medium tracking-wide text-subtle-text uppercase">Evidence · cited ledger rows</h3>
        <div className="rounded-md border">
          <Table>
            <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Txn</TableHead><TableHead>Name / memo</TableHead><TableHead className="text-right">Amount</TableHead></TableRow></TableHeader>
            <TableBody>
              {f.evidence.map((l, i) => (
                <TableRow key={i} className="bg-peach/15">
                  <TableCell className="tabular-nums">{short(l.date)}</TableCell>
                  <TableCell className="font-mono text-xs">{l.txnId}{l.num && <span className="block text-subtle-text">#{l.num}</span>}</TableCell>
                  <TableCell className="whitespace-normal">{l.name || l.type}<span className="block text-xs text-subtle-text">{[l.accountName, l.memo, l.serviceDate && l.serviceDate !== l.date ? `service ${short(l.serviceDate)}` : ""].filter(Boolean).join(" · ")}</span></TableCell>
                  <TableCell className="text-right tabular-nums">{money(l.debit || -l.credit)}</TableCell>
                </TableRow>
              ))}
              {missing && (
                <TableRow><TableCell colSpan={4} className="border-t border-dashed text-subtle-text italic">{monthLabel(period).split(" ")[0]}: none recorded</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </section>

      <section>
        <h3 className="mb-1 text-xs font-medium tracking-wide text-subtle-text uppercase">Proposed entry</h3>
        {!f.verified ? <p className="text-sm text-subtle-text">No verified entry. Review manually.</p>
          : f.proposed_entry.length ? (
            <>
              <div className="rounded-md border"><EntryTable f={f} accounts={accounts} /></div>
              <p className="mt-2 text-sm">Effect on {monthLabel(period).split(" ")[0]} net income: <b className="tabular-nums">{signed(f.ni_effect)}</b></p>
            </>
          ) : <p className="text-sm text-subtle-text">No entry until the client answers.</p>}
      </section>

      <div className="flex gap-2">
        <Button onClick={() => decide("approved")} disabled={!f.verified}><Check /> Approve</Button>
        <Button variant="outline" onClick={() => decide("rejected")}><X /> Reject</Button>
      </div>
    </div>
  );
}

function Approved({ items, accounts, undo }: { items: RunFinding[]; accounts: RunData["accounts"]; undo: (id: string) => void }) {
  if (!items.length) return <p className="px-4 py-10 text-center text-sm text-subtle-text">Approved entries appear here.</p>;
  return (
    <ul className="divide-y">
      {items.map((f) => (
        <li key={f.id} className="p-4">
          <div className="mb-2 flex items-start justify-between gap-3">
            <p className="font-medium">{f.title}<span className="block text-xs font-normal text-subtle-text">{f.check_id} · net income {signed(f.ni_effect)}</span></p>
            <Button size="sm" variant="ghost" onClick={() => undo(f.id)}>Undo</Button>
          </div>
          {f.proposed_entry.length ? <div className="rounded-md border"><EntryTable f={f} accounts={accounts} /></div> : <p className="text-sm text-subtle-text">No entry; client question sent: {f.client_question}</p>}
        </li>
      ))}
    </ul>
  );
}

function LiveMode({ open, onClose, onRun }: { open: boolean; onClose: () => void; onRun: (r: Run) => void }) {
  const [pw, setPw] = useState("");
  const [files, setFiles] = useState<FileList | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function go(sample: boolean) {
    setBusy(true); setError("");
    const body = new FormData();
    if (!sample && files) for (const f of Array.from(files)) body.append("files", f);
    try {
      const res = await fetch("/api/run", { method: "POST", headers: { "x-demo-password": pw }, body });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      onRun(json);
    } catch (e) { setError(e instanceof Error ? e.message : "Run failed"); } finally { setBusy(false); }
  }
  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full p-6 sm:max-w-md">
        <SheetHeader className="p-0"><SheetTitle className="font-serif text-2xl font-normal text-heading">Live mode</SheetTitle>
          <SheetDescription>Run the real pipeline. Upload QBO-shaped CSVs (chart_of_accounts.csv, general_ledger.csv, statement_&lt;account #&gt;.csv) or use the sample client. Synthetic data only.</SheetDescription></SheetHeader>
        <label className="text-sm">Demo password
          <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} className="mt-1 w-full rounded-md border px-3 py-2 outline-ring" />
        </label>
        <label className="text-sm">CSV files
          <input type="file" multiple accept=".csv" onChange={(e) => setFiles(e.target.files)} className="mt-1 block w-full text-sm" />
        </label>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <div className="flex flex-wrap gap-2">
          <Button disabled={busy || !files?.length} onClick={() => go(false)}>{busy && <Loader2 className="animate-spin" />}Run on uploads <ArrowRight /></Button>
          <Button variant="outline" disabled={busy} onClick={() => go(true)}>Use sample client</Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
