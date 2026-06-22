#!/usr/bin/env -S node --import tsx

import { rm } from "fs/promises"
import fs from "node:fs/promises"
import path from "path"
import { parseArgs } from "util"
import { spawn } from "node:child_process"

const root = path.resolve(import.meta.dirname, "..")
const file = path.join(root, "UPCOMING_CHANGELOG.md")
const { values, positionals } = parseArgs({
  args: process.argv.slice(2),
  options: {
    from: { type: "string", short: "f" },
    to: { type: "string", short: "t" },
    variant: { type: "string", default: "low" },
    quiet: { type: "boolean", default: false },
    print: { type: "boolean", default: false },
    help: { type: "boolean", short: "h", default: false },
  },
  allowPositionals: true,
})
const args = [...positionals]

if (values.from) args.push("--from", values.from)
if (values.to) args.push("--to", values.to)

if (values.help) {
  console.log(`
Usage: npx tsx script/changelog.ts [options]

Generates UPCOMING_CHANGELOG.md by running the opencode changelog command.

Options:
  -f, --from <version>   Starting version (default: latest non-draft GitHub release)
  -t, --to <ref>         Ending ref (default: HEAD)
      --variant <name>   Thinking variant for opencode run (default: low)
      --quiet            Suppress opencode command output unless it fails
      --print            Print the generated UPCOMING_CHANGELOG.md after success
  -h, --help             Show this help message

Examples:
  npx tsx script/changelog.ts
  npx tsx script/changelog.ts --from 1.0.200
  npx tsx script/changelog.ts -f 1.0.200 -t 1.0.205
`)
  process.exit(0)
}

await rm(file, { force: true })

const quiet = values.quiet
const cmd = ["opencode", "run"]
cmd.push("--variant", values.variant)
cmd.push("--command", "changelog", "--", ...args)

const proc = spawn(cmd[0], cmd.slice(1), {
  cwd: root,
  stdio: quiet ? "pipe" : "inherit",
})

let out = ""
let err = ""
if (quiet) {
  proc.stdout?.on("data", (data: Buffer) => { out += data.toString() })
  proc.stderr?.on("data", (data: Buffer) => { err += data.toString() })
}

const code = await new Promise<number>((resolve) => {
  proc.on("close", resolve)
})
if (code === 0) {
  if (values.print) process.stdout.write(await fs.readFile(file, "utf-8"))
  process.exit(0)
}

if (quiet) {
  if (out) process.stdout.write(out)
  if (err) process.stderr.write(err)
}

process.exit(code)
