"use client";
import { useState } from "react";
import { ChevronDown, FileText } from "lucide-react";
import { prettyDate } from "@/lib/dates";
import type { Shared } from "./workspace";
import { Avatar, Badge, Button, Card, Empty, PageHeader, cn } from "./ui";

export function MeetingsView({ data, go }: Shared) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <div className="animate-rise">
      <PageHeader title="Meetings" sub="Every meeting the agent has processed." actions={<Button variant="primary" onClick={() => go("capture")}>New meeting</Button>} />
      {data.meetings.length === 0 ? (
        <Empty icon={<FileText className="h-5 w-5" />} title="No meetings yet">Capture your first meeting to get started.</Empty>
      ) : (
        <div className="space-y-3">
          {data.meetings.map((m) => {
            const decisions = data.decisions.filter((d) => d.meeting_id === m.id);
            const tasks = data.tasks.filter((t) => t.meeting_id === m.id);
            const isOpen = open === m.id;
            return (
              <Card key={m.id} className="p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-xs tabular-nums text-faint">{prettyDate(m.held_on)}</div>
                    <h3 className="mt-0.5 font-semibold tracking-[-0.01em]">{m.title}</h3>
                  </div>
                  <div className="flex -space-x-1.5">
                    {m.attendees.slice(0, 6).map((a) => <span key={a} className="rounded-full ring-2 ring-surface"><Avatar name={a} size={24} /></span>)}
                  </div>
                </div>
                {m.summary && <p className="mt-2 text-sm leading-relaxed text-soft">{m.summary}</p>}
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <Badge>{decisions.length} decision{decisions.length === 1 ? "" : "s"}</Badge>
                  <Badge>{tasks.length} task{tasks.length === 1 ? "" : "s"}</Badge>
                  {m.created_by && <span className="text-xs text-faint">captured by {m.created_by}</span>}
                  {m.transcript && (
                    <button onClick={() => setOpen(isOpen ? null : m.id)} className="ml-auto inline-flex items-center gap-1 text-[13px] text-soft hover:text-ink">
                      Original input <ChevronDown className={cn("h-4 w-4 transition-transform", isOpen && "rotate-180")} />
                    </button>
                  )}
                </div>
                {isOpen && <p className="mt-3 whitespace-pre-wrap rounded-lg bg-raised p-3 text-[13px] leading-relaxed text-soft">{m.transcript}</p>}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
