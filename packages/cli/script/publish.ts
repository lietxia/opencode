#!/usr/bin/env -S node --import tsx
import { $ } from "zx"
import fs from "node:fs/promises"
import path from "node:path"
import pkg from "../package.json"
import { Script } from "@opencode-ai/script"
import { fileURLToPath } from "url"
import { glob } from "glob"

const dir = fileURLToPath(new URL("..", import.meta.url))
process.chdir(dir)

async function published(name: string, version: string) {
  return (await $`npm view ${name}@${version} version`.nothrow()).exitCode === 0
}

async function publish(dir: string, name: string, version: string) {
  if (process.platform !== "win32") await $`chmod -R 755 .`.cwd(dir)
  if (await published(name, version)) return console.log(`already published ${name}@${version}`)
  await $`npm pack`.cwd(dir)
  await $`npm publish *.tgz --access public --tag ${Script.channel}`.cwd(dir)
}

const binaries: Record<string, string> = {}
for (const filepath of await glob("*/package.json", { cwd: "./dist" })) {
  const content = await fs.readFile(`./dist/${filepath}`, "utf-8")
  const item = JSON.parse(content)
  binaries[item.name] = item.version
}
console.log("binaries", binaries)
const version = Object.values(binaries)[0]

await $`mkdir -p ./dist/${pkg.name}/bin`
await $`cp ./bin/lildax.cjs ./dist/${pkg.name}/bin/lildax`
await fs.mkdir(path.dirname(`./dist/${pkg.name}/package.json`), { recursive: true })
await fs.writeFile(
  `./dist/${pkg.name}/package.json`,
  JSON.stringify(
    {
      name: pkg.name,
      bin: { lildax: "./bin/lildax" },
      version,
      license: pkg.license,
      repository: { type: "git", url: "git+https://github.com/anomalyco/opencode.git" },
      os: ["darwin", "linux", "win32"],
      cpu: ["arm64", "x64"],
      optionalDependencies: binaries,
    },
    null,
    2,
  ),
)

await Promise.all(
  Object.entries(binaries).map(([name, version]) =>
    publish(`./dist/${name.replace("@opencode-ai/", "")}`, name, version),
  ),
)
await publish(`./dist/${pkg.name}`, pkg.name, version)
