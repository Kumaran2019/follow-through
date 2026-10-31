import { db } from "@/lib/supabase-server";
import { errorResponse, resolveCtx } from "@/lib/workspace";

export const runtime = "nodejs";

const isDate = (d: any) => typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d);

export async function POST(req: Request) {
  try {
    const ctx = await resolveCtx(req);
    const s = db();
    const ws = ctx.workspaceId;
    const body = await req.json();
    const m = body.meeting || {};
    const heldOn = isDate(m.held_on) ? m.held_on : new Date().toISOString().slice(0, 10);

    // Make sure every named person exists in the workspace.
    const names = new Set<string>();
    for (const t of body.tasks || []) { if (t.owner) names.add(String(t.owner)); if (t.requested_by) names.add(String(t.requested_by)); }
    for (const a of m.attendees || []) names.add(String(a));
    if (names.size) {
      await s.from("people").upsert([...names].map((name) => ({ workspace_id: ws, name })), { onConflict: "workspace_id,name", ignoreDuplicates: true });
    }

    const { data: meeting, error: mErr } = await s
      .from("meetings")
      .insert({
        workspace_id: ws,
        title: String(m.title || "Untitled meeting").slice(0, 140),
        held_on: heldOn,
        attendees: (m.attendees || []).map(String),
        transcript: String(m.transcript || "").slice(0, 20000),
        summary: String(m.summary || "").slice(0, 1000),
        created_by: ctx.me.name,
      })
      .select("id")
      .single();
    if (mErr) throw mErr;

    const decisions = (body.decisions || []).map((d: any) => ({
      workspace_id: ws,
      meeting_id: meeting.id,
      text: String(d.text).slice(0, 500),
      topic: d.topic ? String(d.topic).slice(0, 60) : null,
      made_by: d.made_by || null,
      made_on: heldOn,
      _supersedes: Array.isArray(d.supersedes) ? d.supersedes : [],
    }));

    let superseded = 0;
    for (const d of decisions) {
      const { _supersedes, ...row } = d;
      const { data: inserted, error } = await s.from("decisions").insert(row).select("id").single();
      if (error) throw error;
      if (_supersedes.length) {
        const { count } = await s
          .from("decisions")
          .update({ status: "superseded", superseded_by: inserted.id }, { count: "exact" })
          .eq("workspace_id", ws)
          .in("id", _supersedes);
        superseded += count || 0;
      }
    }

    const taskRows = (body.tasks || []).map((t: any) => ({
      workspace_id: ws,
      meeting_id: meeting.id,
      title: String(t.title).slice(0, 300),
      owner: t.owner || null,
      requested_by: t.requested_by || ctx.me.name,
      due_date: isDate(t.due_date) ? t.due_date : null,
    }));
    let tasks: any[] = [];
    if (taskRows.length) {
      const { data, error } = await s.from("tasks").insert(taskRows).select("id, title, owner, requested_by, due_date, status");
      if (error) throw error;
      tasks = data;
    }

    return Response.json({ meeting_id: meeting.id, tasks, decisions: decisions.length, superseded });
  } catch (e) {
    return errorResponse(e);
  }
}
