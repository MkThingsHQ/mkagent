import type { HandlerDeps as BaseHandlerDeps } from '@mkagent/server-core/handlers'
import type { SessionManager } from '@mkagent/server-core/sessions'
import type { BrowserPaneManager } from '../browser-pane-manager'
import type { WindowManager } from '../window-manager'
import type { OAuthFlowStore } from '@mkagent/shared/auth'

export type HandlerDeps = BaseHandlerDeps<SessionManager, OAuthFlowStore, WindowManager, BrowserPaneManager>
