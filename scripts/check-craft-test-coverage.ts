#!/usr/bin/env bun

/** Ensure every Craft test is either present/adapted or belongs to a deleted feature. */
import { existsSync } from 'node:fs'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const repoRoot = resolve(import.meta.dir, '..')
const craftRoot = process.env.CRAFT_AGENT_SOURCE
  ?? [
    resolve(repoRoot, '..', 'craft-agents-oss'),
    resolve(repoRoot, '..', '..', 'agents', 'craft-agents-oss'),
  ].find(candidate => existsSync(candidate))
  ?? resolve(repoRoot, '..', 'craft-agents-oss')

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
  'apps/electron/src/main/handlers/__tests__/registration.test.ts': 'apps/electron/src/main/handlers/__tests__/registration-profiles.test.ts',
  'apps/electron/src/shared/__tests__/ipc-channels.test.ts': 'apps/electron/src/transport/__tests__/channel-map-parity.test.ts',
  'packages/pi-agent-server/src/craft-metadata-schema.test.ts': 'packages/pi-agent-server/src/mkagent-metadata-schema.test.ts',
  'packages/shared/src/mentions/__tests__/resolve-skill-source-mentions.test.ts': 'packages/shared/src/mentions/__tests__/resolve-skill-mentions.test.ts',
  'packages/shared/tests/permissions-craft-agent-sync.test.ts': 'packages/shared/tests/permissions-mkagent-sync.test.ts',
}

const intentionalCaseReductions: Record<string, { upstream: number; retained: number; reason: string }> = {
  'apps/cli/src/commands.test.ts': { upstream: 52, retained: 36, reason: 'Sources, automations, labels, webhooks, and their validation steps were removed' },
  'apps/cli/src/run.test.ts': { upstream: 12, retained: 9, reason: 'Source selection and the upstream validation harness were removed; retained run and workspace routing stay covered' },
  'apps/electron/src/main/__tests__/connection-setup-logic.test.ts': { upstream: 32, retained: 26, reason: 'Claude OAuth and direct Anthropic backend setup were removed' },
  'apps/electron/src/main/__tests__/session-branch-rollback.isolated.ts': { upstream: 3, retained: 1, reason: 'Direct Anthropic rollback was removed; missing parent SDK context remains covered in session-branching-validation and Pi rollback remains isolated' },
  'apps/electron/src/main/__tests__/session-event-message-parity.test.ts': { upstream: 14, retained: 13, reason: 'Source authentication request messages were removed' },
  'apps/electron/src/main/__tests__/session-turn-grouping-parity.test.ts': { upstream: 8, retained: 7, reason: 'Source authentication request turns were removed' },
  'apps/electron/src/main/__tests__/sessions-sanitize.test.ts': { upstream: 37, retained: 35, reason: 'Source mention syntax was removed' },
  'apps/electron/src/renderer/atoms/__tests__/browser-pane.test.ts': { upstream: 7, retained: 5, reason: 'Remote workspace mirroring was removed' },
  'apps/electron/src/renderer/hooks/__tests__/useOnboarding.test.ts': { upstream: 16, retained: 4, reason: 'Claude, ChatGPT, and Copilot OAuth onboarding methods were removed' },
  'apps/electron/src/renderer/lib/__tests__/mentions.test.ts': { upstream: 43, retained: 37, reason: 'Source mentions were removed; Skill and file mentions remain covered' },
  'apps/electron/src/renderer/utils/__tests__/session-list-collapse.test.ts': { upstream: 4, retained: 3, reason: 'Removed id-based product filters no longer have collapse keys' },
  'packages/pi-agent-server/src/model-resolution.test.ts': { upstream: 23, retained: 20, reason: 'ChatGPT account OAuth model restrictions were removed' },
  'packages/pi-agent-server/src/tools/search/resolve-provider.test.ts': { upstream: 13, retained: 5, reason: 'ChatGPT subscription search and OAuth credential variants were removed' },
  'packages/server-core/src/domain/connection-setup-logic.test.ts': { upstream: 16, retained: 12, reason: 'Direct Anthropic and Claude OAuth connection modes were removed' },
  'packages/server-core/src/sessions/background-task-surface.test.ts': { upstream: 5, retained: 4, reason: 'Lite always keeps retained background tasks alive' },
  'packages/server-core/src/sessions/cold-session-metadata.test.ts': { upstream: 6, retained: 3, reason: 'Statuses and labels were removed; retained rename, flag, and cold sidebar metadata are covered' },
  'packages/shared/src/agent/__tests__/base-agent.test.ts': { upstream: 34, retained: 19, reason: 'Source managers, Claude prompt builders, and direct backend callbacks were removed' },
  'packages/shared/src/agent/__tests__/conversation-summary.test.ts': { upstream: 4, retained: 3, reason: 'Cross-workspace transferred-session context was removed' },
  'packages/shared/src/agent/__tests__/pi-event-adapter.test.ts': { upstream: 62, retained: 61, reason: 'Craft-only Pi turn anchor event was removed' },
  'packages/shared/src/agent/__tests__/pi-query-llm.test.ts': { upstream: 5, retained: 4, reason: 'OAuth token refresh behavior was removed' },
  'packages/shared/src/agent/__tests__/session-self-management-bindings.test.ts': { upstream: 10, retained: 7, reason: 'Status and label mutation bindings were removed' },
  'packages/shared/src/agent/backend/__tests__/factory.test.ts': { upstream: 38, retained: 15, reason: 'Claude backend and OAuth auth combinations were removed; Pi registry and model resolution remain covered' },
  'packages/shared/src/agent/backend/__tests__/runtime-resolver.test.ts': { upstream: 10, retained: 8, reason: 'Claude native binary resolution was removed' },
  'packages/shared/src/agent/core/__tests__/pre-tool-use-checks.isolated.ts': { upstream: 70, retained: 18, reason: 'Sources, labels, automations, and their MCP/API guards were removed; retained permission pipeline is covered' },
  'packages/shared/src/agent/core/__tests__/prerequisite-manager.isolated.ts': { upstream: 34, retained: 13, reason: 'Source guide prerequisites were removed; Browser and Skill prerequisites remain covered' },
  'packages/shared/src/config/__tests__/llm-connections.test.ts': { upstream: 52, retained: 13, reason: 'Direct Anthropic and Bedrock model catalogs were removed; retained Pi connection helpers are covered' },
  'packages/shared/src/config/__tests__/midstream-behavior.test.ts': { upstream: 11, retained: 10, reason: 'Direct Anthropic queue behavior was removed' },
  'packages/shared/src/config/__tests__/model-supports-images.test.ts': { upstream: 8, retained: 7, reason: 'Direct Anthropic catalog behavior was removed' },
  'packages/shared/src/config/__tests__/storage-update-llm-connection.test.ts': { upstream: 5, retained: 3, reason: 'Claude OAuth identity fields were removed' },
  'packages/shared/src/i18n/__tests__/locale-registry.test.ts': { upstream: 15, retained: 11, reason: 'Lite intentionally ships only English and Simplified Chinese' },
  'packages/shared/src/prompts/__tests__/system.test.ts': { upstream: 16, retained: 8, reason: 'Projects and project asset manifests were removed; retained prompt and git guidance remain covered' },
  'packages/shared/src/skills/__tests__/storage.test.ts': { upstream: 33, retained: 30, reason: 'Skill requiredSources metadata was removed with Sources' },
  'packages/shared/tests/content-validators.test.ts': { upstream: 41, retained: 15, reason: 'Source and status validators were removed; retained Skills and permissions validators remain covered' },
  'packages/shared/tests/llm-connections.test.ts': { upstream: 20, retained: 16, reason: 'ChatGPT account codex-mini restrictions were removed' },
  'packages/shared/tests/mode-manager.test.ts': { upstream: 175, retained: 174, reason: 'Source MCP read-only patterns were removed' },
}

