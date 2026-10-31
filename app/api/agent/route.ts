import { runAgent } from "@/lib/agent";
import { errorResponse, resolveCtx } from "@/lib/workspace";
import type { AgentEvent } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(req: Request) {
  let ctx;
  try {
    ctx = await resolveCtx(req);
  } catch (e) {
    return errorResponse(e);
  }
  const body = await req.json().catch(() => ({}));
  const text = String(body.text || "").trim();
  if (text.length < 20) return Response.json({ error: "Add a bit more detail from the meeting first." }, { status: 400 });
  if (text.length > 20000) return Response.json({ error: "That's too long. Keep it under 20,000 characters." }, { status: 400 });

  const input = {
    title: String(body.title || "Untitled meeting").slice(0, 140),
    held_on: /^\d{4}-\d{2}-\d{2}$/.test(body.held_on) ? body.held_on : body.today,
    attendees: Array.isArray(body.attendees) ? body.attendees.map(String).slice(0, 30) : [],
    text,
    today: /^\d{4}-\d{2}-\d{2}$/.test(body.today) ? body.today : new Date().toISOString().slice(0, 10),
  };

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const emit = (e: AgentEvent) => controller.enqueue(encoder.encode(JSON.stringify(e) + "\n"));
      try {
        await runAgent(ctx, input, emit);
      } catch (e: any) {
        console.error(e);
        emit({ type: "error", message: e?.message || "The agent hit an error." });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson", "Cache-Control": "no-store" } });
}
