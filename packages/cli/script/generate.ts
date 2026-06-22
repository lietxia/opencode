import fs from "node:fs/promises"

const modelsUrl = process.env.OPENCODE_MODELS_URL || "https://models.dev"

export const modelsData = process.env.MODELS_DEV_API_JSON
  ? await fs.readFile(process.env.MODELS_DEV_API_JSON, "utf-8")
  : await fetch(`${modelsUrl}/api.json`).then((response) => response.text())

console.log("Loaded models.dev snapshot")
