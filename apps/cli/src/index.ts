#!/usr/bin/env bun
/** Terminal client for the MkAgent headless server. */

import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { RPC_CHANNELS, type SessionEvent } from '@mkagent/shared/protocol'
import { CliRpcClient } from './client.ts'
import { spawnServer, type SpawnedServer } from './server-spawner.ts'

export interface CliArgs {
  url: string
  token: string
  workspace?: string
  timeout: number
  json: boolean
  tlsCa?: string
  sendTimeout: number
  command: string
  rest: string[]
  sources: string[]
  mode: string
  name?: string
  outputFormat: string
  noCleanup: boolean
  verbose: boolean
  serverEntry?: string
  workspaceDir?: string
  provider: string
  model: string
  apiKey: string
  baseUrl: string
  protocol?: 'openai-completions' | 'anthropic-messages'
}

function takeValue(argv: string[], index: number, flag: string): string {
  const value = argv[index + 1]
  if (!value || value.startsWith('--')) throw new Error(`${flag} requires a value`)
  return value
}

export function parseArgs(argv: string[]): CliArgs {
  const input = argv.slice(2)
  const args: CliArgs = {
    url: '',
    token: '',
    workspace: process.env.MKAGENT_WORKSPACE,
    timeout: 10_000,
    json: false,
    sendTimeout: 300_000,
    command: '',
    rest: [],
    sources: [],
    mode: '',
    outputFormat: 'text',
    noCleanup: false,
    verbose: false,
    provider: '',
    model: '',
    apiKey: '',
    baseUrl: '',
  }

  for (let index = 0; index < input.length; index++) {
    const value = input[index]!
    switch (value) {
      case '--url': args.url = takeValue(input, index++, value); break
      case '--token': args.token = takeValue(input, index++, value); break
      case '--workspace': args.workspace = takeValue(input, index++, value); break
      case '--timeout': args.timeout = Number(takeValue(input, index++, value)); break
      case '--tls-ca': args.tlsCa = takeValue(input, index++, value); break
      case '--send-timeout': args.sendTimeout = Number(takeValue(input, index++, value)); break
      case '--source': args.sources.push(takeValue(input, index++, value)); break
      case '--mode': args.mode = takeValue(input, index++, value); break
      case '--name': args.name = takeValue(input, index++, value); break
      case '--output-format': args.outputFormat = takeValue(input, index++, value); break
      case '--no-cleanup': args.noCleanup = true; break
      case '--verbose': args.verbose = true; break
      case '--server-entry': args.serverEntry = takeValue(input, index++, value); break
      case '--workspace-dir': args.workspaceDir = takeValue(input, index++, value); break
      case '--provider': args.provider = takeValue(input, index++, value); break
      case '--model': args.model = takeValue(input, index++, value); break
      case '--api-key': args.apiKey = takeValue(input, index++, value); break
      case '--base-url': args.baseUrl = takeValue(input, index++, value); break
      case '--protocol': {
        const protocol = takeValue(input, index++, value)
        if (protocol !== 'openai-completions' && protocol !== 'anthropic-messages') {
          throw new Error('--protocol must be openai-completions or anthropic-messages')
        }
        args.protocol = protocol
        break
      }
      case '--json': args.json = true; break
      case '--help': case '-h': args.command = 'help'; break
      case '--version': case '-v': args.command = 'version'; break
      default:
        if (!args.command) args.command = value
        else args.rest.push(value)
    }
  }

  args.url ||= process.env.MKAGENT_SERVER_URL ?? ''
  args.token ||= process.env.MKAGENT_SERVER_TOKEN ?? ''
  args.tlsCa ||= process.env.MKAGENT_TLS_CA
  args.provider ||= process.env.LLM_PROVIDER ?? 'deepseek'
  args.model ||= process.env.LLM_MODEL ?? ''
  args.apiKey ||= process.env.LLM_API_KEY ?? ''
  args.baseUrl ||= process.env.LLM_BASE_URL ?? ''
  if (!args.apiKey) args.apiKey = process.env[PROVIDER_ENV_KEYS[args.provider] ?? ''] ?? ''
  if (!Number.isFinite(args.timeout) || args.timeout <= 0) throw new Error('--timeout must be a positive number')
  if (!Number.isFinite(args.sendTimeout) || args.sendTimeout <= 0) throw new Error('--send-timeout must be a positive number')
  if (args.outputFormat !== 'text' && args.outputFormat !== 'stream-json') {
    throw new Error('--output-format must be text or stream-json')
  }

  return args
}

