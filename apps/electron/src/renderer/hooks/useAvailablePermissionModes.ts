import { PERMISSION_MODE_ORDER, type PermissionMode } from '@mkagent/shared/agent/modes'

/** Lite exposes the modes supported by its permission engine. */
export function useAvailablePermissionModes(_currentMode?: PermissionMode): PermissionMode[] {
  return [...PERMISSION_MODE_ORDER]
}
