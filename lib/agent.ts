import { callClaude, ClaudeTool, ContentBlock, Msg } from "./ai";
import { db } from "./supabase-server";
import { resolveDate, upcomingCalendar, weekday } from "./dates";
import type { AgentEvent, Draft } from "./types";
import type { Ctx } from "./workspace";

export type AgentInput = { title: string; held_on: string; attendees: string[]; text: string; today: string };

const TOOLS: ClaudeTool[] = [
  {
    name: "list_people",
    description: "List everyone in this workspace with their role. Use it to match names said in the meeting (first names, nicknames) to real people.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "resolve_date",
    description: "Turn a spoken deadline like 'next Monday', 'by Thursday', 'end of week' or '10th November' into a real calendar date. Call once per deadline phrase.",
    input_schema: { type: "object", properties: { phrase: { type: "string" } }, required: ["phrase"] },
  },
  {
    name: "search_decisions",
    description: "Search this team's earlier decisions from past meetings. Call it for every topic a new decision touches (dates, budget, scope, design, process) to check for conflicts.",
    input_schema: { type: "object", properties: { topics: { type: "array", items: { type: "string" } } }, required: ["topics"] },
  },
  {
    name: "search_open_tasks",
    description: "List open tasks already being tracked, so you don't create duplicates.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "submit_draft",
    description: "Submit the final structured result for the human to review. Call this exactly once, at the end.",
    input_schema: {
      type: "object",
      properties: {
        summary: { type: "string", description: "Two plain sentences on what this meeting changed." },
        cleaned: {
          type: "array",
          description: "The input rewritten as clean speaker lines. Remove filler words. Where someone corrects themselves, keep only the final version.",
          items: { type: "object", properties: { speaker: { type: "string" }, text: { type: "string" } }, required: ["speaker", "text"] },
        },
        decisions: {
          type: "array",
          items: {
            type: "object",
            properties: {
              text: { type: "string", description: "The decision as one clear sentence." },
              topic: { type: "string", description: "Short label, e.g. Launch date, Budget, Scope." },
              made_by: { type: ["string", "null"] },
              conflicts: {
                type: "array",
                description: "Only real contradictions with an ACTIVE earlier decision, or a clear risk to one (like a budget cap). Empty if none.",
                items: {
                  type: "object",
                  properties: { decision_id: { type: "string" }, reason: { type: "string", description: "One sentence: what clashes and why it matters." } },
                  required: ["decision_id", "reason"],
                },
              },
            },
            required: ["text", "topic", "conflicts"],
          },
        },
        tasks: {
          type: "array",
          items: {
            type: "object",
            properties: {
              title: { type: "string", description: "Starts with a verb." },
              owner: { type: ["string", "null"], description: "Full name from list_people, or null if nobody was named." },
              requested_by: { type: ["string", "null"] },
              due_date: { type: ["string", "null"], description: "YYYY-MM-DD from resolve_date, or null." },
              due_phrase: { type: ["string", "null"], description: "The words used, e.g. 'next Monday'." },
              source_quote: { type: ["string", "null"], description: "Short cleaned quote this came from." },
              duplicate_of: { type: ["string", "null"], description: "Id of an open task this repeats, if any." },
            },
            required: ["title", "owner", "requested_by", "due_date"],
          },
        },
        gaps: {
          type: "array",
          description: "Follow-ups the team must answer: tasks with no owner, no deadline, or unclear asks.",
          items: { type: "object", properties: { item: { type: "string" }, question: { type: "string" } }, required: ["item", "question"] },
        },
      },
      required: ["summary", "cleaned", "decisions", "tasks", "gaps"],
    },
  },
];

