#!/usr/bin/env bun

/**
 * Guard the MkAgent renderer's Craft lineage.
 *
 * Files outside the Lite customization seams must remain byte-for-byte equal
 * after package/brand normalization. The guard also rejects reintroduction of
 * product surfaces intentionally removed from MkAgent.
 */

import { readFile, readdir } from 'node:fs/promises'
import { resolve } from 'node:path'

const repoRoot = resolve(import.meta.dir, '..')
const craftRoot = process.env.CRAFT_AGENT_SOURCE ?? resolve(repoRoot, '..', 'craft-agents-oss')
const rendererRoot = 'apps/electron/src/renderer'

const intentionalOverridePrefixes = [
  `${rendererRoot}/App.tsx`,
  `${rendererRoot}/atoms/`,
  `${rendererRoot}/context/`,
  `${rendererRoot}/contexts/`,
  `${rendererRoot}/event-processor/`,
  `${rendererRoot}/components/app-menu/`,
  `${rendererRoot}/components/app-shell/`,
  `${rendererRoot}/components/onboarding/`,
  `${rendererRoot}/components/workspace/`,
  `${rendererRoot}/hooks/`,
  `${rendererRoot}/pages/`,
  `${rendererRoot}/utils/session`,
  `${rendererRoot}/lib/mentions`,
  `${rendererRoot}/lib/nav-helpers`,
  `${rendererRoot}/lib/navigation-registry`,
]

const intentionalOverrideFiles = new Set([
  `${rendererRoot}/index.html`,
  `${rendererRoot}/components/SplashScreen.tsx`,
  `${rendererRoot}/components/ServerDirectoryBrowser.tsx`,
  `${rendererRoot}/components/browser/BrowserTabStrip.tsx`,
  `${rendererRoot}/components/apisetup/index.ts`,
  `${rendererRoot}/components/apisetup/ApiKeyInput.tsx`,
  `${rendererRoot}/components/chat/EmptyStateHint.tsx`,
  `${rendererRoot}/components/icons/SettingsIcons.tsx`,
  `${rendererRoot}/components/info/index.ts`,
  `${rendererRoot}/components/ui/EditPopover.tsx`,
  `${rendererRoot}/components/ui/mention-badge.tsx`,
  `${rendererRoot}/components/ui/mention-menu.tsx`,
  `${rendererRoot}/components/ui/rich-text-input.tsx`,
  `${rendererRoot}/lib/__tests__/mentions.test.ts`,
  `${rendererRoot}/lib/provider-icons.ts`,
  `${rendererRoot}/utils/__tests__/session-list-collapse.test.ts`,
  `${rendererRoot}/utils/auth-validation.ts`,
  `${rendererRoot}/utils/__tests__/auth-validation.test.ts`,
])

const allowedMkOnlyPrefixes = [
  `${rendererRoot}/assets/mkagent_`,
  `${rendererRoot}/components/icons/MkAgentAppIcon.tsx`,
]

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
let verifiedReuse = 0
let intentionalOverrides = 0

for (const file of mkFiles) {
  if (excludedPathFragments.some(fragment => file.includes(fragment)) || excludedFiles.some(name => file.endsWith(`/${name}`))) {
    errors.push(`excluded UI file is present: ${file}`)
    continue
  }

  const isOverride = intentionalOverrideFiles.has(file)
    || intentionalOverridePrefixes.some(prefix => file === prefix || file.startsWith(prefix))
  if (isOverride) intentionalOverrides += 1

  let source: string | null = null
  if (/\.(?:ts|tsx|js|jsx|html)$/.test(file)) {
    source = await readFile(resolve(repoRoot, file), 'utf8')
    for (const [pattern, feature] of forbiddenSourcePatterns) {
      if (pattern.test(source)) errors.push(`${feature} residue in ${file}`)
    }
  }

  if (!craftFileSet.has(file)) {
    if (!allowedMkOnlyPrefixes.some(prefix => file.startsWith(prefix))) {
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

if (errors.length > 0) {
  console.error('Craft Lite boundary check failed:')
  for (const error of errors) console.error(`- ${error}`)
  process.exit(1)
}

console.log(`Craft Lite boundary verified (${verifiedReuse} normalized-identical files, ${intentionalOverrides} registered overrides, ${mkFiles.length} renderer files total)`)
