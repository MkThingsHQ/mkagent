#!/usr/bin/env bun
/**
 * Verify that statically referenced translation keys exist in en.json.
 *
 * Locale parity alone cannot catch a key that is missing from every locale.
 * This scanner covers literal t()/i18n.t() calls, <Trans i18nKey="..." />,
 * and the static *Key fields used by menu/settings registries.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, extname, join, relative, resolve } from 'node:path'
import ts from 'typescript'

const ROOT = resolve(import.meta.dir, '..')
const EN_PATH = join(ROOT, 'packages/shared/src/i18n/locales/en.json')
const SOURCE_ROOTS = ['apps', 'packages'].map((dir) => join(ROOT, dir))
const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx'])
// Build/package outputs can contain bundled source from dependencies. Scanning them
// produces false positives and makes validation depend on which local builds ran first.
const IGNORED_DIRS = new Set(['node_modules', 'dist', 'build', 'coverage', 'release'])
const ELECTRON_RENDERER_DIR = join(ROOT, 'apps/electron/src/renderer')
const TRANSLATION_KEY_FIELDS = new Set([
  'descriptionKey',
  'labelKey',
  'messageKey',
  'nameKey',
  'titleKey',
])

type Reference = { file: string; key: string; line: number }

const en = JSON.parse(readFileSync(EN_PATH, 'utf8')) as Record<string, string>
const definedKeys = new Set(Object.keys(en))

function walk(dir: string, files: string[]): void {
  for (const entry of readdirSync(dir)) {
    if (IGNORED_DIRS.has(entry)) continue
    const path = join(dir, entry)
    const stat = statSync(path)
    if (stat.isDirectory()) {
      walk(path, files)
    } else if (
      SOURCE_EXTENSIONS.has(extname(entry)) &&
      !entry.includes('.test.') &&
      !entry.includes('.spec.') &&
      !path.includes(`${join('', '__tests__')}/`)
    ) {
      files.push(path)
    }
  }
}

function literalText(node: ts.Node | undefined): string | null {
  return node && (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node))
    ? node.text
    : null
}

function propertyName(node: ts.PropertyName): string | null {
  return ts.isIdentifier(node) || ts.isStringLiteral(node) ? node.text : null
}

function isTranslationCall(node: ts.CallExpression): boolean {
  if (ts.isIdentifier(node.expression)) return node.expression.text === 't'
  return ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === 't'
}

function hasTranslation(key: string): boolean {
  if (definedKeys.has(key)) return true
  return definedKeys.has(`${key}_one`) && definedKeys.has(`${key}_other`)
}

function standaloneRendererEntries(): string[] {
  const entries: string[] = []
  for (const file of readdirSync(ELECTRON_RENDERER_DIR)) {
    if (extname(file) !== '.html') continue
    const htmlPath = join(ELECTRON_RENDERER_DIR, file)
    const html = readFileSync(htmlPath, 'utf8')
    const scriptSource = html.match(/<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/)?.[1]
    if (!scriptSource || !scriptSource.startsWith('.')) continue
    entries.push(resolve(dirname(htmlPath), scriptSource))
  }
  return entries
}

function initializesI18n(file: string): boolean {
  const sourceText = readFileSync(file, 'utf8')
  const sourceFile = ts.createSourceFile(
    file,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  )
  let initialized = false
  const visit = (node: ts.Node): void => {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'setupI18n'
    ) {
      initialized = true
    }
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
  return initialized
}

const references: Reference[] = []
const sourceFiles: string[] = []
for (const root of SOURCE_ROOTS) walk(root, sourceFiles)

for (const file of sourceFiles) {
  const sourceText = readFileSync(file, 'utf8')
  const sourceFile = ts.createSourceFile(
    file,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  )

  const addReference = (key: string, node: ts.Node): void => {
    const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile))
    references.push({ file: relative(ROOT, file), key, line: line + 1 })
  }

  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node) && isTranslationCall(node)) {
      const key = literalText(node.arguments[0])
      if (key) addReference(key, node.arguments[0]!)
    }

    if (ts.isJsxAttribute(node) && node.name.text === 'i18nKey') {
      const key = literalText(node.initializer)
      if (key) addReference(key, node.initializer!)
    }

    if (ts.isPropertyAssignment(node)) {
      const name = propertyName(node.name)
      const key = literalText(node.initializer)
      if (name && TRANSLATION_KEY_FIELDS.has(name) && key) addReference(key, node.initializer)
    }

    ts.forEachChild(node, visit)
  }

  visit(sourceFile)
}

const missing = references
  .filter(({ key }) => !hasTranslation(key))
  .sort((a, b) => a.key.localeCompare(b.key) || a.file.localeCompare(b.file) || a.line - b.line)

if (missing.length > 0) {
  console.error(`i18n usage check failed: ${missing.length} static reference(s) have no English translation:`)
  for (const reference of missing) {
    console.error(`  ${reference.key} (${reference.file}:${reference.line})`)
  }
  process.exit(1)
}

const uninitializedEntries = standaloneRendererEntries().filter((file) => !initializesI18n(file))
if (uninitializedEntries.length > 0) {
  console.error('i18n usage check failed: standalone Electron renderer entries must call setupI18n() before rendering:')
  for (const file of uninitializedEntries) {
    console.error(`  ${relative(ROOT, file)}`)
  }
  process.exit(1)
}

console.log(`i18n usage OK (${references.length} static references, ${definedKeys.size} English keys, ${standaloneRendererEntries().length} renderer entries initialized)`)
