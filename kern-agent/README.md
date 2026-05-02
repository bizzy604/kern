# kern agent

> Terminal plugin for the KERN developer behavioral intelligence platform.

Captures every command you run, classifies it by activity type (CODING, DEBUGGING, TESTING, DEVOPS, RESEARCHING), buffers it locally in SQLite, and syncs it to your KERN dashboard.

---

## Install

```bash
npm install -g @kern/agent
```

> **Requires Go 1.21+** — the postinstall script compiles a native binary for your platform.

---

## Quick start

```bash
# 1. Inject shell hooks
kern init

# 2. Restart your shell (or source the config)
source ~/.zshrc   # zsh
source ~/.bashrc  # bash
exec fish         # fish

# 3. Work normally — kern captures everything in the background

# 4. Check your local buffer
kern status

# 5. Configure your KERN endpoint
kern config --endpoint https://your-kern.replit.app/api

# 6. Sync to dashboard
kern sync

# 7. (Optional) Run a background sync daemon
nohup kern daemon &
```

---

## Commands

| Command | Description |
|---|---|
| `kern init` | Inject shell hooks into zsh / bash / fish |
| `kern status` | Show local buffer stats and recent events |
| `kern sync` | Flush buffered events to the KERN API |
| `kern daemon` | Run background sync daemon (every 5 min) |
| `kern config` | Show or update configuration |
| `kern record` | *(Internal)* Called by shell hooks to record a command |

---

## How it works

```
┌─────────────────────────────────────────────────────────┐
│  Your shell (zsh / bash / fish)                         │
│                                                         │
│  preexec  ──► records start time in $KERN_CMD_START     │
│  precmd   ──► kern record --cmd "..." --start "..." ... │
└────────────────────────────┬────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────┐
│  kern record (Go)                                       │
│                                                         │
│  1. Filter noise (ls, cd, clear...)                     │
│  2. Classify activity type (rule-based)                 │
│  3. Infer project (walk up to go.mod / package.json)    │
│  4. Write to ~/.kern/events.db (SQLite WAL)             │
└────────────────────────────┬────────────────────────────┘
                             │
                     kern sync / daemon
                             │
                             ▼
┌─────────────────────────────────────────────────────────┐
│  KERN API  (/api/sessions/ingest)                       │
│                                                         │
│  Groups events → sessions → posts gzip JSON             │
│  Dashboard shows activity breakdown, standups, team     │
└─────────────────────────────────────────────────────────┘
```

---

## Activity classification

Commands are classified using a rule-based engine:

| Type | Examples |
|---|---|
| **CODING** | `go build`, `vim`, `git commit`, `tsc`, `cargo build` |
| **DEBUGGING** | `gdb`, `dlv`, `pdb`, `node --inspect` |
| **TESTING** | `go test`, `jest`, `pytest`, `cargo test` |
| **DEVOPS** | `docker`, `kubectl`, `terraform`, `aws`, `fly` |
| **RESEARCHING** | `curl`, `man`, `grep`, `rg`, `dig` |
| **IDLE** | Commands with >15 min gap before them |

---

## Local database

Events are stored at `~/.kern/events.db` using SQLite with WAL mode for safe concurrent writes. The buffer holds 30 days of events and synced events are pruned automatically.

---

## Configuration

```bash
kern config --endpoint https://your-kern.replit.app/api
kern config --key <your-api-key>
```

Config is stored at `~/.kern/config.json`.
