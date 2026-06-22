#!/usr/bin/env -S node --import tsx

import { Script } from "@opencode-ai/script"
import path from "path"
import { fileURLToPath } from "url"
import fs from "node:fs/promises"
import esbuild from "esbuild"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const dir = path.resolve(__dirname, "..")

process.chdir(dir)

const generated = await import("./generate.ts")

await esbuild.build({
  target: "node",
  entryPoints: ["./src/node.ts"],
  outdir: "./dist/node",
  format: "esm",
  sourcemap: "linked",
  bundle: true,
  external: ["jsonc-parser", "@lydell/node-pty"],
  define: {
    OPENCODE_MODELS_DEV: generated.modelsData,
    OPENCODE_CHANNEL: `'${Script.channel}'`,
  },
  stdin: {
    contents: "",
    resolveDir: dir,
    sourcefile: "opencode-web-ui.gen.ts",
  },
})

console.log("Build complete")