function countTestCases(path: string): number {
  const source = readFileSync(path, 'utf8')
  return [...source.matchAll(/\b(?:it|test)(?:\.(?:skip|todo|only))?\s*\(\s*(["'`])(?:\\.|(?!\1)[\s\S])*?\1/g)].length
}

const craftTests = trackedFiles(craftRoot).filter(isTestFile)
const missing: string[] = []
const caseErrors: string[] = []
const excluded: Array<{ file: string; reason: string }> = []
const replaced: Array<{ file: string; replacement: string }> = []

for (const file of craftTests) {
  if (existsSync(resolve(repoRoot, file))) {
    const upstreamCases = countTestCases(resolve(craftRoot, file))
    const currentCases = countTestCases(resolve(repoRoot, file))
    if (currentCases < upstreamCases) {
      const reduction = intentionalCaseReductions[file]
      if (!reduction) {
        caseErrors.push(`${file}: ${upstreamCases} -> ${currentCases} cases without a reviewed reduction`)
      } else if (reduction.upstream !== upstreamCases || currentCases !== reduction.retained) {
        caseErrors.push(`${file}: expected ${reduction.upstream} upstream and exactly ${reduction.retained} reviewed retained cases, found ${upstreamCases} and ${currentCases}`)
      }
    }
    continue
  }
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

if (missing.length || caseErrors.length) {
  console.error('\nCraft tests missing without an approved deleted-feature reason:')
  for (const file of missing) console.error(`- ${file}`)
  if (caseErrors.length) {
    console.error('\nCraft tests with unreviewed or excessive case reductions:')
    for (const error of caseErrors) console.error(`- ${error}`)
  }
  process.exit(1)
}

console.log(`Reviewed same-path case reductions: ${Object.keys(intentionalCaseReductions).length}`)
console.log('Craft retained-test coverage: OK')
