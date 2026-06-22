#!/usr/bin/env -S node --import tsx

import { Script } from "@opencode-ai/script"
import { $ } from "zx"
import fs from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "url"
import { glob } from "glob"

console.log("=== publishing ===\n")

const dir = fileURLToPath(new URL("..", import.meta.url))
process.chdir(dir)
const tag = `v${Script.version}`

const pkgjsons = await glob("**/package.json", { absolute: true, cwd: dir })
  .then((arr) => arr.filter((x) => !x.includes("node_modules") && !x.includes("dist")))

async function prepareReleaseFiles() {
  for (const file of pkgjsons) {
    let pkg = await fs.readFile(file, "utf-8")
    pkg = pkg.replaceAll(/"version": "[^"]+"/g, `"version": "${Script.version}"`)
    console.log("updated:", file)
    await fs.writeFile(file, pkg)
  }

  await $`npm install`
  await $`npx tsx ./packages/sdk/js/script/build.ts`
}

if (Script.release && !Script.preview) {
  await $`git fetch origin --tags`
  await $`git switch --detach`
}

await prepareReleaseFiles()

console.log("\n=== cli ===\n")
await $`npx tsx ./packages/opencode/script/publish.ts`

console.log("\n=== preview cli ===\n")
await $`npx tsx ./packages/cli/script/publish.ts`

console.log("\n=== sdk ===\n")
await $`npx tsx ./packages/sdk/js/script/publish.ts`

console.log("\n=== plugin ===\n")
await $`npx tsx ./packages/plugin/script/publish.ts`

if (Script.release) {
  await $`npx tsx ./packages/desktop/scripts/finalize-latest-json.ts`
  await $`npx tsx ./packages/desktop/scripts/finalize-latest-yml.ts`
}

if (Script.release && !Script.preview) {
  await $`git commit -am "release: ${tag}"`
  await $`git tag -d ${tag}`.nothrow()
  await $`git tag ${tag}`
  await $`git push origin refs/tags/${tag} --force-with-lease --no-verify`
  await new Promise((resolve) => setTimeout(resolve, 5_000))
  await $`git fetch origin`
  await $`git checkout -B dev origin/dev`
  await prepareReleaseFiles()
  await $`git commit -am "sync release versions for ${tag}"`
  await $`git push origin HEAD:dev --no-verify`
}

if (Script.release) {
  await $`gh release edit ${tag} --draft=false --repo ${process.env.GH_REPO}`
}
