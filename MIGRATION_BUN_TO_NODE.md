# Bun → npm + Node.js 迁移说明

本文档记录 opencode monorepo 从 Bun 运行时迁移到 npm + Node.js 的完整过程、替代方案和注意事项。

---

## 1. 迁移概览

| 维度 | 迁移前 | 迁移后 |
|------|--------|--------|
| 运行时 | Bun 1.3.14 | Node.js 22+ |
| 包管理器 | bun (packageManager: bun@1.3.14) | npm 10.9.2 |
| 锁文件 | bun.lock | package-lock.json |
| 构建工具 | Bun.build() | esbuild |
| TypeScript 执行 | bun 直接运行 | npx tsx |
| 工作区协议 | catalog: / workspace:* | 内联版本 / * |
| tsconfig 基础 | @tsconfig/bun | @tsconfig/node22 |

**变更规模**: 168 个文件, +1,176 / -11,196 行

---

## 2. 包管理器迁移

### 2.1 packageManager 字段

```diff
- "packageManager": "bun@1.3.14"
+ "packageManager": "npm@10.9.2"
```

### 2.2 工作区格式

Bun/pnpm 使用字典格式含 `catalog:`，npm 只支持数组格式：

```diff
  "workspaces": {
-   "packages": ["packages/*", "packages/console/*", ...],
-   "catalog": {
-     "@effect/opentelemetry": "4.0.0-beta.83",
-     "@types/bun": "1.3.13",
-     ...
-   }
- }
+ ["packages/*", "packages/console/*", "packages/stats/*", "packages/sdk/js", "packages/slack"]
```

### 2.3 catalog: → 内联版本

Bun 的 `catalog:` 协议允许在工作区中共享版本号，npm 没有等价功能。全部替换为实际版本号：

```diff
- "@types/node": "catalog:"
+ "@types/node": "24.12.2"

- "effect": "catalog:"
+ "effect": "4.0.0-beta.83"

- "typescript": "catalog:"
+ "typescript": "5.8.2"
```

需从根 package.json 的 catalog 块提取版本对照表，逐个内联到所有子 package.json。

### 2.4 workspace:* → *

npm 将 `*` 解析为本地工作区包：

```diff
- "@opencode-ai/core": "workspace:*"
- "@opencode-ai/sdk": "workspace:*"
+ "@opencode-ai/core": "*"
+ "@opencode-ai/sdk": "*"
```

### 2.5 patchedDependencies

这是 pnpm/Bun 特有的补丁功能，npm 不支持，直接删除：

```diff
- "patchedDependencies": {
-   "@ff-labs/fff-bun@0.9.3": "patches/@ff-labs%2Ffff-bun@0.9.3.patch",
-   ...
- }
```

> **注意**: `patches/` 目录保留用于文档参考，但 npm 不会应用这些补丁。

### 2.6 依赖替换

```diff
  devDependencies:
-   "@tsconfig/bun": "catalog:"
+   "@tsconfig/node22": "22.0.2"

  overrides:
-   "@types/bun": "catalog:"
    （整行删除）

  任何 devDependencies/dependencies:
-   "@types/bun": "1.3.13"
    （整行删除）

-   "@effect/sql-sqlite-bun": "4.0.0-beta.83"
+   "@effect/sql-sqlite-node": "4.0.0-beta.83"
```

### 2.7 .npmrc 配置

```ini
save-exact=true
legacy-peer-deps=true
force=true
```

- `legacy-peer-deps=true` — 忽略 peer dependency 冲突（Bun/pnpm 默认忽略，npm 需要显式声明）
- `force=true` — 强制安装存在冲突的依赖
- `save-exact=true` — 保存精确版本号

---

## 3. 脚本命令迁移

### 3.1 包管理器命令对照

| 功能 | Bun | npm |
|------|-----|-----|
| 安装依赖 | `bun install` | `npm install --legacy-peer-deps --force` |
| 添加依赖 | `bun add <pkg>` | `npm install <pkg> --save-exact` |
| 添加开发依赖 | `bun add -d <pkg>` | `npm install <pkg> --save-dev --save-exact` |
| 运行脚本 | `bun run <script>` | `npm run <script>` |
| 执行包命令 | `bunx <cmd>` | `npx <cmd>` |
| 运行 TS 文件 | `bun ./script.ts` | `npx tsx ./script.ts` |
| 带工作区运行 | `bun run --cwd pkg/dir <script>` | `npm run --prefix pkg/dir <script>` |
| 带工作区安装 | `bun install --cwd pkg/dir` | `npm install --prefix pkg/dir` |
| 全局安装 | `bun i -g <pkg>` | `npm i -g <pkg>` |
| 打包 | `bun pm pack` | `npm pack` |

