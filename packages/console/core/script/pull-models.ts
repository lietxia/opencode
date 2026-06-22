#!/usr/bin/env -S node --import tsx

import { $ } from "zx"
import fs from "node:fs/promises"
import path from "path"
import os from "os"
import { ZenData } from "../src/model"

const stage = process.argv[2]
if (!stage) throw new Error("Stage is required")

const root = path.resolve(process.cwd(), "..", "..", "..")
const PARTS = 20

// read the secret
const ret = await $`npx tsx -e "import('@opencode-ai/script').then(m => m.sst?.secretList?.({stage:'${stage}'}))" 2>/dev/null || bun sst secret list --stage ${stage}`.cwd(root).text()
const lines = ret.split("\n")
const values = Array.from({ length: PARTS }, (_, i) => {
  const value = lines
    .find((line) => line.startsWith(`ZEN_MODELS${i + 1}=`))
    ?.split("=")
    .slice(1)
    .join("=")
  if (!value) throw new Error(`ZEN_MODELS${i + 1} not found`)
  return value
})

// validate value
ZenData.validate(JSON.parse(values.join("")))

// update the secret
const envFilePath = path.join(os.tmpdir(), `models-${Date.now()}.env`)
await fs.writeFile(envFilePath, values.map((v, i) => `ZEN_MODELS${i + 1}="${v.replace(/"/g, '\\"')}"`).join("\n"))
await $`npx tsx -e "import('@opencode-ai/script').then(m => m.sst?.secretLoad?.({}))" 2>/dev/null || bun sst secret load ${envFilePath}`.cwd(root)
