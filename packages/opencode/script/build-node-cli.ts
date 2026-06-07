#!/usr/bin/env bun

import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const dir = path.resolve(__dirname, "..")

process.chdir(dir)

// Load migrations from migration directories
const migrationDirs = (
  await fs.promises.readdir(path.join(dir, "migration"), {
    withFileTypes: true,
  })
)
  .filter((entry) => entry.isDirectory() && /^\d{4}\d{2}\d{2}\d{2}\d{2}\d{2}/.test(entry.name))
  .map((entry) => entry.name)
  .sort()

const migrations = await Promise.all(
  migrationDirs.map(async (name) => {
    const file = path.join(dir, "migration", name, "migration.sql")
    const sql = await Bun.file(file).text()
    const match = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})/.exec(name)
    const timestamp = match
      ? Date.UTC(
          Number(match[1]),
          Number(match[2]) - 1,
          Number(match[3]),
          Number(match[4]),
          Number(match[5]),
          Number(match[6]),
        )
      : 0
    return { sql, timestamp, name }
  }),
)
console.log(`Loaded ${migrations.length} migrations`)

// Import the Solid JSX transform plugin
const solidPlugin = (await import("@opentui/solid/bun-plugin")).default

// Build CLI (full index.ts entry) for Node.js
const result = await Bun.build({
  target: "node",
  entrypoints: ["./src/index.ts"],
  outdir: "./dist",
  format: "esm",
  splitting: true,
  naming: "[dir]/opencode-cli.[ext]",
  conditions: ["node"],
  plugins: [solidPlugin],
  external: [
    "jsonc-parser",
    "node-pty",
    "fuzzysort",
    "drizzle-orm/bun-sqlite",
    "drizzle-orm/bun-sqlite/migrator",
    "bun:sqlite",
    "bun:ffi",
  ],
  define: {
    OPENCODE_MIGRATIONS: JSON.stringify(migrations),
  },
})

if (!result.success) {
  console.error("Build failed:")
  for (const log of result.logs) {
    console.error(log)
  }
  process.exit(1)
}

console.log("CLI Build complete")
console.log(`Output: ${result.outputs.map(o => o.path).join(", ")}`)
