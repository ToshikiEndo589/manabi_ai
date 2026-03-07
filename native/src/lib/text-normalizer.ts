const SUPERSCRIPT_DIGITS: Record<string, string> = {
  '0': '⁰',
  '1': '¹',
  '2': '²',
  '3': '³',
  '4': '⁴',
  '5': '⁵',
  '6': '⁶',
  '7': '⁷',
  '8': '⁸',
  '9': '⁹',
}

const KNOWN_GARBLED_REPLACEMENTS: Array<{ pattern: RegExp; replacement: string }> = [
  { pattern: /\u7E3A\u6602\u30FB\u8389\u30FB/g, replacement: 'その他' },
  { pattern: /\u87C4\uFF64\u90A3\u507D\u8C9E\u30FB\u87B3\uFF33\uFF39/g, replacement: '学習内容' },
  { pattern: /\u96B1\uFF6D\u7E3A\uFF7F\u970E\uFF3C/g, replacement: '読み込み' },
]

const FULL_WIDTH_SYMBOL_MAP: Record<string, string> = {
  '　': ' ',
  '＾': '^',
  '＊': '*',
  '／': '/',
  '＝': '=',
  '＜': '<',
  '＞': '>',
  '（': '(',
  '）': ')',
  '｛': '{',
  '｝': '}',
}

function toSuperscriptDigits(value: string): string {
  const chars = [...value]
  if (!chars.every((ch) => SUPERSCRIPT_DIGITS[ch])) return value
  return chars.map((ch) => SUPERSCRIPT_DIGITS[ch]).join('')
}

function normalizeKnownGarbledText(input: string): string {
  let output = input
  for (const { pattern, replacement } of KNOWN_GARBLED_REPLACEMENTS) {
    output = output.replace(pattern, replacement)
  }
  return output
}

function normalizeMathLine(input: string): string {
  let output = input

  for (const [fullWidth, halfWidth] of Object.entries(FULL_WIDTH_SYMBOL_MAP)) {
    output = output.replace(new RegExp(fullWidth, 'g'), halfWidth)
  }

  output = output.replace(/\\sqrt\s*\{([^{}]+)\}/g, (_, inner: string) => `√(${inner.trim()})`)
  output = output.replace(/\bsqrt\s*\(([^()]+)\)/gi, (_, inner: string) => `√(${inner.trim()})`)
  output = output.replace(/\\times/g, '×')
  output = output.replace(/\\div/g, '÷')
  output = output.replace(/<=/g, '≤').replace(/>=/g, '≥').replace(/!=/g, '≠')

  output = output.replace(/([0-9A-Za-z)\]])\s*\*\s*([0-9A-Za-z(\[])/g, '$1 × $2')

  output = output.replace(/([A-Za-z0-9)\]])\s*\^\s*\{(\d+)\}/g, (_, base: string, power: string) => {
    return `${base}${toSuperscriptDigits(power)}`
  })
  output = output.replace(/([A-Za-z0-9)\]])\s*\^\s*(\d+)\b/g, (_, base: string, power: string) => {
    return `${base}${toSuperscriptDigits(power)}`
  })

  output = output
    .replace(/\(\s+/g, '(')
    .replace(/\s+\)/g, ')')
    .replace(/\s{2,}/g, ' ')
    .trim()

  return output
}

export function normalizeQuizText(input: string): string {
  if (!input) return ''
  const normalized = normalizeKnownGarbledText(input)
  return normalized
    .split('\n')
    .map((line) => normalizeMathLine(line))
    .join('\n')
}
