"use client";
import { useMemo, useState } from "react";
import { ArrowRight, BookOpenCheck, Search } from "lucide-react";
import { prettyDate } from "@/lib/dates";
import type { Shared } from "./workspace";
import { Badge, Card, Empty, PageHeader, cn, inputCls } from "./ui";

export function DecisionsView({ data }: Shared) {
  const [filter, setFilter] = useState<"active" | "all">("all");
  const [q, setQ] = useState("");
  const byId = useMemo(() => new Map(data.decisions.map((d) => [d.id, d])), [data.decisions]);
  const meetingTitle = useMemo(() => new Map(data.meetings.map((m) => [m.id, m.title])), [data.meetings]);

  const list = data.decisions.filter((d) => (filter === "all" || d.status === "active") && (!q || `${d.text} ${d.topic}`.toLowerCase().includes(q.toLowerCase())));

  return (
    <div className="animate-rise">
      <PageHeader title="Decision log" sub="One source of truth for what the team agreed. The agent checks every new meeting against this." />

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div className="relative max-w-xs flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
          <input className={cn(inputCls, "pl-9")} placeholder="Search decisions" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="inline-flex rounded-lg border border-line bg-surface p-0.5">
          {(["all", "active"] as const).map((f) => (
            <button key={f} onClick={() => setFilter(f)} className={cn("rounded-md px-3 py-1.5 text-sm", filter === f ? "bg-ink text-canvas" : "text-soft hover:text-ink")}>
              {f === "all" ? "All" : "Active only"}
            </button>
          ))}
        </div>
      </div>

      {list.length === 0 ? (
        <Empty icon={<BookOpenCheck className="h-5 w-5" />} title="No decisions yet">Approved decisions from your meetings will appear here.</Empty>
      ) : (
        <Card className="divide-y divide-line">
          {list.map((d) => {
            const replacedBy = d.superseded_by ? byId.get(d.superseded_by) : null;
            return (
              <div key={d.id} className={cn("flex gap-4 px-4 py-4", d.status === "superseded" && "bg-raised/60")}>
                <div className="w-20 shrink-0 pt-0.5 text-xs tabular-nums text-faint">{prettyDate(d.made_on)}</div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    {d.topic && <Badge>{d.topic}</Badge>}
                    {d.status === "active" ? <Badge tone="good">Active</Badge> : <Badge tone="warn">Replaced</Badge>}
                  </div>
                  <p className={cn("mt-1.5 leading-snug", d.status === "superseded" ? "text-soft line-through decoration-faint" : "font-medium")}>{d.text}</p>
                  <div className="mt-1 text-xs text-faint">
                    {d.made_by && <>by {d.made_by} · </>}
                    {d.meeting_id && meetingTitle.get(d.meeting_id)}
                  </div>
                  {replacedBy && (
                    <p className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-surface px-2 py-1 text-[13px] text-soft ring-1 ring-line">
                      <ArrowRight className="h-3.5 w-3.5 text-warn" /> Now: {replacedBy.text}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </Card>
      )}
    </div>
  );
}
