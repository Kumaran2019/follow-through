const DAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];

export function parseISO(d: string): Date {
  const [y, m, day] = d.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, day));
}

export function toISO(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function addDays(iso: string, n: number): string {
  const d = parseISO(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return toISO(d);
}

export function weekday(iso: string): string {
  const name = DAYS[parseISO(iso).getUTCDay()];
  return name[0].toUpperCase() + name.slice(1);
}

export function prettyDate(iso?: string | null): string {
  if (!iso) return "";
  const d = parseISO(iso);
  return d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
}

export function daysBetween(fromIso: string, toIsoStr: string): number {
  return Math.round((parseISO(toIsoStr).getTime() - parseISO(fromIso).getTime()) / 86400000);
}

function monthIndex(word: string): number {
  const w = word.toLowerCase().replace(/\./g, "");
  return MONTHS.findIndex((m) => m.startsWith(w.slice(0, 3)));
}

/** Resolves a spoken date phrase against "today". Returns null when it can't be sure. */
export function resolveDate(phraseRaw: string, today: string): { date: string | null; note: string } {
  const p = phraseRaw.toLowerCase().trim().replace(/[,]/g, " ").replace(/\s+/g, " ");
  const t = parseISO(today);
  const todayDow = t.getUTCDay();

  if (/^(today|eod|end of (the )?day|tonight)$/.test(p)) return { date: today, note: "today" };
  if (/^tomorrow/.test(p)) return { date: addDays(today, 1), note: "tomorrow" };
  if (/day after tomorrow/.test(p)) return { date: addDays(today, 2), note: "day after tomorrow" };

  let m = p.match(/^in (\d+|a|one|two|three|four) (day|days|week|weeks)$/);
  if (m) {
    const words: Record<string, number> = { a: 1, one: 1, two: 2, three: 3, four: 4 };
    const n = words[m[1]] ?? Number(m[1]);
    return { date: addDays(today, m[2].startsWith("week") ? n * 7 : n), note: p };
  }

  if (/(end of (the )?week|eow|this week)/.test(p)) {
    const toFri = (5 - todayDow + 7) % 7;
    return { date: addDays(today, toFri), note: "end of this week (Friday)" };
  }
  if (/next week/.test(p) && !DAYS.some((d) => p.includes(d))) {
    const toMon = ((1 - todayDow + 7) % 7) || 7;
    return { date: addDays(today, toMon), note: "start of next week (Monday)" };
  }
  if (/(end of (the )?month|eom)/.test(p)) {
    const d = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0));
    return { date: toISO(d), note: "end of this month" };
  }

  const dayIdx = DAYS.findIndex((d) => p.includes(d) || p.includes(d.slice(0, 3) + " ") || p.endsWith(d.slice(0, 3)));
  if (dayIdx >= 0) {
    if (p.includes("next")) {
      // "next Monday" = that day in the next calendar week (weeks start Monday)
      const toNextMon = ((1 - todayDow + 7) % 7) || 7;
      const date = addDays(today, toNextMon + ((dayIdx + 6) % 7));
      return { date, note: `${DAYS[dayIdx]} of next week` };
    }
    const diff = ((dayIdx - todayDow + 7) % 7) || 7;
    return { date: addDays(today, diff), note: `the coming ${DAYS[dayIdx]}` };
  }

  // "10 november", "november 10", "10th nov", "nov 10th"
  m = p.match(/(\d{1,2})(st|nd|rd|th)?\s+(of\s+)?([a-z]+)/) || null;
  let day: number | null = null;
  let mon = -1;
  if (m && monthIndex(m[4]) >= 0) { day = Number(m[1]); mon = monthIndex(m[4]); }
  if (day === null) {
    const m2 = p.match(/([a-z]+)\s+(\d{1,2})(st|nd|rd|th)?/);
    if (m2 && monthIndex(m2[1]) >= 0) { day = Number(m2[2]); mon = monthIndex(m2[1]); }
  }
  if (day !== null && mon >= 0) {
    let year = t.getUTCFullYear();
    let d = new Date(Date.UTC(year, mon, day));
    if (toISO(d) < addDays(today, -60)) d = new Date(Date.UTC(year + 1, mon, day));
    return { date: toISO(d), note: "explicit date" };
  }

  const iso = p.match(/\d{4}-\d{2}-\d{2}/);
  if (iso) return { date: iso[0], note: "explicit ISO date" };

  return { date: null, note: "Could not resolve this phrase. Ask the team for a date." };
}

/** Two weeks of upcoming dates, so the agent can sanity-check its own picks. */
export function upcomingCalendar(today: string, days = 21) {
  return Array.from({ length: days }, (_, i) => {
    const d = addDays(today, i);
    return `${d} ${weekday(d)}${i === 0 ? " (today)" : ""}`;
  });
}
