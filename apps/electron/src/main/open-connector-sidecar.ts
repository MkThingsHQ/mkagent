import { spawn, type ChildProcessByStdio } from 'node:child_process'
import { existsSync, mkdirSync } from 'node:fs'
import { request } from 'node:http'
import { createRequire } from 'node:module'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { Readable } from 'node:stream'
import { app, session as electronSession } from 'electron'
import {
  ensureOpenConnectorSecrets,
  getOpenConnectorBaseUrl,
  getOpenConnectorDataDir,
  getOpenConnectorMcpUrl,
  getOpenConnectorPort,
  type OpenConnectorRemoteToolDefinition,
  type OpenConnectorToolName,
} from '@mkagent/shared/open-connector'
import type { OpenConnectorConsoleInfo } from '../shared/types'
import { mainLog } from './logger'

const HOST = '127.0.0.1'
const ADMIN_COOKIE_NAME = 'oomol_connect_admin_session'
type SidecarProcess = ChildProcessByStdio<null, Readable, Readable>

interface McpToolResult {
  content?: Array<{ type?: string; text?: string; [key: string]: unknown }>
  structuredContent?: unknown
  isError?: boolean
}

interface McpClientLike {
  connect(transport: unknown): Promise<void>
  listTools(
    params?: Record<string, never>,
    options?: { timeout?: number; signal?: AbortSignal },
  ): Promise<{ tools: OpenConnectorRemoteToolDefinition[] }>
  callTool(
    input: { name: string; arguments?: Record<string, unknown> },
    resultSchema?: unknown,
    options?: { timeout?: number; signal?: AbortSignal },
  ): Promise<McpToolResult>
  close(): Promise<void>
}

interface McpClientModule {
  Client: new (clientInfo: { name: string; version: string }) => McpClientLike
}

interface McpTransportModule {
  StreamableHTTPClientTransport: new (
    url: URL,
    options?: { requestInit?: { headers?: Record<string, string> } },
  ) => unknown
}

interface AdminHeaderLease {
  id: symbol
  origin: string
  adminToken: string
}

let activeAdminHeaderLease: AdminHeaderLease | null = null
let adminHeaderHookInstalled = false

function normalizeRoot(candidate: string | undefined): string | null {
  if (!candidate?.trim()) return null
  return resolve(candidate)
}

function findOpenConnectorRoot(): string | null {
  const cwd = process.cwd()
  const appPath = typeof app.getAppPath === 'function' ? app.getAppPath() : cwd
  const resourcesPath = process.resourcesPath
  const candidates = app.isPackaged
    ? [resourcesPath ? normalizeRoot(join(resourcesPath, 'open-connector')) : null]
    : [
        normalizeRoot(join(cwd, 'vendor', 'open-connector')),
        normalizeRoot(join(appPath, 'vendor', 'open-connector')),
        normalizeRoot(join(cwd, 'apps', 'electron', 'dist', 'resources', 'open-connector')),
        normalizeRoot(join(appPath, 'dist', 'resources', 'open-connector')),
      ]

  for (const candidate of [...new Set(candidates.filter(Boolean))] as string[]) {
    if (isRunnableOpenConnectorRoot(candidate)) return candidate
  }
  return null
}

function isRunnableOpenConnectorRoot(candidate: string): boolean {
  if (!existsSync(join(candidate, 'src', 'server', 'index.ts'))) return false
  if (!existsSync(join(candidate, 'dist', 'web', 'index.html'))) return false
  if (!existsSync(join(candidate, 'migrations'))) return false
  if (!existsSync(join(candidate, 'package.json'))) return false
  try {
    createRequire(join(candidate, 'package.json')).resolve('@hono/node-server')
    return true
  } catch {
    mainLog.warn('[open-connector] skipping source without installed runtime dependencies', { root: candidate })
    return false
  }
}

async function installAdminSessionCookie(baseUrl: string, adminToken: string): Promise<void> {
  const setCookie = await requestAdminSessionCookie(baseUrl, adminToken)
  const cookie = parseSetCookie(setCookie)
  if (cookie.name !== ADMIN_COOKIE_NAME || !cookie.value) {
    throw new Error('OpenConnector did not return a valid admin session cookie')
  }

  await electronSession.defaultSession.cookies.set({
    url: baseUrl,
    name: cookie.name,
    value: cookie.value,
    path: '/',
    httpOnly: true,
    secure: false,
    sameSite: 'strict',
  })
}

async function clearAdminSessionCookie(baseUrl: string): Promise<void> {
  try {
    await electronSession.defaultSession.cookies.remove(baseUrl, ADMIN_COOKIE_NAME)
  } catch (error) {
    mainLog.warn('[open-connector] failed to clear admin session cookie', error)
  }
}

