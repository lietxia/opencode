#!/usr/bin/env -S node --import tsx

import { $ } from "zx"

await $`npx prettier --ignore-unknown --write .`