function output(value: unknown, json: boolean): void {
  if (json) {
    process.stdout.write(`${JSON.stringify(value)}\n`)
    return
  }
  if (typeof value === 'string') process.stdout.write(`${value}\n`)
  else process.stdout.write(`${JSON.stringify(value, null, 2)}\n`)
}

async function readStdin(): Promise<string> {
  if (process.stdin.isTTY) return ''
  return new Response(Bun.stdin.stream()).text()
}

async function connect(args: CliArgs): Promise<CliRpcClient> {
  if (!args.url) throw new Error('No server URL. Pass --url or set MKAGENT_SERVER_URL.')
  const client = new CliRpcClient(args.url, {
    token: args.token,
    workspaceId: args.workspace,
    requestTimeout: args.timeout,
    connectTimeout: args.timeout,
  })
  await client.connect()
  return client
}

export async function resolveWorkspace(client: CliRpcClient, requested?: string): Promise<string> {
  if (requested) {
    await client.invoke(RPC_CHANNELS.window.SWITCH_WORKSPACE, requested)
    return requested
  }
  const workspaces = await client.invoke(RPC_CHANNELS.server.GET_WORKSPACES) as Array<{ id: string; slug: string }>
  const workspace = workspaces.find(item => item.slug === 'default') ?? workspaces[0]
  if (!workspace) throw new Error('No workspace available')
  await client.invoke(RPC_CHANNELS.window.SWITCH_WORKSPACE, workspace.id)
  return workspace.id
}

async function waitForTurn(client: CliRpcClient, sessionId: string, args: CliArgs): Promise<SessionEvent[]> {
  const events: SessionEvent[] = []
  let receivedTextDelta = false
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      unsubscribe()
      reject(new Error(`Timed out waiting for session ${sessionId}`))
    }, args.sendTimeout)
    const unsubscribe = client.on(RPC_CHANNELS.sessions.EVENT, (event: unknown) => {
      const typed = event as SessionEvent
      if (typed.sessionId !== sessionId) return
      events.push(typed)
      if (args.outputFormat === 'stream-json') {
        process.stdout.write(`${JSON.stringify(typed)}\n`)
      } else if (!args.json && typed.type === 'text_delta') {
        receivedTextDelta = true
        process.stdout.write(typed.delta)
      } else if (!args.json && typed.type === 'text_complete' && !receivedTextDelta) {
        process.stdout.write(typed.text)
      } else if (!args.json && typed.type === 'tool_start') {
        process.stdout.write(`\n[tool: ${typed.toolName}${typed.toolIntent ? ` — ${typed.toolIntent}` : ''}]\n`)
      } else if (!args.json && typed.type === 'tool_result' && typed.result) {
        process.stdout.write(`${typed.result.length > 200 ? `${typed.result.slice(0, 200)}...` : typed.result}\n`)
      } else if (!args.json && typed.type === 'error') {
        process.stderr.write(`${typed.error}\n`)
      } else if (!args.json && typed.type === 'typed_error') {
        process.stderr.write(`${typed.error.message}\n`)
      }
      if (typed.type === 'complete' || typed.type === 'interrupted' || typed.type === 'error' || typed.type === 'typed_error') {
        if (!args.json && args.outputFormat !== 'stream-json') process.stdout.write('\n')
        clearTimeout(timer)
        unsubscribe()
        resolve(events)
      }
      if (typed.type === 'error') {
        clearTimeout(timer)
        unsubscribe()
        reject(new Error(typed.error))
      }
    })
  })
}

export function getTurnExitCode(events: SessionEvent[]): number {
  if (events.some(event => event.type === 'error' || event.type === 'typed_error')) return 1
  if (events.some(event => event.type === 'interrupted')) return 130
  return 0
}

async function sendAndWait(
  client: CliRpcClient,
  sessionId: string,
  prompt: string,
  args: CliArgs,
): Promise<SessionEvent[]> {
  const completion = waitForTurn(client, sessionId, args)
  await client.invoke(RPC_CHANNELS.sessions.SEND_MESSAGE, sessionId, prompt)
  return completion
}

const PROVIDER_ENV_KEYS: Record<string, string> = {
  anthropic: 'ANTHROPIC_API_KEY',
  openai: 'OPENAI_API_KEY',
  google: 'GOOGLE_API_KEY',
  openrouter: 'OPENROUTER_API_KEY',
  groq: 'GROQ_API_KEY',
  mistral: 'MISTRAL_API_KEY',
  deepseek: 'DEEPSEEK_API_KEY',
  xai: 'XAI_API_KEY',
  cerebras: 'CEREBRAS_API_KEY',
  huggingface: 'HUGGINGFACE_API_KEY',
}

