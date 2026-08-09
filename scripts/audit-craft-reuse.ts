#!/usr/bin/env bun

/** Verify every tracked MkAgent file against the pinned Craft checkout. */

import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { resolve } from 'node:path'

const repoRoot = resolve(import.meta.dir, '..')
const craftRoot = process.env.CRAFT_AGENT_SOURCE
  ?? [
    resolve(repoRoot, '..', 'craft-agents-oss'),
    resolve(repoRoot, '..', '..', 'agents', 'craft-agents-oss'),
  ].find(candidate => existsSync(candidate))
  ?? resolve(repoRoot, '..', 'craft-agents-oss')
const jsonOutput = process.argv.includes('--json')
const baseline = Bun.spawnSync(['git', '-C', craftRoot, 'rev-parse', 'HEAD'], { stdout: 'pipe' }).stdout.toString().trim()

function trackedFiles(root: string): string[] {
  const proc = Bun.spawnSync(
    ['git', '-C', root, 'ls-files', '--cached', '--others', '--exclude-standard', '-z'],
    { stdout: 'pipe', stderr: 'pipe' },
  )
  if (proc.exitCode !== 0) throw new Error(proc.stderr.toString())
  return proc.stdout.toString().split('\0').filter(Boolean)
}

function baselineFiles(root: string, commit: string): string[] {
  const proc = Bun.spawnSync(
    ['git', '-C', root, 'ls-tree', '-r', '--name-only', '-z', commit],
    { stdout: 'pipe', stderr: 'pipe' },
  )
  if (proc.exitCode !== 0) throw new Error(proc.stderr.toString())
  return proc.stdout.toString().split('\0').filter(Boolean)
}

const dirtyCraftFiles = new Set(
  Bun.spawnSync(
    ['git', '-C', craftRoot, 'diff', '--name-only', '-z', baseline, '--'],
    { stdout: 'pipe' },
  ).stdout.toString().split('\0').filter(Boolean),
)

async function readCraftFile(file: string): Promise<Buffer> {
  if (!dirtyCraftFiles.has(file) && existsSync(resolve(craftRoot, file))) {
    return readFile(resolve(craftRoot, file))
  }
  const proc = Bun.spawnSync(['git', '-C', craftRoot, 'show', `${baseline}:${file}`], {
    stdout: 'pipe',
    stderr: 'pipe',
  })
  if (proc.exitCode !== 0) throw new Error(proc.stderr.toString())
  return Buffer.from(proc.stdout)
}

const isAuditedFile = (file: string) => {
  const normalized = file.replace(/\/$/, '')
  return normalized !== 'scripts/craft-source-overrides.json'
    && normalized !== 'vendor/open-connector'
}

const normalizeCraft = (source: string) => source
  .replaceAll('@craft-agent/', '@mkagent/')
  .replaceAll('craftagents://', 'mkagent://')
  .replaceAll('.craft-agent', '.mkagent')
  .replaceAll('CRAFT_AGENT_', 'MKAGENT_')
  .replaceAll('Craft Agents Backend Compatible', 'Pi Backend Compatible')
  .replaceAll('Craft Agents Backend', 'Pi Backend')

function normalizeCraftBytes(bytes: Buffer): Buffer {
  const source = bytes.toString('utf8')
  if (!Buffer.from(source).equals(bytes)) return bytes
  return Buffer.from(normalizeCraft(source))
}

const mkFiles = trackedFiles(repoRoot).filter(file => isAuditedFile(file) && existsSync(resolve(repoRoot, file)))
const craftFiles = baselineFiles(craftRoot, baseline).filter(isAuditedFile)
const mkSet = new Set(mkFiles)
const craftSet = new Set(craftFiles)
const common = mkFiles.filter(file => craftSet.has(file))
const mkOnly = mkFiles.filter(file => !craftSet.has(file))
const craftOnly = craftFiles.filter(file => !mkSet.has(file))
const identical: string[] = []
const modified: string[] = []

