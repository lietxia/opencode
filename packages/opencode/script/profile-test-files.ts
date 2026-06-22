// Per-file profiler for finding candidate test-speed work; see ../../perf/test-suite.md
// for the benchmark notes, kept wins, and discarded experiments.
// Example: TEST_PROFILE_GLOB='test/server/**/*.test.ts' TEST_PROFILE_TOP=15 npm run profile:test
import { glob } from "glob"
import { spawn } from "node:child_process"

const pattern = process.env.TEST_PROFILE_GLOB ?? "test/**/*.test.{ts,tsx}"
const limit = Number(process.env.TEST_PROFILE_LIMIT ?? 0)
const timeout = process.env.TEST_PROFILE_TIMEOUT ?? "30000"
const files = await glob(pattern, { cwd: import.meta.dirname + "/.." })
  .then((files) => files.toSorted())
  .then((files) => (limit > 0 ? files.slice(0, limit) : files))

const results = []
for (const file of await files) {
  const start = performance.now()
  const proc = spawn("bun", ["test", "--timeout", timeout, file], {
    cwd: import.meta.dirname + "/..",
    stdio: ["pipe", "pipe", "pipe"],
    env: { ...process.env },
  })
  let output = ""
  let error = ""
  proc.stdout.on("data", (data: Buffer) => { output += data.toString() })
  proc.stderr.on("data", (data: Buffer) => { error += data.toString() })
  const exitCode = await new Promise<number>((resolve) => { proc.on("close", resolve) })
  const seconds = (performance.now() - start) / 1000
  results.push({ file, seconds, exitCode })
  console.log(`${exitCode === 0 ? "PASS" : "FAIL"} ${seconds.toFixed(3)}s ${file}`)
  if (exitCode !== 0) console.log((output + error).trim())
}

const sorted = results.toSorted((a, b) => b.seconds - a.seconds)
console.log("\nSlowest test files:")
for (const result of sorted.slice(0, Number(process.env.TEST_PROFILE_TOP ?? 20))) {
  console.log(`${result.seconds.toFixed(3)}s ${result.exitCode === 0 ? "PASS" : "FAIL"} ${result.file}`)
}

if (sorted[0]) {
  console.log(`METRIC slowest_test_file_seconds=${sorted[0].seconds.toFixed(3)}`)
  console.log(`METRIC profiled_test_files=${results.length}`)
}

if (results.some((result) => result.exitCode !== 0)) process.exit(1)
