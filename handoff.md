# OpenCode Node.js Migration — Handoff Notes

**Branch:** `node-pty` (based on upstream `node-pty`, at lietxia/opencode)
**Date:** 2026-06-07

## Goal

Make OpenCode run on Node.js (specifically for Termux/Android where Bun doesn't work due to seccomp restrictions).

## What's Done

### Server Mode ✅ Working
- `bun run script/build-node.ts` builds `dist/node.js` (server-only entry)
- Node.js runs it successfully on `0.0.0.0:1338`
- No `bun:` references in built output
- `node:sqlite DatabaseSync` works for DB init
- 8 migrations tracked via `__drizzle_migrations` table

### Core Migrations

1. **`db.ts`** — Replaced `import { migrate } from "drizzle-orm/bun-sqlite/migrator"` with conditional `#db/migrate` import (bun/node branches)
2. **`db-migrate.bun.ts`** — Re-exports `drizzle-orm/bun-sqlite/migrator`
3. **`db-migrate.node.ts`** — NEW: Manual journal-based migrator for node-sqlite. Uses `DatabaseSync.exec()` to run SQL statements, tracks applied migrations by `name` in `__drizzle_migrations` table
4. **`json-migration.ts`** — Removed direct `bun:sqlite` and `drizzle-orm/bun-sqlite` imports, replaced with runtime-detection (`typeof Bun !== "undefined"`) and dynamic imports
5. **`json-migration.node.ts`** — NEW stub: `import { DatabaseSync } from "node:sqlite"; import { drizzle } from "drizzle-orm/node-sqlite"`
6. **`package.json`** — Added `#db/migrate` conditional import (bun/node/default branches)
7. **`build-node.ts`** — Added `conditions: ["node"]` to `Bun.build()` so conditional imports resolve to node branches
8. **`dialog-status.tsx`** — `import { fileURLToPath } from "bun"` → `"node:url"`
9. **`autocomplete.tsx`** — `import { pathToFileURL } from "bun"` → `"node:url"`
10. **`ide/index.ts`** — `import { spawn } from "bun"` → `import { spawn as nodeSpawn } from "node:child_process"` with adapted API
11. **`message-v2.ts`** — `import type { SystemError } from "bun"` → `import type { ErrnoException } from "node:os"`

### Build Script
- **`build-node-cli.ts`** — NEW: Full CLI build targeting Node.js with `conditions: ["node"]` and externals for TUI deps (`@opentui/core`, `@opentui/solid`, `solid-js`, `fuzzysort`)

## What's NOT Done (Blockers)

### 1. 🔴 CLI Build Fails — TUI/Solid JSX Runtime
`build-node-cli.ts` builds `src/index.ts` (full CLI) but fails because:
- `@opentui/core`, `@opentui/solid`, `solid-js` are marked external but need to be bundled or installed
- Solid JSX runtime (`jsxDEV`) is missing when running
- The TUI layer needs either: (a) bundling opentui with the build, or (b) shipping node_modules alongside

### 2. 🟡 Server Mode — Migration Bug (CURRENT)
Server starts but first request fails with `table 'project' already exists`. The `db-migrate.node.ts` was just updated to check by `name` instead of `hash`, but hasn't been rebuild/tested yet. The previous test used a database created by bun's migrator (which stores empty `hash` values and uses `name` for tracking). The new code should match this pattern but needs verification.

### 3. 🟡 Remaining `bun:` Imports in TUI (4 files)
From the node-pty branch's original code, these still have direct `bun` imports:
- `autocomplete.tsx` — `import { pathToFileURL } from "bun"` ← already fixed above
- `dialog-status.tsx` — `import { fileURLToPath } from "bun"` ← already fixed above
- `ide/index.ts` — `import { spawn } from "bun"` ← already fixed above
- `message-v2.ts` — `import type { SystemError } from "bun"` ← already fixed above

BUT: The node-pty branch has different versions of these files. Our fixes are on top of node-pty. Need to verify no other `bun` imports remain in TUI components.

### 4. 🟡 `win32.ts` — `bun:ffi`
Only affects Windows, can be skipped for Linux/Termux. The `#pty` conditional import already handles this.

### 5. 🟡 Other Bun API Usage
- `Bun.file()`, `Bun.stdin`, `Bun.stderr.escapeHTML` — used in CLI/prompt components
- These don't block server mode but block full CLI mode

## Key Architecture Decisions

1. **Conditional imports via `#db`, `#db/migrate`, `#pty`** — Cleanest way to support both runtimes
2. **`conditions: ["node"]` in Bun.build** — Makes the bundler resolve conditional imports to node branches
3. **Manual migrator for node-sqlite** — drizzle-orm/node-sqlite only supports folder-based migration, not journal arrays. We implement our own that matches bun-sqlite's `__drizzle_migrations` schema.
4. **Server-first approach** — Getting the HTTP API working first is more useful for Termux (can use curl/any client). Full TUI can come later.

## Database Migration Schema (existing)

```sql
CREATE TABLE __drizzle_migrations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  hash TEXT NOT NULL,           -- empty string "" in bun-sqlite's records
  created_at INTEGER,
  name TEXT,                    -- e.g. "20260127222353_familiar_lady_ursula"
  applied_at TEXT               -- ISO timestamp
);
```

The bun-sqlite migrator stores `hash=""` and uses `name` as the de facto identifier. Our node migrator must match this.

## How to Test

```bash
cd C:\code\opencode\packages\opencode

# Build server
bun run script/build-node.ts

# Run (ensure port 1338 is free)
node dist/node.js

# Test
curl http://127.0.0.1:1338/session
```

## Termux Deployment Plan

1. **proot-distro Ubuntu** — Run the existing glibc binary (opencode-linux-arm64 124.5MB) inside an Ubuntu container
2. **Native Node.js** — Once CLI build works, use `pkg install nodejs` on Termux and run the Node.js bundle directly (no seccomp issues)
3. **Future** — Wait for Bun's native Android support (PR #30735 merged, but seccomp issue #30766 still open)

## Files Changed (git status)

```
M  bun.lock
M  package.json
M  packages/opencode/package.json
M  packages/opencode/script/build-node.ts
M  packages/opencode/src/cli/cmd/tui/component/dialog-status.tsx
M  packages/opencode/src/cli/cmd/tui/component/prompt/autocomplete.tsx
M  packages/opencode/src/ide/index.ts
M  packages/opencode/src/session/message-v2.ts
M  packages/opencode/src/storage/db.ts
M  packages/opencode/src/storage/json-migration.ts
?? packages/opencode/script/build-node-cli.ts
?? packages/opencode/src/storage/db-migrate.bun.ts
?? packages/opencode/src/storage/db-migrate.node.ts
?? packages/opencode/src/storage/json-migration.node.ts
```