export function resolveApiKey(provider: string, explicit: string): string {
  if (explicit) return explicit
  if (provider === 'ollama') return ''
  const envKey = PROVIDER_ENV_KEYS[provider]
  const value = envKey ? process.env[envKey] : undefined
  if (value) return value
  throw new Error(`No API key found. Use --api-key, set LLM_API_KEY, or set ${envKey ?? `${provider.toUpperCase()}_API_KEY`}.`)
}

export function shouldSetupLlmConnection(
  existingConnectionCount: number,
  args: Pick<CliArgs, 'provider' | 'baseUrl'>,
): boolean {
  return existingConnectionCount === 0 || Boolean(args.baseUrl) || args.provider !== 'deepseek'
}

async function setupLlmConnection(client: CliRpcClient, args: CliArgs): Promise<string> {
  const credential = resolveApiKey(args.provider, args.apiKey)
  const slug = `${args.provider}-cli`
  const setup = {
    slug,
    credential,
    baseUrl: args.baseUrl || undefined,
    defaultModel: args.model || undefined,
    models: args.model ? [args.model] : undefined,
    piAuthProvider: args.provider,
    customEndpoint: args.baseUrl
      ? { api: args.protocol ?? (args.provider === 'anthropic' ? 'anthropic-messages' : 'openai-completions') }
      : undefined,
  }
  const result = await client.invoke(RPC_CHANNELS.settings.SETUP_LLM_CONNECTION, setup) as { success: boolean; error?: string }
  if (!result.success) throw new Error(result.error ?? 'LLM connection setup failed')
  await client.invoke(RPC_CHANNELS.llmConnections.SET_DEFAULT, slug)
  return slug
}

async function commandRun(args: CliArgs): Promise<void> {
  let spawned: SpawnedServer | undefined
  if (!args.url) {
    spawned = await spawnServer({
      serverEntry: args.serverEntry,
      startupTimeout: Math.max(args.timeout, 30_000),
      quiet: !args.verbose,
    })
    args.url = spawned.url
    args.token = spawned.token
  }
  const client = await connect(args)
  let sessionId: string | undefined

  const cleanup = async () => {
    if (sessionId && !args.noCleanup) {
      await client.invoke(RPC_CHANNELS.sessions.DELETE, sessionId).catch(() => {})
    }
    client.destroy()
    await spawned?.stop()
  }
  const onSignal = async () => {
    if (sessionId) await client.invoke(RPC_CHANNELS.sessions.CANCEL, sessionId).catch(() => {})
    await cleanup()
    process.exit(130)
  }
  process.on('SIGINT', onSignal)
  process.on('SIGTERM', onSignal)

  try {
    const prompt = args.rest.join(' ').trim() || (await readStdin()).trim()
    if (!prompt) throw new Error('run requires a prompt argument or stdin')

    let workspaceId: string
    if (args.workspaceDir) {
      const workspace = await client.invoke(
        RPC_CHANNELS.workspaces.CREATE,
        resolve(args.workspaceDir),
        'cli-workspace',
      ) as { id: string }
      workspaceId = workspace.id
      await client.invoke(RPC_CHANNELS.window.SWITCH_WORKSPACE, workspaceId).catch(() => {})
    } else {
      workspaceId = await resolveWorkspace(client, args.workspace)
    }

    const connections = await client.invoke(RPC_CHANNELS.llmConnections.LIST) as unknown[]
    let connection: string | undefined
    if (shouldSetupLlmConnection(connections.length, args)) {
      connection = await setupLlmConnection(client, args)
    }

    const session = await client.invoke(RPC_CHANNELS.sessions.CREATE, workspaceId, {
      permissionMode: args.mode || 'allow-all',
      enabledSourceSlugs: args.sources.length > 0 ? args.sources : undefined,
    }) as { id: string }
    sessionId = session.id
    if (args.model) {
      await client.invoke(RPC_CHANNELS.sessions.SET_MODEL, session.id, workspaceId, args.model, connection)
    }
    const events = await sendAndWait(client, session.id, prompt, args)
    const result = { sessionId: session.id, events }
    if (args.json && args.outputFormat !== 'stream-json') output(result, true)
    process.exitCode = getTurnExitCode(events)
  } finally {
    process.off('SIGINT', onSignal)
    process.off('SIGTERM', onSignal)
    await cleanup()
  }
}

async function commandWorkspace(client: CliRpcClient, args: CliArgs): Promise<unknown> {
  const action = args.rest.shift() ?? 'list'
  if (action === 'list') return client.invoke(RPC_CHANNELS.server.GET_WORKSPACES)
  if (action === 'create') {
    const name = args.rest.join(' ').trim()
    if (!name) throw new Error('workspace create requires a name')
    return client.invoke(RPC_CHANNELS.server.CREATE_WORKSPACE, name)
  }
  throw new Error(`Unknown workspace action: ${action}`)
}

