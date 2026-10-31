"use client";
import { useMemo, useState } from "react";
import { CalendarCheck, CalendarPlus, Check, ClipboardList, ExternalLink } from "lucide-react";
import { api, localToday } from "@/lib/client";
import { calendarLink, createReminder } from "@/lib/calendar";
import { daysBetween, prettyDate } from "@/lib/dates";
import { samePersonClient } from "@/lib/people";
import type { Task } from "@/lib/types";
import type { Shared } from "./workspace";
import { Avatar, Badge, Card, Empty, PageHeader, cn } from "./ui";

type Tab = "mine" | "owed" | "team";

export function WorkView({ mode, data, reload, googleToken, setGoogleToken }: Shared) {
  const [tab, setTab] = useState<Tab>("mine");
  const [person, setPerson] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const today = localToday();
  const me = data.me.name;
  const meetingTitle = useMemo(() => new Map(data.meetings.map((m) => [m.id, m.title])), [data.meetings]);

  const lists = useMemo(() => {
    const mine = data.tasks.filter((t) => samePersonClient(t.owner, me));
    const owed = data.tasks.filter((t) => samePersonClient(t.requested_by, me) && !samePersonClient(t.owner, me));
    const team = data.tasks.filter((t) => !person || (person === "__none" ? !t.owner : samePersonClient(t.owner, person)));
    return { mine, owed, team };
  }, [data.tasks, me, person]);

  const current = lists[tab];
  const open = current.filter((t) => t.status === "open");
  const groups = [
    { key: "overdue", label: "Overdue", items: open.filter((t) => t.due_date && t.due_date < today) },
    { key: "week", label: "Next 7 days", items: open.filter((t) => t.due_date && t.due_date >= today && daysBetween(today, t.due_date) <= 7) },
    { key: "later", label: "Later", items: open.filter((t) => t.due_date && daysBetween(today, t.due_date) > 7) },
    { key: "nodate", label: "No deadline", items: open.filter((t) => !t.due_date) },
    { key: "done", label: "Done", items: current.filter((t) => t.status === "done") },
  ].filter((g) => g.items.length);

  async function toggleDone(t: Task) {
    setBusy(t.id);
    try {
      await api(mode, "/api/tasks", { method: "PATCH", body: JSON.stringify({ id: t.id, status: t.status === "done" ? "open" : "done" }) });
      await reload();
    } finally { setBusy(null); }
  }

  async function addReminder(t: Task) {
    if (!googleToken) return;
    setBusy(t.id);
    try {
      const id = await createReminder(googleToken, t, data.workspaceName);
      if (id) await api(mode, "/api/tasks", { method: "PATCH", body: JSON.stringify({ id: t.id, calendar_event_id: id }) });
      await reload();
    } catch (e: any) {
      if (e.message === "google_expired") setGoogleToken(null);
      alert(e.message === "google_expired" ? "Your Google connection expired. Use “Reconnect Google Calendar” in the sidebar." : e.message);
    } finally { setBusy(null); }
  }

  const tabs: { id: Tab; label: string; n: number }[] = [
    { id: "mine", label: "My commitments", n: lists.mine.filter((t) => t.status === "open").length },
    { id: "owed", label: "Owed to me", n: lists.owed.filter((t) => t.status === "open").length },
    { id: "team", label: "Team", n: data.tasks.filter((t) => t.status === "open").length },
  ];

  return (
    <div className="animate-rise">
      <PageHeader title="Commitments" sub="What you promised, what others promised you, and everything the team is on the hook for." />

      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-full border border-line bg-surface p-1">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={cn("flex items-center gap-2 rounded-full px-3.5 py-1.5 text-sm transition-colors", tab === t.id ? "bg-ink text-canvas" : "text-soft hover:text-ink")}
            >
              {t.label}
              <span className={cn("text-xs tabular-nums", tab === t.id ? "opacity-70" : "text-faint")}>{t.n}</span>
            </button>
          ))}
        </div>
        {tab === "team" && (
          <select value={person} onChange={(e) => setPerson(e.target.value)} className="h-10 rounded-full border border-line bg-surface px-4 text-sm" aria-label="Filter by owner">
            <option value="">Everyone</option>
            {data.people.map((p) => <option key={p.id} value={p.name}>{p.name}</option>)}
            <option value="__none">Unassigned</option>
          </select>
        )}
      </div>

      {groups.length === 0 ? (
        <Empty icon={<ClipboardList className="h-5 w-5" />} title={tab === "owed" ? "Nobody owes you anything right now" : "Nothing here yet"}>
          Run the agent on a meeting and approved tasks will show up here.
        </Empty>
      ) : (
        <div className="space-y-6">
          {groups.map((g) => (
            <section key={g.key}>
              <div className="mb-2 flex items-center gap-2 px-1">
                <h2 className={cn("font-mono text-xs tracking-[0.08em] uppercase", g.key === "overdue" ? "text-bad" : "text-soft")}>{g.label}</h2>
                <span className="text-xs tabular-nums text-faint">{g.items.length}</span>
              </div>
              <Card className="divide-y divide-line">
                {g.items.map((t) => {
                  const overdue = t.status === "open" && t.due_date && t.due_date < today;
                  const link = calendarLink(t, data.workspaceName);
                  return (
                    <div key={t.id} className="group flex items-start gap-3 px-4 py-3.5">
                      <button
                        onClick={() => toggleDone(t)}
                        disabled={busy === t.id}
                        aria-label={t.status === "done" ? "Mark as open" : "Mark as done"}
                        className={cn("mt-0.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border transition-colors", t.status === "done" ? "border-good bg-good text-canvas" : "border-faint hover:border-good hover:bg-good-wash")}
                      >
                        {t.status === "done" && <Check className="h-3 w-3" strokeWidth={3} />}
                      </button>
                      <div className="min-w-0 flex-1">
                        <p className={cn("text-[15px] leading-snug", t.status === "done" && "text-faint line-through")}>{t.title}</p>
                        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-faint">
                          {tab !== "mine" && (
                            <span className="inline-flex items-center gap-1.5 text-soft"><Avatar name={t.owner} size={16} /> {t.owner || "Unassigned"}</span>
                          )}
                          {t.requested_by && tab !== "owed" && <span>for {t.requested_by}</span>}
                          {t.meeting_id && meetingTitle.get(t.meeting_id) && <span className="truncate">{meetingTitle.get(t.meeting_id)}</span>}
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        {t.due_date && <Badge tone={overdue ? "bad" : "neutral"}>{prettyDate(t.due_date)}</Badge>}
                        {t.status === "open" && t.due_date && (
                          t.calendar_event_id ? (
                            <span title="Reminder on Google Calendar" className="text-good"><CalendarCheck className="h-4 w-4" /></span>
                          ) : mode === "org" && googleToken ? (
                            <button title="Add reminder to my Google Calendar" aria-label="Add reminder" onClick={() => addReminder(t)} className="rounded-md p-1 text-faint hover:bg-raised hover:text-brand">
                              <CalendarPlus className="h-4 w-4" />
                            </button>
                          ) : link ? (
                            <a href={link} target="_blank" rel="noreferrer" title="Add to Google Calendar" aria-label="Add to Google Calendar" className="rounded-md p-1 text-faint hover:bg-raised hover:text-brand">
                              <ExternalLink className="h-4 w-4" />
                            </a>
                          ) : null
                        )}
                      </div>
                    </div>
                  );
                })}
              </Card>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