for (const file of common) {
  const [craftBytes, mkagentBytes] = await Promise.all([
    readCraftFile(file),
    readFile(resolve(repoRoot, file)),
  ])
  const craft = normalizeCraftBytes(craftBytes)
  if (craft.equals(mkagentBytes)) identical.push(file)
  else modified.push(file)
}

const summary = {
  craftRoot,
  mkagentFiles: mkFiles.length,
  craftFiles: craftFiles.length,
  commonPathFiles: common.length,
  normalizedIdenticalFiles: identical.length,
  intentionalOrModifiedFiles: modified.length,
  mkagentOnlyFiles: mkOnly.length,
  craftOnlyFiles: craftOnly.length,
  commonPathRatio: mkFiles.length === 0 ? 0 : common.length / mkFiles.length,
  normalizedReuseRatio: mkFiles.length === 0 ? 0 : identical.length / mkFiles.length,
}

const manifest = JSON.parse(
  await readFile(resolve(import.meta.dir, 'craft-source-overrides.json'), 'utf8'),
) as {
  version: number
  baselineCommit: string
  modified: Record<string, { sha256: string; reason: string }>
  mkOnly: Record<string, { sha256: string; reason: string }>
  deleted: Record<string, string>
}

const errors: string[] = []
if (manifest.version !== 2) errors.push(`unsupported source override manifest version: ${manifest.version}`)
if (manifest.baselineCommit !== baseline) errors.push(`Craft baseline changed: expected ${manifest.baselineCommit}, found ${baseline}`)

async function verifyHashes(
  files: string[],
  expected: Record<string, { sha256: string; reason: string }>,
  label: string,
): Promise<void> {
  const current = new Set(files)
  for (const file of files) {
    const registered = expected[file]
    if (!registered) {
      errors.push(`unreviewed ${label} file: ${file}`)
      continue
    }
    const bytes = await readFile(resolve(repoRoot, file))
    const hash = createHash('sha256').update(bytes).digest('hex')
    if (!registered.reason.trim()) errors.push(`reviewed ${label} file has no reason: ${file}`)
    if (hash !== registered.sha256) errors.push(`reviewed ${label} file changed without manifest update: ${file}`)
  }
  for (const file of Object.keys(expected)) {
    if (!current.has(file)) errors.push(`stale ${label} manifest entry: ${file}`)
  }
}

await verifyHashes(modified, manifest.modified, 'Craft-derived override')
await verifyHashes(mkOnly, manifest.mkOnly, 'MkAgent-only file')

const expectedDeleted = new Set(Object.keys(manifest.deleted))
for (const file of craftOnly) {
  if (!expectedDeleted.has(file)) errors.push(`unreviewed Craft file deletion: ${file}`)
}
for (const [file, reason] of Object.entries(manifest.deleted)) {
  if (!craftOnly.includes(file)) errors.push(`stale Craft source deletion entry: ${file}`)
  if (!reason.trim()) errors.push(`reviewed Craft deletion has no reason: ${file}`)
}

if (errors.length > 0) {
  console.error('Craft file-lineage review failed:')
  for (const error of errors) console.error(`- ${error}`)
  process.exit(1)
}

if (jsonOutput) {
  console.log(JSON.stringify({ summary, modified, mkOnly }, null, 2))
} else {
  console.log('MkAgent / Craft file-lineage audit')
  console.log(`Craft checkout: ${craftRoot}`)
  console.log(`MkAgent audited files: ${summary.mkagentFiles}`)
  console.log(`Same relative path in Craft: ${summary.commonPathFiles} (${(summary.commonPathRatio * 100).toFixed(1)}%)`)
  console.log(`Normalized-identical reuse: ${summary.normalizedIdenticalFiles} (${(summary.normalizedReuseRatio * 100).toFixed(1)}%)`)
  console.log(`Modified Craft-derived files: ${summary.intentionalOrModifiedFiles}`)
  console.log(`MkAgent-only audited files: ${summary.mkagentOnlyFiles}`)
  console.log(`Reviewed Craft-only file deletions: ${craftOnly.length}`)
}
