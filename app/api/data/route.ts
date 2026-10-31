import { db } from "@/lib/supabase-server";
import { errorResponse, resolveCtx } from "@/lib/workspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const ctx = await resolveCtx(req);
    const s = db();
    const ws = ctx.workspaceId;
    const [people, meetings, decisions, tasks] = await Promise.all([
      s.from("people").select("id, name, email, role").eq("workspace_id", ws).order("name"),
      s.from("meetings").select("id, title, held_on, attendees, summary, transcript, created_by, created_at").eq("workspace_id", ws).order("held_on", { ascending: false }).order("created_at", { ascending: false }),
      s.from("decisions").select("id, meeting_id, text, topic, made_by, made_on, status, superseded_by").eq("workspace_id", ws).order("made_on", { ascending: false }).order("created_at", { ascending: false }),
      s.from("tasks").select("id, meeting_id, title, owner, requested_by, due_date, status, calendar_event_id, created_at").eq("workspace_id", ws).order("due_date", { ascending: true, nullsFirst: false }),
    ]);
    const err = people.error || meetings.error || decisions.error || tasks.error;
    if (err) throw err;
    return Response.json({
      mode: ctx.mode,
      workspaceName: ctx.workspaceName,
      me: ctx.me,
      people: people.data,
      meetings: meetings.data,
      decisions: decisions.data,
      tasks: tasks.data,
    });
  } catch (e) {
    return errorResponse(e);
  }
}