function activateAdminHeaderInjection(baseUrl: string, adminToken: string): symbol {
  if (!adminHeaderHookInstalled) {
    electronSession.defaultSession.webRequest.onBeforeSendHeaders(
      { urls: ['<all_urls>'] },
      (details, callback) => {
        const lease = activeAdminHeaderLease
        if (lease) {
          try {
            const requestUrl = new URL(details.url)
            const isAdminApi = requestUrl.pathname.startsWith('/api/')
            const isAdminActionRun = details.method === 'POST' && /^\/v1\/actions\/[^/]+$/.test(requestUrl.pathname)
            if (requestUrl.origin === lease.origin && (isAdminApi || isAdminActionRun)) {
              details.requestHeaders.Authorization = `Bearer ${lease.adminToken}`
            }
          } catch {
            // Leave malformed or unrelated requests unchanged.
          }
        }
        callback({ requestHeaders: details.requestHeaders })
      },
    )
    adminHeaderHookInstalled = true
  }

  const id = Symbol('open-connector-admin-header')
  activeAdminHeaderLease = { id, origin: new URL(baseUrl).origin, adminToken }
  return id
}

function deactivateAdminHeaderInjection(id: symbol | null): void {
  if (id && activeAdminHeaderLease?.id === id) activeAdminHeaderLease = null
}

function requestAdminSessionCookie(baseUrl: string, adminToken: string): Promise<string> {
  return new Promise((resolvePromise, reject) => {
    const req = request(new URL('/api/auth/session', baseUrl), {
      method: 'GET',
      headers: { Authorization: `Bearer ${adminToken}` },
      timeout: 5_000,
    }, response => {
      const chunks: Buffer[] = []
      response.on('data', chunk => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)))
      response.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf8')
        if (!response.statusCode || response.statusCode < 200 || response.statusCode >= 300) {
          reject(new Error(`OpenConnector admin authentication failed with HTTP ${response.statusCode ?? 'unknown'}`))
          return
        }
        const setCookie = response.headers['set-cookie']?.[0]
        if (!setCookie) {
          reject(new Error(body.includes('adminAuthConfigured')
            ? 'OpenConnector admin session cookie was not issued'
            : 'OpenConnector admin authentication endpoint did not issue a cookie'))
          return
        }
        resolvePromise(setCookie)
      })
    })

    req.on('timeout', () => req.destroy(new Error('Timed out while creating OpenConnector admin session')))
    req.on('error', reject)
    req.end()
  })
}

function parseSetCookie(setCookie: string): { name: string; value: string } {
  const pair = setCookie.split(';', 1)[0] ?? ''
  const separator = pair.indexOf('=')
  if (separator <= 0) return { name: '', value: '' }
  return { name: pair.slice(0, separator), value: pair.slice(separator + 1) }
}

async function isHealthy(baseUrl: string): Promise<boolean> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 1_000)
  try {
    const response = await fetch(`${baseUrl}/health`, { signal: controller.signal })
    return response.ok
  } catch {
    return false
  } finally {
    clearTimeout(timeout)
  }
}

async function terminateChild(child: SidecarProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return

  await new Promise<void>(resolvePromise => {
    let forceTimer: NodeJS.Timeout | undefined
    let settleTimer: NodeJS.Timeout | undefined
    const finish = () => {
      if (forceTimer) clearTimeout(forceTimer)
      if (settleTimer) clearTimeout(settleTimer)
      child.off('exit', finish)
      resolvePromise()
    }

    child.once('exit', finish)
    try {
      child.kill('SIGTERM')
    } catch {
      finish()
      return
    }
    forceTimer = setTimeout(() => {
      if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL')
    }, 2_500)
    settleTimer = setTimeout(finish, 4_000)
  })
}

async function waitForHealth(baseUrl: string, child: SidecarProcess): Promise<void> {
  const startedAt = Date.now()
  let exited = false
  let exitMessage = ''
  const onExit = (code: number | null, signal: NodeJS.Signals | null) => {
    exited = true
    exitMessage = `OpenConnector exited before becoming ready (code=${code ?? 'null'}, signal=${signal ?? 'null'})`
  }
  child.once('exit', onExit)

  try {
    while (Date.now() - startedAt < 20_000) {
      if (await isHealthy(baseUrl)) return
      if (exited) throw new Error(exitMessage)
      await new Promise(resolvePromise => setTimeout(resolvePromise, 300))
    }
    throw new Error('Timed out waiting for OpenConnector to become ready')
  } finally {
    child.off('exit', onExit)
  }
}

