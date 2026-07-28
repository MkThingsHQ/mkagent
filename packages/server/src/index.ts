#!/usr/bin/env bun
/**
 * @mkagent/server — standalone headless MkAgent server.
 *
 * Usage:
 *   MKAGENT_SERVER_TOKEN=<secret> bun run packages/server/src/index.ts
 *
 * Environment:
 *   MKAGENT_SERVER_TOKEN         — required bearer token for client auth
 *   MKAGENT_RPC_HOST             — bind address (default: 127.0.0.1)
 *   MKAGENT_RPC_PORT             — bind port (default: 9100)
 *   MKAGENT_RPC_TLS_CERT         — path to PEM certificate file (enables TLS/wss)
 *   MKAGENT_RPC_TLS_KEY          — path to PEM private key file (required with cert)
 *   MKAGENT_RPC_TLS_CA           — path to PEM CA chain file (optional)
 *   MKAGENT_APP_ROOT             — app root path (default: cwd)
 *   MKAGENT_RESOURCES_PATH       — resources path (default: cwd/resources)
 *   MKAGENT_IS_PACKAGED          — 'true' for production (default: false)
 *   MKAGENT_VERSION              — app version (default: 0.0.0-dev)
 *   MKAGENT_DEBUG                — 'true' for debug logging
 *   MKAGENT_WEBUI_DIR            — path to built web UI assets (enables web UI on RPC port)
 *   MKAGENT_WEBUI_PASSWORD       — optional shorter password for web login (falls back to MKAGENT_SERVER_TOKEN)
 *   MKAGENT_WEBUI_SECURE_COOKIE  — optional true/false override for the session cookie Secure flag
 *   MKAGENT_WEBUI_WS_URL         — optional browser-facing ws:// or wss:// URL returned by /api/config
 */

import { join } from 'node:path'
import { readFileSync, existsSync } from 'node:fs'
import { version as packageVersion } from '../package.json'
import { enableDebug } from '@mkagent/shared/utils/debug'
import { bootstrapServer, startHealthHttpServer, generateServerToken } from '@mkagent/server-core/bootstrap'
import { validateSession, createWebuiHandler, nodeHttpAdapter } from '@mkagent/server-core/webui'
import type { WebuiHandler } from '@mkagent/server-core/webui'
import { getCredentialManager } from '@mkagent/shared/credentials'
import { initializeBackendHostRuntime } from '@mkagent/shared/agent/backend'
import { getAllPiModels, getPiModelsForAuthProvider, registerPiModelResolver } from '@mkagent/shared/config'
import { ensureDefaultWorkspace } from '@mkagent/shared/workspaces'

// --generate-token: print a crypto-random token and exit
if (process.argv.includes('--generate-token')) {
  console.log(generateServerToken())
  process.exit(0)
}
import type { WsRpcTlsOptions } from '@mkagent/server-core/transport'
import { registerCoreRpcHandlers, cleanupSessionFileWatchForClient } from '@mkagent/server-core/handlers/rpc'
import { SessionManager, setSessionPlatform, setSessionRuntimeHooks } from '@mkagent/server-core/sessions'
import { initModelRefreshService, setFetcherPlatform } from '@mkagent/server-core/model-fetchers'
import { setSearchPlatform, setImageProcessor } from '@mkagent/server-core/services'
import type { HandlerDeps } from '@mkagent/server-core/handlers'

process.env.MKAGENT_IS_PACKAGED ??= 'false'

// Prevent unhandled rejections from crashing the server.
// SDK subprocess abort can reject promises that propagate up unhandled;
// Bun (unlike Node) terminates the process on unhandled rejections by default.
process.on('unhandledRejection', (reason) => {
  const msg = reason instanceof Error ? reason.message : String(reason)
  console.error(`[server] Unhandled rejection (caught, not crashing): ${msg}`)
})

if (process.env.MKAGENT_DEBUG === 'true' || process.env.MKAGENT_DEBUG === '1') {
  enableDebug()
}

function parseOptionalBooleanEnv(name: string, value: string | undefined): boolean | undefined {
  if (value == null || value.trim() === '') return undefined

  const normalized = value.trim().toLowerCase()
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false

  console.error(`Invalid ${name}: expected one of true/false/1/0/yes/no/on/off.`)
  process.exit(1)
}

