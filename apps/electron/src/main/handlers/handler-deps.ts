import type { HandlerDeps as BaseHandlerDeps } from '@mkagent/server-core/handlers'
import type { SessionManager } from '@mkagent/server-core/sessions'
import type { BrowserPaneManager } from '../browser-pane-manager'
import type { WindowManager } from '../window-manager'

export type HandlerDeps = BaseHandlerDeps<SessionManager, WindowManager, BrowserPaneManager>
