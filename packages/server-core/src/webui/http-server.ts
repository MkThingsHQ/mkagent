/**
 * Web UI HTTP handler and standalone server.
 *
 * The core logic lives in `createWebuiHandler()` which returns a web-standard
 * fetch handler `(Request) => Promise<Response>`. This handler can be:
 *
 * 1. **Embedded** — attached to the WsRpcServer's HTTPS server via the
 *    node-adapter so that HTTP and WSS share a single port.
 * 2. **Standalone** — wrapped in `Bun.serve()` via `startWebuiHttpServer()`
 *    for separate-port deployments or development.
 */

import { rmSync } from 'node:fs'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, join, extname } from 'node:path'
import {
  RateLimiter,
  initPasswordHash,
  verifyPassword,
  createSessionToken,
  validateSession,
  buildSessionCookie,
  buildLogoutCookie,
} from './auth'
import { generateCallbackPage } from '@mkagent/shared/auth'
import type { PlatformServices } from '../runtime/platform'

// ---------------------------------------------------------------------------
// MIME types for static file serving
// ---------------------------------------------------------------------------

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.webp': 'image/webp',
  '.map': 'application/json',
}

const MAX_ATTACHMENT_FILES = 20
const MAX_ATTACHMENT_FILE_SIZE = 50 * 1024 * 1024
const MAX_ATTACHMENT_TOTAL_SIZE = 100 * 1024 * 1024
const MAX_ATTACHMENT_REQUEST_SIZE = MAX_ATTACHMENT_TOTAL_SIZE + 1024 * 1024
const ATTACHMENT_UPLOAD_TTL_MS = 60 * 60 * 1000

function getMimeType(path: string): string {
  return MIME_TYPES[extname(path).toLowerCase()] ?? 'application/octet-stream'
}

function getForwardedValue(req: Request, key: 'proto' | 'host'): string | null {
  const forwarded = req.headers.get('forwarded')
  if (!forwarded) return null

  const match = forwarded.match(new RegExp(`${key}="?([^;,"]+)"?`, 'i'))
  return match?.[1]?.trim() || null
}

function getRequestProto(req: Request): string {
  return req.headers.get('x-forwarded-proto')?.split(',')[0]?.trim()
    || getForwardedValue(req, 'proto')
    || new URL(req.url).protocol.replace(/:$/, '')
}

function getRequestHost(req: Request): string | null {
  return req.headers.get('x-forwarded-host')?.split(',')[0]?.trim()
    || getForwardedValue(req, 'host')
    || req.headers.get('host')
}

function formatHostWithPort(host: string, port: number): string {
  try {
    const parsed = new URL(`http://${host}`)
    const hostname = parsed.hostname.includes(':') ? `[${parsed.hostname}]` : parsed.hostname
    return `${hostname}:${port}`
  } catch {
    const withoutPort = host.replace(/:\d+$/, '')
    return `${withoutPort}:${port}`
  }
}

export function shouldUseSecureCookies(req: Request, secureCookies?: boolean): boolean {
  if (secureCookies != null) return secureCookies
  return getRequestProto(req) === 'https'
}

export interface ResolveWebSocketUrlOptions {
  publicWsUrl?: string
  wsProtocol: 'ws' | 'wss'
  wsPort: number
}

export function resolveWebSocketUrl(
  req: Request,
  { publicWsUrl, wsProtocol, wsPort }: ResolveWebSocketUrlOptions,
): string {
  if (publicWsUrl) return publicWsUrl

  const host = getRequestHost(req)
  if (host) {
    return `${wsProtocol}://${formatHostWithPort(host, wsPort)}`
  }

  return `${wsProtocol}://127.0.0.1:${wsPort}`
}

// ---------------------------------------------------------------------------
// Handler options (shared between embedded and standalone modes)
// ---------------------------------------------------------------------------

export interface OAuthCallbackDeps {
  flowStore: { getByState: (state: string) => any; remove: (state: string) => void }
  credManager: { exchangeAndStore: (...args: any[]) => Promise<any> }
  sessionManager: { completeAuthRequest: (...args: any[]) => Promise<void> }
  pushSourcesChanged: (workspaceId: string) => void
}