### 3.2 package.json scripts 迁移示例

```diff
  "scripts": {
-   "dev": "bun run --cwd packages/opencode --conditions=browser src/index.ts",
+   "dev": "npx tsx --cwd packages/opencode --conditions=browser src/index.ts",

-   "dev:desktop": "bun --cwd packages/desktop dev",
+   "dev:desktop": "npm --prefix packages/desktop run dev",

-   "dev:web": "bun --cwd packages/app dev",
+   "dev:web": "npm --prefix packages/app run dev",

-   "typecheck": "bun turbo typecheck",
+   "typecheck": "npx turbo typecheck",

-   "upgrade-opentui": "bun run script/upgrade-opentui.ts",
+   "upgrade-opentui": "npx tsx script/upgrade-opentui.ts",

-   "postinstall": "bun run --cwd packages/core fix-node-pty",
+   "postinstall": "npm run --prefix packages/core fix-node-pty",
  }
```

### 3.3 首次安装注意事项

由于 `npx tsx` 可能在 postinstall 中触发交互式提示，首次安装建议：

```bash
npm install --legacy-peer-deps --force --ignore-scripts
```

后续安装可去掉 `--ignore-scripts`。

---

## 4. Bun.* API → Node.js 替代方案

### 4.1 文件操作

#### Bun.file(path).json()

```diff
- const data = await Bun.file(path).json()
+ import fs from "node:fs/promises"
+ const data = JSON.parse(await fs.readFile(path, "utf-8"))
```

#### Bun.file(path).text()

```diff
- const text = await Bun.file(path).text()
+ import fs from "node:fs/promises"
+ const text = await fs.readFile(path, "utf-8")
```

#### Bun.file(path).exists()

```diff
- const exists = await Bun.file(path).exists()
+ import fs from "node:fs/promises"
+ const exists = await fs.access(path).then(() => true, () => false)
```

#### Bun.file(path).bytes()

```diff
- const buffer = await Bun.file(path).bytes()
+ import fs from "node:fs/promises"
+ const buffer = await fs.readFile(path)  // 返回 Buffer
```

#### Bun.file(path).delete()

```diff
- await Bun.file(path).delete()
+ import fs from "node:fs/promises"
+ await fs.unlink(path)
```

#### Bun.write(path, content)

```diff
- await Bun.write(path, content)
+ import fs from "node:fs/promises"
+ import path from "node:path"
+ await fs.mkdir(path.dirname(path), { recursive: true })
+ await fs.writeFile(path, content)
```

> **重要**: Bun.write 自动创建父目录，Node.js 的 fs.writeFile 不会。迁移时必须先 `mkdir -p`。

---

### 4.2 构建与打包

#### Bun.build()

```diff
- const result = await Bun.build({
-   entrypoints: ["./src/index.ts"],
-   target: "node",
-   outdir: "./dist",
- })
+ import * as esbuild from "esbuild"
+ await esbuild.build({
+   entryPoints: ["./src/index.ts"],
+   platform: "node",
+   outdir: "./dist",
+   bundle: true,
+   format: "esm",
+ })
```

**关键差异**:
- Bun.build 的 `entrypoints` → esbuild 的 `entryPoints`
- Bun.build 的 `target` → esbuild 的 `platform` + `target`
- Bun.build 默认 bundle，esbuild 需要显式 `bundle: true`
- Bun.Build.CompileTarget 类型 → 直接用 `string`

---

### 4.3 子进程

#### Bun.spawn()

```diff
- const proc = Bun.spawn(["bun", "run", "script.ts"], {
-   cwd: "./packages/opencode",
-   env: process.env,
-   stdout: "inherit",
-   stderr: "inherit",
- })
- await proc.exited
+ import { spawn } from "node:child_process"
+ const proc = spawn("bun", ["run", "script.ts"], {
+   cwd: "./packages/opencode",
+   env: process.env,
+   stdio: "inherit",
+ })
+ const exitCode = await new Promise<number>((resolve) => {
+   proc.on("exit", (code) => resolve(code ?? 0))
+ })
```

**关键差异**:
- Bun.spawn 签名: `Bun.spawn([cmd, ...args], opts)` — 命令和参数在同一数组
- Node.spawn 签名: `spawn(cmd, [args], opts)` — 命令和参数分开
- Bun 的 `stdout/stderr: "inherit"` → Node 的 `stdio: "inherit"`
- Bun 的 `proc.exited` (Promise) → Node 需手动创建 Promise 监听 `exit` 事件

