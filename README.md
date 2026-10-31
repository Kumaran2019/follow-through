# Follow-through

Meetings in, commitments out. An AI agent that turns a spoken recap or transcript into decisions, owners, deadlines and calendar reminders, and flags conflicts with decisions the team already made. Nothing is posted until a person approves.

## Stack

- **App:** Next.js 15 (App Router) on Vercel
- **AI:** Claude on AWS Bedrock, with tool use (agent loop in `lib/agent.ts`)
- **Database + login:** Supabase (Postgres, Google sign-in)
- **Integration:** Google Calendar API (deadline reminders)
- **Voice:** Wispr Flow, dictating into the capture box

## Setup (about 30–40 minutes)

### 1. Supabase
1. Create a project at supabase.com.
2. SQL Editor → New query → paste `supabase/schema.sql` → Run.
3. Project Settings → API: copy the **Project URL**, **anon key** and **service_role key**.

### 2. Bedrock
Copy your **region**, **model ID** (or inference profile ID) and your **Bedrock API key** (or IAM access key + secret with only `bedrock:InvokeModel`).

### 3. Vercel
1. Push this folder to a new GitHub repo.
2. Vercel → Add New → Project → import the repo.
3. Add every variable from `.env.example` under Environment Variables.
4. Deploy. Copy your live URL, e.g. `https://follow-through.vercel.app`.

The demo (`/workspace?demo=1`) works at this point, with no sign-in.

### 4. Google sign-in + Calendar (for real workspaces)
1. console.cloud.google.com → new project.
2. APIs & Services → Library → enable **Google Calendar API**.
3. OAuth consent screen → External → add scope `.../auth/calendar.events` → add your email under Test users.
4. Credentials → Create OAuth client ID → Web application.
   Authorized redirect URI: `https://<your-supabase-ref>.supabase.co/auth/v1/callback`
5. Supabase → Authentication → Providers → Google → paste the client ID and secret → enable.
6. Supabase → Authentication → URL Configuration:
   - Site URL: your Vercel URL
   - Redirect URLs: add `https://<your-vercel-url>/workspace`

## How the agent works

1. Reads the meeting input (messy speech or a transcript).
2. `list_people` matches names to the workspace.
3. `resolve_date` turns "next Monday" into a real date.
4. `search_decisions` checks earlier decisions for conflicts.
5. `search_open_tasks` avoids duplicates.
6. `submit_draft` returns decisions, tasks, conflicts and open questions.
7. A person reviews, edits and approves. Then tasks are saved, replaced decisions are marked, and reminders go to Google Calendar.

## Security

- Database tables have row-level security on with no public policies. Only the server touches them, after checking who the user is.
- AWS and Supabase service keys live only in Vercel environment variables.
- Workspaces are scoped by company email domain.
