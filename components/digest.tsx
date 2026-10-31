"use client";
import { useState } from "react";
import { AlertCircle, Check, Clock, Copy, Hourglass, Sparkles } from "lucide-react";
import { api, localToday } from "@/lib/client";
import { prettyDate } from "@/lib/dates";
import type { Shared } from "./workspace";
import { Avatar, Button, Card, PageHeader, cn } from "./ui";

type Digest = { person: string; brief: string; overdue: any[]; dueThisWeek: any[]; noDate: any[]; done: any[]; owedToMe: any[]; decisions: any[] };

export function DigestView({ mode, data }: Shared) {
  const [person, setPerson] = useState(data.me.name);
  const [digest, setDigest] = useState<Digest | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [copied, setCopied] = useState(false);

  async function generate(p = person) {
    setBusy(true);
    setErr("");
    try {
      setDigest(await api<Digest>(mode, "/api/digest", { method: "POST", body: JSON.stringify({ person: p, today: localToday() }) }));
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  }

  function asText(d: Digest) {
    const line = (t: any) => `- ${t.title}${t.due_date ? ` (due ${prettyDate(t.due_date)})` : ""}`;
    return [
      `Weekly digest for ${d.person}`, "", d.brief, "",
      d.overdue.length ? `Overdue:\n${d.overdue.map(line).join("\n")}\n` : "",
      d.dueThisWeek.length ? `Due this week:\n${d.dueThisWeek.map(line).join("\n")}\n` : "",
      d.owedToMe.length ? `Waiting on others:\n${d.owedToMe.map((t: any) => `- ${t.owner || "Unassigned"}: ${t.title}`).join("\n")}\n` : "",
      d.decisions.length ? `Decisions this week:\n${d.decisions.map((x: any) => `- ${x.text}`).join("\n")}` : "",
    ].filter(Boolean).join("\n");
  }

  const people = data.people.map((p) => p.name);

  return (
    <div className="animate-rise">
      <PageHeader title="Weekly digest" sub="A one-minute read per person: what’s overdue, what’s due, and who they’re waiting on." />

      <Card className="mb-6 flex flex-wrap items-end gap-3 p-4">
        <label className="min-w-[220px] flex-1">
          <span className="mb-1.5 block text-[13px] font-medium text-soft">Person</span>
          <select value={person} onChange={(e) => { setPerson(e.target.value); setDigest(null); }} className="h-9 w-full rounded-lg border border-line bg-surface px-3 text-sm">
            {people.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </label>
        <Button variant="primary" loading={busy} icon={<Sparkles className="h-4 w-4" />} onClick={() => generate()}>Generate digest</Button>
      </Card>

      {err && <p className="mb-4 text-sm text-bad">{err}</p>}

      {digest && (
        <Card className="animate-rise overflow-hidden">
          <div className="flex items-center justify-between gap-3 border-b border-line bg-raised px-5 py-4">
            <div className="flex items-center gap-3">
              <Avatar name={digest.person} size={36} />
              <div>
                <div className="font-semibold">{digest.person}</div>
                <div className="text-xs text-faint">Week of {prettyDate(localToday())}</div>
              </div>
            </div>
            <Button size="sm" icon={copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />} onClick={async () => { await navigator.clipboard.writeText(asText(digest)); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>
              {copied ? "Copied" : "Copy"}
            </Button>
          </div>
          <div className="p-5">
            <p className="text-[15px] leading-relaxed">{digest.brief}</p>
            <div className="mt-6 grid gap-5 md:grid-cols-2">
              <Block icon={<AlertCircle className="h-4 w-4" />} tone="bad" title="Overdue" items={digest.overdue} />
              <Block icon={<Clock className="h-4 w-4" />} tone="brand" title="Due in the next 7 days" items={digest.dueThisWeek} />
              <Block icon={<Hourglass className="h-4 w-4" />} tone="ask" title="Waiting on others" items={digest.owedToMe} showOwner />
              <Block icon={<Check className="h-4 w-4" />} tone="good" title="Completed" items={digest.done} />
            </div>
            {digest.decisions.length > 0 && (
              <div className="mt-6 border-t border-line pt-5">
                <h3 className="mb-2 text-[13px] font-semibold uppercase tracking-[0.06em] text-soft">Decisions this week</h3>
                <ul className="space-y-1.5 text-sm">
                  {digest.decisions.map((d: any) => (
                    <li key={d.id} className={cn(d.status === "superseded" && "text-faint line-through")}>{d.text}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </Card>
      )}
    </div>
  );
}

function Block({ icon, title, items, tone, showOwner }: { icon: React.ReactNode; title: string; items: any[]; tone: "bad" | "brand" | "ask" | "good"; showOwner?: boolean }) {
  const toneCls = { bad: "text-bad", brand: "text-brand", ask: "text-ask", good: "text-good" }[tone];
  return (
    <div>
      <h3 className={cn("mb-2 flex items-center gap-2 text-[13px] font-semibold", toneCls)}>{icon} {title} <span className="font-normal text-faint">{items.length}</span></h3>
      {items.length === 0 ? (
        <p className="text-sm text-faint">Nothing here.</p>
      ) : (
        <ul className="space-y-2">
          {items.map((t: any) => (
            <li key={t.id} className="flex items-start justify-between gap-3 text-sm">
              <span className="min-w-0">
                {showOwner && <span className="font-medium">{t.owner || "Unassigned"}: </span>}
                {t.title}
              </span>
              {t.due_date && <span className="shrink-0 text-xs tabular-nums text-faint">{prettyDate(t.due_date)}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