---

### 4.4 Glob 模式匹配

#### Bun.Glob (异步)

```diff
- for await (const path of new Bun.Glob("*/migration.sql").scan({ cwd: directory })) {
+ import { glob } from "node:fs/promises"
+ for await (const path of glob("*/migration.sql", { cwd: directory })) {
    ...
  }
```

#### Bun.Glob (同步)

```diff
- for (const filepath of new Bun.Glob("*/package.json").scanSync({ cwd: "./dist" })) {
+ import { globSync } from "glob"  // 或 "node:fs"
+ for (const filepath of globSync("*/package.json", { cwd: "./dist" })) {
    ...
  }
```

> **注意**: Node.js 22+ 内置 `fs.glob`/`fs.globSync`，但项目已有 `glob` 依赖包，两者都可用。

---

### 4.5 标准输入

#### Bun.stdin.text()

```diff
- const input = await Bun.stdin.text()
+ async function readStdinText(): Promise<string> {
+   return new Promise<string>((resolve) => {
+     let data = ""
+     process.stdin.setEncoding("utf-8")
+     process.stdin.on("data", (chunk) => { data += chunk })
+     process.stdin.on("end", () => resolve(data))
+     process.stdin.resume()
+   })
+ }
+ const input = await readStdinText()
```

---

### 4.6 环境与参数

```diff
- Bun.env.MY_VAR
+ process.env.MY_VAR

- Bun.argv.slice(2)
+ process.argv.slice(2)
```

> **注意**: `Bun.argv` 不含 `bun` 自身，与 `process.argv` 行为一致（第一个元素是执行路径）。

---

### 4.7 哈希

#### Bun.hash()

```diff
- const hash = Bun.hash(data).toString(16)
+ import { createHash } from "node:crypto"
+ const hash = createHash("sha256").update(data).digest("hex")
```

> **注意**: Bun.hash() 默认使用 xxHash（非加密哈希），迁移到 Node.js 后使用 SHA-256（加密哈希）。哈希值会不同，但功能等价。如果需要精确匹配旧哈希值，需要安装 `xxhash-wasm` 等包。

---

### 4.8 字符串宽度

#### Bun.stringWidth()

Bun 内置了 Unicode 感知的字符串宽度计算（CJK 字符算2宽度）。Node.js 无内置等价：

```typescript
/** 近似字符串宽度：去掉 ANSI 转义序列，CJK/宽字符算 2 */
export function stringWidth(str: string): number {
  const stripped = str.replace(/\x1b\[[0-9;]*m/g, "")
  let width = 0
  for (const char of stripped) {
    const cp = char.codePointAt(0)!
    if (
      (cp >= 0x1100 && cp <= 0x115f) ||    // Hangul Jamo
      (cp >= 0x2329 && cp <= 0x232a) ||    // Angle brackets
      (cp >= 0x2e80 && cp <= 0x303f) ||    // CJK radicals / punctuation
      (cp >= 0x3040 && cp <= 0x33ff) ||    // Hiragana, Katakana, CJK
      (cp >= 0x3400 && cp <= 0x4dbf) ||    // CJK Extension A
      (cp >= 0x4e00 && cp <= 0x9fff) ||    // CJK Unified Ideographs
      (cp >= 0xa000 && cp <= 0xabff) ||    // Yi, Hangul Syllables
      (cp >= 0xac00 && cp <= 0xd7a3) ||    // Hangul Syllables
      (cp >= 0xd7b0 && cp <= 0xd7fb) ||    // Hangul Jamo Extended B
      (cp >= 0xf900 && cp <= 0xfaff) ||    // CJK Compatibility Ideographs
      (cp >= 0xfe10 && cp <= 0xfe19) ||    // Vertical forms
      (cp >= 0xfe30 && cp <= 0xfe6f) ||    // CJK Compatibility Forms
      (cp >= 0xff01 && cp <= 0xff60) ||    // Fullwidth forms
      (cp >= 0xffe0 && cp <= 0xffe6) ||    // Fullwidth signs
      (cp >= 0x20000 && cp <= 0x2fffc) ||  // CJK Extensions B-I
      (cp >= 0x30000 && cp <= 0x3fffd)     // CJK Extension G
    ) {
      width += 2
    } else {
      width += 1
    }
  }
  return width
}
```

> **替代方案**: 可安装 `string-width` npm 包，但我们选择自定义实现以避免新增依赖。如需更精确（如处理 Emoji ZWJ 序列），建议安装 `string-width`。

---

### 4.9 其他 API

