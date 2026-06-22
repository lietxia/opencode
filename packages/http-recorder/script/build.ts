#!/usr/bin/env -S node --import tsx
import { $ } from "zx"
import { readdir, rm } from "node:fs/promises"
import esbuild from "esbuild"

await rm("dist", { recursive: true, force: true })
await $`npx tsc --emitDeclarationOnly`

const build = await esbuild.build({
  entryPoints: ["src/index.ts"],
  outdir: "dist",
  target: "node",
  format: "esm",
  packages: "external",
  bundle: true,
})
if (!build.errors.length && !build.warnings.length) {
  // success
} else if (build.errors.length > 0) {
  throw new AggregateError(build.errors, "Failed to build @opencode-ai/http-recorder")
}

const publicFiles = new Set(["index.js", "index.d.ts", "effect.d.ts", "socket.d.ts", "types.d.ts"])
await Promise.all(
  (await readdir("dist")).filter((file) => !publicFiles.has(file)).map((file) => rm(`dist/${file}`, { force: true })),
)