function formatMcpToolResult(result: McpToolResult): { content: string; isError: boolean } {
  if (result.structuredContent !== undefined) {
    return {
      content: JSON.stringify(result.structuredContent, null, 2),
      isError: result.isError === true,
    }
  }
  const text = result.content
    ?.filter(item => item.type === 'text' && typeof item.text === 'string')
    .map(item => item.text)
    .join('\n')
    .trim()
  const fallback = result.content ?? result
  return {
    content: text || JSON.stringify(fallback, null, 2),
    isError: result.isError === true,
  }
}

export class OpenConnectorSidecarService {
  private child: SidecarProcess | null = null
  private startPromise: Promise<OpenConnectorConsoleInfo> | null = null
  private current: OpenConnectorConsoleInfo | null = null
  private generation = 0
  private stopping = false
  private adminHeaderLease: symbol | null = null

  async getConsoleInfo(): Promise<OpenConnectorConsoleInfo> {
    try {
      return await this.ensureRunning()
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      mainLog.error('[open-connector] failed to start', message)
      return {
        url: getOpenConnectorBaseUrl(),
        mcpUrl: getOpenConnectorMcpUrl(),
        port: getOpenConnectorPort(),
        status: 'failed',
        error: message,
      }
    }
  }

  async ensureRunning(): Promise<OpenConnectorConsoleInfo> {
    if (this.stopping) throw new Error('OpenConnector is shutting down')
    if (this.startPromise) return this.startPromise
    const generation = this.generation
    this.startPromise = this.restartIfNeeded(generation).finally(() => { this.startPromise = null })
    return this.startPromise
  }

  async listTools(options?: { signal?: AbortSignal }): Promise<OpenConnectorRemoteToolDefinition[]> {
    options?.signal?.throwIfAborted()
    await this.ensureRunning()
    options?.signal?.throwIfAborted()
    const result = await this.withMcpClient(
      client => client.listTools({}, { timeout: 15_000, signal: options?.signal }),
      options?.signal,
    )
    return result.tools
  }

  async callTool(
    name: OpenConnectorToolName,
    args: Record<string, unknown>,
    options?: { signal?: AbortSignal },
  ): Promise<{ content: string; isError: boolean }> {
    options?.signal?.throwIfAborted()
    await this.ensureRunning()
    options?.signal?.throwIfAborted()
    try {
      return await this.callToolOnce(name, args, options?.signal)
    } catch (error) {
      if (name === 'execute_action') {
        const message = error instanceof Error ? error.message : String(error)
        throw new Error(
          `OpenConnector execute_action failed and was not retried because the external result may be unknown. Check OpenConnector Runs before retrying. ${message}`,
        )
      }
      options?.signal?.throwIfAborted()
      return this.callToolOnce(name, args, options?.signal)
    }
  }

  async stop(): Promise<void> {
    this.stopping = true
    this.generation += 1
    this.current = null
    deactivateAdminHeaderInjection(this.adminHeaderLease)
    this.adminHeaderLease = null
    const child = this.child
    this.child = null
    await clearAdminSessionCookie(getOpenConnectorBaseUrl())
    if (child) await terminateChild(child)
  }

  private async restartIfNeeded(generation: number): Promise<OpenConnectorConsoleInfo> {
    const current = this.current
    if (current?.status === 'running' && await isHealthy(current.url)) {
      if (!this.stopping && generation === this.generation && this.current === current) return current
      throw new Error('OpenConnector startup was cancelled')
    }

    const staleChild = this.child
    this.child = null
    this.current = null
    deactivateAdminHeaderInjection(this.adminHeaderLease)
    this.adminHeaderLease = null
    if (staleChild) {
      await terminateChild(staleChild)
      await clearAdminSessionCookie(getOpenConnectorBaseUrl())
    }
    if (this.stopping || generation !== this.generation) throw new Error('OpenConnector startup was cancelled')
    return this.start(generation)
  }