| Bun API | Node.js 替代 |
|---------|-------------|
| `Bun.sleep(ms)` | `await new Promise((r) => setTimeout(r, ms))` |
| `Bun.gc(true)` | 无等价 — 删除调用 |
| `Bun.serve({...})` | `http.createServer()` 或 Hono/Express |
| `Bun.$\`cmd\`` | `execSync("cmd", { encoding: "utf-8" })` |
| `import { pathToFileURL } from "bun"` | `import { pathToFileURL } from "url"` |
| `import { fileURLToPath } from "bun"` | `import { fileURLToPath } from "url"` |
| `import type { SystemError } from "bun"` | 自定义 `NodeSystemError` 接口 |

#### NodeSystemError 替代

```typescript
/** Node.js system error with errno-style code and syscall */
interface NodeSystemError extends Error {
  code?: string
  syscall?: string
}
```

---

### 4.10 $bunfs 路径

Bun 编译模式 (`bun build --compile`) 使用虚拟文件系统，路径格式为 `/$bunfs/root/...`。迁移到 esbuild 后，文件在磁盘上以相对路径访问：

```diff
  // esbuild define
  define: {
-   "OTUI_TREE_SITTER_WORKER_PATH": JSON.stringify(`/$bunfs/root/${workerRelativePath}`),
+   "OTUI_TREE_SITTER_WORKER_PATH": JSON.stringify("./" + workerRelativePath),
  }
```

Windows 上 Bun 的虚拟路径格式 `B:/~BUN/root/` 同理替换为 `./`。

---

## 5. TypeScript 配置迁移

### 5.1 tsconfig extends

```diff
  {
-   "extends": "@tsconfig/bun/tsconfig.json"
+   "extends": "@tsconfig/node22/tsconfig.json"
  }
```

### 5.2 types 数组

```diff
  {
    "compilerOptions": {
-     "types": ["vite/client", "bun"]
+     "types": ["vite/client", "node"]
    }
  }
```

### 5.3 保留的配置选项

以下选项在迁移后保持不变（`@tsconfig/node22` 也支持）：

- `moduleResolution: "bundler"` — 避免 1000+ 文件添加 `.js` 扩展名
- `module: "ESNext"` — 保持 ESM 输出
- `target: "ESNext"` — 保持最新语法支持

---

## 6. CI/CD 迁移

### 6.1 GitHub Actions 结构

| 迁移前 | 迁移后 |
|--------|--------|
| 29 个 workflows | 2 个 workflows (build.yml + publish.yml) |
| .github/actions/setup-bun/ | .github/actions/setup-node/ |
| .github/actions/setup-git-committer/ | （删除 — 依赖 anomalyco GitHub App） |

### 6.2 setup-node action

```yaml
name: "Setup Node"
description: "Setup Node.js with npm caching and install dependencies"
inputs:
  node-version:
    description: "Node.js version"
    required: false
    default: "22"
runs:
  using: "composite"
  steps:
    - name: Setup Node.js
      uses: actions/setup-node@v4.4.0
      with:
        node-version: ${{ inputs.node-version }}
        cache: "npm"

    - name: Install dependencies
      run: npm install --legacy-peer-deps --force --ignore-scripts
      shell: bash
```

### 6.3 Runner 替代

| Bun (blacksmith) | Node.js (标准) |
|------------------|----------------|
| `blacksmith-4vcpu-ubuntu-2404` | `ubuntu-latest` |
| `blacksmith-4vcpu-ubuntu-2404-arm` | （移除或用 QEMU） |
| `blacksmith-4vcpu-windows-2025` | `windows-latest` |
| `macos-26-intel` | `macos-13` |
| `macos-26` | `macos-latest` |

### 6.4 Workflow 中的命令替换

```diff
  # 安装
- run: bun install
+ run: npm install --legacy-peer-deps --force

  # 运行 TS 脚本
- run: bun ./scripts/prepare.ts
+ run: npx tsx ./scripts/prepare.ts

- run: ./script/version.ts
+ run: npx tsx ./script/version.ts

  # 构建
- run: bun run build
+ run: npm run build

  # 仓库门控
- if: github.repository == 'anomalyco/opencode'
+ （移除，或在 fork 中改为自己的仓库名）
```

---

## 7. Shebang 迁移

```diff
- #!/usr/bin/env bun
+ #!/usr/bin/env -S node --import tsx
```

> **注意**: `--import tsx` 需要 Node.js 22.6+ (stable in 24+)。旧版本可改用 `#!/usr/bin/env -S npx tsx`。

---

## 8. 保留的 Bun 相关引用

