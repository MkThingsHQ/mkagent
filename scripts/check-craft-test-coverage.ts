#!/usr/bin/env bun

/** Ensure every Craft test is either present/adapted or belongs to a deleted feature. */
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

const repoRoot = resolve(import.meta.dir, '..')
const craftRoot = process.env.CRAFT_AGENT_SOURCE ?? resolve(repoRoot, '..', 'craft-agents-oss')

function trackedFiles(root: string): string[] {
  const result = Bun.spawnSync(['git', '-C', root, 'ls-files', '-z'], { stdout: 'pipe', stderr: 'pipe' })
  if (result.exitCode !== 0) throw new Error(result.stderr.toString())
  return result.stdout.toString().split('\0').filter(Boolean)
}

function isTestFile(file: string): boolean {
  return /\.(?:test|spec)\.(?:ts|tsx|js|jsx)$/.test(file) || file.endsWith('.isolated.ts')
}

const deletedFeaturePatterns: Array<{ pattern: RegExp; reason: string }> = [
  { pattern: /^packages\/messaging-/, reason: 'external messaging removed' },
  { pattern: /^apps\/electron\/src\/renderer\/components\/app-shell\/(?:__tests__\/transfer-targets|kanban\/)/, reason: 'transfer/projects/kanban removed' },
  { pattern: /^apps\/electron\/src\/renderer\/components\/automations\//, reason: 'product automations removed' },
  { pattern: /^apps\/electron\/src\/renderer\/components\/ui\/__tests__\/(?:label-menu|status-icon)/, reason: 'labels and user status removed' },
  { pattern: /^apps\/electron\/src\/renderer\/utils\/__tests__\/auth-validation/, reason: 'Sources OAuth credential UI removed' },
  { pattern: /^apps\/electron\/src\/renderer\/config\/__tests__\/session-status-config/, reason: 'user status removed' },
  { pattern: /^apps\/electron\/src\/renderer\/playground\//, reason: 'playground removed' },
  { pattern: /^apps\/electron\/src\/shared\/__tests__\/route-parser-(?:automations|label-filter)/, reason: 'removed routes' },
  { pattern: /^apps\/electron\/src\/transport\/__tests__\/routed-client/, reason: 'remote workspace routing removed' },
  { pattern: /^packages\/pi-agent-server\/src\/tools\/search\/providers\/chatgpt/, reason: 'ChatGPT subscription search removed' },
  { pattern: /^packages\/server-core\/src\/handlers\/rpc\/transfer/, reason: 'session transfer removed' },
  { pattern: /^packages\/server-core\/src\/sessions\/(?:adopt-task-draft|execute-prompt-automation-test-mode|sendmessage-oauth-refresh|source-activated-auto-retry)/, reason: 'tasks, automations, OAuth, and sources removed' },
  { pattern: /^packages\/server-core\/src\/tasks\//, reason: 'projects/tasks conductor removed' },
  { pattern: /^packages\/server-core\/src\/webui\/__tests__\/oauth-callback/, reason: 'OAuth removed' },
  { pattern: /^packages\/session-tools-core\/src\/handlers\/(?:create-task|set-session-status|source-test)/, reason: 'tasks, user status, and sources removed' },
  { pattern: /^packages\/shared\/src\/agent\/__tests__\/(?:base-agent-source-activation|claude-|credential-prompt-detection|json-prop-to-zod|permissions-config-craft-cli-flag|pi-agent-bedrock-env|pi-agent-pretool-labels|query-llm-partial-output|source-activation-drain|source-state)/, reason: 'Claude, sources, labels, or unsupported IAM auth removed' },
  { pattern: /^packages\/shared\/src\/agent\/backend\/claude\//, reason: 'Claude backend removed' },
  { pattern: /^packages\/shared\/src\/agent\/backend\/internal\/drivers\/anthropic/, reason: 'direct Anthropic backend removed; Pi provider retained' },
  { pattern: /^packages\/shared\/src\/agent\/core\/__tests__\/source-manager/, reason: 'sources removed' },
  { pattern: /^packages\/shared\/src\/auth\//, reason: 'subscription and OAuth removed' },
  { pattern: /^packages\/shared\/src\/automations\//, reason: 'product automations removed' },
  { pattern: /^packages\/shared\/src\/config\/__tests__\/(?:llm-connections-auth-env|storage-migrations|storage-startup-migration)/, reason: 'Claude auth and OAuth migration removed; new data root has no legacy migration' },
  { pattern: /^packages\/shared\/src\/labels\//, reason: 'labels removed' },
  { pattern: /^packages\/shared\/src\/mcp\//, reason: 'Source MCP removed' },
  { pattern: /^packages\/shared\/src\/projects\//, reason: 'projects removed' },
  { pattern: /^packages\/shared\/src\/resources\//, reason: 'source/automation resource bundle removed; session and Skill paths remain separate' },
  { pattern: /^packages\/shared\/src\/sources\//, reason: 'sources removed' },
  { pattern: /^packages\/shared\/src\/tasks\//, reason: 'tasks conductor removed' },
  { pattern: /^packages\/shared\/tests\/mcp-pool/, reason: 'Source MCP pool removed' },
]

const replacements: Record<string, string> = {
  'apps/electron/src/main/__tests__/session-branch-rollback.isolated.ts': 'apps/electron/src/main/__tests__/session-branching-validation.test.ts',
  'apps/electron/src/main/handlers/__tests__/registration.test.ts': 'apps/electron/src/main/handlers/__tests__/registration-profiles.test.ts',
  'apps/electron/src/shared/__tests__/ipc-channels.test.ts': 'apps/electron/src/transport/__tests__/channel-map-parity.test.ts',
  'packages/pi-agent-server/src/craft-metadata-schema.test.ts': 'packages/pi-agent-server/src/mkagent-metadata-schema.test.ts',
  'packages/shared/src/mentions/__tests__/resolve-skill-source-mentions.test.ts': 'packages/shared/src/mentions/__tests__/resolve-skill-mentions.test.ts',
  'packages/shared/tests/permissions-craft-agent-sync.test.ts': 'packages/shared/tests/permissions-mkagent-sync.test.ts',
}

const craftTests = trackedFiles(craftRoot).filter(isTestFile)
const missing: string[] = []
const excluded: Array<{ file: string; reason: string }> = []
const replaced: Array<{ file: string; replacement: string }> = []

for (const file of craftTests) {
  if (existsSync(resolve(repoRoot, file))) continue
  const replacement = replacements[file]
  if (replacement && existsSync(resolve(repoRoot, replacement))) {
    replaced.push({ file, replacement })
    continue
  }
  const deletion = deletedFeaturePatterns.find(entry => entry.pattern.test(file))
  if (deletion) {
    excluded.push({ file, reason: deletion.reason })
    continue
  }
  missing.push(file)
}

console.log(`Craft tests: ${craftTests.length}`)
console.log(`Present at the same path: ${craftTests.length - excluded.length - replaced.length - missing.length}`)
console.log(`Brand/cut-down replacements: ${replaced.length}`)
console.log(`Excluded with deleted features: ${excluded.length}`)

if (missing.length) {
  console.error('\nCraft tests missing without an approved deleted-feature reason:')
  for (const file of missing) console.error(`- ${file}`)
  process.exit(1)
}

console.log('Craft retained-test coverage: OK')
