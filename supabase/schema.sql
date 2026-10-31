-- Follow-through database schema
-- Run this once in Supabase: SQL Editor -> New query -> paste -> Run.

create extension if not exists "pgcrypto";

create table if not exists workspaces (
  id text primary key,
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists people (
  id uuid primary key default gen_random_uuid(),
  workspace_id text not null references workspaces(id) on delete cascade,
  name text not null,
  email text,
  role text,
  created_at timestamptz not null default now(),
  unique (workspace_id, name)
);

create table if not exists meetings (
  id uuid primary key default gen_random_uuid(),
  workspace_id text not null references workspaces(id) on delete cascade,
  title text not null,
  held_on date not null,
  attendees text[] not null default '{}',
  transcript text,
  summary text,
  created_by text,
  created_at timestamptz not null default now()
);

create table if not exists decisions (
  id uuid primary key default gen_random_uuid(),
  workspace_id text not null references workspaces(id) on delete cascade,
  meeting_id uuid references meetings(id) on delete cascade,
  text text not null,
  topic text,
  made_by text,
  made_on date not null,
  status text not null default 'active' check (status in ('active','superseded')),
  superseded_by uuid references decisions(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists tasks (
  id uuid primary key default gen_random_uuid(),
  workspace_id text not null references workspaces(id) on delete cascade,
  meeting_id uuid references meetings(id) on delete cascade,
  title text not null,
  owner text,
  requested_by text,
  due_date date,
  status text not null default 'open' check (status in ('open','done')),
  calendar_event_id text,
  created_at timestamptz not null default now()
);

create index if not exists decisions_ws_idx on decisions(workspace_id, status);
create index if not exists tasks_ws_idx on tasks(workspace_id, status);
create index if not exists meetings_ws_idx on meetings(workspace_id, held_on desc);

-- Lock the tables down. The app only reaches them from the server,
-- using the service role key, after checking who the user is.
alter table workspaces enable row level security;
alter table people enable row level security;
alter table meetings enable row level security;
alter table decisions enable row level security;
alter table tasks enable row level security;
