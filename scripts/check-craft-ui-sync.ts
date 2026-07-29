#!/usr/bin/env bun

/**
 * Guard the MkAgent renderer's Craft lineage.
 *
 * Files outside the Lite customization seams must remain byte-for-byte equal
 * after package/brand normalization. The guard also rejects reintroduction of
 * product surfaces intentionally removed from MkAgent.
 */

import { readFile, readdir } from 'node:fs/promises'
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
const rendererRoot = 'apps/electron/src/renderer'
const manifest = JSON.parse(
  await readFile(resolve(import.meta.dir, 'craft-ui-overrides.json'), 'utf8'),
) as { version: number; files: Record<string, { sha256: string; reason: string }> }
if (manifest.version !== 2) throw new Error(`Unsupported Craft UI override manifest version: ${manifest.version}`)
const intentionalOverrideFiles = new Set(Object.keys(manifest.files))

const excludedPathFragments = [
  '/automations/',
  '/messaging/',
  '/projects/',
  '/kanban/',
  '/sources/',
  '/playground/',
]

const excludedFiles = [
  'WorkspacePicker.tsx',
  'AddWorkspaceStep_ConnectRemote.tsx',
  'AuthRequestCard.tsx',
  'craft-renderer-compat.ts',
  'playground.html',
]

const forbiddenSourcePatterns: Array<[RegExp, string]> = [
  [/\bperformOAuth\b/, 'Sources/MCP OAuth'],
  [/\bgetServerWorkspaces\b|\bcreateServerWorkspace\b/, 'remote workspace picker'],
  [/\bremoteServer\b/, 'remote workspace binding'],
  [/\b(?:sources_changed|labels_changed|project_id_changed|session_status_changed|session_shared|source_activated)\b/, 'excluded session metadata event'],
  [/@mkagent\/shared\/(?:labels|projects|sources|statuses|views)/, 'excluded shared feature module'],
  [/\b(?:onAddAutomation|onAddSource|onAddProject|onConfigureStatuses|onConfigureLabels|automationSelection|sourceSelection|sourceSlug)\b/, 'excluded product callback or state'],
  [/getDocUrl\(['"](?:sources|statuses|automations|messaging)['"]\)/, 'excluded product documentation link'],
  [/\b(?:loadSourceIcon|getSourceIconSync|sourceIconCache)\b/, 'excluded Source icon runtime'],
]

const normalizeUpstream = (source: string) => source
  .replaceAll('@craft-agent/', '@mkagent/')
  .replaceAll('craftagents://', 'mkagent://')
  .replaceAll('.craft-agent', '.mkagent')
  .replaceAll('Craft Agents Backend Compatible', 'Pi Backend Compatible')
  .replaceAll('Craft Agents Backend', 'Pi Backend')

async function listFiles(base: string, dir: string): Promise<string[]> {
  const entries = await readdir(resolve(base, dir), { withFileTypes: true })
  const nested = await Promise.all(entries.map(async entry => {
    const path = `${dir}/${entry.name}`
    return entry.isDirectory() ? listFiles(base, path) : [path]
  }))
  return nested.flat()
}

const [mkFiles, craftFiles] = await Promise.all([
  listFiles(repoRoot, rendererRoot),
  listFiles(craftRoot, rendererRoot),
])
const craftFileSet = new Set(craftFiles)
const errors: string[] = []
const seenOverrides = new Set<string>()
let verifiedReuse = 0
let intentionalOverrides = 0

for (const file of mkFiles) {
  if (excludedPathFragments.some(fragment => file.includes(fragment)) || excludedFiles.some(name => file.endsWith(`/${name}`))) {
    errors.push(`excluded UI file is present: ${file}`)
    continue
  }

  const isOverride = intentionalOverrideFiles.has(file)
  if (isOverride) {
    intentionalOverrides += 1
    seenOverrides.add(file)
    const bytes = await readFile(resolve(repoRoot, file))
    const hash = createHash('sha256').update(bytes).digest('hex')
    const review = manifest.files[file]
    if (!review?.reason.trim()) errors.push(`reviewed UI override has no reason: ${file}`)
    if (hash !== review?.sha256) errors.push(`reviewed UI override changed without manifest update: ${file}`)
  }

  let source: string | null = null
  if (/\.(?:ts|tsx|js|jsx|html)$/.test(file)) {
    source = await readFile(resolve(repoRoot, file), 'utf8')
    for (const [pattern, feature] of forbiddenSourcePatterns) {
      if (pattern.test(source)) errors.push(`${feature} residue in ${file}`)
    }
  }

  if (!craftFileSet.has(file)) {
    if (!isOverride) {
      errors.push(`unregistered MkAgent-only renderer file: ${file}`)
    }
    continue
  }

  if (isOverride) continue
  const craftSource = await readFile(resolve(craftRoot, file), 'utf8')
  const mkSource = source ?? await readFile(resolve(repoRoot, file), 'utf8')
  if (normalizeUpstream(craftSource) !== mkSource) {
    errors.push(`unexpected Craft source drift: ${file}`)
  } else {
    verifiedReuse += 1
  }
}

for (const file of intentionalOverrideFiles) {
  if (!seenOverrides.has(file)) errors.push(`stale or missing reviewed UI override: ${file}`)
}

if (errors.length > 0) {
  console.error('Craft Lite boundary check failed:')
  for (const error of errors) console.error(`- ${error}`)
  process.exit(1)
}

console.log(`Craft Lite boundary verified (${verifiedReuse} normalized-identical files, ${intentionalOverrides} registered overrides, ${mkFiles.length} renderer files total)`)
