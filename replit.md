# Workspace

## Overview

pnpm workspace monorepo using TypeScript + Go. Each package manages its own dependencies.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.

## Artifacts

### KERN Dashboard (`artifacts/kern-dashboard`)
- React + Vite frontend, dark theme, deployed at `/`
- Pages: Dashboard, Sessions, Standups, Team, Settings
- Uses React Query hooks generated from OpenAPI spec via Orval
- Chart library: Recharts

### API Server (`artifacts/api-server`)
- Express 5 + Drizzle ORM + PostgreSQL
- Routes: `/api/developers/me`, `/api/sessions`, `/api/standups`, `/api/dashboard/summary`, `/api/dashboard/activity-breakdown`, `/api/team/members`, `/api/team/snapshot`

## KERN Agent (`kern-agent/`)
- **Language**: Go 1.21
- **npm package**: `@kern/agent` — installs via `npm install -g @kern/agent`
- **Binary**: compiled to `kern-agent/bin/kern` by `install.js` postinstall script
- **Commands**:
  - `kern init` — inject shell hooks (zsh / bash / fish)
  - `kern record` — called by shell hooks to capture each command
  - `kern sync` — flush SQLite buffer to KERN API (gzip JSON)
  - `kern daemon` — background sync daemon (every 5 min)
  - `kern status` — show local buffer stats and recent events
  - `kern config` — show/set API endpoint, key, developer ID
- **Local DB**: `~/.kern/events.db` — SQLite WAL mode, 30-day retention
- **Activity classification**: rule-based engine (CODING / DEBUGGING / TESTING / DEVOPS / RESEARCHING / IDLE)
- **Build**: `cd kern-agent && go build -o bin/kern .`

## Database Schema (PostgreSQL)

Tables: `teams`, `developers`, `work_sessions`, `standups`
Enums: `developer_role`, `activity_type`, `standup_source`
