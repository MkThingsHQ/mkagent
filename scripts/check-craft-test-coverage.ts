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
  { pattern: /^packages\/shared\/src\/agent\/__tests__\/subagent-model\.test\.ts$/, reason: 'Claude Agent/Task family aliases and custom .claude agents absent; actual Pi spawn model preservation covered by pi-usage-runtime.isolated.ts' },
  { pattern: /^apps\/electron\/src\/transport\/__tests__\/source\-oauth\.test\.ts$/, reason: "Sources OAuth client orchestration is absent; LLM login remains independent and browser website popup tests are retained." },
  { pattern: /^packages\/server\-core\/src\/handlers\/rpc\/oauth\.test\.ts$/, reason: "Generic Sources OAuth RPC is absent from Lite." },
  { pattern: /^packages\/server\-core\/src\/handlers\/rpc\/tasks\-generate\-wait\.test\.ts$/, reason: "Conductor subtask generation and activity timeout API are absent from Lite." },
  { pattern: /^packages\/server\-core\/src\/sessions\/auth\-request\-fanout\.test\.ts$/, reason: "Only Source OAuth pending-card fanout; Lite has no Source auth cards." },
  { pattern: /^packages\/server\-core\/src\/sources\/mcp\-source\-tool\-callbacks\.test\.ts$/, reason: "Source MCP resources/prompts callbacks are excluded." },
  { pattern: /^packages\/session\-tools\-core\/src\/handlers\/mcp\-sources\.test\.ts$/, reason: "Source MCP resources/prompts tools are excluded." },
  { pattern: /^packages\/session\-tools\-core\/src\/handlers\/project\-memory\.test\.ts$/, reason: "Projects and their shared memory tool are excluded." },
  { pattern: /^packages\/session\-tools\-core\/src\/handlers\/source\-oauth\.test\.ts$/, reason: "Source auth tool refresh-before-prompt is excluded; no Source credential manager exists." },
  { pattern: /^packages\/shared\/src\/agent\/__tests__\/pdf\-inline\.test\.ts$/, reason: "Claude Messages inline PDFs are excluded; Pi reads stored PDF paths." },
  { pattern: /^apps\/electron\/src\/renderer\/components\/app-shell\/(?:__tests__\/fit-labels|chat-header\/__tests__\/label-strip-layout)\.test\.ts$/, reason: 'v0.15 label-chip fitting tests exercise excluded user labels; Lite header and session actions remain retained' },
  { pattern: /^apps\/electron\/src\/renderer\/components\/ui\/__tests__\/source-connection-status\.test\.ts$/, reason: 'Source connection status UI is excluded with Sources/MCP' },
  { pattern: /^packages\/shared\/src\/agent\/__tests__\/text-completion-options\.test\.ts$/, reason: 'Tests Claude Agent SDK utility-call options; Pi utility sessions use an explicit empty tool allowlist and isolated resource-loader tests' },
  { pattern: /^packages\/(?:shared|server-core)\/src\/decisions\//, reason: 'Decision model explicitly deferred for the v0.14.1 Lite sync' },
  { pattern: /^packages\/(?:shared|server-core)\/src\/pages\//, reason: 'Pages and its source/action bridge are outside Lite' },
  { pattern: /^apps\/electron\/src\/(?:main\/__tests__\/page-thumbnail-host|shared\/(?:__tests__\/page-bridge|__tests__\/route-parser-pages))/, reason: 'Pages UI and thumbnail runtime removed' },
  { pattern: /^packages\/pi-agent-server\/src\/large-result-gate/, reason: 'Decision-model large-result gate deferred; existing summarization retained' },
  { pattern: /^packages\/server-core\/src\/sessions\/(?:attended-session|automation-loop-and-retry|automation-prompts|decision-lifecycle|turn-context)/, reason: 'Automation and decision-model lifecycle not included in Lite' },
  { pattern: /^packages\/session-tools-core\/src\/(?:api-auth|handlers\/(?:decide|pages))/, reason: 'Sources auth, Pages and decide tool are outside this sync' },
  { pattern: /^packages\/shared\/src\/agent\/(?:__tests__\/(?:base-agent-turn-context|guarded-permission-mode|pi-agent-guarded-mode|mcp-tool-names)|core\/__tests__\/guarded-mode)/, reason: 'Decision turn context, Guarded mode and external MCP runtime excluded' },
  { pattern: /^packages\/shared\/src\/utils\/(?:__tests__\/(?:large-result-filter|redaction)|redaction\.test)/, reason: 'Decision result filtering and removed source/Pages audit redaction helpers excluded' },

  { pattern: /^packages\/messaging-/, reason: 'external messaging removed' },
  { pattern: /^apps\/electron\/src\/renderer\/components\/app-shell\/(?:__tests__\/transfer-targets|kanban\/)/, reason: 'transfer/projects/kanban removed' },
  { pattern: /^apps\/electron\/src\/renderer\/components\/app-shell\/inherited-filter-params/, reason: 'labels and user status filters removed' },
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
  { pattern: /^packages\/shared\/src\/auth\//, reason: 'generic and Sources OAuth removed; retained LLM OAuth is covered by MkAgent tests' },
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
  'packages/shared/src/agent/__tests__/clamp-permission-mode.test.ts': 'packages/server-core/src/sessions/midstream-queue.test.ts',
  'packages/server-core/src/sessions/title-generation.isolated.ts': 'packages/pi-agent-server/src/mini-model-query.test.ts',

  'apps/electron/src/main/handlers/__tests__/registration.test.ts': 'apps/electron/src/main/handlers/__tests__/registration-profiles.test.ts',
  'apps/electron/src/shared/__tests__/ipc-channels.test.ts': 'apps/electron/src/transport/__tests__/channel-map-parity.test.ts',
  'packages/pi-agent-server/src/craft-metadata-schema.test.ts': 'packages/pi-agent-server/src/mkagent-metadata-schema.test.ts',
  'packages/shared/src/mentions/__tests__/resolve-skill-source-mentions.test.ts': 'packages/shared/src/mentions/__tests__/resolve-skill-mentions.test.ts',
  'packages/shared/tests/permissions-craft-agent-sync.test.ts': 'packages/shared/tests/permissions-mkagent-sync.test.ts',
}

const intentionalCaseReductions: Record<string, { upstream: number; retained: number; reason: string }> = {
  'apps/electron/src/renderer/hooks/__tests__/useSessionSearch.test.ts': { upstream: 9, retained: 6, reason: 'Four cases require excluded status/project metadata; retain unread independent windows and date pagination, with additional Lite unread collapse tests below.' },
  'packages/server-core/src/sessions/turn-usage.test.ts': { upstream: 9, retained: 3, reason: 'Retain Pi per-turn accumulation in the actual Lite manager; eight upstream Claude running-total/reset/fork-parent cases have no Pi backend state. Extra Lite occupancy and usage-free tests, and real SDK multi-call/turn/disk/restart/fork/child coverage in pi-usage-runtime.isolated.ts.' },
  "packages/server-core/src/sessions/session-completion.test.ts": { upstream: 9, retained: 2, reason: "Lite has no conductor completion listeners, activity subscriptions or workflow counting; cancelled turns, fallback abort and preservation of child sessions/background shells are tested, with real Pi Stop integration." },
  'apps/electron/src/renderer/components/app-shell/chat-display/__tests__/new-chat-suggestions.test.ts': { upstream: 13, retained: 7, reason: 'Source ranking/email setup and source enabling excluded with Sources; custom cap/label/prompt, qualified/unqualified/unknown Skill mentions, no-mention and automatic fallback covered' },
  'packages/shared/src/agent/__tests__/tool-matching.test.ts': { upstream: 62, retained: 61, reason: 'Sources MCP matching excluded; Lite tool matching retained' },
  "packages/session-tools-core/src/tool-defs-filtering.test.ts": { upstream: 16, retained: 14, reason: "Decide and Source resource schema cases are excluded; Coding allowlist and Pi schema/browser flags are retained, with Source/project conditional case asserting Lite absence." },
  'packages/server-core/src/sessions/pi-retry-streaming.test.ts': { upstream: 4, retained: 2, reason: 'Lite forwards unbatched deltas and has no upstream delta-flush timers; discard and recovered persistence covered' },
  'packages/server-core/src/sessions/midstream-queue.test.ts': { upstream: 12, retained: 7, reason: 'Decision routing and Claude queue lifecycle excluded; Lite queue, compaction, claims and spawn clamp covered' },
  'apps/cli/src/commands.test.ts': { upstream: 53, retained: 37, reason: 'Sources, automations, labels, webhooks, and their validation steps were removed' },
  'apps/cli/src/run.test.ts': { upstream: 12, retained: 9, reason: 'Source selection and the upstream validation harness were removed; retained run and workspace routing stay covered' },
  'apps/electron/src/main/__tests__/connection-setup-logic.test.ts': { upstream: 32, retained: 26, reason: 'Direct Anthropic, Bedrock, and Copilot setup were removed; retained LLM subscriptions are covered in server-core' },
  'apps/electron/src/main/__tests__/session-branch-rollback.isolated.ts': { upstream: 3, retained: 1, reason: 'Direct Anthropic rollback was removed; missing parent SDK context remains covered in session-branching-validation and Pi rollback remains isolated' },
  'apps/electron/src/main/__tests__/session-event-message-parity.test.ts': { upstream: 14, retained: 13, reason: 'Source authentication request messages were removed' },
  'apps/electron/src/main/__tests__/session-turn-grouping-parity.test.ts': { upstream: 8, retained: 7, reason: 'Source authentication request turns were removed' },
  'apps/electron/src/main/__tests__/sessions-sanitize.test.ts': { upstream: 37, retained: 35, reason: 'Source mention syntax was removed' },
  'apps/electron/src/renderer/atoms/__tests__/browser-pane.test.ts': { upstream: 7, retained: 5, reason: 'Remote workspace mirroring was removed' },
  'apps/electron/src/renderer/hooks/__tests__/useOnboarding.test.ts': { upstream: 16, retained: 7, reason: 'Direct Anthropic and Copilot methods were removed; Claude, ChatGPT, and Pi setup remain covered' },
  'apps/electron/src/renderer/lib/__tests__/mentions.test.ts': { upstream: 43, retained: 37, reason: 'Source mentions were removed; Skill and file mentions remain covered' },
  'apps/electron/src/renderer/utils/__tests__/session-list-collapse.test.ts': { upstream: 4, retained: 3, reason: 'Removed id-based product filters no longer have collapse keys' },
  'packages/pi-agent-server/src/tools/search/resolve-provider.test.ts': { upstream: 13, retained: 5, reason: 'ChatGPT subscription search and OAuth credential variants were removed' },
  'packages/server-core/src/domain/connection-setup-logic.test.ts': { upstream: 24, retained: 23, reason: 'Direct Claude/Copilot provider setup excluded; masked-key regressions retained' },
  'packages/server-core/src/sessions/background-task-surface.test.ts': { upstream: 9, retained: 4, reason: 'Claude SDK ownership and automation/task notices excluded; retained Pi task surface covered' },
  'packages/server-core/src/sessions/cold-session-metadata.test.ts': { upstream: 6, retained: 3, reason: 'Statuses and labels were removed; retained rename, flag, and cold sidebar metadata are covered' },
  'packages/shared/src/agent/__tests__/base-agent.test.ts': { upstream: 34, retained: 19, reason: 'Source managers, Claude prompt builders, and direct backend callbacks were removed' },
  'packages/shared/src/agent/__tests__/conversation-summary.test.ts': { upstream: 4, retained: 3, reason: 'Cross-workspace transferred-session context was removed' },
  "packages/shared/src/agent/__tests__/session-self-management-bindings.test.ts": { upstream: 12, retained: 7, reason: "Status/label mutation, MCP resources and project append bindings are excluded." },
  'packages/shared/src/agent/backend/__tests__/factory.test.ts': { upstream: 39, retained: 17, reason: 'Claude SDK, Copilot, and unsupported auth combinations were removed; Pi OAuth routing remains covered' },
  'packages/shared/src/agent/backend/__tests__/runtime-resolver.test.ts': { upstream: 10, retained: 8, reason: 'Claude native binary resolution was removed' },
  "packages/shared/src/agent/core/__tests__/pre-tool-use-checks.isolated.ts": { upstream: 83, retained: 20, reason: "Sources, Pages and Guarded cases excluded; retained Browser/Skill shell prerequisite pipeline and permission mode ordering tested." },
  "packages/shared/src/agent/core/__tests__/prerequisite-manager.isolated.ts": { upstream: 43, retained: 26, reason: "Source guide/API rule cases excluded; all new shell parsing cases for Browser/Skill are retained with injectable configuration instead of global fs mocks." },
  'packages/shared/src/config/__tests__/llm-connections.test.ts': { upstream: 76, retained: 20, reason: 'Direct Claude and Copilot catalogs excluded; Pi 0.87 models covered by shared models and mini-model tests' },
  'packages/shared/src/config/__tests__/midstream-behavior.test.ts': { upstream: 11, retained: 10, reason: 'Direct Anthropic queue behavior was removed' },
  'packages/shared/src/config/__tests__/model-supports-images.test.ts': { upstream: 8, retained: 7, reason: 'Direct Anthropic catalog behavior was removed' },
  'packages/shared/src/i18n/__tests__/locale-registry.test.ts': { upstream: 15, retained: 11, reason: 'Lite intentionally ships only English and Simplified Chinese' },
  "packages/shared/src/prompts/__tests__/system.test.ts": { upstream: 32, retained: 15, reason: "Project memory append and Source MCP instructions excluded; all six Coding prompt cases retained with Lite signature, branding and three permission modes; Git/developer context covered separately." },
  'packages/shared/src/skills/__tests__/storage.test.ts': { upstream: 33, retained: 30, reason: 'Skill requiredSources metadata was removed with Sources' },
  'packages/shared/tests/content-validators.test.ts': { upstream: 41, retained: 15, reason: 'Source and status validators were removed; retained Skills and permissions validators remain covered' },
  'packages/shared/tests/mode-manager.test.ts': { upstream: 176, retained: 174, reason: 'External MCP pattern and source policy cases excluded; retained Bash restrictions covered by pi-permission-sync' },
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
