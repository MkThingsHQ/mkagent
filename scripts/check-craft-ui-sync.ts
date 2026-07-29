#!/usr/bin/env bun

/**
 * Verifies renderer files that are intentionally reused verbatim from Craft.
 *
 * Product adapters live outside this manifest. A manifest entry may only differ
 * by the workspace package scope (`@craft-agent` -> `@mkagent`). Keeping this
 * check explicit prevents copied UI primitives from silently drifting again.
 */

import { readFile, readdir } from 'node:fs/promises'
import { resolve } from 'node:path'

const repoRoot = resolve(import.meta.dir, '..')
const craftRoot = process.env.CRAFT_AGENT_SOURCE
  ?? resolve(repoRoot, '..', 'craft-agents-oss')

const rendererRoot = 'apps/electron/src/renderer'
const allowedOverrides = new Set([
  `${rendererRoot}/components/app-menu/DesktopAppMenu.tsx`,
  `${rendererRoot}/components/app-menu/MobileAppMenu.tsx`,
  `${rendererRoot}/components/app-shell/AppShell.tsx`,
  `${rendererRoot}/components/app-shell/input/FreeFormInput.tsx`,
  `${rendererRoot}/components/SplashScreen.tsx`,
  `${rendererRoot}/index.html`,
  `${rendererRoot}/pages/settings/SettingsNavigator.tsx`,
])

const productCopyReplacements = new Map<string, ReadonlyArray<readonly [string, string]>>([
  [`${rendererRoot}/pages/settings/AiSettingsPage.tsx`, [
    ['Craft Agents Backend Compatible', 'Pi Backend Compatible'],
    ['Craft Agents Backend', 'Pi Backend'],
  ]],
  [`${rendererRoot}/lib/provider-icons.ts`, [['Craft Agents Backend', 'Pi Backend']]],
  [`${rendererRoot}/components/apisetup/ApiKeyInput.tsx`, [['Craft Agents Backend', 'Pi Backend']]],
  [`${rendererRoot}/components/app-shell/input/model-picker-helpers.ts`, [['Craft Agents Backend', 'Pi Backend']]],
  [`${rendererRoot}/components/app-shell/input/__tests__/model-picker-helpers.test.ts`, [['Craft Agents Backend', 'Pi Backend']]],
  [`${rendererRoot}/hooks/useNotifications.ts`, [['Craft Agent has a new message for you', 'The agent has a new message for you']]],
  [`${rendererRoot}/playground.html`, [['Craft Agent', 'MkAgent']]],
  [`${rendererRoot}/components/workspace/AddWorkspaceStep_ConnectRemote.tsx`, [
    ['Connect to a remote Craft Agent Server for this workspace.', 'Connect to a remote agent server for this workspace.'],
  ]],
])

const normalizeUpstream = (file: string, source: string) => {
  let normalized = source
    .replaceAll('@craft-agent/', '@mkagent/')
    .replaceAll('craftagents://', 'mkagent://')
    .replaceAll('.craft-agent', '.mkagent')
  for (const [from, to] of productCopyReplacements.get(file) ?? []) {
    normalized = normalized.replaceAll(from, to)
  }
  return normalized
}

async function listFiles(dir: string): Promise<string[]> {
  const entries = await readdir(resolve(craftRoot, dir), { withFileTypes: true })
  const nested = await Promise.all(entries.map(async entry => {
    const path = `${dir}/${entry.name}`
    return entry.isDirectory() ? listFiles(path) : [path]
  }))
  return nested.flat()
}

const reusedFiles = (await listFiles(rendererRoot)).filter(file => !allowedOverrides.has(file))

const drifted: string[] = []
for (const file of reusedFiles) {
  const [craft, mkagent] = await Promise.all([
    readFile(resolve(craftRoot, file), 'utf8'),
    readFile(resolve(repoRoot, file), 'utf8'),
  ])
  if (normalizeUpstream(file, craft) !== mkagent) drifted.push(file)
}

if (drifted.length > 0) {
  console.error('Craft UI source drift detected:')
  for (const file of drifted) console.error(`- ${file}`)
  process.exit(1)
}

console.log(`Craft UI sync verified (${reusedFiles.length} files)`)
