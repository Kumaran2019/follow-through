"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { BookOpenCheck, CalendarCheck, CalendarX, ClipboardList, FileText, LogOut, Menu, Mic, RotateCcw, Sparkles, X } from "lucide-react";
import { api, Mode } from "@/lib/client";
import { browserDb, clearGoogleToken, readGoogleToken, saveGoogleToken, signInWithGoogle } from "@/lib/supabase-browser";
import type { WorkspaceData } from "@/lib/types";
import { samePersonClient } from "@/lib/people";
import { Logo } from "./logo";
import { Avatar, Button, cn } from "./ui";
import { CaptureView } from "./capture";
import { WorkView } from "./work";
import { DecisionsView } from "./decisions";
import { MeetingsView } from "./meetings";
import { DigestView } from "./digest";

export type View = "capture" | "work" | "decisions" | "meetings" | "digest";

const NAV: { id: View; label: string; icon: any }[] = [
  { id: "capture", label: "New meeting", icon: Mic },
  { id: "work", label: "Commitments", icon: ClipboardList },
  { id: "decisions", label: "Decision log", icon: BookOpenCheck },
  { id: "meetings", label: "Meetings", icon: FileText },
  { id: "digest", label: "Weekly digest", icon: Sparkles },
];

export type Shared = {
  mode: Mode;
  data: WorkspaceData;
  reload: () => Promise<void>;
  googleToken: string | null;
  setGoogleToken: (t: string | null) => void;
  go: (v: View) => void;
};

