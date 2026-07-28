export type CliDomainNamespace = 'workspace' | 'session' | 'connections' | 'config'

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
  workspace: {
    namespace: 'workspace',
    helpCommand: 'mkagent --help',
    workspacePathScopes: [],
    readActions: ['list'],
    quickExamples: ['mkagent workspace list'],
  },
  session: {
    namespace: 'session',
    helpCommand: 'mkagent --help',
    workspacePathScopes: [],
    readActions: ['list', 'messages'],
    quickExamples: ['mkagent session list', 'mkagent session messages <id>'],
  },
  connections: {
    namespace: 'connections',
    helpCommand: 'mkagent --help',
    workspacePathScopes: [],
    readActions: ['list'],
    quickExamples: ['mkagent connections list'],
  },
  config: {
    namespace: 'config',
    helpCommand: 'mkagent --help',
    workspacePathScopes: [],
    readActions: ['validate'],
    quickExamples: ['mkagent config validate'],
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
export function getMkAgentReadOnlyBashPatterns(): BashPatternRule[] {
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