export interface WebuiHandlerOptions {
  /** Path to built web UI dist/ directory. */
  webuiDir: string
  /** Secret used to sign JWTs — typically MKAGENT_SERVER_TOKEN. */
  secret: string
  /** Optional separate web UI password. Falls back to `secret` for verification. */
  password?: string
  /** Explicit Secure-cookie override. When unset, infer from the request / proxy headers. */
  secureCookies?: boolean
  /** Optional browser-facing WebSocket URL override for reverse-proxy deployments. */
  publicWsUrl?: string
  /** RPC WebSocket protocol used when building a browser-facing fallback URL. */
  wsProtocol: 'ws' | 'wss'
  /** RPC WebSocket port used when building a browser-facing fallback URL. */
  wsPort: number
  /** Health check function (injected from existing server handler). */
  getHealthCheck: () => { status: string }
  /** Logger. */
  logger: PlatformServices['logger']
  /** OAuth callback deps — when provided, enables /api/oauth/callback. */
  oauthCallbackDeps?: OAuthCallbackDeps
  /**
   * Trusted proxy IPs/CIDRs. When set, proxy headers (x-forwarded-for, x-forwarded-proto)
   * are only trusted from these sources. When empty/unset, proxy headers are ignored
   * and 'direct' is used as the rate-limit key.
   */
  trustedProxies?: string[]
}

// ---------------------------------------------------------------------------
// Handler factory — the core request handler
// ---------------------------------------------------------------------------

export interface WebuiHandler {
  /** Web-standard fetch handler. */
  fetch: (req: Request) => Promise<Response>
  /** Call on shutdown to release timers. */
  dispose: () => void
  /** Inject OAuth callback deps after the RPC bootstrap is ready. */
  setOAuthCallbackDeps: (deps: OAuthCallbackDeps) => void
}

/**
 * Create a web-standard fetch handler for the WebUI.
 *
 * This handler can be used directly with `Bun.serve({ fetch })`,
 * or adapted for Node's HTTP server via `nodeHttpAdapter()`.
 */