function parseOptionalWebSocketUrl(name: string, value: string | undefined): string | undefined {
  if (value == null || value.trim() === '') return undefined

  try {
    const url = new URL(value)
    if (url.protocol !== 'ws:' && url.protocol !== 'wss:') {
      throw new Error('must use ws:// or wss://')
    }
    return value
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error(`Invalid ${name}: ${message}`)
    process.exit(1)
  }
}

// In dev (monorepo), bundled assets root is the repo root (4 levels up from this file).
// In packaged mode, use MKAGENT_BUNDLED_ASSETS_ROOT env or cwd.
const bundledAssetsRoot = process.env.MKAGENT_BUNDLED_ASSETS_ROOT
  ?? join(import.meta.dir, '..', '..', '..', '..')

ensureDefaultWorkspace()
registerPiModelResolver(provider => provider ? getPiModelsForAuthProvider(provider) : getAllPiModels())
initializeBackendHostRuntime({
  hostRuntime: {
    appRootPath: process.env.MKAGENT_APP_ROOT ?? bundledAssetsRoot,
    resourcesPath: process.env.MKAGENT_RESOURCES_PATH ?? bundledAssetsRoot,
    isPackaged: process.env.MKAGENT_IS_PACKAGED === 'true',
  },
})

// TLS configuration — when cert + key paths are provided, server listens on wss://
let tls: WsRpcTlsOptions | undefined
const tlsCertPath = process.env.MKAGENT_RPC_TLS_CERT
const tlsKeyPath = process.env.MKAGENT_RPC_TLS_KEY
if (tlsCertPath || tlsKeyPath) {
  if (!tlsCertPath || !tlsKeyPath) {
    console.error('TLS requires both MKAGENT_RPC_TLS_CERT and MKAGENT_RPC_TLS_KEY.')
    process.exit(1)
  }
  tls = {
    cert: readFileSync(tlsCertPath),
    key: readFileSync(tlsKeyPath),
    ...(process.env.MKAGENT_RPC_TLS_CA ? { ca: readFileSync(process.env.MKAGENT_RPC_TLS_CA) } : {}),
  }
}

// Web UI configuration
const webuiDir = process.env.MKAGENT_WEBUI_DIR || undefined
const webuiEnabled = webuiDir && existsSync(webuiDir)
const webuiSecureCookies = parseOptionalBooleanEnv('MKAGENT_WEBUI_SECURE_COOKIE', process.env.MKAGENT_WEBUI_SECURE_COOKIE)
const webuiWsUrl = parseOptionalWebSocketUrl('MKAGENT_WEBUI_WS_URL', process.env.MKAGENT_WEBUI_WS_URL)
const serverToken = process.env.MKAGENT_SERVER_TOKEN

// ---------------------------------------------------------------------------
// Create WebUI handler early so it can be embedded in the WsRpcServer.
// The handler is a pure function — it doesn't need the session manager yet
// because health checks are injected lazily via getHealthCheck().
// ---------------------------------------------------------------------------

let webuiHandler: WebuiHandler | null = null
let webuiNodeHandler: ReturnType<typeof nodeHttpAdapter> | undefined

// Health check is injected lazily — the session manager isn't ready until
// after bootstrap completes, but the handler captures the closure.
let healthCheckFn: (() => { status: string }) | null = null

if (webuiEnabled && serverToken) {
  const rpcPort = parseInt(process.env.MKAGENT_RPC_PORT ?? '9100', 10)
  const rpcProtocol = tls ? 'wss' as const : 'ws' as const

  webuiHandler = createWebuiHandler({
    webuiDir: webuiDir!,
    secret: serverToken,
    password: process.env.MKAGENT_WEBUI_PASSWORD || undefined,
    secureCookies: webuiSecureCookies,
    publicWsUrl: webuiWsUrl,
    wsProtocol: rpcProtocol,
    // WebUI is served on the same port as WS — wsPort matches the RPC port
    wsPort: rpcPort,
    getHealthCheck: () => healthCheckFn?.() ?? { status: 'starting' },
    logger: { info: console.log, warn: console.warn, error: console.error } as any,
  })

  webuiNodeHandler = nodeHttpAdapter(webuiHandler.fetch)
}

