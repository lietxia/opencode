#!/usr/bin/env -S node --import tsx

import { $ } from "zx"
import fs from "node:fs/promises"
import path from "path"
import os from "os"
import { ZenData } from "../src/model"

const root = path.resolve(process.cwd(), "..", "..", "..")
const models = await $`npx tsx -e "import('@opencode-ai/script').then(m => m.sst?.secretList?.({stage:'frank'}))" 2>/dev/null || bun sst secret list --stage frank`.cwd(root).text()
const PARTS = 30

// read the line starting with "ZEN_MODELS"
const lines = models.split("\n")
const oldValues = Array.from({ length: PARTS }, (_, i) => {
  const value = lines
    .find((line) => line.startsWith(`ZEN_MODELS${i + 1}=`))
    ?.split("=")
    .slice(1)
    .join("=")
  if (!value) throw new Error(`ZEN_MODELS${i + 1} not found`)
  return value
})

// store the prettified json to a temp file
const filename = `models-${Date.now()}.json`
const tempFilePath = path.join(os.tmpdir(), filename)
await fs.writeFile(tempFilePath, JSON.stringify(JSON.parse(oldValues.join("")), null, 2))
console.log("tempFile", tempFilePath)

// open temp file in vim and read the file on close
await $`vim ${tempFilePath}`
const newValue = JSON.stringify(JSON.parse(await fs.readFile(tempFilePath, "utf-8")))
ZenData.validate(JSON.parse(newValue))

// update the secret
const chunk = Math.ceil(newValue.length / PARTS)
const newValues = Array.from({ length: PARTS }, (_, i) =>
  newValue.slice(chunk * i, i === PARTS - 1 ? undefined : chunk * (i + 1)),
)

const envFilePath = path.join(os.tmpdir(), `models-${Date.now()}.env`)
await fs.writeFile(envFilePath, newValues.map((v, i) => `ZEN_MODELS${i + 1}="${v.replace(/"/g, '\\"')}"`).join("\n"))
await $`npx tsx -e "import('@opencode-ai/script').then(m => m.sst?.secretLoad?.({stage:'frank'}))" 2>/dev/null || bun sst secret load ${envFilePath} --stage frank`.cwd(root)