export function createWebuiHandler(options: WebuiHandlerOptions): WebuiHandler {
  const {
    webuiDir,
    secret,
    password,
    secureCookies,
    publicWsUrl,
    wsProtocol,
    wsPort,
    getHealthCheck,
    logger,
    trustedProxies,
  } = options

  const rateLimiter = new RateLimiter(5, 60_000)
  const uploadDirectories = new Map<string, number>()
  const cleanupTimer = setInterval(() => {
    rateLimiter.cleanup()
    const now = Date.now()
    for (const [dir, createdAt] of uploadDirectories) {
      if (now - createdAt < ATTACHMENT_UPLOAD_TTL_MS) continue
      uploadDirectories.delete(dir)
      void rm(dir, { recursive: true, force: true })
    }
  }, 120_000)

  const loginPassword = password || secret
  const trustedProxySet = new Set(trustedProxies ?? [])

  // Hash the login password at startup (async, but resolves before first auth attempt in practice)
  const passwordReady = initPasswordHash(loginPassword)

  /** Extract client IP — only trusts proxy headers when trustedProxies is configured. */
  function getClientIp(req: Request): string {
    if (trustedProxySet.size > 0) {
      return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
        ?? req.headers.get('x-real-ip')
        ?? 'direct'
    }
    return 'direct'
  }

  async function fetch(req: Request): Promise<Response> {
    const url = new URL(req.url)
    const path = url.pathname
    const useSecureCookies = shouldUseSecureCookies(req, secureCookies)

    // ── Health endpoint (no auth) ──
    if (path === '/health') {
      const health = getHealthCheck()
      return Response.json(health, {
        status: health.status === 'ok' ? 200 : 503,
      })
    }

    // ── Login page (no auth) ──
    if (path === '/login' || path === '/login/') {
      const loginFile = Bun.file(join(webuiDir, 'login.html'))
      if (await loginFile.exists()) {
        return new Response(loginFile, {
          headers: { 'Content-Type': 'text/html; charset=utf-8' },
        })
      }
      return new Response('Login page not found', { status: 404 })
    }

    // ── Static assets that login page needs (no auth) ──
    if (path === '/favicon.ico' || path.startsWith('/login-assets/')) {
      const file = Bun.file(join(webuiDir, path))
      if (await file.exists()) {
        return new Response(file, {
          headers: { 'Content-Type': getMimeType(path) },
        })
      }
      return new Response('Not Found', { status: 404 })
    }

    // ── Auth endpoint ──
    if (path === '/api/auth' && req.method === 'POST') {
      await passwordReady
      const ip = getClientIp(req)

      if (!rateLimiter.check(ip)) {
        logger.warn(`[webui] Rate limited auth attempt from ${ip}`)
        return Response.json(
          { error: 'Too many attempts. Try again later.' },
          { status: 429 },
        )
      }

      let body: { password?: string }
      try {
        body = await req.json() as { password?: string }
      } catch {
        return Response.json({ error: 'Invalid request body' }, { status: 400 })
      }

      if (!body.password || typeof body.password !== 'string') {
        return Response.json({ error: 'Password is required' }, { status: 400 })
      }

      if (!await verifyPassword(body.password)) {
        logger.warn(`[webui] Failed auth attempt from ${ip}`)
        return Response.json({ error: 'Invalid credentials' }, { status: 401 })
      }

      const jwt = await createSessionToken(secret)
      logger.info(`[webui] Successful auth from ${ip}`)

      return Response.json({ ok: true }, {
        status: 200,
        headers: {
          'Set-Cookie': buildSessionCookie(jwt, useSecureCookies),
        },
      })
    }

    // ── Logout endpoint ──
    if (path === '/api/auth/logout' && req.method === 'POST') {
      return new Response(null, {
        status: 204,
        headers: {
          'Set-Cookie': buildLogoutCookie(useSecureCookies),
        },
      })
    }

    if (path === '/api/oauth/callback' && req.method === 'GET' && options.oauthCallbackDeps) {
      const code = url.searchParams.get('code')
      const state = url.searchParams.get('state')
      const oauthError = url.searchParams.get('error')
      const errorDescription = url.searchParams.get('error_description')

      if (oauthError) {
        const flow = state ? options.oauthCallbackDeps.flowStore.getByState(state) : null
        if (flow && state) options.oauthCallbackDeps.flowStore.remove(state)
        const errorDetail = errorDescription || oauthError
        logger.warn(`[webui] OAuth callback error: ${errorDetail}`)
        return new Response(generateCallbackPage({ title: 'Authorization Failed', isSuccess: false, errorDetail }), {
          status: 200,
          headers: { 'Content-Type': 'text/html; charset=utf-8' },
        })
      }

      if (!code || !state) {
        return new Response(generateCallbackPage({
          title: 'Authorization Failed',
          isSuccess: false,
          errorDetail: 'Missing code or state parameter',
        }), {
          status: 400,
          headers: { 'Content-Type': 'text/html; charset=utf-8' },
        })
      }

      try {
        const { completeOAuthFlow } = await import('../handlers/rpc/oauth')
        const result = await completeOAuthFlow({
          code,
          state,
          flowStore: options.oauthCallbackDeps.flowStore,
          credManager: options.oauthCallbackDeps.credManager,
          sessionManager: options.oauthCallbackDeps.sessionManager,
          pushSourcesChanged: options.oauthCallbackDeps.pushSourcesChanged,
          logger,
        })
        return new Response(generateCallbackPage({
          title: result.success ? 'Authorization Successful' : 'Authorization Failed',
          isSuccess: result.success,
          errorDetail: result.error,
        }), {
          status: 200,
          headers: { 'Content-Type': 'text/html; charset=utf-8' },
        })
      } catch (error) {
        const errorDetail = error instanceof Error ? error.message : 'Token exchange failed'
        logger.error(`[webui] OAuth callback failed: ${errorDetail}`)
        return new Response(generateCallbackPage({ title: 'Authorization Failed', isSuccess: false, errorDetail }), {
          status: 200,
          headers: { 'Content-Type': 'text/html; charset=utf-8' },
        })
      }
    }

    // ── Config endpoint (requires session cookie) ──
    if (path === '/api/config' && req.method === 'GET') {
      const configSession = await validateSession(req.headers.get('cookie'), secret)
      if (!configSession) {
        return Response.json({ error: 'Unauthorized' }, { status: 401 })
      }
      return Response.json({
        wsUrl: resolveWebSocketUrl(req, { publicWsUrl, wsProtocol, wsPort }),
      })
    }

    // Return the default workspace ID so the webui can include it in the WS handshake
    if (path === '/api/config/workspaces' && req.method === 'GET') {
      const configSession = await validateSession(req.headers.get('cookie'), secret)
      if (!configSession) {
        return Response.json({ error: 'Unauthorized' }, { status: 401 })
      }
      const { getActiveWorkspace } = await import('@mkagent/shared/config/storage')
      const active = getActiveWorkspace()
      return Response.json({
        defaultWorkspaceId: active?.id ?? null,
      })
    }

    // ── Everything below requires a valid session cookie ──
    const cookieHeader = req.headers.get('cookie')
    const session = await validateSession(cookieHeader, secret)

    if (!session) {
      const accept = req.headers.get('accept') ?? ''
      if (accept.includes('text/html') || path === '/' || path === '') {
        return Response.redirect('/login', 302)
      }
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Browser file pickers cannot expose local paths. Upload selected files to
    // a private temporary directory, then feed those paths through the same
    // attachment validation and persistence pipeline used by Desktop.
    if (path === '/api/attachments' && req.method === 'POST') {
      const contentLength = Number(req.headers.get('content-length'))
      if (Number.isFinite(contentLength) && contentLength > MAX_ATTACHMENT_REQUEST_SIZE) {
        return Response.json({ error: 'Attachments must be 100 MB or smaller in total' }, { status: 413 })
      }

      let form
      try {
        form = await req.formData()
      } catch {
        return Response.json({ error: 'Invalid multipart form data' }, { status: 400 })
      }
      const files = form.getAll('files').filter((value): value is Exclude<typeof value, string> => typeof value !== 'string')
      if (files.length === 0 || files.length > MAX_ATTACHMENT_FILES) {
        return Response.json({ error: 'Select between 1 and 20 files' }, { status: 400 })
      }
      if (files.some(file => file.size > MAX_ATTACHMENT_FILE_SIZE)) {
        return Response.json({ error: 'Each attachment must be 50 MB or smaller' }, { status: 413 })
      }
      if (files.reduce((total, file) => total + file.size, 0) > MAX_ATTACHMENT_TOTAL_SIZE) {
        return Response.json({ error: 'Attachments must be 100 MB or smaller in total' }, { status: 413 })
      }

      const uploadDir = await mkdtemp(join(tmpdir(), 'mkagent-webui-upload-'))
      uploadDirectories.set(uploadDir, Date.now())
      try {
        const paths: string[] = []
        for (const [index, file] of files.entries()) {
          const safeName = basename(file.name).replace(/[^a-zA-Z0-9._ -]/g, '_') || `attachment-${index + 1}`
          const filePath = join(uploadDir, `${index + 1}-${safeName}`)
          await writeFile(filePath, Buffer.from(await file.arrayBuffer()))
          paths.push(filePath)
        }
        return Response.json({ paths })
      } catch (error) {
        uploadDirectories.delete(uploadDir)
        await rm(uploadDir, { recursive: true, force: true })
        throw error
      }
    }

    // ── Serve SPA static files ──
    if (path !== '/') {
      const file = Bun.file(join(webuiDir, path))
      if (await file.exists()) {
        return new Response(file, {
          headers: { 'Content-Type': getMimeType(path) },
        })
      }
    }

    // SPA fallback — serve index.html for all non-file routes
    const indexFile = Bun.file(join(webuiDir, 'index.html'))
    if (await indexFile.exists()) {
      return new Response(indexFile, {
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      })
    }

    return new Response('Not Found', { status: 404 })
  }

  return {
    fetch,
    dispose: () => {
      clearInterval(cleanupTimer)
      for (const dir of uploadDirectories.keys()) {
        rmSync(dir, { recursive: true, force: true })
      }
      uploadDirectories.clear()
    },
    setOAuthCallbackDeps: deps => {
      options.oauthCallbackDeps = deps
    },
  }
}

// ---------------------------------------------------------------------------
// Standalone server (backwards-compatible, uses Bun.serve)
// ---------------------------------------------------------------------------

export interface WebuiHttpServerOptions extends WebuiHandlerOptions {
  /** Port to bind on. Use 0 for an ephemeral port in tests. */
  port: number
}

export async function startWebuiHttpServer(
  options: WebuiHttpServerOptions,
): Promise<{ port: number, stop: () => void }> {
  const { port, logger, ...handlerOpts } = options
  const handler = createWebuiHandler({ ...handlerOpts, logger })

  const server = Bun.serve({
    port,
    fetch: handler.fetch,
  })

  const boundPort = server.port ?? port
  logger.info(`[webui] Web UI server listening on http://0.0.0.0:${boundPort}`)

  return {
    port: boundPort,
    stop: () => {
      handler.dispose()
      server.stop()
    },
  }
}
