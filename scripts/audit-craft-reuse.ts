#!/usr/bin/env bun

/** Quantify MkAgent source lineage against the sibling Craft checkout. */

import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { extname, resolve } from 'node:path'

const repoRoot = resolve(import.meta.dir, '..')
const craftRoot = process.env.CRAFT_AGENT_SOURCE ?? resolve(repoRoot, '..', 'craft-agents-oss')
const jsonOutput = process.argv.includes('--json')

const sourceExtensions = new Set([
  '.c', '.cc', '.cpp', '.css', '.h', '.html', '.java', '.js', '.json', '.jsx',
  '.kt', '.md', '.mjs', '.mts', '.py', '.rs', '.scss', '.sh', '.swift', '.toml',
  '.ts', '.tsx', '.yaml', '.yml',
])

function trackedFiles(root: string): string[] {
  const proc = Bun.spawnSync(['git', '-C', root, 'ls-files', '-z'], { stdout: 'pipe', stderr: 'pipe' })
  if (proc.exitCode !== 0) throw new Error(proc.stderr.toString())
  return proc.stdout.toString().split('\0').filter(Boolean)
}

const isSourceFile = (file: string) => sourceExtensions.has(extname(file).toLowerCase())
  && !file.includes('/dist/')
  && !file.includes('/node_modules/')
  && !file.endsWith('project-analysis.md')
  && !file.endsWith('project-analysis.html')

const normalizeCraft = (source: string) => source
  .replaceAll('@craft-agent/', '@mkagent/')
  .replaceAll('craftagents://', 'mkagent://')
  .replaceAll('.craft-agent', '.mkagent')
  .replaceAll('CRAFT_AGENT_', 'MKAGENT_')
  .replaceAll('Craft Agents Backend Compatible', 'Pi Backend Compatible')
  .replaceAll('Craft Agents Backend', 'Pi Backend')

const mkFiles = trackedFiles(repoRoot).filter(file => isSourceFile(file) && existsSync(resolve(repoRoot, file)))
const craftFiles = trackedFiles(craftRoot).filter(file => isSourceFile(file) && existsSync(resolve(craftRoot, file)))
const mkSet = new Set(mkFiles)
const craftSet = new Set(craftFiles)
const common = mkFiles.filter(file => craftSet.has(file))
const mkOnly = mkFiles.filter(file => !craftSet.has(file))
const craftOnly = craftFiles.filter(file => !mkSet.has(file))
const identical: string[] = []
const modified: string[] = []

for (const file of common) {
  const [craft, mkagent] = await Promise.all([
    readFile(resolve(craftRoot, file), 'utf8'),
    readFile(resolve(repoRoot, file), 'utf8'),
  ])
  if (normalizeCraft(craft) === mkagent) identical.push(file)
  else modified.push(file)
}

const summary = {
  craftRoot,
  mkagentSourceFiles: mkFiles.length,
  craftSourceFiles: craftFiles.length,
  commonPathFiles: common.length,
  normalizedIdenticalFiles: identical.length,
  intentionalOrModifiedFiles: modified.length,
  mkagentOnlyFiles: mkOnly.length,
  craftOnlyFiles: craftOnly.length,
  commonPathRatio: mkFiles.length === 0 ? 0 : common.length / mkFiles.length,
  normalizedReuseRatio: mkFiles.length === 0 ? 0 : identical.length / mkFiles.length,
}

if (jsonOutput) {
  console.log(JSON.stringify({ summary, modified, mkOnly }, null, 2))
} else {
  console.log('MkAgent / Craft source-lineage audit')
  console.log(`Craft checkout: ${craftRoot}`)
  console.log(`MkAgent source files: ${summary.mkagentSourceFiles}`)
  console.log(`Same relative path in Craft: ${summary.commonPathFiles} (${(summary.commonPathRatio * 100).toFixed(1)}%)`)
  console.log(`Normalized-identical reuse: ${summary.normalizedIdenticalFiles} (${(summary.normalizedReuseRatio * 100).toFixed(1)}%)`)
  console.log(`Modified Craft-derived files: ${summary.intentionalOrModifiedFiles}`)
  console.log(`MkAgent-only source files: ${summary.mkagentOnlyFiles}`)
}
