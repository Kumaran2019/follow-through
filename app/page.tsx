import Link from "next/link";
import { ArrowRight, CalendarCheck, GitCompareArrows, Mic, ShieldCheck, Users } from "lucide-react";
import { Logo } from "@/components/logo";
import { SignInButton } from "@/components/sign-in-button";

const FEATURES = [
  { icon: Mic, title: "Speak, don't type", text: "Dictate a messy recap right after the call. Filler words and “no wait, Thursday” corrections get cleaned up." },
  { icon: GitCompareArrows, title: "Catches conflicts", text: "Every new decision is checked against what your team already agreed, before it causes damage." },
  { icon: Users, title: "Owners, not vague asks", text: "Each action gets a named owner and a real date. Anything missing comes back as a question." },
  { icon: CalendarCheck, title: "Reminders that land", text: "Approved deadlines go straight onto Google Calendar with a heads-up the day before." },
];

export default function Home() {
  return (
    <main className="min-h-screen">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <Logo />
        <div className="flex items-center gap-2">
          <Link href="/workspace?demo=1" className="hidden h-9 items-center rounded-lg px-3.5 text-sm font-medium text-soft hover:bg-raised hover:text-ink sm:inline-flex">
            Try the demo
          </Link>
          <SignInButton compact />
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-6 pb-16 pt-12 md:pt-20">
        <div className="max-w-3xl animate-rise">
          <span className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1 text-xs font-medium text-soft">
            <span className="h-1.5 w-1.5 rounded-full bg-brand" /> Meeting-to-execution agent
          </span>
          <h1 className="mt-6 font-display text-[44px] font-semibold leading-[1.04] tracking-[-0.035em] md:text-[64px]">
            Meetings end.
            <br />
            <span className="text-brand">Follow-through</span> starts.
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-soft">
            Say what happened in your meeting. The agent pulls out decisions, owners and deadlines, flags anything that breaks an earlier decision, and only posts once you approve.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link href="/workspace?demo=1" className="inline-flex h-11 items-center gap-2 rounded-lg bg-brand px-5 text-[15px] font-medium text-brand-ink shadow-sm hover:bg-brand/90">
              Try the live demo <ArrowRight className="h-4 w-4" />
            </Link>
            <SignInButton />
          </div>
          <p className="mt-3 text-[13px] text-faint">The demo needs no sign-in. Sign in to use your own team workspace and calendar.</p>
        </div>

        <div className="mt-16 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((f, i) => (
            <div key={f.title} className="animate-rise rounded-xl border border-line bg-surface p-5 shadow-card" style={{ animationDelay: `${80 + i * 60}ms` }}>
              <div className="mb-4 flex h-9 w-9 items-center justify-center rounded-lg bg-brand-wash text-brand">
                <f.icon className="h-[18px] w-[18px]" />
              </div>
              <h3 className="font-semibold tracking-[-0.01em]">{f.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-soft">{f.text}</p>
            </div>
          ))}
        </div>

        <div className="mt-10 flex items-center gap-2 text-[13px] text-faint">
          <ShieldCheck className="h-4 w-4" /> Nothing is posted or added to a calendar until a person approves it.
        </div>
      </section>
    </main>
  );
}
