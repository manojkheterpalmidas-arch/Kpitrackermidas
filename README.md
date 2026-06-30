# Team KPI Tracker

Weekly KPI tracker for Manoj's team.

The app can run in two modes:

- local portable mode using SQLite
- web mode using Supabase as the shared database

## What Is Included

- Dashboard for weekly KPI assignments, KPI progress, overdue actions, missed commitments, and Manoj workload
- Team member setup with roles, regions, team area, KPI type, and weekly expectations
- KPI definitions per person
- Weekly KPI entries with target value, actual value, notes, weekly/monthly period type, and exports
- Weekly commitments for Monday planning and Friday review
- Action tracker with list, Kanban, due-date view, tags, recurring flag, and overdue tracking
- 1:1 reviews focused on KPI progress, blockers, coaching, and action items
- Weekly KPI reports in Markdown with print/PDF support
- CSV and Excel exports
- Optional DeepSeek AI assistant using your own API key
- Optional local PIN lock
- Password protection for KPI target, assignment, and actual changes
- Full SQLite backup and restore
- Light/dark theme

## Local Data

The local database is created here:

```text
data/team-kpi-tracker.sqlite
```

The optional AI API key is encrypted before storage. The local encryption key is created here:

```text
data/.local-key
```

Keep both files private. Use the in-app backup button to save a copy of the database.

## Requirements

- Windows 10 or Windows 11
- Node.js 20 or newer
- pnpm

Install pnpm if needed:

```powershell
npm install -g pnpm
```

## Run Locally

From this folder:

```powershell
pnpm install
pnpm build
pnpm start
```

Then open:

```text
http://127.0.0.1:4173
```

If that port is already occupied, start with another port:

```powershell
$env:PORT=4174
pnpm start
```

Then open:

```text
http://127.0.0.1:4174
```

If no Supabase environment variables are set, the app automatically uses the local SQLite database.

## Web App With Supabase

Use this mode when remote employees need to open the same app and work from the same shared data.

### 1. Create Supabase Tables

Create a Supabase project, open the SQL editor, and run:

```text
supabase/schema.sql
```

This creates the same tables the app already uses: team members, KPIs, weekly KPI entries, commitments, actions, 1:1 reviews, settings, and audit log.

### 2. Add Environment Variables

Copy `.env.example` and set these in your deployment platform:

```text
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
APP_SECRET=use-a-long-random-secret
HOST=0.0.0.0
```

`SUPABASE_URL` can be either the project URL or the REST endpoint URL ending in `/rest/v1/`.

Do not commit real keys to Git. Use the deployment platform's secret/environment variable settings.

The service-role key is used only by the Node server. It is not sent to the browser.

For local Supabase testing, you can copy `.env.example` to `.env` and fill in the values. `.env` is ignored by Git.

### 3. Deploy From Git

If this folder is not already a Git repository, initialize it and push it to GitHub:

```powershell
git init
git add .
git commit -m "Prepare Team KPI Tracker web app"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/team-kpi-tracker.git
git push -u origin main
```

Then deploy from GitHub with:

```text
pnpm install --frozen-lockfile
pnpm build
pnpm start
```

For Vercel, the included `vercel.json` handles the build and static output. Set the environment variables in Vercel Project Settings, then redeploy from the `main` branch.

The app will use Supabase when `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are set. If those variables are missing, it falls back to SQLite.

### 4. Updating Data In Supabase

You can edit data directly in the Supabase table editor, or use the app UI. Keep IDs stable when editing related rows:

- `team_members.id` is used by KPIs, commitments, actions, and reviews
- `kpis.id` is used by weekly KPI entries
- date fields such as `week_start`, `period_start`, and `due_date` should stay in `YYYY-MM-DD` format

### Security Note

The current web mode is a shared app with the existing app-level PIN lock. It is suitable as a first web version. For per-employee logins and row-level employee access, the next step is Supabase Auth plus user-role policies.

## AI Setup

AI is disabled by default.

Go to `Settings` and open `Manage DeepSeek Settings` to:

- enable or disable AI
- enter your DeepSeek API key
- set the API endpoint
- set the model name

The app only sends the selected KPI, commitment, action, review, and team content shown in the AI Assistant screen. It does not send the full database automatically.

## PIN Lock

The app starts with PIN lock enabled. The initial PIN is:

```text
2101
```

Go to `Settings` and use `PIN Lock` to change or disable it. The PIN is stored as a salted hash, not as plain text.

KPI targets, KPI assignments, and weekly KPI actuals require a password before changes can be saved. The initial password is:

```text
3007
```

## Backup and Restore

Use `Settings`:

- `Backup SQLite Database` downloads the current database
- `Restore Database` replaces the current database with a selected backup file
- table exports are available as CSV or Excel

## Project Structure

```text
src/server   Node backend; SQLite local mode or Supabase web mode
src/client   browser UI
public       HTML and CSS shell
supabase     SQL schema for web mode
data         local SQLite storage, ignored by Git
```