const instance = await (async () => {
  try {
    return await bootstrapServer<SessionManager, HandlerDeps>({
      bundledAssetsRoot,
      serverVersion: process.env.MKAGENT_VERSION ?? packageVersion,
      tls,
      // When web UI is enabled, accept JWT session cookies on WebSocket upgrade
      validateSessionCookie: webuiEnabled && serverToken
        ? async (cookieHeader) => {
            const session = await validateSession(cookieHeader, serverToken)
            return session !== null
          }
        : undefined,
      // Embed the WebUI HTTP handler on the WS server's port
      httpHandler: webuiNodeHandler,
      applyPlatformToSubsystems: (platform) => {
        setFetcherPlatform(platform)
        setSessionPlatform(platform)
        setSessionRuntimeHooks({
          updateBadgeCount: () => {},
          captureException: (error) => {
            const err = error instanceof Error ? error : new Error(String(error))
            platform.captureError?.(err)
          },
        })
        setSearchPlatform(platform)
        setImageProcessor(platform.imageProcessor)
      },
      initModelRefreshService: () => initModelRefreshService(async (slug: string) => {
        const manager = getCredentialManager()
        const apiKey = await manager.getLlmApiKey(slug).catch(() => null)
        return { apiKey: apiKey ?? undefined }
      }),
      createSessionManager: () => new SessionManager(),
      bindRpcServer: (sm, server) => sm.setRpcServer(server),
      createHandlerDeps: ({ sessionManager, platform }) => ({ sessionManager, platform }),
      registerAllRpcHandlers: registerCoreRpcHandlers,
      setSessionEventSink: (sessionManager, sink) => sessionManager.setEventSink(sink),
      initializeSessionManager: async (sessionManager) => {
        await sessionManager.initialize()
      },
      cleanupSessionManager: async (sessionManager) => {
        try {
          await sessionManager.flushAllSessions()
        } finally {
          sessionManager.cleanup()
        }
      },
      cleanupClientResources: cleanupSessionFileWatchForClient,
    })
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  }
})()

// Wire up the lazy health check now that the session manager is ready
if (webuiHandler) {
  const { getHealthCheck } = await import('@mkagent/server-core/handlers/rpc/server')
  const depsLike = { sessionManager: instance.sessionManager } as any
  healthCheckFn = () => getHealthCheck(depsLike)

}

// Start HTTP health endpoint if MKAGENT_HEALTH_PORT is set
const healthPort = parseInt(process.env.MKAGENT_HEALTH_PORT ?? '0', 10)
const healthServer = await startHealthHttpServer({
  port: healthPort,
  deps: { sessionManager: instance.sessionManager },
  wsServer: instance.wsServer,
  platform: instance.platform,
})

const serverProto = instance.protocol === 'wss' ? 'https' : 'http'
console.log(`MKAGENT_SERVER_URL=${instance.protocol}://${instance.host}:${instance.port}`)
console.log(`MKAGENT_SERVER_TOKEN=${instance.token}`)
if (webuiHandler) {
  console.log(`MKAGENT_WEBUI_URL=${serverProto}://0.0.0.0:${instance.port}`)
}

// Block binding to a non-localhost address without TLS — tokens would be sent in cleartext.
// Override with --allow-insecure-bind for explicitly trusted networks.
const isLocalBind = instance.host === '127.0.0.1' || instance.host === 'localhost' || instance.host === '::1'
if (!isLocalBind && instance.protocol === 'ws') {
  if (process.argv.includes('--allow-insecure-bind')) {
    console.warn(
      '\n⚠️  WARNING: Server is listening on a network address without TLS.\n' +
      '   Authentication tokens will be sent in cleartext.\n' +
      '   Set MKAGENT_RPC_TLS_CERT and MKAGENT_RPC_TLS_KEY to enable wss://.\n'
    )
  } else {
    console.error(
      '\n❌  Refusing to bind to a network address without TLS.\n' +
      '   Authentication tokens would be sent in cleartext.\n\n' +
      '   Options:\n' +
      '     1. Set MKAGENT_RPC_TLS_CERT and MKAGENT_RPC_TLS_KEY to enable wss://\n' +
      '     2. Pass --allow-insecure-bind to override (NOT recommended for production)\n'
    )
    await instance.stop()
    process.exit(1)
  }
}

const shutdown = async () => {
  webuiHandler?.dispose()
  healthServer?.stop()
  await instance.stop()
  process.exit(0)
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
