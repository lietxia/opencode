#!/usr/bin/env -S node --import tsx
import { Script } from "@opencode-ai/script"
import fs from "node:fs/promises"

await import("./prebuild")

const content = await fs.readFile("./package.json", "utf-8")
const pkg = JSON.parse(content)
pkg.version = Script.version
await fs.writeFile("./package.json", JSON.stringify(pkg, null, 2) + "\n")
console.log(`Updated package.json version to ${Script.version}`)
