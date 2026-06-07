/**
 * Cross-runtime string width utility.
 * Uses Bun.stringWidth when available, falls back to string-width npm package.
 */

const isBun = typeof (globalThis as any).Bun !== "undefined" && typeof (globalThis as any).Bun.stringWidth === "function"

// Lazy-loaded fallback for Node.js
let _nodeStringWidth: ((str: string) => number) | null = null

async function loadNodeStringWidth(): Promise<(str: string) => number> {
  if (_nodeStringWidth) return _nodeStringWidth
  const mod = await import("string-width")
  _nodeStringWidth = (str: string) => {
    const result = mod.default(str)
    // string-width v8 returns an object with a .length property when used with strip-ansi
    // but the default export is a function that returns the visual width
    return typeof result === "number" ? result : (result as any).length ?? String(result).length
  }
  return _nodeStringWidth
}

// Synchronous wrapper for Bun, async for Node
export function stringWidth(str: string): number {
  if (isBun) {
    return (globalThis as any).Bun.stringWidth(str)
  }
  // For Node.js sync usage, we need a different approach
  // Use the eastasianwidth-based calculation as a sync fallback
  return stringWidthSync(str)
}

// Simple sync implementation based on Unicode East Asian Width
// This covers the vast majority of cases (CJK characters, emojis, etc.)
function stringWidthSync(str: string): number {
  let width = 0
  // eslint-disable-next-line no-control-regex
  const stripped = str.replace(/\x1b\[[0-9;]*m/g, "") // strip ANSI
  for (const char of stripped) {
    const code = char.codePointAt(0)!
    if (code <= 0x1f || (code >= 0x7f && code <= 0x9f)) {
      continue // control characters
    }
    if (
      // CJK Unified Ideographs
      (code >= 0x4e00 && code <= 0x9fff) ||
      // CJK Extension A
      (code >= 0x3400 && code <= 0x4dbf) ||
      // CJK Compatibility Ideographs
      (code >= 0xf900 && code <= 0xfaff) ||
      // Hangul Syllables
      (code >= 0xac00 && code <= 0xd7a3) ||
      // Hiragana + Katakana
      (code >= 0x3040 && code <= 0x30ff) ||
      // Fullwidth forms
      (code >= 0xff01 && code <= 0xff60) ||
      // CJK Extension B and others
      (code >= 0x20000 && code <= 0x2fffd) ||
      // CJK Symbols and Punctuation, fullwidth brackets
      (code >= 0x3000 && code <= 0x303f) ||
      // Various fullwidth/presentation forms
      (code >= 0xfe30 && code <= 0xfe6f) ||
      // Emoji ranges (most emojis are width 2)
      (code >= 0x1f600 && code <= 0x1f64f) || // Emoticons
      (code >= 0x1f300 && code <= 0x1f5ff) || // Misc Symbols and Pictographs
      (code >= 0x1f680 && code <= 0x1f6ff) || // Transport and Map
      (code >= 0x1f900 && code <= 0x1f9ff) || // Supplemental Symbols
      (code >= 0x1fa00 && code <= 0x1fa6f) || // Chess Symbols
      (code >= 0x1fa70 && code <= 0x1faff) || // Symbols and Pictographs Extended-A
      (code >= 0x2600 && code <= 0x26ff) ||   // Misc symbols
      (code >= 0x2700 && code <= 0x27bf)       // Dingbats
    ) {
      width += 2
    } else {
      width += 1
    }
  }
  return width
}

export async function stringWidthAsync(str: string): Promise<number> {
  if (isBun) {
    return (globalThis as any).Bun.stringWidth(str)
  }
  const fn = await loadNodeStringWidth()
  return fn(str)
}
