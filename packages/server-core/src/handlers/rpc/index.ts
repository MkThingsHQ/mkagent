import type { RpcServer } from '@mkagent/server-core/transport'
import type { HandlerDeps } from '../handler-deps'

import { registerAuthHandlers } from './auth'
import { registerFilesHandlers } from './files'
import { registerLlmConnectionsHandlers } from './llm-connections'
import { registerOnboardingHandlers } from './onboarding'
import { registerOAuthHandlers } from './oauth'
import { registerResourcesHandlers } from './resources'
import { registerSessionsHandlers } from './sessions'
export { registerSessionsHandlers, cleanupSessionFileWatchForClient } from './sessions'
import { registerServerHandlers } from './server'
import type { ServerHandlerContext } from '../../bootstrap/headless-start'
export type { ServerHandlerContext } from '../../bootstrap/headless-start'
export { getHealthCheck } from './server'
import { registerSettingsHandlers } from './settings'
import { registerSkillsHandlers } from './skills'
import { registerSourcesHandlers } from './sources'
import { registerSystemCoreHandlers } from './system'
import { registerWorkspaceCoreHandlers } from './workspace'

export function registerCoreRpcHandlers(
  server: RpcServer,
  deps: HandlerDeps,
  serverCtx?: ServerHandlerContext,
): void {
  registerAuthHandlers(server, deps)
  registerFilesHandlers(server, deps)
  registerLlmConnectionsHandlers(server, deps)
  registerOnboardingHandlers(server, deps)
  registerOAuthHandlers(server, deps)
  registerResourcesHandlers(server, deps)
  registerSessionsHandlers(server, deps)
  if (serverCtx) registerServerHandlers(server, deps, serverCtx)
  registerSettingsHandlers(server, deps)
  registerSkillsHandlers(server, deps)
  registerSourcesHandlers(server, deps)
  registerSystemCoreHandlers(server, deps)
  registerWorkspaceCoreHandlers(server, deps)
}
