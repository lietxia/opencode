#!/usr/bin/env node

/**
 * Build opencode web/serve mode for Node.js — no Bun dependency.
 *
 * Usage:  node script/build-node-web.mjs
 * Output: dist/node-web.js
 *
 * Then:   node dist/node-web.js
 *         node dist/node-web.js --port 8080 --hostname 0.0.0.0
 */

import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"
import { build } from "esbuild"

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
    const sql = await fs.promises.readFile(file, "utf-8")
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

const externals = [
  "node-pty",
  "bun-pty",
  "drizzle-orm/bun-sqlite",
  "drizzle-orm/bun-sqlite/migrator",
  "bun:sqlite",
  "bun:ffi",
  "jsonc-parser",
  "web-tree-sitter",
  "tree-sitter-bash",
  "open",
]

await build({
  entryPoints: ["./src/node-web.ts"],
  bundle: true,
  outdir: "./dist/node-web",
  platform: "node",
  format: "esm",
  splitting: true,
  target: "node22",
  conditions: ["node"],
  alias: {
    "@parcel/watcher/wrapper": "./script/alias-parcel-watcher.mjs",
  },
  external: externals,
  define: {
    OPENCODE_MIGRATIONS: JSON.stringify(migrations),
    OPENCODE_VERSION: '"local"',
    OPENCODE_CHANNEL: '"local"',
  },
  banner: {
    js: `
import{fileURLToPath as __fURL}from"url";import{dirname as __dirN}from"path";const __filename=fileURLToPath(import.meta.url);const __dirname=__dirN(__filename);if(typeof import.meta.dirname==="undefined"){Object.defineProperty(import.meta,"dirname",{get(){return __dirname}});Object.defineProperty(import.meta,"filename",{get(){return __filename}})}
import{createRequire as __createRequire}from"module";const require=__createRequire(import.meta.url);
`.trimStart(),
  },
  logLevel: "info",
})

console.log("Build complete → dist/node-web")

// Post-build: fix esbuild's broken __dirname polyfill in all chunks
// esbuild generates: import{fileURLToPath as __fURL}from"url"; ... const __filename=fileURLToPath(...)
// Bug: uses fileURLToPath instead of __fURL alias. Fix: replace with __fURL
// Also: bundled modules like yargs declare var __dirname which conflicts with the polyfill's const __dirname
const chunkDir = path.resolve(dir, "dist/node-web")
const chunkFiles = fs.readdirSync(chunkDir).filter(f => f.endsWith(".js"))

for (const file of chunkFiles) {
  const filePath = path.join(chunkDir, file)
  let content = fs.readFileSync(filePath, "utf-8")
  let changed = false

  // Fix the polyfill bug: fileURLToPath( → __fURL( in the polyfill line
  if (content.includes('import{fileURLToPath as __fURL}from"url"')) {
    const fixed = content.replace(
      /const __filename=fileURLToPath\(import\.meta\.url\)/,
      "const __filename=__fURL(import.meta.url)"
    )
    if (fixed !== content) { content = fixed; changed = true }
  }

  // If the chunk has both the polyfill (const __dirname) and bundled var __dirname,
  // rename the bundled one to avoid conflict
  if (content.includes('const __dirname=__dirN(__filename)') && content.includes('var __dirname =')) {
    // Only rename 'var __dirname =' that's NOT on the polyfill line (line 1)
    const lines = content.split('\n')
    for (let i = 1; i < lines.length; i++) {
      if (lines[i].includes('var __dirname =')) {
        lines[i] = lines[i].replace('var __dirname =', 'var __bundled__dirname =')
        // Also fix any references to this renamed variable in the next few lines
        for (let j = i + 1; j < Math.min(i + 10, lines.length); j++) {
          if (lines[j].includes('__dirname') && !lines[j].includes('__bundled__dirname') && !lines[j].includes('const __dirname')) {
            lines[j] = lines[j].replace(/\b__dirname\b/g, '__bundled__dirname')
          }
        }
        changed = true
        break  // Only fix the first one
      }
    }
    content = lines.join('\n')
  }

  if (changed) {
    fs.writeFileSync(filePath, content)
  }
}

console.log("Fixed __dirname polyfill and conflicts in all chunks")
