"use client";
import { useMemo, useRef, useState } from "react";
import {
  AlertTriangle, ArrowRight, CalendarCheck, CalendarPlus, Check, CheckCircle2, ChevronDown, CircleDashed, Copy, HelpCircle,
  Loader2, Mic, Quote, RefreshCw, Sparkles, Undo2, Wand2,
} from "lucide-react";
import { authHeaders, api, localToday } from "@/lib/client";
import { createReminder } from "@/lib/calendar";
import { prettyDate } from "@/lib/dates";
import { SAMPLE_ATTENDEES, SAMPLE_RECAP, SAMPLE_TITLE } from "@/lib/sample";
import { signInWithGoogle } from "@/lib/supabase-browser";
import type { AgentEvent, Draft } from "@/lib/types";
import type { Shared } from "./workspace";
import { Avatar, Badge, Button, Card, Field, inputCls, PageHeader, cn } from "./ui";

type Step = Extract<AgentEvent, { type: "step" }>;
type Phase = "input" | "running" | "review" | "posting" | "done";

type EditTask = Draft["tasks"][number] & { keep: boolean; key: string };
type EditDecision = Draft["decisions"][number] & { keep: boolean; key: string; replace: Record<string, boolean> };

export function CaptureView({ mode, data, reload, googleToken, setGoogleToken, go }: Shared) {
  const [phase, setPhase] = useState<Phase>("input");
  const [title, setTitle] = useState("");
  const [heldOn, setHeldOn] = useState(localToday());
  const [attendees, setAttendees] = useState<string[]>([]);
  const [text, setText] = useState("");
  const [steps, setSteps] = useState<Step[]>([]);
  const [error, setError] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [tasks, setTasks] = useState<EditTask[]>([]);
  const [decisions, setDecisions] = useState<EditDecision[]>([]);
  const [syncCal, setSyncCal] = useState(true);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [result, setResult] = useState<{ tasks: number; decisions: number; superseded: number; reminders: number; calendarError?: string } | null>(null);
  const [showCleaned, setShowCleaned] = useState(false);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const [typing, setTyping] = useState(false);
  const typingTimer = useRef<any>(null);
  const [sortKey, setSortKey] = useState(0);

  function onText(v: string) {
    setText(v);
    setTyping(true);
    clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => setTyping(false), 1200);
  }

  const people = data.people.map((p) => p.name);

  function loadSample() {
    setTitle(SAMPLE_TITLE);
    setAttendees(SAMPLE_ATTENDEES.filter((a) => people.includes(a)));
    setText(SAMPLE_RECAP);
  }

  async function run() {
    setError("");
    setSteps([]);
    setDraft(null);
    setPhase("running");
    try {
      const res = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await authHeaders(mode)) },
        body: JSON.stringify({ title: title || "Untitled meeting", held_on: heldOn, attendees, text, today: localToday() }),
      });
      if (!res.ok || !res.body) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `The agent couldn't start (${res.status}).`);
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      let gotDraft = false;
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() || "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const ev = JSON.parse(line) as AgentEvent;
          if (ev.type === "step") {
            setSteps((prev) => {
              const i = prev.findIndex((s) => s.id === ev.id);
              if (i === -1) return [...prev, ev];
              const next = [...prev];
              next[i] = { ...prev[i], ...ev, detail: ev.detail ?? prev[i].detail };
              return next;
            });
          } else if (ev.type === "draft") {
            gotDraft = true;
            openReview(ev.draft);
          } else if (ev.type === "error") {
            throw new Error(ev.message);
          }
        }
      }
      if (!gotDraft) throw new Error("The agent stopped before finishing. Please try again.");
    } catch (e: any) {
      setError(e.message);
      setPhase("input");
    }
  }

  function openReview(d: Draft) {
    setDraft(d);
    setTasks(d.tasks.map((t, i) => ({ ...t, keep: !t.duplicate_of, key: `t${i}` })));
    setDecisions(
      d.decisions.map((x, i) => ({
        ...x,
        keep: true,
        key: `d${i}`,
        replace: Object.fromEntries(x.conflicts.map((c) => [c.decision_id, false])),
      }))
    );
    setPhase("review");
  }

  const conflictCount = decisions.reduce((n, d) => n + d.conflicts.length, 0);
  const keptTasks = tasks.filter((t) => t.keep);
  const keptDecisions = decisions.filter((d) => d.keep);
  const replaceCount = keptDecisions.reduce((n, d) => n + Object.values(d.replace).filter(Boolean).length, 0);
  const unowned = keptTasks.filter((t) => !t.owner).length;
  const calendarReady = mode === "org" && !!googleToken;
  const reminderCount = calendarReady && syncCal ? keptTasks.filter((t) => t.due_date).length : 0;

  async function post() {
    if (!draft) return;
    setConfirmOpen(false);
    setPhase("posting");
    setError("");
    try {
      const res = await api<{ tasks: any[]; decisions: number; superseded: number }>(mode, "/api/approve", {
        method: "POST",
        body: JSON.stringify({
          meeting: { title: title || "Untitled meeting", held_on: heldOn, attendees, transcript: text, summary: draft.summary },
          decisions: keptDecisions.map((d) => ({ text: d.text, topic: d.topic, made_by: d.made_by, supersedes: Object.entries(d.replace).filter(([, v]) => v).map(([k]) => k) })),
          tasks: keptTasks.map((t) => ({ title: t.title, owner: t.owner, requested_by: t.requested_by, due_date: t.due_date })),
        }),
      });

      let reminders = 0;
      let calendarError: string | undefined;
      if (calendarReady && syncCal) {
        for (const t of res.tasks.filter((t) => t.due_date)) {
          try {
            const id = await createReminder(googleToken!, t, data.workspaceName);
            if (id) {
              reminders++;
              await api(mode, "/api/tasks", { method: "PATCH", body: JSON.stringify({ id: t.id, calendar_event_id: id }) });
            }
          } catch (e: any) {
            if (e.message === "google_expired") { setGoogleToken(null); calendarError = "Your Google connection expired. Reconnect to add the rest."; break; }
            calendarError = e.message;
          }
        }
      }
      setResult({ tasks: res.tasks.length, decisions: res.decisions, superseded: res.superseded, reminders, calendarError });
      await reload();
      setPhase("done");
    } catch (e: any) {
      setError(e.message);
      setPhase("review");
    }
  }

  function reset() {
    setPhase("input");
    setTitle("");
    setText("");
    setAttendees([]);
    setSteps([]);
    setDraft(null);
    setResult(null);
    setHeldOn(localToday());
  }

  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  const dateLabel = prettyDate(heldOn).toUpperCase();

  // ---------- INPUT ----------
  if (phase === "input") {
    return (
      <div className="animate-rise">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className={cn("h-2.5 w-2.5 rounded-full", typing ? "animate-pulseDot bg-warn" : "bg-[#3A3A3E]")} />
            <span className="font-mono text-xs tracking-[0.1em] text-soft">{typing ? "CAPTURING" : "READY"} · {words} WORDS</span>
          </div>
          <Button variant="ghost" size="sm" icon={<Wand2 className="h-4 w-4" />} onClick={loadSample}>Use sample recap</Button>
        </div>

        {error && (
          <div className="mt-5 flex items-start gap-2 rounded-2xl border border-bad/30 bg-bad-wash px-4 py-3 text-sm text-bad">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {error}
          </div>
        )}

        <div className="mt-6 flex flex-wrap items-center gap-2">
          <input
            aria-label="Meeting title"
            className="h-10 min-w-[220px] flex-1 rounded-full border border-line bg-transparent px-4 text-sm text-ink placeholder:text-faint focus:border-brand/60 sm:max-w-sm"
            placeholder="Meeting title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <input type="date" aria-label="Held on" className="h-10 rounded-full border border-line bg-transparent px-4 text-sm text-ink" value={heldOn} onChange={(e) => setHeldOn(e.target.value)} />
          {people.map((p) => {
            const on = attendees.includes(p);
            return (
              <button
                key={p}
                onClick={() => setAttendees(on ? attendees.filter((a) => a !== p) : [...attendees, p])}
                aria-pressed={on}
                className={cn("inline-flex h-10 items-center gap-2 rounded-full border pl-1.5 pr-3.5 text-[13px] transition-colors", on ? "border-brand/50 bg-brand-wash text-ink" : "border-line text-faint hover:text-ink")}
              >
                <Avatar name={p} size={26} /> {p.split(" ")[0]}
              </button>
            );
          })}
        </div>

        <div aria-hidden="true" className="mt-12 flex h-[96px] items-center gap-[6px]">
          {[40, 90, 60, 96, 70, 88, 50, 96, 80, 56, 92, 64, 96, 44, 84, 52, 36, 24].map((h, i) => (
            <span
              key={i}
              className={cn("w-[6px] rounded-full", typing ? "ft-bar" : "ft-bar-idle", i > 13 ? "bg-[#3A4A1A]" : "bg-brand")}
              style={{ height: h, animationDelay: `${(i * 0.12) % 1.1}s`, transition: "transform 300ms ease" }}
            />
          ))}
        </div>

        <textarea
          ref={textRef}
          value={text}
          onChange={(e) => onText(e.target.value)}
          aria-label="What happened in the meeting"
          placeholder={"Click here and speak with Wispr Flow.\nSay it like you would to a colleague: “Priya will check the effort by Tuesday, no wait, Thursday…”"}
          className="scroll-thin mt-8 min-h-[300px] w-full resize-none bg-transparent text-[24px] font-medium leading-[1.35] tracking-[-0.02em] text-ink placeholder:text-[#4A4A4E] focus:outline-none sm:text-[32px]"
        />

        <div className="sticky bottom-5 mt-8">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-full border border-[#2A2A2D] bg-surface py-2.5 pl-6 pr-2.5 shadow-pop">
            <p className="flex items-center gap-2 text-sm text-faint"><Mic className="h-4 w-4" /> Speak naturally. Filler and corrections get cleaned up. Nothing posts until you approve.</p>
            <Button variant="primary" size="lg" icon={<Sparkles className="h-4 w-4" />} disabled={text.trim().length < 20} onClick={run}>Run the agent</Button>
          </div>
        </div>
      </div>
    );
  }

  // ---------- DONE ----------
  if (phase === "done" && result) {
    return (
      <div className="mx-auto max-w-3xl animate-rise pt-10">
        <span className="inline-flex items-center gap-2 rounded-full bg-brand-wash px-3 py-1.5 text-[13px] text-brand"><CheckCircle2 className="h-4 w-4" /> Posted to {data.workspaceName}</span>
        <h1 className="mt-6 text-[44px] font-semibold leading-[1.02] tracking-[-0.035em] sm:text-[56px]">Everyone knows<br /><span className="text-faint">what they owe, and when.</span></h1>
        <div className="mt-10 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat n={result.tasks} label="tasks created" />
          <Stat n={result.decisions} label="decisions logged" />
          <Stat n={result.superseded} label="decisions replaced" />
          <Stat n={result.reminders} label="calendar reminders" />
        </div>
        {result.calendarError && <p className="mt-4 text-sm text-warn">{result.calendarError}</p>}
        <div className="mt-10 flex flex-wrap gap-2">
          <Button onClick={reset} icon={<Undo2 className="h-4 w-4" />}>Capture another</Button>
          <Button variant="primary" onClick={() => go("work")} icon={<ArrowRight className="h-4 w-4" />}>See commitments</Button>
        </div>
      </div>
    );
  }

  // ---------- RUNNING / REVIEW / POSTING ----------
  const running = phase === "running";
  const summary = draft?.summary || "";
  const firstStop = summary.indexOf(". ");
  const headA = running ? "Agent at work." : firstStop > 0 ? summary.slice(0, firstStop + 1) : summary;
  const headB = running ? "Sorting what was said into decisions, owners and dates." : firstStop > 0 ? summary.slice(firstStop + 2) : "";
  let delay = 0;
  const nextDelay = () => `${(delay++ * 0.13 + 0.15).toFixed(2)}s`;

  return (
    <div className="animate-rise">
      <section className="flex flex-wrap items-end justify-between gap-6">
        <div className="min-w-0 flex-[1_1_640px]">
          <p className="font-mono text-xs tracking-[0.08em] text-faint">{(title || "Untitled meeting").toUpperCase()} · {dateLabel}</p>
          <h1 className="mt-3.5 text-[34px] font-semibold leading-[1.04] tracking-[-0.035em] sm:text-[48px]">
            {headA}
            {headB && <><br /><span className="text-faint">{headB}</span></>}
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {running ? (
            <span className="inline-flex items-center gap-2 rounded-full bg-brand-wash px-3 py-2 text-[13px] text-brand"><span className="h-[7px] w-[7px] animate-pulseDot rounded-full bg-brand" /> Live</span>
          ) : (
            <>
              <span className="inline-flex items-center gap-2 rounded-full bg-brand-wash px-3 py-2 text-[13px] text-brand"><span className="h-[7px] w-[7px] rounded-full bg-brand" /> Agent done · {steps.length} steps</span>
              <Button size="sm" onClick={() => setSortKey((k) => k + 1)}>Replay sort</Button>
              <Button size="sm" variant="ghost" icon={<RefreshCw className="h-3.5 w-3.5" />} onClick={() => setPhase("input")}>Edit input</Button>
            </>
          )}
        </div>
      </section>

      <section aria-label="Agent trace" className="mt-7 flex flex-wrap gap-2">
        {steps.map((s) => (
          <span key={s.id} className={cn("inline-flex animate-rise items-center gap-1.5 rounded-full border px-3 py-1.5 font-mono text-xs", /clash|conflict/i.test(s.detail || "") ? "border-warn/40 text-[#FFB08F]" : "border-line text-soft")}>
            {s.status === "done" ? <Check className="h-3 w-3 text-brand" strokeWidth={3} /> : <Loader2 className="h-3 w-3 animate-spin text-brand" />}
            {s.label}{s.detail ? <span className="text-faint">· {s.detail}</span> : null}
          </span>
        ))}
        {running && steps.length === 0 && <span className="inline-flex items-center gap-2 font-mono text-xs text-faint"><Loader2 className="h-3 w-3 animate-spin" /> starting…</span>}
      </section>

      {running && (
        <div className="mt-10 grid grid-cols-1 gap-5 md:grid-cols-3">
          {[0, 1, 2].map((c) => (
            <div key={c} className="space-y-3">
              <div className="h-3 w-24 animate-pulse rounded-full bg-raised" />
              {[0, 1].map((r) => <div key={r} className="h-24 animate-pulse rounded-[18px] border border-dashed border-[#2A2A2D]" style={{ animationDelay: `${(c + r) * 0.15}s` }} />)}
            </div>
          ))}
        </div>
      )}

      {draft && !running && (
        <div key={sortKey}>
          <section aria-label="Sorted results" className="mt-10 grid grid-cols-1 items-start gap-5 md:grid-cols-2">
            {/* Decisions */}
            <div className="min-w-0 space-y-3">
              <LaneHead title="Decisions" n={decisions.length} />
              {decisions.length === 0 && <p className="px-1 text-sm text-faint">No decisions in this meeting.</p>}
              {decisions.map((d, i) => (
                <article key={d.key} className={cn("ft-card relative rounded-[18px] border border-line bg-surface p-5 transition-opacity", !d.keep && "opacity-40")} style={{ animationDelay: nextDelay() }}>
                  <KeepToggle on={d.keep} onChange={(v) => setDecisions(decisions.map((x, j) => (j === i ? { ...x, keep: v } : x)))} />
                  <p className="pr-8 text-xs text-faint">{d.topic}{d.made_by ? ` · ${d.made_by.split(" ")[0]}` : ""}</p>
                  <p className="mt-2 pr-8 text-[19px] font-medium leading-snug tracking-[-0.01em]">{d.text}</p>
                  {d.conflicts.length > 0 && <p className="mt-2 font-mono text-[11px] text-[#FFB08F]">CLASHES WITH {d.conflicts.length} EARLIER DECISION{d.conflicts.length > 1 ? "S" : ""} ↓</p>}
                </article>
              ))}
            </div>

            {/* Tasks */}
            <div className="min-w-0 space-y-3">
              <LaneHead title="Tasks" n={tasks.length} />
              {tasks.length === 0 && <p className="px-1 text-sm text-faint">No action items found.</p>}
              {tasks.map((t, i) => {
                const set = (patch: Partial<EditTask>) => setTasks(tasks.map((x, j) => (j === i ? { ...x, ...patch } : x)));
                return (
                  <article key={t.key} className={cn("ft-card relative rounded-[18px] border bg-surface p-4", !t.owner || !t.due_date ? "border-dashed border-[#3A3A3E]" : "border-line", !t.keep && "opacity-40")} style={{ animationDelay: nextDelay() }}>
                    <KeepToggle on={t.keep} onChange={(v) => set({ keep: v })} />
                    <div className="flex gap-3 pr-8">
                      <Avatar name={t.owner} size={32} />
                      <div className="min-w-0 flex-1">
                        <input value={t.title} onChange={(e) => set({ title: e.target.value })} aria-label="Task title" className="-mx-1 w-full rounded-md bg-transparent px-1 py-0.5 text-[15px] leading-snug hover:bg-raised focus:bg-raised" />
                        {t.source_quote && <p className="mt-1 flex items-start gap-1.5 text-[13px] text-faint"><Quote className="mt-0.5 h-3 w-3 shrink-0" /> {t.source_quote}</p>}
                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          <select value={t.owner || ""} onChange={(e) => set({ owner: e.target.value || null })} aria-label="Owner" className={cn("h-8 rounded-full border bg-transparent px-3 text-[13px]", t.owner ? "border-line text-ink" : "border-[#4A4A4E] text-faint")}>
                            <option value="">Needs an owner</option>
                            {people.map((p) => <option key={p} value={p}>{p}</option>)}
                            {t.owner && !people.includes(t.owner) && <option value={t.owner}>{t.owner}</option>}
                          </select>
                          <input type="date" value={t.due_date || ""} onChange={(e) => set({ due_date: e.target.value || null })} aria-label="Due date" className={cn("h-8 rounded-full border bg-transparent px-3 font-mono text-[12px]", t.due_date ? "border-brand/30 text-brand" : "border-[#4A4A4E] text-faint")} />
                          {t.due_phrase && t.due_date && <span className="font-mono text-[11px] text-faint">FROM “{t.due_phrase.toUpperCase()}”</span>}
                          {t.duplicate_of && <Badge><Copy className="h-3 w-3" /> Looks like an existing task</Badge>}
                        </div>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>

            {/* Conflicts */}
            {conflictCount > 0 && (
              <div className="min-w-0 space-y-3 md:col-span-2">
                <LaneHead title="Conflicts with earlier decisions" n={conflictCount} tone="warn" />
                <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                  {decisions.flatMap((d, i) =>
                    d.conflicts.map((c) => (
                      <article key={`${d.key}-${c.decision_id}`} className="ft-card rounded-[18px] border border-[#5A2A17] bg-warn-wash p-5" style={{ animationDelay: nextDelay() }}>
                        <div className="grid grid-cols-[minmax(0,1fr)_40px_minmax(0,1fr)] items-center">
                          <div className="rounded-xl border border-warn bg-[#241712] px-3.5 py-3">
                            <p className="font-mono text-[10.5px] tracking-[0.06em] text-[#FFB08F]">NEW · TODAY</p>
                            <p className="mt-1.5 text-[15px] font-medium leading-snug">{d.text}</p>
                          </div>
                          <div aria-hidden="true" className="relative h-[2px]"><div className="ft-thread absolute inset-0 bg-warn" style={{ animationDelay: `${parseFloat(nextDelay()) + 0.4}s` }} /></div>
                          <div className="rounded-xl border border-dashed border-[#4A4A4E] bg-[#141414] px-3.5 py-3">
                            <p className="font-mono text-[10.5px] tracking-[0.06em] text-faint">EARLIER · {(c.past_meeting || "").toUpperCase().slice(0, 28)}{c.past_date ? `, ${prettyDate(c.past_date).toUpperCase()}` : ""}</p>
                            <p className={cn("mt-1.5 text-[15px] leading-snug text-soft", d.replace[c.decision_id] && "line-through decoration-warn")}>{c.past_text}</p>
                          </div>
                        </div>
                        <p className="mt-4 text-sm leading-relaxed text-[#E6CFC6]">{c.reason}</p>
                        <div role="group" aria-label="Resolve conflict" className="mt-4 inline-flex rounded-full border border-[#3A2318] bg-canvas p-1">
                          {[
                            { v: false, label: "Keep both, discuss" },
                            { v: true, label: "Replace earlier" },
                          ].map((opt) => {
                            const on = d.replace[c.decision_id] === opt.v;
                            return (
                              <button
                                key={opt.label}
                                aria-pressed={on}
                                onClick={() => setDecisions(decisions.map((x, j) => (j === i ? { ...x, replace: { ...x.replace, [c.decision_id]: opt.v } } : x)))}
                                className={cn("h-8 rounded-full px-3.5 text-[13px] transition-colors", on ? (opt.v ? "bg-warn font-medium text-canvas" : "bg-[#3A2318] font-medium text-[#FFE3D6]") : "text-[#E6CFC6] hover:text-white")}
                              >
                                {opt.label}
                              </button>
                            );
                          })}
                        </div>
                      </article>
                    ))
                  )}
                </div>
              </div>
            )}

            {/* Questions */}
            {draft.gaps.length > 0 && (
              <div className="min-w-0 space-y-3 md:col-span-2">
                <LaneHead title="Questions for the team" n={draft.gaps.length} />
                <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                  {draft.gaps.map((g, i) => (
                    <div key={i} className="ft-card flex items-center gap-3 rounded-[18px] border border-dashed border-[#3A3A3E] px-4 py-3.5" style={{ animationDelay: nextDelay() }}>
                      <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-dashed border-[#6A6A6E] text-faint"><HelpCircle className="h-4 w-4" /></span>
                      <div className="min-w-0">
                        <p className="text-[15px]">{g.question}</p>
                        <p className="text-[13px] text-faint">{g.item}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>

          {/* Cleaned transcript */}
          <section className="mt-8">
            <button className="inline-flex items-center gap-2 font-mono text-xs tracking-[0.06em] text-faint hover:text-ink" onClick={() => setShowCleaned(!showCleaned)}>
              CLEANED TRANSCRIPT <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", showCleaned && "rotate-180")} />
            </button>
            {showCleaned && (
              <div className="mt-3 space-y-2 rounded-[18px] border border-line bg-surface p-5">
                {draft.cleaned.map((l, i) => (
                  <p key={i} className="text-sm leading-relaxed"><span className="font-medium">{l.speaker}:</span> <span className="text-soft">{l.text}</span></p>
                ))}
              </div>
            )}
          </section>

          {/* Approve bar */}
          <div className="sticky bottom-5 z-10 mt-10">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-[28px] border border-[#2A2A2D] bg-surface py-2.5 pl-6 pr-2.5 shadow-pop sm:rounded-full">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-soft">
                <span>{keptTasks.length} tasks · {keptDecisions.length} decisions{replaceCount ? ` · ${replaceCount} replaced` : ""}</span>
                {mode === "org" ? (
                  calendarReady ? (
                    <label className="flex cursor-pointer items-center gap-2 text-brand">
                      <input type="checkbox" checked={syncCal} onChange={(e) => setSyncCal(e.target.checked)} className="h-4 w-4 accent-[rgb(var(--brand))]" />
                      {reminderCount} reminders to Google Calendar
                    </label>
                  ) : (
                    <button onClick={() => signInWithGoogle()} className="flex items-center gap-1.5 text-warn hover:underline"><CalendarPlus className="h-4 w-4" /> Reconnect calendar</button>
                  )
                ) : (
                  <span className="flex items-center gap-1.5 text-faint"><CalendarPlus className="h-4 w-4" /> Demo: add to calendar from Commitments</span>
                )}
              </div>
              <Button variant="primary" size="lg" loading={phase === "posting"} disabled={!keptTasks.length && !keptDecisions.length} onClick={() => setConfirmOpen(true)}>Approve and post</Button>
            </div>
            {error && <p className="mt-2 px-4 text-sm text-bad">{error}</p>}
          </div>
        </div>
      )}

      {confirmOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center" role="dialog" aria-modal="true" aria-label="Confirm posting">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setConfirmOpen(false)} />
          <div className="relative w-full max-w-md animate-rise rounded-[24px] border border-[#2A2A2D] bg-surface p-7 shadow-pop">
            <p className="font-mono text-xs tracking-[0.08em] text-faint">CONFIRM</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-[-0.02em]">Post to {data.workspaceName}?</h2>
            <ul className="mt-5 space-y-2.5 text-sm">
              <ConfirmRow n={keptTasks.length} text="tasks created and shared with the team" />
              <ConfirmRow n={keptDecisions.length} text="decisions added to the log" />
              {replaceCount > 0 && <ConfirmRow n={replaceCount} text="earlier decisions marked as replaced" tone="warn" />}
              {reminderCount > 0 && <ConfirmRow n={reminderCount} text="reminders added to your Google Calendar" />}
              {unowned > 0 && <ConfirmRow n={unowned} text="tasks still need an owner" tone="ask" />}
            </ul>
            <div className="mt-7 flex justify-end gap-2">
              <Button onClick={() => setConfirmOpen(false)}>Go back</Button>
              <Button variant="primary" onClick={post} icon={<Check className="h-4 w-4" />}>Approve and post</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function LaneHead({ title, n, tone }: { title: string; n: number; tone?: "warn" }) {
  return (
    <div className="flex items-baseline justify-between px-1">
      <h2 className={cn("text-sm font-medium", tone === "warn" ? "text-[#FF8A5C]" : "text-ink")}>{title}</h2>
      <span className={cn("font-mono text-xs", tone === "warn" ? "text-[#FF8A5C]" : "text-faint")}>{String(n).padStart(2, "0")}</span>
    </div>
  );
}

function KeepToggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      role="checkbox"
      aria-checked={on}
      aria-label={on ? "Included. Click to leave out" : "Left out. Click to include"}
      onClick={() => onChange(!on)}
      className={cn("absolute right-4 top-4 flex h-6 w-6 items-center justify-center rounded-full border transition-colors", on ? "border-brand bg-brand text-canvas" : "border-[#4A4A4E] text-transparent hover:border-faint")}
    >
      <Check className="h-3.5 w-3.5" strokeWidth={3} />
    </button>
  );
}

function ConfirmRow({ n, text, tone }: { n: number; text: string; tone?: "warn" | "ask" }) {
  return (
    <li className="flex items-center gap-3">
      <span className={cn("flex h-7 min-w-7 items-center justify-center rounded-full px-2 font-mono text-xs tabular-nums", tone === "warn" ? "bg-warn-wash text-warn" : tone === "ask" ? "bg-ask-wash text-ask" : "bg-brand-wash text-brand")}>{n}</span>
      <span className="text-soft">{text}</span>
    </li>
  );
}

function Stat({ n, label }: { n: number; label: string }) {
  return (
    <div className="rounded-[18px] border border-line bg-surface p-5">
      <div className="font-mono text-[34px] font-medium tabular-nums tracking-[-0.03em] text-brand">{String(n).padStart(2, "0")}</div>
      <div className="mt-1 text-[13px] text-faint">{label}</div>
    </div>
  );
}

