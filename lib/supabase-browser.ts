"use client";
import { createClient, SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

export function browserDb(): SupabaseClient | null {
  if (client) return client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  client = createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
  return client;
}

const GOOGLE_TOKEN_KEY = "ft.google_token";

export function saveGoogleToken(token: string | null | undefined) {
  try {
    if (token) localStorage.setItem(GOOGLE_TOKEN_KEY, JSON.stringify({ token, at: Date.now() }));
  } catch {}
}

export function readGoogleToken(): string | null {
  try {
    const raw = localStorage.getItem(GOOGLE_TOKEN_KEY);
    if (!raw) return null;
    const { token, at } = JSON.parse(raw);
    // Google access tokens last about an hour.
    if (Date.now() - at > 55 * 60 * 1000) return null;
    return token;
  } catch {
    return null;
  }
}

export function clearGoogleToken() {
  try { localStorage.removeItem(GOOGLE_TOKEN_KEY); } catch {}
}

export async function signInWithGoogle() {
  const sb = browserDb();
  if (!sb) throw new Error("Sign-in isn't configured yet.");
  await sb.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${window.location.origin}/workspace`,
      scopes: "https://www.googleapis.com/auth/calendar.events",
      queryParams: { access_type: "offline", prompt: "consent" },
    },
  });
}
