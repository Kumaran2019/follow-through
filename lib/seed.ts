import { db } from "./supabase-server";
import { addDays } from "./dates";
import type { Me } from "./types";

export const DEMO_ME: Me = { name: "Ravi Kumar", email: "ravi@northwind.demo", role: "Delivery Manager" };

export function todayIn(tz = "Asia/Kolkata") {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

const PEOPLE = [
  { name: "Ravi Kumar", role: "Delivery Manager", email: "ravi@northwind.demo" },
  { name: "Priya Sharma", role: "Engineering Lead", email: "priya@northwind.demo" },
  { name: "Arjun Mehta", role: "Product Designer", email: "arjun@northwind.demo" },
  { name: "Sana Khan", role: "QA Lead", email: "sana@northwind.demo" },
  { name: "Meera Iyer", role: "Client PM, Northwind", email: "meera@northwind.demo" },
];



let seeding: Promise<void> | null = null;

export async function ensureDemoSeeded() {
  if (!seeding) {
    seeding = (async () => {
      const { count } = await db().from("decisions").select("id", { count: "exact", head: true }).eq("workspace_id", "demo");
      if (!count) await seedDemo();
    })().finally(() => { seeding = null; });
  }
  return seeding;
}

export async function seedDemo() {
  const ws = "demo";
  const s = db();
  const today = todayIn();

  await s.from("workspaces").upsert({ id: ws, name: "Northwind Retail (demo)" });
  await s.from("tasks").delete().eq("workspace_id", ws);
  await s.from("decisions").delete().eq("workspace_id", ws);
  await s.from("meetings").delete().eq("workspace_id", ws);
  await s.from("people").delete().eq("workspace_id", ws);

  await s.from("people").insert(PEOPLE.map((p) => ({ ...p, workspace_id: ws })));

  const kickoffDate = addDays(today, -7);
  const reviewDate = addDays(today, -3);

  const { data: meetings, error } = await s
    .from("meetings")
    .insert([
      {
        workspace_id: ws,
        title: "Northwind kickoff: scope & timeline",
        held_on: kickoffDate,
        attendees: ["Ravi Kumar", "Priya Sharma", "Arjun Mehta", "Sana Khan", "Meera Iyer"],
        summary: "Agreed launch date, budget cap and v1 scope for the Northwind checkout rebuild.",
        transcript: "Meera: We need to go live before the holiday rush. Ravi: Then let's lock the public launch for 20 November. Priya: That works if v1 is web only. Meera: Fine, mobile can be phase 2. Ravi: Budget stays capped at 40K dollars.",
        created_by: "Ravi Kumar",
      },
      {
        workspace_id: ws,
        title: "Checkout design review",
        held_on: reviewDate,
        attendees: ["Ravi Kumar", "Priya Sharma", "Arjun Mehta"],
        summary: "Chose a single-page checkout and agreed a weekly client demo.",
        transcript: "Arjun: Users drop off on step three. Priya: Let's go single page. Ravi: Agreed. And we'll demo to the client every Thursday.",
        created_by: "Ravi Kumar",
      },
    ])
    .select("id, title");
  if (error) throw error;
  const kickoff = meetings!.find((m) => m.title.startsWith("Northwind kickoff"))!.id;
  const review = meetings!.find((m) => m.title.startsWith("Checkout design"))!.id;

  await s.from("decisions").insert([
    { workspace_id: ws, meeting_id: kickoff, text: "Public launch date is 20 November.", topic: "Launch date", made_by: "Ravi Kumar", made_on: kickoffDate },
    { workspace_id: ws, meeting_id: kickoff, text: "Total project budget is capped at $40K.", topic: "Budget", made_by: "Ravi Kumar", made_on: kickoffDate },
    { workspace_id: ws, meeting_id: kickoff, text: "v1 is web only. The mobile app moves to phase 2.", topic: "Scope", made_by: "Meera Iyer", made_on: kickoffDate },
    { workspace_id: ws, meeting_id: review, text: "Checkout uses a single-page flow.", topic: "Design", made_by: "Priya Sharma", made_on: reviewDate },
    { workspace_id: ws, meeting_id: review, text: "Client demo every Thursday.", topic: "Cadence", made_by: "Ravi Kumar", made_on: reviewDate },
  ]);

  const { error: taskErr } = await s.from("tasks").insert([
    { workspace_id: ws, meeting_id: kickoff, title: "Finalize the checkout API spec", owner: "Priya Sharma", requested_by: "Ravi Kumar", due_date: addDays(today, 3), status: "open" },
    { workspace_id: ws, meeting_id: kickoff, title: "Draft the UAT test plan", owner: "Sana Khan", requested_by: "Ravi Kumar", due_date: addDays(today, 6), status: "open" },
    { workspace_id: ws, meeting_id: kickoff, title: "Send the revised SOW to the client", owner: "Ravi Kumar", requested_by: "Meera Iyer", due_date: addDays(today, -1), status: "open" },
    { workspace_id: ws, meeting_id: kickoff, title: "Share brand guidelines", owner: "Meera Iyer", requested_by: "Arjun Mehta", due_date: addDays(today, 2), status: "open" },
    { workspace_id: ws, meeting_id: review, title: "Rework checkout into a single page", owner: "Arjun Mehta", requested_by: "Priya Sharma", due_date: addDays(today, 4), status: "open" },
    { workspace_id: ws, meeting_id: review, title: "Set up the Thursday demo invite", owner: "Ravi Kumar", requested_by: "Meera Iyer", due_date: addDays(today, -2), status: "done" },
  ]);
  if (taskErr) throw taskErr;
}