  private async start(generation: number): Promise<OpenConnectorConsoleInfo> {
    const port = getOpenConnectorPort()
    const baseUrl = getOpenConnectorBaseUrl()
    const mcpUrl = getOpenConnectorMcpUrl()

    if (await isHealthy(baseUrl)) {
      throw new Error(`OpenConnector port ${port} is already in use; refusing to send credentials to an unowned process`)
    }
    if (this.stopping || generation !== this.generation) throw new Error('OpenConnector startup was cancelled')

    const root = findOpenConnectorRoot()
    if (!root) {
      throw new Error('OpenConnector runtime was not found. Initialize vendor/open-connector and build its dependencies and web console.')
    }

    const secrets = ensureOpenConnectorSecrets()
    const dataDir = getOpenConnectorDataDir()
    mkdirSync(dataDir, { recursive: true })
    const env = {
      ...process.env,
      ELECTRON_RUN_AS_NODE: '1',
      NODE_ENV: process.env.MKAGENT_OPEN_CONNECTOR_NODE_ENV ?? 'production',
      HOST,
      PORT: String(port),
      OOMOL_CONNECT_ORIGIN: baseUrl,
      OOMOL_CONNECT_DATA_DIR: dataDir,
      OOMOL_CONNECT_ADMIN_TOKEN: secrets.adminToken,
      OOMOL_CONNECT_RUNTIME_TOKEN: secrets.runtimeToken,
      OOMOL_CONNECT_ENCRYPTION_KEY: secrets.encryptionKey,
    }

    mainLog.info('[open-connector] starting sidecar', { root, port, dataDir })
    const child = spawn(process.execPath, [join(root, 'src', 'server', 'index.ts')], {
      cwd: root,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    this.child = child
    child.stdout.on('data', chunk => mainLog.info('[open-connector]', String(chunk).trim()))
    child.stderr.on('data', chunk => mainLog.warn('[open-connector]', String(chunk).trim()))
    child.once('exit', (code, signal) => {
      mainLog.info('[open-connector] sidecar exited', { code, signal })
      if (this.child === child) {
        this.child = null
        if (this.current?.port === port) this.current = null
        deactivateAdminHeaderInjection(this.adminHeaderLease)
        this.adminHeaderLease = null
        void clearAdminSessionCookie(baseUrl)
      }
    })

    try {
      await waitForHealth(baseUrl, child)
      if (this.stopping || generation !== this.generation || this.child !== child) {
        throw new Error('OpenConnector startup was cancelled')
      }
      await installAdminSessionCookie(baseUrl, secrets.adminToken)
      if (this.stopping || generation !== this.generation || this.child !== child) {
        throw new Error('OpenConnector startup was cancelled')
      }
      this.adminHeaderLease = activateAdminHeaderInjection(baseUrl, secrets.adminToken)
      this.current = { url: baseUrl, mcpUrl, port, status: 'running' }
      return this.current
    } catch (error) {
      if (this.child === child) this.child = null
      deactivateAdminHeaderInjection(this.adminHeaderLease)
      this.adminHeaderLease = null
      await terminateChild(child)
      await clearAdminSessionCookie(baseUrl)
      throw error
    }
  }

  private callToolOnce(
    name: OpenConnectorToolName,
    args: Record<string, unknown>,
    signal?: AbortSignal,
  ): Promise<{ content: string; isError: boolean }> {
    const timeout = name === 'execute_action' ? 180_000 : 30_000
    return this.withMcpClient(async client => {
      const result = await client.callTool({ name, arguments: args }, undefined, { timeout, signal })
      return formatMcpToolResult(result)
    }, signal)
  }

  private async createMcpClient(): Promise<McpClientLike> {
    const root = findOpenConnectorRoot()
    if (!root) throw new Error('OpenConnector runtime is unavailable')
    const requireFromRuntime = createRequire(join(root, 'package.json'))
    const clientEntry = requireFromRuntime.resolve('@modelcontextprotocol/sdk/client/index.js')
    const transportEntry = requireFromRuntime.resolve('@modelcontextprotocol/sdk/client/streamableHttp.js')
    const [{ Client }, { StreamableHTTPClientTransport }] = await Promise.all([
      import(pathToFileURL(clientEntry).href) as Promise<McpClientModule>,
      import(pathToFileURL(transportEntry).href) as Promise<McpTransportModule>,
    ])
    const secrets = ensureOpenConnectorSecrets()
    const client = new Client({ name: 'mkagent', version: app.getVersion() })
    const transport = new StreamableHTTPClientTransport(new URL(getOpenConnectorMcpUrl()), {
      requestInit: { headers: { Authorization: `Bearer ${secrets.runtimeToken}` } },
    })
    await client.connect(transport)
    return client
  }

  private async withMcpClient<T>(
    operation: (client: McpClientLike) => Promise<T>,
    signal?: AbortSignal,
  ): Promise<T> {
    signal?.throwIfAborted()
    const client = await this.createMcpClient()
    try {
      signal?.throwIfAborted()
      return await operation(client)
    } finally {
      try {
        await client.close()
      } catch {
        // A failed request may already have disconnected the stateless client.
      }
    }
  }

}

let singleton: OpenConnectorSidecarService | null = null

export function getOpenConnectorSidecarService(): OpenConnectorSidecarService {
  singleton ??= new OpenConnectorSidecarService()
  return singleton
}
