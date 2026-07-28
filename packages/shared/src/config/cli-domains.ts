export type CliDomainNamespace = 'label' | 'source' | 'skill' | 'automation' | 'permission' | 'theme'

export interface CliDomainPolicy {
  namespace: CliDomainNamespace
  helpCommand: string
  workspacePathScopes: string[]
  readActions: string[]
  quickExamples: string[]
  /** Optional workspace-relative paths guarded for direct Bash operations */
  bashGuardPaths?: string[]
}

const POLICIES: Record<CliDomainNamespace, CliDomainPolicy> = {
  label: {
    namespace: 'label',
    helpCommand: 'mkagent label --help',
    workspacePathScopes: ['labels/**'],
    readActions: ['list', 'get', 'auto-rule-list', 'auto-rule-validate'],
    quickExamples: [
      'mkagent label list',
      'mkagent label create --name "Bug" --color "accent"',
      'mkagent label update bug --json \'{"name":"Bug Report"}\'',
    ],
    bashGuardPaths: ['labels/**'],
  },
  source: {
    namespace: 'source',
    helpCommand: 'mkagent source --help',
    workspacePathScopes: ['sources/**'],
    readActions: ['list', 'get', 'validate', 'test', 'auth-help'],
    quickExamples: [
      'mkagent source list',
      'mkagent source get <slug>',
      'mkagent source update <slug> --json "{...}"',
      'mkagent source validate <slug>',
    ],
  },
  skill: {
    namespace: 'skill',
    helpCommand: 'mkagent skill --help',
    workspacePathScopes: ['skills/**'],
    readActions: ['list', 'get', 'validate', 'where'],
    quickExamples: [
      'mkagent skill list',
      'mkagent skill get <slug>',
      'mkagent skill update <slug> --json "{...}"',
      'mkagent skill validate <slug>',
    ],
  },
  automation: {
    namespace: 'automation',
    helpCommand: 'mkagent automation --help',
    workspacePathScopes: ['automations.json', 'automations-history.jsonl'],
    readActions: ['list', 'get', 'validate', 'history', 'last-executed', 'test', 'lint'],
    quickExamples: [
      'mkagent automation list',
      'mkagent automation create --event UserPromptSubmit --prompt "Summarize this prompt"',
      'mkagent automation update <id> --json "{\"enabled\":false}"',
      'mkagent automation history <id> --limit 20',
      'mkagent automation validate',
    ],
    bashGuardPaths: ['automations.json', 'automations-history.jsonl'],
  },
  permission: {
    namespace: 'permission',
    helpCommand: 'mkagent permission --help',
    workspacePathScopes: ['permissions.json', 'sources/*/permissions.json'],
    readActions: ['list', 'get', 'validate'],
    quickExamples: [
      'mkagent permission list',
      'mkagent permission get --source linear',
      'mkagent permission add-mcp-pattern "list" --comment "All list ops" --source linear',
      'mkagent permission validate',
    ],
    bashGuardPaths: ['permissions.json', 'sources/*/permissions.json'],
  },
  theme: {
    namespace: 'theme',
    helpCommand: 'mkagent theme --help',
    workspacePathScopes: ['config.json', 'theme.json', 'themes/*.json'],
    readActions: ['get', 'validate', 'list-presets', 'get-preset'],
    quickExamples: [
      'mkagent theme get',
      'mkagent theme list-presets',
      'mkagent theme set-color-theme nord',
      'mkagent theme set-workspace-color-theme default',
      'mkagent theme set-override --json "{\"accent\":\"#3b82f6\"}"',
    ],
    bashGuardPaths: ['config.json', 'theme.json', 'themes/*.json'],
  },
}

export const CLI_DOMAIN_POLICIES = POLICIES

export interface CliDomainScopeEntry {
  namespace: CliDomainNamespace
  scope: string
}

function dedupeScopes(scopes: string[]): string[] {
  return [...new Set(scopes)]
}

/**
 * Canonical workspace-relative path scopes owned by mkagent CLI domains.
 * Use these for file-path ownership checks to avoid drift across call sites.
 */
export const MKAGENT_AGENTS_CLI_OWNED_WORKSPACE_PATH_SCOPES = dedupeScopes(
  Object.values(POLICIES).flatMap(policy => policy.workspacePathScopes)
)

/**
 * Canonical workspace-relative path scopes guarded for direct Bash operations.
 */
export const MKAGENT_AGENTS_CLI_OWNED_BASH_GUARD_PATH_SCOPES = dedupeScopes(
  Object.values(POLICIES).flatMap(policy => policy.bashGuardPaths ?? [])
)

/**
 * Namespace-aware workspace scope entries for mkagent CLI owned paths.
 */
export const MKAGENT_AGENTS_CLI_WORKSPACE_SCOPE_ENTRIES: CliDomainScopeEntry[] = Object.values(POLICIES)
  .flatMap(policy => policy.workspacePathScopes.map(scope => ({ namespace: policy.namespace, scope })))

/**
 * Namespace-aware Bash guard scope entries.
 */
export const MKAGENT_AGENTS_CLI_BASH_GUARD_SCOPE_ENTRIES: CliDomainScopeEntry[] = Object.values(POLICIES)
  .flatMap(policy => (policy.bashGuardPaths ?? []).map(scope => ({ namespace: policy.namespace, scope })))

export interface BashPatternRule {
  pattern: string
  comment: string
}

/**
 * Derive the canonical Explore-mode read-only mkagent bash patterns from
 * CLI domain policies. Keeps permissions regexes aligned with command metadata.
 */
export function getCraftAgentReadOnlyBashPatterns(): BashPatternRule[] {
  const namespaces = Object.keys(POLICIES) as CliDomainNamespace[]
  const namespaceAlternation = namespaces.join('|')

  const rules: BashPatternRule[] = namespaces.map((namespace) => {
    const policy = POLICIES[namespace]
    const actions = policy.readActions.join('|')
    return {
      pattern: `^mkagent\\s+${namespace}\\s+(${actions})\\b`,
      comment: `mkagent ${namespace} read-only operations`,
    }
  })

  rules.push(
    { pattern: '^mkagent\\s*$', comment: 'mkagent bare invocation (prints help)' },
    { pattern: `^mkagent\\s+(${namespaceAlternation})\\s*$`, comment: 'mkagent entity help' },
    { pattern: `^mkagent\\s+(${namespaceAlternation})\\s+--help\\b`, comment: 'mkagent entity help flags' },
    { pattern: '^mkagent\\s+--(help|version|discover)\\b', comment: 'mkagent global flags' },
  )

  return rules
}

export function getCliDomainPolicy(namespace: CliDomainNamespace): CliDomainPolicy {
  return POLICIES[namespace]
}
