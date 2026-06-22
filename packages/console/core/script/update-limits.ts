#!/usr/bin/env -S node --import tsx

import { $ } from "zx"
import fs from "node:fs/promises"
import path from "path"
import os from "os"
import { Subscription } from "../src/subscription"

const root = path.resolve(process.cwd(), "..", "..", "..")
const secrets = await $`npx tsx -e "import('@opencode-ai/script').then(m => m.sst?.secretList?.({fallback:true}))" 2>/dev/null || bun sst secret list --fallback`.cwd(root).text()

// read value
const lines = secrets.split("\n")
const oldValue = lines.find((line) => line.startsWith("ZEN_LIMITS"))?.split("=")[1] ?? "{}"
if (!oldValue) throw new Error("ZEN_LIMITS not found")

// store the prettified json to a temp file
const filename = `limits-${Date.now()}.json`
const tempFilePath = path.join(os.tmpdir(), filename)
await fs.writeFile(tempFilePath, JSON.stringify(JSON.parse(oldValue), null, 2))
console.log("tempFile", tempFilePath)

// open temp file in vim and read the file on close
await $`vim ${tempFilePath}`
const newValue = JSON.stringify(JSON.parse(await fs.readFile(tempFilePath, "utf-8")))
Subscription.validate(JSON.parse(newValue))

// update the secret
const envFilePath = path.join(os.tmpdir(), `limits-${Date.now()}.env`)
await fs.writeFile(envFilePath, `ZEN_LIMITS="${newValue.replace(/"/g, '\\"')}"`)
await $`npx tsx -e "import('@opencode-ai/script').then(m => m.sst?.secretLoad?.({fallback:true}))" 2>/dev/null || bun sst secret load ${envFilePath} --fallback`.cwd(root)
