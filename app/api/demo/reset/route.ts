import { seedDemo } from "@/lib/seed";
import { errorResponse } from "@/lib/workspace";

export const runtime = "nodejs";

export async function POST() {
  try {
    await seedDemo();
    return Response.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