function systemPrompt(ctx: Ctx, input: AgentInput) {
  return `You are Follow-through, an agent that turns meetings into execution for the team "${ctx.workspaceName}".

Today is ${input.today} (${weekday(input.today)}). The meeting "${input.title}" was held on ${input.held_on}.
The person submitting this is ${ctx.me.name}. When the speaker says "I" or "I'll" without a name, that is ${ctx.me.name}.
Attendees: ${input.attendees.join(", ") || "not listed"}.

The input may be a pasted transcript ("Name: text") or a messy spoken recap with filler words and self-corrections.

Work in this order, using your tools:
1. Call list_people to match names.
2. Call resolve_date for every deadline phrase. Never guess dates yourself.
3. Call search_decisions with the topics of every new decision, to catch conflicts with earlier decisions.
4. Call search_open_tasks to avoid duplicates.
5. Call submit_draft once with the final result.

Rules:
- Self-corrections: "Tuesday, no wait, Thursday" means Thursday. Always keep the last version.
- A decision is something the group agreed or a requirement the client stated. A task is a concrete action someone must do.
- Owners must come from list_people. If no one was named, set owner to null and add a gap asking who owns it.
- If a task has no deadline, set due_date to null and add a gap asking for one.
- Conflicts: flag only real contradictions with ACTIVE past decisions, or clear risks to them (for example, extra scope against a budget cap, or a timeline that leaves less test time than the team said it needs). Cite the past decision id. Do not flag things that merely relate.
- Be brief and concrete. Plain language.`;
}

async function runTool(name: string, input: any, ctx: Ctx, ai: AgentInput, emit: (e: AgentEvent) => void, stepId: string): Promise<string> {
  const s = db();
  switch (name) {
    case "list_people": {
      const { data } = await s.from("people").select("name, role").eq("workspace_id", ctx.workspaceId).order("name");
      emit({ type: "step", id: stepId, label: "Matched speakers to people", detail: `${data?.length ?? 0} people in the workspace`, status: "done" });
      return JSON.stringify(data ?? []);
    }
    case "resolve_date": {
      const r = resolveDate(String(input.phrase || ""), ai.today);
      emit({ type: "step", id: stepId, label: `Resolved “${input.phrase}”`, detail: r.date ? `${r.date} (${weekday(r.date)})` : "Unclear, will ask the team", status: "done" });
      return JSON.stringify({ phrase: input.phrase, date: r.date, weekday: r.date ? weekday(r.date) : null, note: r.note, next_three_weeks: r.date ? undefined : upcomingCalendar(ai.today) });
    }
    case "search_decisions": {
      const topics: string[] = Array.isArray(input.topics) ? input.topics : [];
      const { data } = await s
        .from("decisions")
        .select("id, text, topic, made_on, made_by, status, meeting_id, meetings(title)")
        .eq("workspace_id", ctx.workspaceId)
        .eq("status", "active")
        .order("made_on", { ascending: false })
        .limit(60);
      const words = topics.flatMap((t) => t.toLowerCase().split(/\W+/)).filter((w) => w.length > 2);
      const scored = (data ?? []).map((d: any) => {
        const hay = `${d.text} ${d.topic}`.toLowerCase();
        return { d, score: words.filter((w) => hay.includes(w)).length };
      });
      scored.sort((a, b) => b.score - a.score);
      const rows = scored.map(({ d }) => ({ id: d.id, text: d.text, topic: d.topic, made_on: d.made_on, made_by: d.made_by, meeting: d.meetings?.title }));
      const hits = scored.filter((x) => x.score > 0).length;
      emit({ type: "step", id: stepId, label: `Checked decision memory: ${topics.slice(0, 4).join(", ")}`, detail: `${rows.length} active decisions scanned, ${hits} on these topics`, status: "done" });
      return JSON.stringify(rows);
    }
    case "search_open_tasks": {
      const { data } = await s.from("tasks").select("id, title, owner, due_date").eq("workspace_id", ctx.workspaceId).eq("status", "open").limit(80);
      emit({ type: "step", id: stepId, label: "Checked open tasks for duplicates", detail: `${data?.length ?? 0} open tasks`, status: "done" });
      return JSON.stringify(data ?? []);
    }
    default:
      return JSON.stringify({ error: "Unknown tool" });
  }
}

