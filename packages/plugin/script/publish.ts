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

await $`npx tsc`
const originalText = await fs.readFile("package.json", "utf-8")
const pkg = JSON.parse(originalText) as {
  name: string
  version: string
  exports: Record<string, string>
}
if (await published(pkg.name, pkg.version)) {
  console.log(`already published ${pkg.name}@${pkg.version}`)
} else {
  for (const [key, value] of Object.entries(pkg.exports)) {
    const file = value.replace("./src/", "./dist/").replace(".ts", "")
    pkg.exports[key] = {
      import: file + ".js",
      types: file + ".d.ts",
    }
  }
  await fs.writeFile("package.json", JSON.stringify(pkg, null, 2))
  try {
    await $`npm pack`
    await $`npm publish *.tgz --tag ${Script.channel} --access public`
  } finally {
    await fs.writeFile("package.json", originalText)
  }
}
