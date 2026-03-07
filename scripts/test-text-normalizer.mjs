import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import ts from 'typescript'

const require = createRequire(import.meta.url)

function loadTsModule(modulePath) {
  const absolute = path.resolve(modulePath)
  const source = fs.readFileSync(absolute, 'utf8')
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
    fileName: absolute,
  }).outputText

  const compiledModule = { exports: {} }
  const fn = new Function('exports', 'require', 'module', '__filename', '__dirname', transpiled)
  fn(compiledModule.exports, require, compiledModule, absolute, path.dirname(absolute))
  return compiledModule.exports
}

const webModule = loadTsModule('./lib/text-normalizer.ts')
const nativeModule = loadTsModule('./native/src/lib/text-normalizer.ts')

assert.equal(typeof webModule.normalizeQuizText, 'function', 'Web normalizeQuizText not found')
assert.equal(typeof nativeModule.normalizeQuizText, 'function', 'Native normalizeQuizText not found')

const cases = [
  { input: 'x^2', expected: 'x²' },
  { input: '10^3', expected: '10³' },
  { input: 'x^{2}', expected: 'x²' },
  { input: 'sqrt(x+1)', expected: '√(x+1)' },
  { input: '\\sqrt{a}', expected: '√(a)' },
  { input: 'a<=b', expected: 'a≤b' },
  { input: 'a>=b', expected: 'a≥b' },
  { input: 'a!=b', expected: 'a≠b' },
  { input: 'a * b', expected: 'a × b' },
  { input: 'x^(n+1)', expected: 'x^(n+1)' },
]

for (const testCase of cases) {
  const webActual = webModule.normalizeQuizText(testCase.input)
  const nativeActual = nativeModule.normalizeQuizText(testCase.input)

  assert.equal(webActual, testCase.expected, `Web mismatch: ${testCase.input}`)
  assert.equal(nativeActual, testCase.expected, `Native mismatch: ${testCase.input}`)
  assert.equal(webActual, nativeActual, `Web/Native mismatch: ${testCase.input}`)
}

console.log(`Math normalization tests passed: ${cases.length} cases`)
