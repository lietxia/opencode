#!/usr/bin/env -S node --import tsx

import { $ } from "zx"

await $`npx tsx ./packages/sdk/js/script/build.ts`

await $`npx tsx -e "import {dev} from './packages/opencode/src/cli/cmd/dev'; dev({generate: true})" 2>/dev/null || bun dev generate > ../sdk/openapi.json`.cwd("packages/opencode")

await $`npx tsx ./script/format.ts`
