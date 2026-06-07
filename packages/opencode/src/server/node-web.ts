import { Log } from "../util/log"
import { Installation } from "../installation"
import { Flag } from "../flag/flag"
import { networkInterfaces } from "os"

function getNetworkIPs() {
  const nets = networkInterfaces()
  const results: string[] = []
  for (const name of Object.keys(nets)) {
    const net = nets[name]
    if (!net) continue
    for (const netInfo of net) {
      if (netInfo.internal || netInfo.family !== "IPv4") continue
      // Skip Docker/Colima bridge networks (172.17-31.x.x are Docker default subnets)
      if (netInfo.address.startsWith("172.17.") || netInfo.address.startsWith("172.18.") ||
          netInfo.address.startsWith("172.19.") || netInfo.address.startsWith("172.20.") ||
          netInfo.address.startsWith("172.21.") || netInfo.address.startsWith("172.22.") ||
          netInfo.address.startsWith("172.23.") || netInfo.address.startsWith("172.24.") ||
          netInfo.address.startsWith("172.25.") || netInfo.address.startsWith("172.26.") ||
          netInfo.address.startsWith("172.27.") || netInfo.address.startsWith("172.28.") ||
          netInfo.address.startsWith("172.29.") || netInfo.address.startsWith("172.30.") ||
          netInfo.address.startsWith("172.31.")) continue
      results.push(netInfo.address)
    }
  }
  return results
}

process.on("unhandledRejection", (e) => {
  Log.Default.error("rejection", {
    e: e instanceof Error ? e.message : e,
  })
})

process.on("uncaughtException", (e) => {
  Log.Default.error("exception", {
    e: e instanceof Error ? e.message : e,
  })
})

let shutdownHandler: (() => Promise<void>) | undefined
const onShutdown = (fn: () => Promise<void>) => { shutdownHandler = fn }
for (const sig of ["SIGHUP", "SIGINT", "SIGTERM"]) {
  process.on(sig, async () => {
    console.log(`\n${sig} received, shutting down...`)
    if (shutdownHandler) await shutdownHandler()
    process.exit(0)
  })
}

await Log.init({
  print: process.argv.includes("--print-logs"),
  dev: Installation.isLocal(),
  level: (() => {
    const idx = process.argv.indexOf("--log-level")
    if (idx !== -1 && process.argv[idx + 1]) return process.argv[idx + 1] as Log.Level
    if (Installation.isLocal()) return "DEBUG"
    return "INFO"
  })(),
})

process.env.AGENT = "1"
process.env.OPENCODE = "1"
process.env.OPENCODE_PID = String(process.pid)

const { Server } = await import("./server")

const { default: yargs } = await import("yargs")
const argv = await yargs()
  .option("port", {
    type: "number",
    describe: "port to listen on",
    default: 0,
  })
  .option("hostname", {
    type: "string",
    describe: "hostname to listen on",
    default: "127.0.0.1",
  })
  .option("mdns", {
    type: "boolean",
    describe: "enable mDNS discovery",
    default: false,
  })
  .option("mdns-domain", {
    type: "string",
    describe: "mDNS domain name",
    default: "opencode.local",
  })
  .option("cors", {
    type: "string",
    describe: "allowed CORS origin (can be repeated)",
    array: true,
    default: [],
  })
  .option("password", {
    type: "string",
    describe: "server password (also set OPENCODE_SERVER_PASSWORD env)",
  })
  .help()
  .parse()

if (argv.password) {
  process.env.OPENCODE_SERVER_PASSWORD = argv.password
}

if (!Flag.OPENCODE_SERVER_PASSWORD) {
  console.log("! OPENCODE_SERVER_PASSWORD is not set; server is unsecured.")
}

const mdns = argv.mdns || false
const hostname = mdns && argv.hostname === "127.0.0.1" ? "0.0.0.0" : argv.hostname

try {
  const server = await Server.listen({
    port: argv.port,
    hostname,
    mdns,
    mdnsDomain: argv.mdnsDomain,
    cors: argv.cors,
  })

  process.env.OPENCODE_PORT = String(server.port)

  console.log("")
  console.log(`  opencode v${Installation.VERSION}`)
  console.log("")

  if (hostname === "0.0.0.0") {
    const localhostUrl = `http://localhost:${server.port}`
    console.log(`  Local access:   ${localhostUrl}`)
    const networkIPs = getNetworkIPs()
    if (networkIPs.length > 0) {
      for (const ip of networkIPs) {
        console.log(`  Network access:  http://${ip}:${server.port}`)
      }
    }
    if (mdns) {
      console.log(`  mDNS:            ${argv.mdnsDomain}:${server.port}`)
    }
    const { default: open } = await import("open")
    open(localhostUrl).catch(() => {})
  } else {
    const displayUrl = server.url.toString()
    console.log(`  Web interface:  ${displayUrl}`)
    const { default: open } = await import("open")
    open(displayUrl).catch(() => {})
  }

  console.log("")

  onShutdown(async () => { await server.stop() })

  await new Promise<void>((resolve) => {
    process.once("SIGINT", () => resolve())
    process.once("SIGTERM", () => resolve())
  })
  await server.stop()
} catch (err) {
  console.error("Failed to start:", err instanceof Error ? err.message : err)
  if (err instanceof Error && err.stack) console.error(err.stack)
  process.exit(1)
}
