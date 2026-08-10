import { describe, expect, it } from 'bun:test'
import { parseArgs, resolveApiKey, shouldSetupLlmConnection } from './index.ts'

describe('parseArgs', () => {
  it('parses --url, --token, --workspace', () => {
    const args = parseArgs(['bun', 'index.ts', '--url', 'ws://localhost:3000', '--token', 'secret123', '--workspace', 'ws-1', 'ping'])
    expect(args.url).toBe('ws://localhost:3000')
    expect(args.token).toBe('secret123')
    expect(args.workspace).toBe('ws-1')
    expect(args.command).toBe('ping')
  })

  it('parses --timeout and --json', () => {
    const args = parseArgs(['bun', 'index.ts', '--timeout', '5000', '--json', 'workspaces'])
    expect(args.timeout).toBe(5000)
    expect(args.json).toBe(true)
  })

  it('parses --tls-ca', () => {
    expect(parseArgs(['bun', 'index.ts', '--tls-ca', '/path/to/ca.pem', 'ping']).tlsCa).toBe('/path/to/ca.pem')
  })

  it('parses --send-timeout', () => {
    const args = parseArgs(['bun', 'index.ts', '--send-timeout', '60000', 'send', 'session-1', 'hello'])
    expect(args.sendTimeout).toBe(60000)
    expect(args.rest).toEqual(['session-1', 'hello'])
  })

  it('falls back to MkAgent env vars', () => {
    const previous = [process.env.MKAGENT_SERVER_URL, process.env.MKAGENT_SERVER_TOKEN, process.env.MKAGENT_TLS_CA]
    process.env.MKAGENT_SERVER_URL = 'ws://env-server:8080'
    process.env.MKAGENT_SERVER_TOKEN = 'env-token'
    process.env.MKAGENT_TLS_CA = '/env/ca.pem'
    try {
      const args = parseArgs(['bun', 'index.ts', 'ping'])
      expect([args.url, args.token, args.tlsCa]).toEqual(['ws://env-server:8080', 'env-token', '/env/ca.pem'])
    } finally {
      const keys = ['MKAGENT_SERVER_URL', 'MKAGENT_SERVER_TOKEN', 'MKAGENT_TLS_CA'] as const
      keys.forEach((key, index) => previous[index] === undefined ? delete process.env[key] : process.env[key] = previous[index])
    }
  })

  it('explicit flags override env vars', () => {
    const previous = process.env.MKAGENT_SERVER_URL
    process.env.MKAGENT_SERVER_URL = 'ws://env-server:8080'
    try {
      expect(parseArgs(['bun', 'index.ts', '--url', 'ws://flag-server:9090', 'ping']).url).toBe('ws://flag-server:9090')
    } finally {
      if (previous === undefined) delete process.env.MKAGENT_SERVER_URL
      else process.env.MKAGENT_SERVER_URL = previous
    }
  })

  it('parses --help as command', () => expect(parseArgs(['bun', 'index.ts', '--help']).command).toBe('help'))
  it('parses --version as command', () => expect(parseArgs(['bun', 'index.ts', '--version']).command).toBe('version'))
  it('parses session subcommand with global args', () => {
    const args = parseArgs(['bun', 'index.ts', 'session', 'create', '--name', 'test', '--mode', 'safe'])
    expect(args.rest).toEqual(['create'])
    expect(args.name).toBe('test')
    expect(args.mode).toBe('safe')
  })

  it('parses send with message text', () => {
    const args = parseArgs(['bun', 'index.ts', 'send', 'sess-123', 'What', 'files', 'are', 'here?'])
    expect(args.rest).toEqual(['sess-123', 'What', 'files', 'are', 'here?'])
  })

  it('parses invoke with channel and JSON args', () => {
    expect(parseArgs(['bun', 'index.ts', 'invoke', 'sessions:get', '["workspace-1"]']).rest)
      .toEqual(['sessions:get', '["workspace-1"]'])
  })

  it('defaults to empty command', () => expect(parseArgs(['bun', 'index.ts']).command).toBe(''))
  it('defaults timeout to 10000', () => expect(parseArgs(['bun', 'index.ts', 'ping']).timeout).toBe(10000))
  it('defaults sendTimeout to 300000', () => expect(parseArgs(['bun', 'index.ts', 'ping']).sendTimeout).toBe(300000))
  it('defaults json to false', () => expect(parseArgs(['bun', 'index.ts', 'ping']).json).toBe(false))
  it('parses run command with positional args', () => expect(parseArgs(['bun', 'index.ts', 'run', 'hello', 'world']).rest).toEqual(['hello', 'world']))

  it('--mode sets mode', () => expect(parseArgs(['bun', 'index.ts', '--mode', 'safe', 'run']).mode).toBe('safe'))
  it('defaults mode to empty', () => expect(parseArgs(['bun', 'index.ts', 'run']).mode).toBe(''))
  it('--source accumulates into array', () => {
    const args = parseArgs(['bun', 'index.ts', '--source', 'craft-kb', '--source', 'github', 'run'])
    expect(args.sources).toEqual(['craft-kb', 'github'])
  })
  it('defaults sources to empty array', () => {
    expect(parseArgs(['bun', 'index.ts', 'run']).sources).toEqual([])
  })
  it('--output-format sets outputFormat', () => expect(parseArgs(['bun', 'index.ts', '--output-format', 'stream-json', 'run']).outputFormat).toBe('stream-json'))
  it('rejects an unsupported output format', () => expect(() => parseArgs(['bun', 'index.ts', '--output-format', 'xml', 'run'])).toThrow('text or stream-json'))
  it('rejects invalid timeout values', () => expect(() => parseArgs(['bun', 'index.ts', '--timeout', '0', 'ping'])).toThrow('positive number'))
  it('defaults outputFormat to text', () => expect(parseArgs(['bun', 'index.ts', 'run']).outputFormat).toBe('text'))
  it('--no-cleanup sets noCleanup', () => expect(parseArgs(['bun', 'index.ts', '--no-cleanup', 'run']).noCleanup).toBe(true))
  it('defaults noCleanup to false', () => expect(parseArgs(['bun', 'index.ts', 'run']).noCleanup).toBe(false))
  it('--server-entry sets serverEntry', () => expect(parseArgs(['bun', 'index.ts', '--server-entry', '/server.ts', 'run']).serverEntry).toBe('/server.ts'))
  it('defaults serverEntry to undefined', () => expect(parseArgs(['bun', 'index.ts', 'run']).serverEntry).toBeUndefined())
  it('--workspace-dir sets workspaceDir', () => expect(parseArgs(['bun', 'index.ts', '--workspace-dir', '/tmp/ws', 'run']).workspaceDir).toBe('/tmp/ws'))
  it('defaults workspaceDir to undefined', () => expect(parseArgs(['bun', 'index.ts', 'run']).workspaceDir).toBeUndefined())
  it('defaults provider to deepseek', () => expect(parseArgs(['bun', 'index.ts', 'run']).provider).toBe(process.env.LLM_PROVIDER ?? 'deepseek'))
})

