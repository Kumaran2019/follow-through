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
        <div className="flex items-center gap-3 text-sm text-soft"><span className="h-2 w-2 animate-pulseDot rounded-full bg-brand" /> <span className="font-mono text-xs tracking-[0.1em]">LOADING WORKSPACE</span></div>
      </div>
    );
  }

  const shared: Shared = { mode, data, reload, googleToken, setGoogleToken, go };

  const userMenu = (
    <div className="flex items-center gap-2">
      {mode === "org" ? (
        googleToken ? (
          <span className="hidden items-center gap-1.5 rounded-full border border-line px-3 py-1.5 text-xs text-brand md:inline-flex"><CalendarCheck className="h-3.5 w-3.5" /> Calendar on</span>
        ) : (
          <button onClick={() => signInWithGoogle()} className="hidden items-center gap-1.5 rounded-full border border-warn/40 px-3 py-1.5 text-xs text-warn hover:bg-warn-wash md:inline-flex">
            <CalendarX className="h-3.5 w-3.5" /> Reconnect calendar
          </button>
        )
      ) : (
        <span className="hidden rounded-full border border-line px-3 py-1.5 font-mono text-[11px] text-faint md:inline-flex">DEMO · {data.me.name.toUpperCase()}</span>
      )}
      <span className="hidden text-[13px] text-faint lg:inline">{data.workspaceName}</span>
      <Avatar name={data.me.name} size={32} />
      {mode === "demo" ? (
        <button
          title="Reset demo data"
          aria-label="Reset demo data"
          className="rounded-full p-2 text-faint hover:bg-raised hover:text-ink"
          onClick={async () => { if (confirm("Reset the demo workspace to its starting data?")) { await api("demo", "/api/demo/reset", { method: "POST" }); await reload(); go("capture"); } }}
        >
          <RotateCcw className="h-4 w-4" />
        </button>
      ) : (
        <button
          title="Sign out"
          aria-label="Sign out"
          className="rounded-full p-2 text-faint hover:bg-raised hover:text-ink"
          onClick={async () => { clearGoogleToken(); await browserDb()?.auth.signOut(); router.replace("/"); }}
        >
          <LogOut className="h-4 w-4" />
        </button>
      )}
    </div>
  );

  return (
    <div className="min-h-screen bg-canvas">
      <header className="sticky top-0 z-30 border-b border-[#1E1E21] bg-canvas/85 backdrop-blur">
        <div className="mx-auto flex max-w-[1360px] items-center justify-between gap-4 px-4 py-4 sm:px-10">
          <div className="flex min-w-0 items-center gap-7">
            <button onClick={() => go("capture")} aria-label="Follow-through home"><Logo size={26} /></button>
            <nav aria-label="Main" className="hidden items-center gap-1 lg:flex">
              {NAV.map((n) => (
                <button
                  key={n.id}
                  onClick={() => go(n.id)}
                  className={cn("flex items-center gap-2 rounded-full px-3.5 py-2 text-sm transition-colors", view === n.id ? "bg-raised text-ink" : "text-faint hover:text-ink")}
                >
                  {n.label}
                  {counts[n.id] ? <span className="font-mono text-[11px] text-faint">{String(counts[n.id]).padStart(2, "0")}</span> : null}
                </button>
              ))}
            </nav>
          </div>
          {userMenu}
          <button className="rounded-full p-2 text-soft lg:hidden" onClick={() => setNavOpen(!navOpen)} aria-label="Menu">{navOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}</button>
        </div>
        {navOpen && (
          <nav aria-label="Main" className="flex flex-wrap gap-1 border-t border-[#1E1E21] px-4 py-3 lg:hidden">
            {NAV.map((n) => (
              <button key={n.id} onClick={() => go(n.id)} className={cn("flex items-center gap-2 rounded-full px-3.5 py-2 text-sm", view === n.id ? "bg-raised text-ink" : "text-faint")}>
                <n.icon className="h-4 w-4" /> {n.label}
              </button>
            ))}
          </nav>
        )}
      </header>

      <main className="mx-auto max-w-[1360px] px-4 pb-40 pt-10 sm:px-10">
        {view === "capture" && <CaptureView {...shared} />}
        {view === "work" && <WorkView {...shared} />}
        {view === "decisions" && <DecisionsView {...shared} />}
        {view === "meetings" && <MeetingsView {...shared} />}
        {view === "digest" && <DigestView {...shared} />}
      </main>
    </div>
  );
}