export function Workspace() {
  const params = useSearchParams();
  const router = useRouter();
  const mode: Mode = params.get("demo") ? "demo" : "org";
  const [ready, setReady] = useState(mode === "demo");
  const [data, setData] = useState<WorkspaceData | null>(null);
  const [error, setError] = useState("");
  const [view, setView] = useState<View>("capture");
  const [navOpen, setNavOpen] = useState(false);
  const [googleToken, setGoogleTokenState] = useState<string | null>(null);

  // Hash routing so views can be bookmarked and the back button works.
  useEffect(() => {
    const read = () => {
      const h = window.location.hash.replace("#", "") as View;
      if (NAV.some((n) => n.id === h)) setView(h);
    };
    read();
    window.addEventListener("hashchange", read);
    return () => window.removeEventListener("hashchange", read);
  }, []);

  const go = useCallback((v: View) => {
    window.location.hash = v;
    setView(v);
    setNavOpen(false);
    window.scrollTo({ top: 0 });
  }, []);

  // Session handling for signed-in mode.
  useEffect(() => {
    if (mode === "demo") return;
    const sb = browserDb();
    if (!sb) { setError("Sign-in isn't configured yet. Try the demo instead."); return; }
    setGoogleTokenState(readGoogleToken());
    sb.auth.getSession().then(({ data }) => {
      if (!data.session) { router.replace("/"); return; }
      if (data.session.provider_token) { saveGoogleToken(data.session.provider_token); setGoogleTokenState(data.session.provider_token); }
      setReady(true);
    });
    const { data: sub } = sb.auth.onAuthStateChange((_e, session) => {
      if (session?.provider_token) { saveGoogleToken(session.provider_token); setGoogleTokenState(session.provider_token); }
    });
    return () => sub.subscription.unsubscribe();
  }, [mode, router]);

  const reload = useCallback(async () => {
    try {
      const d = await api<WorkspaceData>(mode, "/api/data");
      setData(d);
      setError("");
    } catch (e: any) {
      setError(e.message);
    }
  }, [mode]);

  useEffect(() => { if (ready) reload(); }, [ready, reload]);

  const setGoogleToken = (t: string | null) => { if (!t) clearGoogleToken(); setGoogleTokenState(t); };

  const counts = useMemo(() => {
    if (!data) return {} as Record<string, number>;
    const mine = data.tasks.filter((t) => t.status === "open" && samePersonClient(t.owner, data.me.name)).length;
    return { work: mine, decisions: data.decisions.filter((d) => d.status === "active").length, meetings: data.meetings.length };
  }, [data]);

  if (error && !data) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <div className="max-w-sm text-center">
          <p className="font-medium">Couldn’t open the workspace</p>
          <p className="mt-1 text-sm text-soft">{error}</p>
          <div className="mt-4 flex justify-center gap-2">
            <Button onClick={() => router.push("/")}>Home</Button>
            <Button variant="primary" onClick={() => router.push("/workspace?demo=1")}>Open demo</Button>
          </div>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="flex items-center gap-3 text-sm text-soft"><span className="h-2 w-2 animate-pulseDot rounded-full bg-brand" /> Loading your workspace…</div>
      </div>
    );
  }

  const shared: Shared = { mode, data, reload, googleToken, setGoogleToken, go };

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between px-4 pb-4 pt-5">
        <Logo size={26} />
        <button className="rounded-md p-1 text-faint hover:text-ink lg:hidden" onClick={() => setNavOpen(false)} aria-label="Close menu"><X className="h-5 w-5" /></button>
      </div>

      <div className="mx-3 mb-4 rounded-lg border border-line bg-raised px-3 py-2.5">
        <div className="text-[11px] font-medium uppercase tracking-[0.06em] text-faint">Workspace</div>
        <div className="mt-0.5 truncate text-sm font-medium">{data.workspaceName}</div>
      </div>

      <nav className="flex-1 space-y-0.5 px-3">
        {NAV.map((n) => (
          <button
            key={n.id}
            onClick={() => go(n.id)}
            className={cn(
              "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors",
              view === n.id ? "bg-surface font-medium text-ink shadow-card" : "text-soft hover:bg-surface/60 hover:text-ink"
            )}
          >
            <n.icon className={cn("h-4 w-4", view === n.id ? "text-brand" : "")} />
            <span className="flex-1 text-left">{n.label}</span>
            {counts[n.id] ? <span className="text-xs tabular-nums text-faint">{counts[n.id]}</span> : null}
          </button>
        ))}
      </nav>

      <div className="space-y-3 border-t border-line p-3">
        {mode === "org" ? (
          googleToken ? (
            <div className="flex items-center gap-2 px-1 text-xs text-good"><CalendarCheck className="h-3.5 w-3.5" /> Google Calendar connected</div>
          ) : (
            <button onClick={() => signInWithGoogle()} className="flex w-full items-center gap-2 rounded-lg px-1 text-left text-xs text-warn hover:underline">
              <CalendarX className="h-3.5 w-3.5" /> Reconnect Google Calendar
            </button>
          )
        ) : (
          <div className="rounded-lg bg-brand-wash px-3 py-2 text-xs leading-relaxed text-brand">
            You’re in the demo as <b>{data.me.name}</b>. Sign in to sync reminders to your own calendar.
          </div>
        )}
        <div className="flex items-center gap-2.5 px-1">
          <Avatar name={data.me.name} size={28} />
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium">{data.me.name}</div>
            <div className="truncate text-xs text-faint">{data.me.role || data.me.email}</div>
          </div>
          {mode === "demo" ? (
            <button
              title="Reset demo data"
              aria-label="Reset demo data"
              className="rounded-md p-1.5 text-faint hover:bg-raised hover:text-ink"
              onClick={async () => { if (confirm("Reset the demo workspace to its starting data?")) { await api("demo", "/api/demo/reset", { method: "POST" }); await reload(); go("capture"); } }}
            >
              <RotateCcw className="h-4 w-4" />
            </button>
          ) : (
            <button
              title="Sign out"
              aria-label="Sign out"
              className="rounded-md p-1.5 text-faint hover:bg-raised hover:text-ink"
              onClick={async () => { clearGoogleToken(); await browserDb()?.auth.signOut(); router.replace("/"); }}
            >
              <LogOut className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen lg:pl-64">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 border-r border-line bg-canvas lg:block">{sidebar}</aside>

      {navOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/30" onClick={() => setNavOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 border-r border-line bg-canvas shadow-pop">{sidebar}</aside>
        </div>
      )}

      <header className="sticky top-0 z-20 flex items-center justify-between border-b border-line bg-canvas/85 px-4 py-3 backdrop-blur lg:hidden">
        <button onClick={() => setNavOpen(true)} className="rounded-md p-1 text-soft" aria-label="Open menu"><Menu className="h-5 w-5" /></button>
        <Logo size={24} />
        <Avatar name={data.me.name} size={26} />
      </header>

      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-8 lg:py-10">
        {view === "capture" && <CaptureView {...shared} />}
        {view === "work" && <WorkView {...shared} />}
        {view === "decisions" && <DecisionsView {...shared} />}
        {view === "meetings" && <MeetingsView {...shared} />}
        {view === "digest" && <DigestView {...shared} />}
      </main>
    </div>
  );
}