async function commandSession(client: CliRpcClient, args: CliArgs): Promise<unknown> {
  const action = args.rest.shift() ?? 'list'
  const workspaceId = await resolveWorkspace(client, args.workspace)
  if (action === 'list') return client.invoke(RPC_CHANNELS.sessions.GET)
  if (action === 'create') {
    return client.invoke(RPC_CHANNELS.sessions.CREATE, workspaceId, {
      name: args.name ?? (args.rest.join(' ') || undefined),
      enabledSourceSlugs: args.sources.length > 0 ? args.sources : undefined,
    })
  }
  const sessionId = args.rest.shift()
  if (!sessionId) throw new Error(`session ${action} requires a session id`)
  switch (action) {
    case 'messages': return client.invoke(RPC_CHANNELS.sessions.GET_MESSAGES, sessionId)
    case 'delete': return client.invoke(RPC_CHANNELS.sessions.DELETE, sessionId)
    case 'rename': return client.invoke(RPC_CHANNELS.sessions.COMMAND, sessionId, { type: 'rename', name: args.rest.join(' ') })
    case 'flag': return client.invoke(RPC_CHANNELS.sessions.COMMAND, sessionId, { type: 'flag' })
    case 'unflag': return client.invoke(RPC_CHANNELS.sessions.COMMAND, sessionId, { type: 'unflag' })
    case 'archive': return client.invoke(RPC_CHANNELS.sessions.COMMAND, sessionId, { type: 'archive' })
    case 'unarchive': return client.invoke(RPC_CHANNELS.sessions.COMMAND, sessionId, { type: 'unarchive' })
    case 'export': {
      const file = args.rest.shift() ?? `${sessionId}.mkagent-session.json`
      const bundle = await client.invoke(RPC_CHANNELS.sessions.EXPORT, sessionId)
      await writeFile(file, JSON.stringify(bundle, null, 2), 'utf-8')
      return { file }
    }
    case 'import': {
      const file = sessionId
      const bundle = JSON.parse(await readFile(file, 'utf-8'))
      const mode = args.rest.shift() === 'move' ? 'move' : 'fork'
      return client.invoke(RPC_CHANNELS.sessions.IMPORT, workspaceId, bundle, mode)
    }
    case 'branch': {
      const messageId = args.rest.shift()
      if (!messageId) throw new Error('session branch requires a message id')
      return client.invoke(RPC_CHANNELS.sessions.CREATE, workspaceId, {
        branchFromSessionId: sessionId,
        branchFromMessageId: messageId,
        parentSessionId: sessionId,
      })
    }
    default: throw new Error(`Unknown session action: ${action}`)
  }
}

async function commandConnections(client: CliRpcClient, args: CliArgs): Promise<unknown> {
  const action = args.rest.shift() ?? 'list'
  if (action === 'list') return client.invoke(RPC_CHANNELS.llmConnections.LIST_WITH_STATUS)
  const slug = args.rest.shift()
  if (!slug) throw new Error(`connections ${action} requires a slug`)
  if (action === 'test') return client.invoke(RPC_CHANNELS.llmConnections.TEST, slug)
  if (action === 'delete') return client.invoke(RPC_CHANNELS.llmConnections.DELETE, slug)
  if (action === 'default') return client.invoke(RPC_CHANNELS.llmConnections.SET_DEFAULT, slug)
  if (action === 'add') {
    return client.invoke(RPC_CHANNELS.settings.SETUP_LLM_CONNECTION, {
      slug,
      credential: args.apiKey,
      baseUrl: args.baseUrl,
      defaultModel: args.model,
      models: args.model ? [args.model] : undefined,
      piAuthProvider: args.provider,
      customEndpoint: args.baseUrl
        ? { api: args.protocol ?? 'openai-completions' }
        : undefined,
    })
  }
  throw new Error(`Unknown connections action: ${action}`)
}

async function commandSources(client: CliRpcClient, args: CliArgs): Promise<unknown> {
  const workspaceId = await resolveWorkspace(client, args.workspace)
  return client.invoke(RPC_CHANNELS.sources.GET, workspaceId)
}

