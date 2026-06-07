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

### 2. ✅ Server Mode — Migration Bug FIXED
Migration bug resolved. Server starts clean, 8 migrations applied, API returns `[]`. No `table already exists` errors.

### 3. ✅ Remaining `bun:` Imports in TUI — FIXED
All `bun:` imports in TUI components have been replaced:
- `autocomplete.tsx` — `import { pathToFileURL } from "node:url"` ✅
- `dialog-status.tsx` — `import { fileURLToPath } from "node:url"` ✅
- `ide/index.ts` — `import { spawn } from "node:child_process"` ✅
- `message-v2.ts` — `import type { ErrnoException } from "node:os"` ✅

### 4. ✅ `Bun.stringWidth` — FIXED
Replaced 3 occurrences with cross-runtime `stringWidth` utility (`src/util/string-width.ts`):
- `autocomplete.tsx` (2 occurrences)
- `prompt/index.tsx` (1 occurrence)
Uses `Bun.stringWidth` when available, falls back to Unicode-based calculation for Node.js.

### 5. ✅ `Bun.stdin.text()` — FIXED
Replaced in `cli/cmd/run.ts` with Node.js stdin streaming:
```js
const chunks: Buffer[] = []
for await (const chunk of process.stdin) chunks.push(chunk)
message += "\n" + Buffer.concat(chunks).toString("utf-8")
```

### 6. ✅ `bun:sqlite` in `cli/cmd/db.ts` — FIXED
Replaced `import { Database } from "bun:sqlite"` with `import { init as dbInit } from "#db"`. Now uses drizzle's `$client` which resolves to either `bun:sqlite` Database or `node:sqlite` DatabaseSync depending on runtime.

### 7. ✅ Plugin ESM Directory Import — FIXED
Added `resolvePluginPath()` function in `src/plugin/index.ts` that resolves package.json `main`/`exports` for Node.js ESM compatibility. Node.js ESM doesn't support directory imports; this resolves them to actual file paths.
- `opencode-anthropic-auth` now loads successfully ✅
- `oh-my-openagent` fails because it internally uses `bun:` protocol imports (third-party limitation) ⚠️

### 8. ✅ `win32.ts` — `bun:ffi` — FIXED
Split into conditional imports via `#win32`:
- `win32.bun.ts` — Original bun:ffi implementation
- `win32.node.ts` — No-op stubs (Windows FFI can be added later via koffi)
- All TUI imports (`app.tsx`, `exit.tsx`, `attach.ts`, `thread.ts`) changed from `"./win32"` to `"#win32"`
- `package.json` imports: `#win32` → bun/node/default branches

### 9. ✅ `json-migration.ts` drizzle-orm/bun-sqlite — FIXED
Split into conditional imports:
- `json-migration.bun.ts` — Re-exports `drizzle` from `drizzle-orm/bun-sqlite`
- `json-migration.node.ts` — Re-exports `drizzle` from `drizzle-orm/node-sqlite`
- `json-migration.ts` `getDrizzle()` now uses dynamic `import("./json-migration.bun")` / `import("./json-migration.node")` instead of direct `drizzle-orm/bun-sqlite`

### 10. ✅ Server Build — `bun:` Protocol Free
`dist/node.js` has ZERO `bun:` protocol imports. Only a harmless string literal `bun: 2`.

### 11. 🔴 CLI Build — TUI Still Blocked by `@opentui/core` (bun:ffi dependency)
CLI build (`opencode-cli.js`) succeeds but contains `bun:ffi` imports from `@opentui/core`.
`@opentui/core`'s renderer, buffer, editor all depend on `bun:ffi` (FFI to native code for terminal rendering).
This is a **fundamental blocker** — the TUI framework itself is Bun-only.

**Options:**
- (a) Accept CLI/TUI only works under Bun runtime
- (b) Port `@opentui/core` to use Node.js FFI (koffi/node-ffi-napi) — major effort
- (c) Build a non-TUI CLI mode (headless/REPL) for Node.js

### 12. ✅ Build Scripts — External List Updated
Both `build-node.ts` and `build-node-cli.ts` now externalize:
- `drizzle-orm/bun-sqlite`, `drizzle-orm/bun-sqlite/migrator`, `bun:sqlite`, `bun:ffi`
- `build-node-cli.ts` also includes `@opentui/solid/bun-plugin` for Solid JSX transform

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

## Files Changed (git status — cumulative)

```
M  bun.lock
M  package.json
M  packages/opencode/package.json
M  packages/opencode/script/build-node.ts
M  packages/opencode/script/build-node-cli.ts
M  packages/opencode/src/cli/cmd/tui/component/dialog-status.tsx
M  packages/opencode/src/cli/cmd/tui/component/prompt/autocomplete.tsx
M  packages/opencode/src/cli/cmd/tui/component/prompt/index.tsx
M  packages/opencode/src/cli/cmd/tui/app.tsx
M  packages/opencode/src/cli/cmd/tui/attach.ts
M  packages/opencode/src/cli/cmd/tui/thread.ts
M  packages/opencode/src/cli/cmd/tui/context/exit.tsx
M  packages/opencode/src/cli/cmd/db.ts
M  packages/opencode/src/cli/cmd/run.ts
M  packages/opencode/src/ide/index.ts
M  packages/opencode/src/plugin/index.ts
M  packages/opencode/src/session/message-v2.ts
M  packages/opencode/src/storage/db.ts
M  packages/opencode/src/storage/json-migration.ts
?? packages/opencode/script/build-node-cli.ts
?? packages/opencode/src/storage/db-migrate.bun.ts
?? packages/opencode/src/storage/db-migrate.node.ts
?? packages/opencode/src/storage/json-migration.bun.ts
?? packages/opencode/src/storage/json-migration.node.ts
?? packages/opencode/src/cli/cmd/tui/win32.bun.ts
?? packages/opencode/src/cli/cmd/tui/win32.node.ts
?? packages/opencode/src/util/string-width.ts
```
