export type Person = { id: string; name: string; email?: string | null; role?: string | null };

export type Meeting = {
  id: string;
  title: string;
  held_on: string;
  attendees: string[];
  transcript?: string | null;
  summary?: string | null;
  created_by?: string | null;
  created_at?: string;
};

export type Decision = {
  id: string;
  meeting_id?: string | null;
  text: string;
  topic?: string | null;
  made_by?: string | null;
  made_on: string;
  status: "active" | "superseded";
  superseded_by?: string | null;
};

export type Task = {
  id: string;
  meeting_id?: string | null;
  title: string;
  owner?: string | null;
  requested_by?: string | null;
  due_date?: string | null;
  status: "open" | "done";
  calendar_event_id?: string | null;
  created_at?: string;
};

export type Me = { name: string; email?: string | null; role?: string | null };

export type WorkspaceData = {
  mode: "demo" | "org";
  workspaceName: string;
  me: Me;
  people: Person[];
  meetings: Meeting[];
  decisions: Decision[];
  tasks: Task[];
};

export type DraftConflict = {
  decision_id: string;
  reason: string;
  past_text?: string;
  past_date?: string;
  past_meeting?: string;
};

export type DraftDecision = {
  text: string;
  topic: string;
  made_by?: string | null;
  conflicts: DraftConflict[];
};

export type DraftTask = {
  title: string;
  owner: string | null;
  requested_by: string | null;
  due_date: string | null;
  due_phrase?: string | null;
  source_quote?: string | null;
  duplicate_of?: string | null;
};

export type DraftGap = { item: string; question: string };

export type DraftLine = { speaker: string; text: string };

export type Draft = {
  summary: string;
  cleaned: DraftLine[];
  decisions: DraftDecision[];
  tasks: DraftTask[];
  gaps: DraftGap[];
};

export type AgentEvent =
  | { type: "step"; id: string; label: string; detail?: string; status: "running" | "done" }
  | { type: "draft"; draft: Draft }
  | { type: "error"; message: string };
