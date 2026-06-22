#!/usr/bin/env -S node --import tsx
import { $ } from "zx"

import { resolveChannel } from "./utils"

const channel = resolveChannel()
await $`npx tsx ./scripts/copy-icons.ts ${channel}`
await $`npx tsx ./scripts/copy-metainfo.ts ${channel}`

await $`cd ../opencode && npx tsx script/build-node.ts`
