import { callClaude, textOf } from "@/lib/ai";
import { addDays } from "@/lib/dates";
import { db } from "@/lib/supabase-server";
import { errorResponse, resolveCtx, samePerson } from "@/lib/workspace";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const ctx = await resolveCtx(req);
    const body = await req.json();
    const person = String(body.person || ctx.me.name);
    const today = /^\d{4}-\d{2}-\d{2}$/.test(body.today) ? body.today : new Date().toISOString().slice(0, 10);
    const weekAgo = addDays(today, -7);
    const weekAhead = addDays(today, 7);

    const s = db();
    const [{ data: tasks }, { data: decisions }] = await Promise.all([
      s.from("tasks").select("id, title, owner, requested_by, due_date, status, created_at").eq("workspace_id", ctx.workspaceId),
      s.from("decisions").select("id, text, topic, made_on, status").eq("workspace_id", ctx.workspaceId).gte("made_on", weekAgo).order("made_on", { ascending: false }),
    ]);

    const all = tasks ?? [];
    const mine = all.filter((t) => samePerson(t.owner, person));
    const open = mine.filter((t) => t.status === "open");
    const overdue = open.filter((t) => t.due_date && t.due_date < today);
    const dueThisWeek = open.filter((t) => t.due_date && t.due_date >= today && t.due_date <= weekAhead);
    const noDate = open.filter((t) => !t.due_date);
    const done = mine.filter((t) => t.status === "done");
    const owedToMe = all.filter((t) => t.status === "open" && samePerson(t.requested_by, person) && !samePerson(t.owner, person));
    const recentDecisions = (decisions ?? []).filter((d) => d.status === "active");

    const facts = {
      person,
      today,
      overdue: overdue.map((t) => `${t.title} (due ${t.due_date})`),
      due_this_week: dueThisWeek.map((t) => `${t.title} (due ${t.due_date})`),
      no_deadline: noDate.map((t) => t.title),
      completed: done.map((t) => t.title),
      waiting_on_others: owedToMe.map((t) => `${t.owner || "Unassigned"}: ${t.title}${t.due_date ? ` (due ${t.due_date})` : ""}`),
      decisions_this_week: recentDecisions.map((d) => d.text),
    };

    let brief = "";
    try {
      const res = await callClaude({
        system: "You write a short weekly brief for one person on a team. Plain text, no markdown, no lists. Two or three short sentences. Lead with what needs attention first (overdue, then due soon). Mention who they're waiting on if relevant. Friendly, direct, no fluff.",
        messages: [{ role: "user", content: JSON.stringify(facts) }],
        max_tokens: 300,
      });
      brief = textOf(res);
    } catch {
      brief = `${person.split(" ")[0]}, you have ${overdue.length} overdue and ${dueThisWeek.length} due this week. You're waiting on ${owedToMe.length} item${owedToMe.length === 1 ? "" : "s"} from others.`;
    }

    return Response.json({
      person,
      brief,
      overdue,
      dueThisWeek,
      noDate,
      done,
      owedToMe,
      decisions: recentDecisions,
    });
  } catch (e) {
    return errorResponse(e);
  }
}
