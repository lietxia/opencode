#!/usr/bin/env -S node --import tsx

import { $ } from "zx"
import path from "path"
import { Subscription } from "../src/subscription"

const stage = process.argv[2]
if (!stage) throw new Error("Stage is required")

const root = path.resolve(process.cwd(), "..", "..", "..")

// read the secret
const ret = await $`npx tsx -e "import('@opencode-ai/script').then(m => m.sst?.secretList?.({fallback:true}))" 2>/dev/null || bun sst secret list --fallback`.cwd(root).text()
const lines = ret.split("\n")
const value = lines.find((line) => line.startsWith("ZEN_LIMITS"))?.split("=")[1]
if (!value) throw new Error("ZEN_LIMITS not found")

// validate value
Subscription.validate(JSON.parse(value))

// update the secret
await $`npx tsx -e "import('@opencode-ai/script').then(m => m.sst?.secretSet?.({key:'ZEN_LIMITS',value:'${value}',stage:'${stage}'}))" 2>/dev/null || bun sst secret set ZEN_LIMITS ${value} --stage ${stage}`
