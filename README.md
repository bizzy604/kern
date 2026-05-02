# KERN

**Developer behavioral intelligence platform.**

KERN captures how your engineering team actually works — shell commands, git commits, coding patterns — classifies the activity, and surfaces it as a real-time dashboard, AI-generated standups, and team blocker intelligence.

No manual time-tracking. No ticket updates. No standups that take 20 minutes to say nothing.

---

## What it does

| Layer | What happens |
|---|---|
| **kern CLI** | Silent Go agent installed in your shell. Captures every command, buffers locally in SQLite, syncs to the API every 5 minutes |
| **API Server** | Express 5 + PostgreSQL ingests sessions and commits, classifies activity, exposes a typed REST API |
| **Dashboard** | React app showing your personal activity, team progress, AI-written standups, and blocker intel |
| **AI Layer** | Claude Sonnet streams daily standups from your session + commit history; scans the whole team for blockers |

---

## Terminal commands — quick reference

Everything you can do from your shell:

```bash
# ── Setup ────────────────────────────────────────────────────────────────────
kern register                                    # Create account, save API key automatically
kern init                                        # Inject shell hooks + open dashboard
kern config --endpoint <url> --key <key>         # Set API endpoint and API key manually
kern config --dev-id <id>                        # Set your developer ID
kern config                                      # Print current config

# ── Open dashboard ───────────────────────────────────────────────────────────
kern dashboard                                   # Open KERN dashboard in your browser

# ── Sync & daemon ────────────────────────────────────────────────────────────
kern sync                                        # Flush local buffer to API now
kern daemon                                      # Background sync loop (every 5 min)

# ── Inspect ──────────────────────────────────────────────────────────────────
kern status                                      # Buffer stats, last sync, recent events

# ── Record (called automatically by shell hooks) ─────────────────────────────
kern record --cmd <cmd> --start <ns> --exit <n> --cwd <path>
```

### Config flags

| Flag | Description | Example |
|---|---|---|
| `--endpoint <url>` | KERN API base URL | `https://kern.example.com/api` |
| `--key <api_key>` | API key (from Settings → CLI API Key) | `kern_abc123` |
| `--dev-id <id>` | Developer ID | `1` |

### Shell flags for `kern init`

| Flag | Description |
|---|---|
| `--shell zsh` | Force zsh hook (default: auto-detect) |
| `--shell bash` | Force bash hook |
| `--shell fish` | Force fish hook |

---

## Features

### Dashboard
- Today's coding time, session count, commit count, and active streak
- Activity breakdown across Coding / Debugging / Testing / DevOps / Research
- Real-time project timeline
- Recent git commits with diff stats

### Sessions
- Full session history with activity classification, project, language, inferred task, and duration
- Pagination, filtering by project and activity type

### Standups
- AI-generated daily standup from real session and commit data — no prompting required
- Streams token-by-token (SSE), editable before posting
- One-click post to Slack via configured webhook
- History of all past standups

### Team Collaboration
- Live view of every team member: current activity, last seen, today's time, streak
- Expandable per-member detail: recent sessions, commits, today's standup
- **AI Blocker Intel** — one click scans all team members' recent work and streams a structured report flagging who is stuck, what they're fighting, and where teammates can jump in
- "Copy jump-in message" generates a context-aware Slack message for each teammate

### Settings
- Profile (name, GitHub handle, role, timezone)
- CLI API Key — masked reveal, one-click copy, ready-to-paste `~/.kern/config.json` snippet
- Slack integration — paste an incoming webhook URL, KERN tests it live before saving, shows connected channel
- GitHub integration — auto-detected from commit activity
- Jira / Asana — coming soon

---

## Architecture

```
kern/
├── kern-agent/          # Go CLI agent (ships as npm package @kern/agent)
│   ├── cmd/             # Commands: init, record, sync, daemon, status, config, dashboard
│   └── internal/
│       ├── classifier/  # Rule-based shell command → activity type classification
│       ├── client/      # HTTP client for API sync (gzip JSON)
│       ├── config/      # ~/.kern/config.json reader/writer
│       ├── db/          # SQLite WAL buffer (~/.kern/events.db)
│       └── git/         # Git log reader for commit capture
│
├── artifacts/
│   ├── api-server/      # Express 5 API, esbuild bundle, PostgreSQL + Drizzle ORM
│   └── kern-dashboard/  # React + Vite dashboard, React Query, Recharts
│
└── lib/
    ├── db/              # Drizzle schema + migrations (shared)
    ├── api-spec/        # OpenAPI spec (contract-first)
    ├── api-zod/         # Generated Zod schemas (from OpenAPI)
    └── api-client-react/# Generated React Query hooks (from OpenAPI via Orval)
```

