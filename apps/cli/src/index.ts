#!/usr/bin/env bun
/** Terminal client for the MkAgent headless server. */

import { readFile, writeFile } from 'node:fs/promises'
import { RPC_CHANNELS, type SessionEvent } from '@mkagent/shared/protocol'
import { CliRpcClient } from './client.ts'
import { spawnServer, type SpawnedServer } from './server-spawner.ts'

export interface CliArgs {
  url?: string
  token?: string
  workspace?: string
  timeout: number
  json: boolean
  command: string
  rest: string[]
  provider?: string
  model?: string
  apiKey?: string
  baseUrl?: string
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
    url: process.env.MKAGENT_SERVER_URL,
    token: process.env.MKAGENT_SERVER_TOKEN,
    workspace: process.env.MKAGENT_WORKSPACE,
    timeout: 30_000,
    json: false,
    command: '',
    rest: [],
  }

  for (let index = 0; index < input.length; index++) {
    const value = input[index]!
    switch (value) {
      case '--url': args.url = takeValue(input, index++, value); break
      case '--token': args.token = takeValue(input, index++, value); break
      case '--workspace': args.workspace = takeValue(input, index++, value); break
      case '--timeout': args.timeout = Number(takeValue(input, index++, value)); break
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

async function resolveWorkspace(client: CliRpcClient, requested?: string): Promise<string> {
  if (requested) return requested
  const workspaces = await client.invoke(RPC_CHANNELS.server.GET_WORKSPACES) as Array<{ id: string; slug: string }>
  const workspace = workspaces.find(item => item.slug === 'default') ?? workspaces[0]
  if (!workspace) throw new Error('No workspace available')
  return workspace.id
}

async function waitForTurn(client: CliRpcClient, sessionId: string, timeout: number): Promise<SessionEvent[]> {
  const events: SessionEvent[] = []
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      unsubscribe()
      reject(new Error(`Timed out waiting for session ${sessionId}`))
    }, timeout)
    const unsubscribe = client.on(RPC_CHANNELS.sessions.EVENT, (event: unknown) => {
      const typed = event as SessionEvent
      if (typed.sessionId !== sessionId) return
      events.push(typed)
      if (typed.type === 'text_delta' && !process.stdout.isTTY) return
      if (typed.type === 'text_delta') process.stdout.write(typed.delta)
      if (typed.type === 'complete' || typed.type === 'interrupted') {
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

async function sendAndWait(
  client: CliRpcClient,
  sessionId: string,
  prompt: string,
  timeout: number,
): Promise<SessionEvent[]> {
  const completion = waitForTurn(client, sessionId, timeout)
  await client.invoke(RPC_CHANNELS.sessions.SEND_MESSAGE, sessionId, prompt)
  return completion
}

async function commandRun(args: CliArgs): Promise<void> {
  let spawned: SpawnedServer | undefined
  if (!args.url) {
    spawned = await spawnServer()
    args.url = spawned.url
    args.token = spawned.token
  }
  const client = await connect(args)
  try {
    const workspaceId = await resolveWorkspace(client, args.workspace)
    const prompt = args.rest.join(' ').trim() || (await readStdin()).trim()
    if (!prompt) throw new Error('run requires a prompt argument or stdin')
    const session = await client.invoke(RPC_CHANNELS.sessions.CREATE, workspaceId, {
      model: args.model,
    }) as { id: string }
    const events = await sendAndWait(client, session.id, prompt, args.timeout)
    const result = { sessionId: session.id, events }
    if (args.json) output(result, true)
    else {
      const final = [...events].reverse().find(event => event.type === 'text_complete')
      if (final?.type === 'text_complete') output(final.text, false)
    }
  } finally {
    client.destroy()
    await spawned?.stop()
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
  if (action === 'create') return client.invoke(RPC_CHANNELS.sessions.CREATE, workspaceId, { name: args.rest.join(' ') || undefined })
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

async function commandConfig(client: CliRpcClient, args: CliArgs): Promise<unknown> {
  const action = args.rest.shift()
  if (action !== 'validate') throw new Error('Only config validate is supported')
  const preferences = await client.invoke(RPC_CHANNELS.preferences.READ) as { content: string }
  JSON.parse(preferences.content)
  return { valid: true }
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
  config validate
  ping | health

Options:
  --url <ws-url> --token <token> --workspace <id> --json
  --provider <preset> --model <id> --api-key <key> --base-url <url>
  --protocol <openai-completions|anthropic-messages>
`)
}

export async function main(argv: string[] = process.argv): Promise<void> {
  const args = parseArgs(argv)
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
      case 'workspace': result = await commandWorkspace(client, args); break
      case 'session': result = await commandSession(client, args); break
      case 'connections': result = await commandConnections(client, args); break
      case 'config': result = await commandConfig(client, args); break
      case 'send': {
        const sessionId = args.rest.shift()
        const prompt = args.rest.join(' ').trim() || (await readStdin()).trim()
        if (!sessionId || !prompt) throw new Error('send requires a session id and prompt')
        result = await sendAndWait(client, sessionId, prompt, args.timeout)
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
    output(result, args.json)
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