async function enrichDraft(draft: Draft, ctx: Ctx): Promise<Draft> {
  const ids = draft.decisions.flatMap((d) => (d.conflicts || []).map((c) => c.decision_id));
  if (!ids.length) return draft;
  const { data } = await db().from("decisions").select("id, text, made_on, meetings(title)").eq("workspace_id", ctx.workspaceId).in("id", ids);
  const byId = new Map((data ?? []).map((d: any) => [d.id, d]));
  for (const d of draft.decisions) {
    d.conflicts = (d.conflicts || [])
      .filter((c) => byId.has(c.decision_id))
      .map((c) => {
        const p: any = byId.get(c.decision_id);
        return { ...c, past_text: p.text, past_date: p.made_on, past_meeting: p.meetings?.title };
      });
  }
  return draft;
}

export async function runAgent(ctx: Ctx, input: AgentInput, emit: (e: AgentEvent) => void) {
  emit({ type: "step", id: "read", label: "Read the meeting input", detail: `${input.text.split(/\s+/).length} words`, status: "done" });

  const messages: Msg[] = [{ role: "user", content: `Meeting input:\n"""\n${input.text}\n"""` }];
  const system = systemPrompt(ctx, input);

  for (let turn = 0; turn < 8; turn++) {
    const thinkingId = `think-${turn}`;
    emit({ type: "step", id: thinkingId, label: turn === 0 ? "Planning the steps" : "Reasoning over results", status: "running" });
    const res = await callClaude({ system, messages, tools: TOOLS, max_tokens: 4096, tool_choice: turn >= 6 ? { type: "tool", name: "submit_draft" } : undefined });
    emit({ type: "step", id: thinkingId, label: turn === 0 ? "Planned the steps" : "Reasoned over results", status: "done" });

    const uses = res.content.filter((b) => b.type === "tool_use") as Extract<ContentBlock, { type: "tool_use" }>[];
    if (!uses.length) {
      messages.push({ role: "assistant", content: res.content });
      messages.push({ role: "user", content: "Please finish by calling submit_draft." });
      continue;
    }

    const submit = uses.find((u) => u.name === "submit_draft");
    if (submit) {
      emit({ type: "step", id: "draft", label: "Prepared the draft for your review", status: "done" });
      const raw = submit.input as Draft;
      const draft: Draft = {
        summary: raw.summary || "",
        cleaned: raw.cleaned || [],
        decisions: (raw.decisions || []).map((d) => ({ ...d, conflicts: d.conflicts || [] })),
        tasks: raw.tasks || [],
        gaps: raw.gaps || [],
      };
      emit({ type: "draft", draft: await enrichDraft(draft, ctx) });
      return;
    }

    messages.push({ role: "assistant", content: res.content });
    const results: ContentBlock[] = [];
    for (const u of uses) {
      const stepId = `${u.name}-${u.id}`;
      emit({ type: "step", id: stepId, label: labelFor(u.name, u.input), status: "running" });
      try {
        const out = await runTool(u.name, u.input, ctx, input, emit, stepId);
        results.push({ type: "tool_result", tool_use_id: u.id, content: out });
      } catch (e: any) {
        emit({ type: "step", id: stepId, label: labelFor(u.name, u.input), detail: "Failed, continuing", status: "done" });
        results.push({ type: "tool_result", tool_use_id: u.id, content: `Error: ${e?.message}`, is_error: true });
      }
    }
    messages.push({ role: "user", content: results });
  }
  throw new Error("The agent took too many steps. Try a shorter input.");
}

function labelFor(name: string, input: any) {
  switch (name) {
    case "list_people": return "Looking up people";
    case "resolve_date": return `Resolving “${input?.phrase ?? "date"}”`;
    case "search_decisions": return "Searching decision memory";
    case "search_open_tasks": return "Checking open tasks";
    default: return name;
  }
}