### Data flow

```
Shell command
     │
     ▼
kern record                     (called by shell hook after every command)
     │
     ▼
~/.kern/events.db               (SQLite buffer, 30-day retention, WAL mode)
     │
     ▼  every 5 min (daemon) or kern sync
POST /api/sessions/ingest        (gzip JSON, Bearer API key auth)
     │
     ▼
PostgreSQL                       (work_sessions, git_commits tables)
     │
     ▼
Dashboard / Standups / Team      (React Query, SSE streaming)
```

---

## Quick start

### 1. Install the CLI agent

```bash
npm install -g kern-agent
```

### 2. Register and get your API key

```bash
kern register
```

Prompts for your name, email, and the KERN API endpoint. Creates your account and saves the API key to `~/.kern/config.json` automatically — no copy-paste required.

### 3. Initialize shell integration

```bash
kern init
```

Detects your shell (zsh, bash, or fish), injects the capture hook into the appropriate config file, and opens the dashboard automatically. After restarting your shell, every command you run is silently captured.

### 4. Start the daemon

```bash
kern daemon
```

Syncs your local buffer to the API every 5 minutes in the background. Or call `kern sync` manually to flush immediately.

### 5. Open your dashboard

```bash
kern dashboard
```

---

## CLI reference

| Command | Description |
|---|---|
| `kern register` | Create a KERN account, save API key automatically |
| `kern init` | Detect shell, inject hooks, open dashboard in browser |
| `kern dashboard` | Open the KERN dashboard in your browser |
| `kern config` | Print current configuration |
| `kern config --endpoint <url> --key <key>` | Set API endpoint and API key |
| `kern config --dev-id <id>` | Set developer ID |
| `kern sync` | Flush local SQLite buffer to the KERN API |
| `kern daemon` | Run background sync loop (every 5 minutes) |
| `kern status` | Show local buffer stats, last sync time, and recent events |
| `kern record --cmd <cmd> --start <ns> --exit <n> --cwd <path>` | Capture one command (called automatically by shell hooks) |

### `kern init` flags

| Flag | Description |
|---|---|
| `--shell zsh` | Force zsh hook |
| `--shell bash` | Force bash hook |
| `--shell fish` | Force fish hook |

### `kern config` flags

| Flag | Description |
|---|---|
| `--endpoint <url>` | Set API base URL |
| `--key <api_key>` | Set API key |
| `--dev-id <id>` | Set developer ID |

---

## Activity classification

The kern agent classifies every captured command into one of six activity types using a rule-based engine with ~60 patterns. No ML model required — deterministic and fast.

| Type | Example commands |
|---|---|
| `CODING` | `vim`, `nvim`, `code`, `nano`, `git add`, `git commit`, compiler invocations |
| `DEBUGGING` | `gdb`, `dlv`, `pdb`, `node --inspect`, `console.log` patterns |
| `TESTING` | `go test`, `pytest`, `jest`, `vitest`, `pnpm test`, `cargo test` |
| `DEVOPS` | `docker`, `kubectl`, `terraform`, `aws`, `gcloud`, `helm`, `fly` |
| `RESEARCHING` | `curl`, `man`, `grep`, `jq`, `dig`, `cat`, reading files |
| `IDLE` | Empty commands, shell built-ins, cd |

Classification confidence is stored (0.0–1.0) for future ML override.

---

## API reference

All routes are prefixed with `/api`. Protected routes require `Authorization: Bearer <api_key>`.

### Developer

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/developers/me` | — | Profile, role, team |

### Sessions

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/sessions` | — | Paginated session history |
| `POST` | `/sessions/ingest` | Required | CLI sync endpoint (gzip JSON array) |

