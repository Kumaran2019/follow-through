import { db } from "./supabase-server";
import { ensureDemoSeeded, DEMO_ME } from "./seed";
import type { Me } from "./types";

export type Ctx = { workspaceId: string; workspaceName: string; mode: "demo" | "org"; me: Me };

const PERSONAL_DOMAINS = ["gmail.com", "googlemail.com", "outlook.com", "hotmail.com", "yahoo.com", "icloud.com", "proton.me"];

export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

/**
 * Demo requests share one sandbox workspace with sample data.
 * Signed-in users get their organisation's workspace, keyed by email domain,
 * so everyone at the same company sees the same decisions and tasks.
 */
export async function resolveCtx(req: Request): Promise<Ctx> {
  const mode = req.headers.get("x-ft-mode");
  if (mode === "demo") {
    await ensureDemoSeeded();
    return { workspaceId: "demo", workspaceName: "Northwind Retail (demo)", mode: "demo", me: DEMO_ME };
  }

  const auth = req.headers.get("authorization") || "";
  const token = auth.replace(/^Bearer\s+/i, "");
  if (!token) throw new HttpError(401, "Please sign in, or open the demo.");

  const { data, error } = await db().auth.getUser(token);
  if (error || !data.user?.email) throw new HttpError(401, "Your session has expired. Please sign in again.");

  const email = data.user.email.toLowerCase();
  const domain = email.split("@")[1];
  const personal = PERSONAL_DOMAINS.includes(domain);
  const workspaceId = personal ? `user:${email}` : `org:${domain}`;
  const workspaceName = personal ? "My workspace" : domain;
  const meta: any = data.user.user_metadata || {};
  const name: string = meta.full_name || meta.name || email.split("@")[0];

  await db().from("workspaces").upsert({ id: workspaceId, name: workspaceName }, { onConflict: "id" });
  await db().from("people").upsert({ workspace_id: workspaceId, name, email }, { onConflict: "workspace_id,name" });

  return { workspaceId, workspaceName, mode: "org", me: { name, email } };
}

export function errorResponse(e: any) {
  const status = e instanceof HttpError ? e.status : 500;
  return Response.json({ error: e?.message || "Something went wrong." }, { status });
}

/** Loose name match: "Priya", "priya sharma" and "Priya S." are the same person. */
export function samePerson(a?: string | null, b?: string | null) {
  if (!a || !b) return false;
  const first = (s: string) => s.trim().toLowerCase().split(/\s+/)[0];
  return first(a) === first(b);
}
