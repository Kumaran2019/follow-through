import { db } from "@/lib/supabase-server";
import { errorResponse, resolveCtx } from "@/lib/workspace";

export const runtime = "nodejs";

export async function PATCH(req: Request) {
  try {
    const ctx = await resolveCtx(req);
    const body = await req.json();
    const patch: any = {};
    if (body.status === "open" || body.status === "done") patch.status = body.status;
    if (typeof body.calendar_event_id === "string") patch.calendar_event_id = body.calendar_event_id.slice(0, 300);
    if (typeof body.owner === "string") patch.owner = body.owner.slice(0, 120) || null;
    if (body.due_date === null || (typeof body.due_date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.due_date))) patch.due_date = body.due_date;
    if (!Object.keys(patch).length) return Response.json({ error: "Nothing to update." }, { status: 400 });
    const { data, error } = await db().from("tasks").update(patch).eq("workspace_id", ctx.workspaceId).eq("id", body.id).select().single();
    if (error) throw error;
    return Response.json({ task: data });
  } catch (e) {
    return errorResponse(e);
  }
}
