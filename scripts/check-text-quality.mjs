import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const targetDirs = ['app', 'components', 'lib', 'native/src', 'app/api']
const allowedExtensions = new Set(['.ts', '.tsx', '.js', '.md'])
const ignoredDirNames = new Set(['node_modules', '.next', '.git', 'android', 'ios', 'build'])

const mojibakePatterns = [
  { label: 'replacement-character', pattern: /\uFFFD/u },
  { label: 'garbled-lead-1', pattern: /\u7E3A/u }, // 縺
  { label: 'garbled-lead-2', pattern: /\u7E67/u }, // 繧
  { label: 'garbled-lead-3', pattern: /\u8B4C/u }, // 譌
  { label: 'garbled-lead-4', pattern: /\u86FB/u }, // 蛻
  { label: 'garbled-halfwidth-dot', pattern: /\uFF65/u },
]

const staticChecks = [
  {
    file: 'app/api/quiz/route.ts',
    mustInclude: [
      'normalizeQuizText(String(q.question || \'\').trim())',
      'normalizeQuizText(String(choice ?? \'\'))',
      'response_format: { type: \'json_object\' }',
    ],
  },
  {
    file: 'app/app/study/page.tsx',
    mustInclude: [
      "import { normalizeQuizText } from '@/lib/text-normalizer'",
      'normalizeQuizText(q.question)',
      'normalizeQuizText(choice)',
      'normalizeQuizText(q.explanation)',
    ],
  },
  {
    file: 'native/src/screens/ReviewScreen.tsx',
    mustInclude: [
      "import { normalizeQuizText } from '../lib/text-normalizer'",
      'normalizeQuizText(q.question)',
      'normalizeQuizText(choice)',
      'normalizeQuizText(attempt.question)',
    ],
  },
]

const hits = []

function walk(dirPath) {
  for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
    const absolute = path.join(dirPath, entry.name)

    if (entry.isDirectory()) {
      if (ignoredDirNames.has(entry.name)) continue
      walk(absolute)
      continue
    }

    if (!allowedExtensions.has(path.extname(entry.name))) continue

    const content = fs.readFileSync(absolute, 'utf8')
    const lines = content.split(/\r?\n/)

    for (let i = 0; i < lines.length; i++) {
      for (const { label, pattern } of mojibakePatterns) {
        if (pattern.test(lines[i])) {
          hits.push({ file: path.relative(root, absolute), line: i + 1, label, text: lines[i].trim() })
        }
      }
    }
  }
}

for (const dir of targetDirs) {
  const absolute = path.join(root, dir)
  if (fs.existsSync(absolute)) walk(absolute)
}

const missingMarkers = []
for (const check of staticChecks) {
  const absolute = path.join(root, check.file)
  if (!fs.existsSync(absolute)) {
    missingMarkers.push({ file: check.file, marker: '__FILE_NOT_FOUND__' })
    continue
  }
  const content = fs.readFileSync(absolute, 'utf8')
  for (const marker of check.mustInclude) {
    if (!content.includes(marker)) {
      missingMarkers.push({ file: check.file, marker })
    }
  }
}

if (hits.length === 0) {
  console.log('Mojibake scan: 0 issues')
} else {
  console.error(`Mojibake scan: ${hits.length} issues`)
  for (const hit of hits.slice(0, 200)) {
    console.error(`- ${hit.file}:${hit.line} [${hit.label}] ${hit.text}`)
  }
}

if (missingMarkers.length === 0) {
  console.log('Static checks: OK')
} else {
  console.error(`Static checks: ${missingMarkers.length} missing marker(s)`) 
  for (const missing of missingMarkers) {
    console.error(`- ${missing.file}: ${missing.marker}`)
  }
}

if (hits.length > 0 || missingMarkers.length > 0) {
  process.exit(1)
}
