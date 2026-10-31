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

  // ---------- INPUT ----------
  if (phase === "input") {
    return (
      <div className="animate-rise">
        <PageHeader
          title="New meeting"
          sub="Speak a quick recap or paste the transcript. The agent does the rest, and you approve before anything is posted."
          actions={<Button variant="ghost" icon={<Wand2 className="h-4 w-4" />} onClick={loadSample}>Use sample recap</Button>}
        />

        {error && (
          <div className="mb-4 flex items-start gap-2 rounded-lg border border-bad/30 bg-bad-wash px-3.5 py-2.5 text-sm text-bad">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {error}
          </div>
        )}

        <Card className="p-5 sm:p-6">
          <div className="grid gap-4 sm:grid-cols-[1fr_180px]">
            <Field label="Meeting title">
              <input className={inputCls} placeholder="e.g. Northwind weekly sync" value={title} onChange={(e) => setTitle(e.target.value)} />
            </Field>
            <Field label="Held on">
              <input type="date" className={inputCls} value={heldOn} onChange={(e) => setHeldOn(e.target.value)} />
            </Field>
          </div>

          {people.length > 0 && (
            <div className="mt-4">
              <span className="mb-1.5 block text-[13px] font-medium text-soft">Attendees</span>
              <div className="flex flex-wrap gap-1.5">
                {people.map((p) => {
                  const on = attendees.includes(p);
                  return (
                    <button
                      key={p}
                      onClick={() => setAttendees(on ? attendees.filter((a) => a !== p) : [...attendees, p])}
                      className={cn("inline-flex items-center gap-1.5 rounded-full border py-1 pl-1 pr-2.5 text-[13px] transition-colors", on ? "border-brand/40 bg-brand-wash text-ink" : "border-line text-soft hover:bg-raised")}
                    >
                      <Avatar name={p} size={20} /> {p.split(" ")[0]}
                      {on && <Check className="h-3 w-3 text-brand" />}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="mt-5">
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-[13px] font-medium text-soft">What happened?</span>
              <span className="inline-flex items-center gap-1.5 text-xs text-faint"><Mic className="h-3.5 w-3.5" /> Click the box, then dictate with Wispr Flow</span>
            </div>
            <textarea
              ref={textRef}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={"Speak naturally. For example:\n“So, um, Priya will finish the API spec by Tuesday, no wait, Thursday. And the client wants to launch earlier…”\n\nOr paste a transcript with speaker names, like “Meera: …”"}
              className="min-h-[260px] w-full resize-y rounded-xl border border-line bg-raised p-4 text-[15px] leading-relaxed text-ink placeholder:text-faint focus:border-brand/60 focus:bg-surface"
            />
            <div className="mt-1 text-right text-xs tabular-nums text-faint">{text.trim() ? text.trim().split(/\s+/).length : 0} words</div>
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
            <p className="text-xs text-faint">Nothing is saved until you approve the draft.</p>
            <Button variant="primary" size="lg" icon={<Sparkles className="h-4 w-4" />} disabled={text.trim().length < 20} onClick={run}>
              Run the agent
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  // ---------- DONE ----------
  if (phase === "done" && result) {
    return (
      <div className="mx-auto max-w-xl animate-rise pt-6 text-center">
        <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-full bg-good-wash text-good"><CheckCircle2 className="h-6 w-6" /></div>
        <h1 className="font-display text-2xl font-semibold tracking-[-0.02em]">Posted to the team</h1>
        <p className="mt-2 text-soft">Everyone in {data.workspaceName} can now see these commitments.</p>
        <div className="mt-6 grid grid-cols-2 gap-3 text-left sm:grid-cols-4">
          <Stat n={result.tasks} label="tasks created" />
          <Stat n={result.decisions} label="decisions logged" />
          <Stat n={result.superseded} label="decisions replaced" />
          <Stat n={result.reminders} label="calendar reminders" />
        </div>
        {result.calendarError && <p className="mt-4 text-sm text-warn">{result.calendarError}</p>}
        <div className="mt-8 flex justify-center gap-2">
          <Button onClick={reset} icon={<Undo2 className="h-4 w-4" />}>Capture another</Button>
          <Button variant="primary" onClick={() => go("work")} icon={<ArrowRight className="h-4 w-4" />}>See commitments</Button>
        </div>
      </div>
    );
  }

  // ---------- RUNNING / REVIEW / POSTING ----------
  const running = phase === "running";
  return (
    <div className="animate-rise">
      <PageHeader
        title={running ? "Agent at work" : "Review the draft"}
        sub={running ? "Watch each step as it happens." : "Edit anything, untick what you don’t want, then post."}
        actions={!running && <Button variant="ghost" icon={<RefreshCw className="h-4 w-4" />} onClick={() => setPhase("input")}>Edit input</Button>}
      />

      <div className="grid gap-6 lg:grid-cols-[300px_1fr]">
        {/* Agent trace */}
        <div className="lg:sticky lg:top-6 lg:self-start">
          <Card className="p-4">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-[13px] font-semibold">Agent trace</span>
              {running ? <Badge tone="brand"><span className="h-1.5 w-1.5 animate-pulseDot rounded-full bg-brand" /> Live</Badge> : <Badge tone="good">{steps.length} steps</Badge>}
            </div>
            <ol className="relative space-y-3">
              {steps.map((s, i) => (
                <li key={s.id} className="relative flex gap-3 animate-rise">
                  {i < steps.length - 1 && <span className="absolute left-[9px] top-5 h-[calc(100%+4px)] w-px bg-line" />}
                  <span className={cn("relative z-10 mt-0.5 flex h-[19px] w-[19px] shrink-0 items-center justify-center rounded-full", s.status === "done" ? "bg-brand text-brand-ink" : "bg-surface text-brand ring-1 ring-brand/40")}>
                    {s.status === "done" ? <Check className="h-3 w-3" strokeWidth={3} /> : <Loader2 className="h-3 w-3 animate-spin" />}
                  </span>
                  <div className="min-w-0">
                    <div className="text-[13px] leading-5">{s.label}</div>
                    {s.detail && <div className="text-xs text-faint">{s.detail}</div>}
                  </div>
                </li>
              ))}
              {running && steps.length === 0 && <li className="flex items-center gap-2 text-sm text-soft"><Loader2 className="h-4 w-4 animate-spin" /> Starting…</li>}
            </ol>
          </Card>

          {draft && (
            <Card className="mt-4 p-4">
              <button className="flex w-full items-center justify-between text-[13px] font-semibold" onClick={() => setShowCleaned(!showCleaned)}>
                Cleaned-up transcript <ChevronDown className={cn("h-4 w-4 text-faint transition-transform", showCleaned && "rotate-180")} />
              </button>
              <p className="mt-1 text-xs text-faint">Filler removed. Self-corrections resolved.</p>
              {showCleaned && (
                <div className="scroll-thin mt-3 max-h-80 space-y-2.5 overflow-y-auto pr-1">
                  {draft.cleaned.map((l, i) => (
                    <div key={i} className="text-[13px] leading-relaxed">
                      <span className="font-medium">{l.speaker}:</span> <span className="text-soft">{l.text}</span>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          )}
        </div>

        {/* Draft */}
        <div className="min-w-0 space-y-5">
          {running && <SkeletonDraft />}

          {draft && !running && (
            <>
              <Card className="p-5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[13px] font-semibold">Summary</span>
                  {conflictCount > 0 && <Badge tone="warn"><AlertTriangle className="h-3 w-3" /> {conflictCount} conflict{conflictCount > 1 ? "s" : ""}</Badge>}
                  {draft.gaps.length > 0 && <Badge tone="ask"><HelpCircle className="h-3 w-3" /> {draft.gaps.length} open question{draft.gaps.length > 1 ? "s" : ""}</Badge>}
                </div>
                <p className="mt-2 leading-relaxed text-soft">{draft.summary}</p>
              </Card>

              {/* Decisions */}
              <Section title="Decisions" count={decisions.length}>
                {decisions.length === 0 && <p className="px-1 text-sm text-faint">No decisions found in this meeting.</p>}
                {decisions.map((d, i) => (
                  <Card key={d.key} className={cn("overflow-hidden", !d.keep && "opacity-55")}>
                    <div className="flex gap-3 p-4">
                      <Toggle on={d.keep} onChange={(v) => setDecisions(decisions.map((x, j) => (j === i ? { ...x, keep: v } : x)))} />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge>{d.topic}</Badge>
                          {d.made_by && <span className="text-xs text-faint">by {d.made_by}</span>}
                        </div>
                        <p className="mt-1.5 font-medium leading-snug">{d.text}</p>
                      </div>
                    </div>
                    {d.conflicts.map((c) => (
                      <div key={c.decision_id} className="border-t border-warn/25 bg-warn-wash/70 px-4 py-3.5">
                        <div className="flex items-start gap-2.5">
                          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warn" />
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-ink">{c.reason}</p>
                            <p className="mt-1 text-[13px] text-soft">
                              Earlier: “{c.past_text}” <span className="text-faint">· {c.past_meeting} · {prettyDate(c.past_date)}</span>
                            </p>
                            <div className="mt-2.5 inline-flex rounded-lg border border-line bg-surface p-0.5 text-[13px]">
                              {[
                                { v: false, label: "Keep both & discuss" },
                                { v: true, label: "Replace earlier decision" },
                              ].map((opt) => (
                                <button
                                  key={opt.label}
                                  onClick={() => setDecisions(decisions.map((x, j) => (j === i ? { ...x, replace: { ...x.replace, [c.decision_id]: opt.v } } : x)))}
                                  className={cn("rounded-md px-2.5 py-1 transition-colors", d.replace[c.decision_id] === opt.v ? "bg-ink text-canvas" : "text-soft hover:text-ink")}
                                >
                                  {opt.label}
                                </button>
                              ))}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </Card>
                ))}
              </Section>

              {/* Tasks */}
              <Section title="Action items" count={tasks.length}>
                {tasks.length === 0 && <p className="px-1 text-sm text-faint">No action items found.</p>}
                {tasks.map((t, i) => {
                  const set = (patch: Partial<EditTask>) => setTasks(tasks.map((x, j) => (j === i ? { ...x, ...patch } : x)));
                  return (
                    <Card key={t.key} className={cn("p-4", !t.keep && "opacity-55")}>
                      <div className="flex gap-3">
                        <Toggle on={t.keep} onChange={(v) => set({ keep: v })} />
                        <div className="min-w-0 flex-1">
                          <input
                            value={t.title}
                            onChange={(e) => set({ title: e.target.value })}
                            className="w-full rounded-md bg-transparent px-1 py-0.5 -mx-1 font-medium hover:bg-raised focus:bg-raised"
                          />
                          {t.source_quote && (
                            <p className="mt-1 flex items-start gap-1.5 text-[13px] text-faint"><Quote className="mt-0.5 h-3 w-3 shrink-0" /> {t.source_quote}</p>
                          )}
                          <div className="mt-3 flex flex-wrap items-center gap-2">
                            <div className={cn("flex items-center gap-1.5 rounded-lg border pl-1.5", !t.owner ? "border-ask/50 bg-ask-wash" : "border-line")}>
                              <Avatar name={t.owner} size={20} />
                              <select
                                value={t.owner || ""}
                                onChange={(e) => set({ owner: e.target.value || null })}
                                className="h-8 rounded-lg bg-transparent pr-2 text-[13px]"
                                aria-label="Owner"
                              >
                                <option value="">Needs an owner</option>
                                {people.map((p) => <option key={p} value={p}>{p}</option>)}
                                {t.owner && !people.includes(t.owner) && <option value={t.owner}>{t.owner}</option>}
                              </select>
                            </div>
                            <div className={cn("flex items-center rounded-lg border", !t.due_date ? "border-ask/50 bg-ask-wash" : "border-line")}>
                              <input
                                type="date"
                                value={t.due_date || ""}
                                onChange={(e) => set({ due_date: e.target.value || null })}
                                className="h-8 rounded-lg bg-transparent px-2 text-[13px]"
                                aria-label="Due date"
                              />
                            </div>
                            {t.due_phrase && t.due_date && <span className="text-xs text-faint">from “{t.due_phrase}”</span>}
                            {t.duplicate_of && <Badge tone="neutral"><Copy className="h-3 w-3" /> Looks like an existing task</Badge>}
                          </div>
                        </div>
                      </div>
                    </Card>
                  );
                })}
              </Section>

              {/* Gaps */}
              {draft.gaps.length > 0 && (
                <Section title="Questions for the team" count={draft.gaps.length}>
                  <Card className="divide-y divide-line">
                    {draft.gaps.map((g, i) => (
                      <div key={i} className="flex gap-3 p-4">
                        <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-ask-wash text-ask"><HelpCircle className="h-3.5 w-3.5" /></span>
                        <div>
                          <p className="text-sm font-medium">{g.question}</p>
                          <p className="text-[13px] text-faint">{g.item}</p>
                        </div>
                      </div>
                    ))}
                  </Card>
                </Section>
              )}

              {/* Footer */}
              <div className="sticky bottom-4 z-10">
                <Card className="flex flex-wrap items-center justify-between gap-3 p-3 pl-4 shadow-pop">
                  <div className="flex items-center gap-2 text-sm">
                    {mode === "org" ? (
                      calendarReady ? (
                        <label className="flex cursor-pointer items-center gap-2">
                          <input type="checkbox" checked={syncCal} onChange={(e) => setSyncCal(e.target.checked)} className="h-4 w-4 accent-[rgb(var(--brand))]" />
                          <CalendarCheck className="h-4 w-4 text-brand" /> Add deadline reminders to my Google Calendar
                        </label>
                      ) : (
                        <button onClick={() => signInWithGoogle()} className="flex items-center gap-2 text-warn hover:underline"><CalendarPlus className="h-4 w-4" /> Reconnect Google Calendar for reminders</button>
                      )
                    ) : (
                      <span className="flex items-center gap-2 text-soft"><CalendarPlus className="h-4 w-4" /> Demo: use “Add to calendar” on each task after posting</span>
                    )}
                  </div>
                  <Button variant="primary" loading={phase === "posting"} disabled={!keptTasks.length && !keptDecisions.length} onClick={() => setConfirmOpen(true)}>
                    Review & post
                  </Button>
                </Card>
                {error && <p className="mt-2 text-sm text-bad">{error}</p>}
              </div>
            </>
          )}
        </div>
      </div>

      {confirmOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-black/40" onClick={() => setConfirmOpen(false)} />
          <Card className="relative w-full max-w-md animate-rise p-6 shadow-pop">
            <h2 className="font-display text-lg font-semibold tracking-[-0.01em]">Post to {data.workspaceName}?</h2>
            <ul className="mt-4 space-y-2 text-sm">
              <ConfirmRow n={keptTasks.length} text="tasks will be created and shared with the team" />
              <ConfirmRow n={keptDecisions.length} text="decisions will be added to the log" />
              {replaceCount > 0 && <ConfirmRow n={replaceCount} text="earlier decisions will be marked as replaced" tone="warn" />}
              {reminderCount > 0 && <ConfirmRow n={reminderCount} text="reminders will be added to your Google Calendar" />}
              {unowned > 0 && <ConfirmRow n={unowned} text="tasks still have no owner" tone="ask" />}
            </ul>
            <div className="mt-6 flex justify-end gap-2">
              <Button onClick={() => setConfirmOpen(false)}>Go back</Button>
              <Button variant="primary" onClick={post} icon={<Check className="h-4 w-4" />}>Approve & post</Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}

function Section({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return (
    <section>
      <div className="mb-2.5 flex items-center gap-2 px-1">
        <h2 className="text-[13px] font-semibold uppercase tracking-[0.06em] text-soft">{title}</h2>
        <span className="text-xs tabular-nums text-faint">{count}</span>
      </div>
      <div className="space-y-2.5">{children}</div>
    </section>
  );
}

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      role="checkbox"
      aria-checked={on}
      aria-label={on ? "Included" : "Excluded"}
      onClick={() => onChange(!on)}
      className={cn("mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-colors", on ? "border-brand bg-brand text-brand-ink" : "border-line bg-surface text-transparent hover:border-faint")}
    >
      <Check className="h-3.5 w-3.5" strokeWidth={3} />
    </button>
  );
}

function ConfirmRow({ n, text, tone }: { n: number; text: string; tone?: "warn" | "ask" }) {
  return (
    <li className="flex items-center gap-3">
      <span className={cn("flex h-6 min-w-6 items-center justify-center rounded-md px-1.5 text-xs font-semibold tabular-nums", tone === "warn" ? "bg-warn-wash text-warn" : tone === "ask" ? "bg-ask-wash text-ask" : "bg-brand-wash text-brand")}>{n}</span>
      <span className="text-soft">{text}</span>
    </li>
  );
}

function Stat({ n, label }: { n: number; label: string }) {
  return (
    <Card className="p-3.5">
      <div className="font-display text-2xl font-semibold tabular-nums">{n}</div>
      <div className="text-xs text-soft">{label}</div>
    </Card>
  );
}

function SkeletonDraft() {
  return (
    <div className="space-y-4">
      {[88, 64, 72, 56].map((w, i) => (
        <Card key={i} className="p-5">
          <div className="h-3 w-24 animate-pulse rounded bg-raised" />
          <div className="mt-3 h-4 animate-pulse rounded bg-raised" style={{ width: `${w}%` }} />
          <div className="mt-2 h-4 w-2/5 animate-pulse rounded bg-raised" />
        </Card>
      ))}
      <p className="flex items-center gap-2 px-1 text-sm text-faint"><CircleDashed className="h-4 w-4 animate-spin" /> Building your draft…</p>
    </div>
  );
}
