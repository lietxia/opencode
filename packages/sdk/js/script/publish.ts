#!/usr/bin/env -S node --import tsx

import { Script } from "@opencode-ai/script"
import { $ } from "zx"
import fs from "node:fs/promises"
import { fileURLToPath } from "url"

const dir = fileURLToPath(new URL("..", import.meta.url))
process.chdir(dir)

async function published(name: string, version: string) {
  return (await $`npm view ${name}@${version} version`.nothrow()).exitCode === 0
}

const originalText = await fs.readFile("package.json", "utf-8")
const pkg = JSON.parse(originalText) as {
  name: string
  version: string
  exports: Record<string, unknown>
}
function transformExports(exports: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(exports).map(([key, value]) => {
      if (typeof value === "string") {
        const file = value.replace("./src/", "./dist/").replace(".ts", "")
        return [key, { import: file + ".js", types: file + ".d.ts" }]
      }
      if (typeof value === "object" && value !== null && !Array.isArray(value)) {
        return [key, transformExports(value)]
      }
      return [key, value]
    }),
  )
}
if (await published(pkg.name, pkg.version)) {
  console.log(`already published ${pkg.name}@${pkg.version}`)
} else {
  pkg.exports = transformExports(pkg.exports)
  await fs.writeFile("package.json", JSON.stringify(pkg, null, 2))
  try {
    await $`npm pack`
    await $`npm publish *.tgz --tag ${Script.channel} --access public`
  } finally {
    await fs.writeFile("package.json", originalText)
  }
}