### Standups

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/standups/today` | — | Today's standup |
| `GET` | `/standups` | — | Paginated standup history |
| `PUT` | `/standups/:id` | — | Edit standup content |
| `POST` | `/standups/generate` | — | Stream AI standup generation (SSE) |
| `POST` | `/standups/:id/post-to-slack` | — | Post standup to Slack |

### Dashboard

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/dashboard/summary` | — | Today's stats (time, sessions, commits, streak) |
| `GET` | `/dashboard/activity-breakdown` | — | Time split by activity type |

### Team

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/team/members` | — | All developers with today's stats |
| `GET` | `/team/members/:id/detail` | — | Sessions, commits, standup for one developer |
| `GET` | `/team/snapshot` | — | Aggregate stats and top projects |
| `POST` | `/team/blockers/analyze` | — | Stream AI blocker analysis for whole team (SSE) |

### Git

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/git/commits` | — | Recent commit history |

### Integrations

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/integrations` | — | Status of all integrations |
| `POST` | `/integrations/slack` | — | Connect Slack (tests webhook before saving) |
| `DELETE` | `/integrations/slack` | — | Disconnect Slack |

---

## Database schema

```
teams              id, name, created_at
developers         id, name, email, api_key, github_handle, team_id, role, timezone
work_sessions      id, developer_id, activity_type, inferred_task, project, language,
                   duration_minutes, command_count, started_at, ended_at, confidence
standups           id, developer_id, date, content, source, posted_to_slack, posted_at
git_commits        id, developer_id, hash, short_hash, branch, message, author,
                   files_changed, insertions, deletions, project, committed_at
integrations       id, developer_id, type, config (JSON), connected_at
```

Enums: `developer_role` (DEVELOPER / TEAM_LEAD / ADMIN), `activity_type` (CODING / DEBUGGING / TESTING / DEVOPS / RESEARCHING / IDLE), `standup_source` (AI / MANUAL)

---

## Integrations

### Slack

1. Create an [Incoming Webhook](https://api.slack.com/messaging/webhooks) in your Slack workspace
2. Go to **Settings → Integrations → Slack → Connect**
3. Paste the webhook URL — KERN sends a test message before saving
4. Standups posted via the dashboard will go to that channel

### GitHub

Automatically detected when the kern agent captures git commits. No OAuth required — commit data is captured locally by `kern sync` reading your git log.

---

## Development setup

### Prerequisites

- Node.js 20+, pnpm 9+
- Go 1.21+
- PostgreSQL 15+

### Clone and install

```bash
git clone https://github.com/bizzy604/kern
cd kern
pnpm install
```

### Environment

Create a `.env` file in `artifacts/api-server/`:

```env
DATABASE_URL=postgresql://user:pass@localhost:5432/kern
SESSION_SECRET=your-session-secret
PORT=3001
```

Set `ANTHROPIC_API_KEY` for AI standup generation and team blocker analysis.

### Run locally

```bash
# API server (rebuilds + starts on save)
pnpm --filter @workspace/api-server run dev

# Dashboard (Vite HMR)
pnpm --filter @workspace/kern-dashboard run dev

# Build the kern CLI agent
cd kern-agent && go build -o bin/kern .

# Typecheck everything
pnpm run typecheck

# Typecheck shared libs only
pnpm run typecheck:libs

# Regenerate API client (after changing OpenAPI spec)
pnpm --filter @workspace/api-spec run codegen
```

### Typecheck

```bash
pnpm run typecheck        # full workspace typecheck
pnpm run typecheck:libs   # shared libs only
```

### Regenerate API client (after changing OpenAPI spec)

```bash
pnpm --filter @workspace/api-spec run codegen
```

---

## Deployment

Push to Replit and click **Deploy**. The platform handles TLS, health checks, and process management. The dashboard and API are served through a shared reverse proxy with path-based routing (`/` for the dashboard, `/api` for the server).

Set the following secrets in your deployment environment:

| Variable | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `SESSION_SECRET` | Random string for session signing |
| `ANTHROPIC_API_KEY` | Claude API key for AI features |
| `SLACK_WEBHOOK_URL` | Optional fallback webhook (overridden by per-user DB config) |

---

## Built by

Amoni Erot Kevin — Platform Engineering

---

## License

MIT