describe('provider setup', () => {
  it('uses DEEPSEEK_API_KEY for the deepseek provider', () => {
    const previous = process.env.DEEPSEEK_API_KEY
    process.env.DEEPSEEK_API_KEY = 'deepseek-test-key'
    try {
      expect(resolveApiKey('deepseek', '')).toBe('deepseek-test-key')
    } finally {
      if (previous === undefined) delete process.env.DEEPSEEK_API_KEY
      else process.env.DEEPSEEK_API_KEY = previous
    }
  })

  it('uses an explicit API key first', () => expect(resolveApiKey('deepseek', 'explicit')).toBe('explicit'))
  it('allows keyless Ollama connections', () => expect(resolveApiKey('ollama', '')).toBe(''))
  it('forces setup when no connections exist', () => expect(shouldSetupLlmConnection(0, { provider: 'deepseek', baseUrl: '' })).toBe(true))
  it('skips setup for default DeepSeek when a connection exists', () => expect(shouldSetupLlmConnection(2, { provider: 'deepseek', baseUrl: '' })).toBe(false))
  it('forces setup for another provider', () => expect(shouldSetupLlmConnection(2, { provider: 'openai', baseUrl: '' })).toBe(true))
  it('forces setup for custom endpoints', () => expect(shouldSetupLlmConnection(2, { provider: 'deepseek', baseUrl: 'https://api.example.com' })).toBe(true))
})
