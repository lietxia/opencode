#!/usr/bin/env -S node --import tsx

import path from "path"
const toDynamicallyImport = path.join(process.cwd(), process.argv[2])
await import(toDynamicallyImport)
console.log(performance.now())