async function commandConfig(client: CliRpcClient, args: CliArgs): Promise<unknown> {
  const action = args.rest.shift()
  if (action !== 'validate') throw new Error('Only config validate is supported')
  const preferences = await client.invoke(RPC_CHANNELS.preferences.READ) as { content: string }
  JSON.parse(preferences.content)
  const workspaceId = await resolveWorkspace(client, args.workspace)
  await Promise.all([
    client.invoke(RPC_CHANNELS.permissions.GET_DEFAULTS),
    client.invoke(RPC_CHANNELS.workspace.GET_PERMISSIONS, workspaceId),
    client.invoke(RPC_CHANNELS.toolIcons.GET_MAPPINGS),
  ])
  return { valid: true, targets: ['preferences', 'permissions', 'tool-icons'] }
}

async function commandInvoke(client: CliRpcClient, args: CliArgs): Promise<unknown> {
  const channel = args.rest.shift()
  if (!channel) throw new Error('invoke requires a channel')
  const values = args.rest.map(value => {
    try {
      return JSON.parse(value)
    } catch {
      return value
    }
  })
  return client.invoke(channel, ...values)
}

async function commandListen(client: CliRpcClient, args: CliArgs): Promise<never> {
  const channel = args.rest.shift()
  if (!channel) throw new Error('listen requires a channel')
  client.on(channel, (...values) => output({ channel, args: values, timestamp: new Date().toISOString() }, true))
  process.stdout.write(`Listening on ${channel} (Ctrl+C to stop)\n`)
  return new Promise(() => {})
}

function printHelp(): void {
  process.stdout.write(`mkagent — Terminal client for MkAgent

Usage: mkagent [options] <command>

Commands:
  run <prompt>                         Run in a temporary local server
  workspace [list|create <name>]
  session [list|create|messages|rename|delete|flag|unflag|archive|unarchive]
  session export <id> [file]
  session import <file> [fork|move]
  session branch <id> <message-id>
  send <session-id> <prompt>
  cancel <session-id>
  connections [list|add|test|delete|default]
  sources                                List configured sources
  config validate
  ping | health | versions
  invoke <channel> [json-args...]
  listen <channel>

Options:
  --url <ws-url> --token <token> --workspace <id> --json
  --timeout <ms> --send-timeout <ms> --tls-ca <path>
  --mode <mode> --output-format <text|stream-json> --no-cleanup
  --source <slug>                        Enable source (repeatable)
  --server-entry <path> --workspace-dir <path>
  --provider <preset> --model <id> --api-key <key> --base-url <url>
  --protocol <openai-completions|anthropic-messages>
`)
}

export async function main(argv: string[] = process.argv): Promise<void> {
  const args = parseArgs(argv)
  if (args.tlsCa) process.env.NODE_EXTRA_CA_CERTS = args.tlsCa
  if (!args.command || args.command === 'help') return printHelp()
  if (args.command === 'version') {
    const pkg = await import('../package.json')
    return output(pkg.version, false)
  }
  if (args.command === 'run') return commandRun(args)

  const client = await connect(args)
  try {
    let result: unknown
    switch (args.command) {
      case 'ping': result = await client.invoke(RPC_CHANNELS.server.GET_STATUS); break
      case 'health': result = await client.invoke(RPC_CHANNELS.server.GET_HEALTH); break
      case 'versions': result = await client.invoke(RPC_CHANNELS.system.VERSIONS); break
      case 'workspace': result = await commandWorkspace(client, args); break
      case 'workspaces': result = await commandWorkspace(client, args); break
      case 'session': result = await commandSession(client, args); break
      case 'sessions':
        await resolveWorkspace(client, args.workspace)
        result = await client.invoke(RPC_CHANNELS.sessions.GET)
        break
      case 'connections': result = await commandConnections(client, args); break
      case 'sources': result = await commandSources(client, args); break
      case 'config': result = await commandConfig(client, args); break
      case 'invoke': result = await commandInvoke(client, args); break
      case 'listen': return commandListen(client, args)
      case 'send': {
        await resolveWorkspace(client, args.workspace)
        const sessionId = args.rest.shift()
        const prompt = args.rest.join(' ').trim() || (await readStdin()).trim()
        if (!sessionId || !prompt) throw new Error('send requires a session id and prompt')
        const events = await sendAndWait(client, sessionId, prompt, args)
        process.exitCode = getTurnExitCode(events)
        result = args.json && args.outputFormat !== 'stream-json' ? { sessionId, events } : undefined
        break
      }
      case 'cancel': {
        const sessionId = args.rest.shift()
        if (!sessionId) throw new Error('cancel requires a session id')
        result = await client.invoke(RPC_CHANNELS.sessions.CANCEL, sessionId)
        break
      }
      default: throw new Error(`Unknown command: ${args.command}`)
    }
    if (result !== undefined) output(result, args.json)
  } finally {
    client.destroy()
  }
}

if (import.meta.main) {
  main().catch(error => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    process.exit(1)
  })
}
