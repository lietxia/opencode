import { $ } from "zx"

await $`npx tsx ./scripts/copy-icons.ts ${process.env.OPENCODE_CHANNEL ?? "dev"}`

await $`cd ../opencode && npx tsx script/build-node.ts`