以下引用是合法的，**不需要修改**：

### 8.1 条件导出 (conditional exports)

```json
{
  "exports": {
    ".": {
      "bun": "./src/storage/db.bun.ts",
      "node": "./src/storage/db.node.ts"
    }
  }
}
```

`"bun"` 条件键是 Node.js 规范的条件导出机制，仅在 Bun 运行时生效。保留它确保代码在两种运行时下都能正确解析。

### 8.2 名字含 "bun" 的包

| 包名 | 说明 |
|------|------|
| `@ff-labs/fff-bun` | Rust 原生插件，在 Node.js 中可用 |
| `bun-pty` | 伪终端包（实际依赖 @lydell/node-pty） |

### 8.3 测试文件

测试文件中仍有约 91 个文件包含 `Bun.*` 调用（Bun.gc, Bun.serve, Bun.spawn, etc.）。这些文件只在 Bun 运行时下运行测试时使用，暂不修改。

---

## 9. 删除的文件

### 配置文件（5+4=9 个）
- `bunfig.toml` (根目录 + packages/app, cli, opencode, tui)
- `bun.lock` (根目录 + github/, packages/console/resource/, sdks/vscode/)

### CI 文件（27 个）
- 25 个非必要 workflow (beta, close-issues, close-prs, compliance-close, containers, deploy, docs-locale-sync, docs-update, duplicate-issues, generate, nix-eval, nix-hashes, notify-discord, opencode, pr-management, pr-standards, publish-github-action, publish-vscode, release-github-action, review, stats, storybook, test, triage, typecheck)
- `setup-bun` action
- `setup-git-committer` action
- `publish-python-sdk.yml` (已注释掉)

---

## 10. 已知限制与后续工作

### 10.1 编译二进制文件

Bun 的 `bun build --compile` 可生成独立二进制文件，Node.js 下需要替代方案：

| 方案 | 说明 |
|------|------|
| Node.js SEA (Single Executable Application) | Node 20+ 实验性功能，需要 `--experimental-sea-config` |
| `pkg` (Vercel) | 将 Node.js 应用打包为可执行文件 |
| esbuild + node shebang | 当前方案 — 生成 JS bundle + `#!/usr/bin/env node` |

> 当前迁移使用 esbuild 构建 bundle + 分发入口脚本。独立二进制编译留待后续实现。

### 10.2 SQLite

Node.js 22 需要 `--experimental-sqlite` 标志启用 `node:sqlite`，Node.js 24+ 已稳定。迁移使用了 `@effect/sql-sqlite-node` 替代 `@effect/sql-sqlite-bun`。

### 10.3 安装性能

Bun install 通常比 npm install 快 3-10 倍。大型 monorepo 首次安装可能较慢。可考虑：

- 使用 `npm ci`（从 lockfile 安装，更快且可复现）
- 配置 npm 缓存 (`~/.npm`)
- 使用 `--prefer-offline` 标志

### 10.4 类型检查

部分包的类型检查可能存在预存错误（非迁移引入），需在更快的环境中运行 `npx turbo typecheck` 完成全量验证。

---

## 11. 验证清单

迁移完成后运行以下命令确认无残留：

```bash
# Bun API 调用（应返回 0）
grep -rn "Bun\." --include="*.ts" --include="*.tsx" packages/ script/ | grep -v "node_modules\|\.d\.ts\|\.test\.\|\.spec\.\|/test/" | wc -l

# catalog: 协议（应返回 0）
grep -rn "catalog:" --include="package.json" | grep -v node_modules | wc -l

# workspace:* 协议（应返回 0）
grep -rn "workspace:\*" --include="package.json" | grep -v node_modules | wc -l

# @tsconfig/bun（应返回 0）
grep -rn "@tsconfig/bun" --include="*.json" | grep -v node_modules | wc -l

# @types/bun（应返回 0）
grep -rn '"@types/bun"' --include="package.json" | grep -v node_modules | wc -l

# bunfig.toml（应返回 0）
find . -name "bunfig.toml" -not -path "*/node_modules/*" | wc -l

# bun.lock（应返回 0）
find . -name "bun.lock" -not -path "*/node_modules/*" | wc -l

# $bunfs 路径（非test文件应返回 0）
grep -rn '\$bunfs\|/bunfs/' --include="*.ts" packages/ | grep -v "node_modules\|/test/" | wc -l

# CI 中的 setup-bun 引用（应返回 0）
grep -rn "setup-bun\|blacksmith" .github/ | wc -l

# packageManager（应为 npm）
grep -rn "packageManager" package.json | grep -v node_modules
```
