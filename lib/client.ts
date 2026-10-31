"use client";
import { browserDb } from "./supabase-browser";

export type Mode = "demo" | "org";

export function localToday(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export async function authHeaders(mode: Mode): Promise<Record<string, string>> {
  if (mode === "demo") return { "x-ft-mode": "demo" };
  const sb = browserDb();
  const { data } = (await sb?.auth.getSession()) || { data: { session: null } };
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function api<T = any>(mode: Mode, path: string, init: RequestInit = {}): Promise<T> {
  const headers = { "Content-Type": "application/json", ...(await authHeaders(mode)), ...(init.headers as any) };
  const res = await fetch(path, { ...init, headers });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || `Request failed (${res.status})`);
  return json as T;
}
