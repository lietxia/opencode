const graphemes = new Intl.Segmenter(undefined, { granularity: "grapheme" })

/** Approximate string width: strip ANSI escapes then count characters, treating CJK/wide chars as 2. */
export function stringWidth(str: string): number {
  const stripped = str.replace(/\x1b\[[0-9;]*m/g, "")
  let width = 0
  for (const char of stripped) {
    const cp = char.codePointAt(0)!
    // CJK Unified Ideographs and other wide characters
    if (
      (cp >= 0x1100 && cp <= 0x115f) || // Hangul Jamo
      (cp >= 0x2329 && cp <= 0x232a) || // Angle brackets
      (cp >= 0x2e80 && cp <= 0x303f) || // CJK radicals / punctuation
      (cp >= 0x3040 && cp <= 0x33ff) || // Hiragana, Katakana, CJK symbols
      (cp >= 0x3400 && cp <= 0x4dbf) || // CJK Unified Ideographs Extension A
      (cp >= 0x4e00 && cp <= 0x9fff) || // CJK Unified Ideographs
      (cp >= 0xa000 && cp <= 0xabff) || // Yi, Hangul Syllables
      (cp >= 0xac00 && cp <= 0xd7a3) || // Hangul Syllables
      (cp >= 0xd7b0 && cp <= 0xd7fb) || // Hangul Jamo Extended B
      (cp >= 0xf900 && cp <= 0xfaff) || // CJK Compatibility Ideographs
      (cp >= 0xfe10 && cp <= 0xfe19) || // Vertical forms
      (cp >= 0xfe30 && cp <= 0xfe6f) || // CJK Compatibility Forms
      (cp >= 0xff01 && cp <= 0xff60) || // Fullwidth forms
      (cp >= 0xffe0 && cp <= 0xffe6) || // Fullwidth signs
      (cp >= 0x20000 && cp <= 0x2fffc) || // CJK Extensions B-I
      (cp >= 0x30000 && cp <= 0x3fffd) || // CJK Unified Ideographs Extension G+
      (cp >= 0x1f300 && cp <= 0x1f9ff)    // Emoji (most are wide)
    ) {
      width += 2
    } else {
      width += 1
    }
  }
  return width
}

export function promptOffsetWidth(value: string) {
  let width = 0
  for (const part of graphemes.segment(value)) {
    // Textarea offsets count newlines as one position; stringWidth counts them as zero.
    width += part.segment === "\n" ? 1 : stringWidth(part.segment)
  }
  return width
}

function displayOffsetIndex(value: string, offset: number) {
  if (offset <= 0) return 0

  let width = 0
  for (const part of graphemes.segment(value)) {
    const next = width + promptOffsetWidth(part.segment)
    if (next > offset) return part.index
    width = next
  }

  return value.length
}

export function displaySlice(value: string, start = 0, end = promptOffsetWidth(value)) {
  return value.slice(displayOffsetIndex(value, start), displayOffsetIndex(value, end))
}

export function displayCharAt(value: string, offset: number) {
  let width = 0
  for (const part of graphemes.segment(value)) {
    const next = width + promptOffsetWidth(part.segment)
    if (offset === width || offset < next) return part.segment
    width = next
  }
}

export function mentionTriggerIndex(value: string, offset = promptOffsetWidth(value)) {
  const text = displaySlice(value, 0, offset)
  const index = text.lastIndexOf("@")
  if (index === -1) return

  const before = index === 0 ? undefined : text[index - 1]
  const query = text.slice(index)
  if ((before === undefined || /\s/.test(before)) && !/\s/.test(query)) {
    return promptOffsetWidth(text.slice(0, index))
  }
}
