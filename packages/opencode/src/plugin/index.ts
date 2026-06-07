import type { Hooks, PluginInput, Plugin as PluginInstance } from "@opencode-ai/plugin"
import { Config } from "../config/config"
import { Bus } from "../bus"
import { Log } from "../util/log"
import { createOpencodeClient } from "@opencode-ai/sdk"
import { Npm } from "../npm"
import { Instance } from "../project/instance"
import { Flag } from "../flag/flag"
import { CodexAuthPlugin } from "./codex"
import { Session } from "../session"
import { NamedError } from "@opencode-ai/util/error"
import { CopilotAuthPlugin } from "./copilot"
import { gitlabAuthPlugin as GitlabAuthPlugin } from "@gitlab/opencode-gitlab-auth"
import { readFileSync, existsSync } from "fs"
import { join } from "path"

export namespace Plugin {
  const log = Log.create({ service: "plugin" })

  const BUILTIN = ["opencode-anthropic-auth@0.0.13"]

  /**
   * Resolve a plugin path to an actual file path for Node.js ESM compatibility.
   * Node.js ESM doesn't support directory imports; we must resolve package.json main/exports.
   */
  function resolvePluginPath(pluginPath: string): string {
    // Already a file URL or file path with extension
    if (pluginPath.startsWith("file://") || pluginPath.endsWith(".js") || pluginPath.endsWith(".mjs")) {
      return pluginPath
    }

    // Try to resolve from package.json
    const pkgJsonPath = join(pluginPath, "package.json")
    if (existsSync(pkgJsonPath)) {
      try {
        const pkg = JSON.parse(readFileSync(pkgJsonPath, "utf-8"))
        // Check exports first (modern packages)
        if (pkg.exports) {
          const exp = pkg.exports
          if (typeof exp === "string") return join(pluginPath, exp)
          if (typeof exp === "object" && exp["."]) {
            const dot = exp["."]
            if (typeof dot === "string") return join(pluginPath, dot)
            if (typeof dot === "object") {
              // Prefer import > default > require
              const target = dot.import || dot.default || dot.require
              if (typeof target === "string") return join(pluginPath, target)
            }
          }
        }
        // Fall back to main/module
        const entry = pkg.module || pkg.main
        if (entry) return join(pluginPath, entry)
      } catch {
        // Fall through
      }
    }

    // Try common entry files
    for (const file of ["index.mjs", "index.js", "dist/index.js", "dist/index.mjs"]) {
      if (existsSync(join(pluginPath, file))) {
        return join(pluginPath, file)
      }
    }

    return pluginPath
  }

  // Built-in plugins that are directly imported (not installed from npm)
  const INTERNAL_PLUGINS: PluginInstance[] = [CodexAuthPlugin, CopilotAuthPlugin, GitlabAuthPlugin]

  const state = Instance.state(async () => {
    const baseUrl = `http://127.0.0.1:${process.env.OPENCODE_PORT ?? 4096}`
    const client = createOpencodeClient({
      baseUrl,
      directory: Instance.directory,
    })
    log.info("loading config")
    const config = await Config.get()
    log.info("config loaded")
    const hooks: Hooks[] = []
    const input: PluginInput = {
      client,
      project: Instance.project,
      worktree: Instance.worktree,
      directory: Instance.directory,
      get serverUrl(): URL {
        throw new Error("Server URL is no longer supported in plugins")
      },
      // @ts-expect-error
      $: typeof Bun === "undefined" ? undefined : Bun.$,
    }

    for (const plugin of INTERNAL_PLUGINS) {
      log.info("loading internal plugin", { name: plugin.name })
      const init = await plugin(input).catch((err) => {
        log.error("failed to load internal plugin", { name: plugin.name, error: err })
      })
      if (init) hooks.push(init)
    }

    let plugins = config.plugin ?? []
    if (plugins.length) await Config.waitForDependencies()
    if (!Flag.OPENCODE_DISABLE_DEFAULT_PLUGINS) {
      plugins = [...BUILTIN, ...plugins]
    }

    for (let plugin of plugins) {
      // ignore old codex plugin since it is supported first party now
      if (plugin.includes("opencode-openai-codex-auth") || plugin.includes("opencode-copilot-auth")) continue
      log.info("loading plugin", { path: plugin })
      if (!plugin.startsWith("file://")) {
        plugin = await Npm.add(plugin).catch((err) => {
          const cause = err instanceof Error ? err.cause : err
          const detail = cause instanceof Error ? cause.message : String(cause ?? err)
          log.error("failed to install plugin", { plugin, error: detail })
          Bus.publish(Session.Event.Error, {
            error: new NamedError.Unknown({
              message: `Failed to install plugin ${plugin}: ${detail}`,
            }).toObject(),
          })
          return ""
        })
        if (!plugin) continue
      }
      // Prevent duplicate initialization when plugins export the same function
      // as both a named export and default export (e.g., `export const X` and `export default X`).
      // Object.entries(mod) would return both entries pointing to the same function reference.
      const resolvedPath = resolvePluginPath(plugin)
      await import(resolvedPath)
        .then(async (mod) => {
          const seen = new Set<PluginInstance>()
          for (const [_name, fn] of Object.entries<PluginInstance>(mod)) {
            if (seen.has(fn)) continue
            seen.add(fn)
            hooks.push(await fn(input))
          }
        })
        .catch((err) => {
          const message = err instanceof Error ? err.message : String(err)
          log.error("failed to load plugin", { path: plugin, error: message })
          Bus.publish(Session.Event.Error, {
            error: new NamedError.Unknown({
              message: `Failed to load plugin ${plugin}: ${message}`,
            }).toObject(),
          })
        })
    }

    return {
      hooks,
      input,
    }
  })

  export async function trigger<
    Name extends Exclude<keyof Required<Hooks>, "auth" | "event" | "tool">,
    Input = Parameters<Required<Hooks>[Name]>[0],
    Output = Parameters<Required<Hooks>[Name]>[1],
  >(name: Name, input: Input, output: Output): Promise<Output> {
    if (!name) return output
    for (const hook of await state().then((x) => x.hooks)) {
      const fn = hook[name]
      if (!fn) continue
      // @ts-expect-error if you feel adventurous, please fix the typing, make sure to bump the try-counter if you
      // give up.
      // try-counter: 2
      await fn(input, output)
    }
    return output
  }

  export async function list() {
    return state().then((x) => x.hooks)
  }

  export async function init() {
    const hooks = await state().then((x) => x.hooks)
    const config = await Config.get()
    for (const hook of hooks) {
      // @ts-expect-error this is because we haven't moved plugin to sdk v2
      await hook.config?.(config)
    }
    Bus.subscribeAll(async (input) => {
      const hooks = await state().then((x) => x.hooks)
      for (const hook of hooks) {
        hook["event"]?.({
          event: input,
        })
      }
    })
  }
}
