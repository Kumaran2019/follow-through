"use client";
import type { Task } from "./types";

const pad = (n: number) => String(n).padStart(2, "0");

/** A link that opens Google Calendar with the event pre-filled. Works for anyone, no sign-in. */
export function calendarLink(task: Pick<Task, "title" | "owner" | "due_date">, workspace: string) {
  if (!task.due_date) return null;
  const d = task.due_date.replace(/-/g, "");
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: `Due: ${task.title}`,
    dates: `${d}T093000/${d}T094500`,
    details: `Owner: ${task.owner || "Unassigned"}\nTracked in Follow-through (${workspace}).`,
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

/** Creates a reminder on the signed-in user's own Google Calendar, using the token from Google sign-in. */
export async function createReminder(token: string, task: Pick<Task, "title" | "owner" | "due_date" | "requested_by">, workspace: string) {
  if (!task.due_date) return null;
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const [y, m, d] = task.due_date.split("-").map(Number);
  const start = `${y}-${pad(m)}-${pad(d)}T09:30:00`;
  const end = `${y}-${pad(m)}-${pad(d)}T09:45:00`;
  const res = await fetch("https://www.googleapis.com/calendar/v3/calendars/primary/events", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      summary: `Due: ${task.title}`,
      description: `Owner: ${task.owner || "Unassigned"}\nRequested by: ${task.requested_by || "—"}\nTracked in Follow-through (${workspace}).`,
      start: { dateTime: start, timeZone: tz },
      end: { dateTime: end, timeZone: tz },
      reminders: { useDefault: false, overrides: [{ method: "popup", minutes: 24 * 60 }, { method: "popup", minutes: 60 }] },
      transparency: "transparent",
    }),
  });
  if (res.status === 401) throw new Error("google_expired");
  if (!res.ok) throw new Error(`Calendar error ${res.status}`);
  const json = await res.json();
  return json.id as string;
}
