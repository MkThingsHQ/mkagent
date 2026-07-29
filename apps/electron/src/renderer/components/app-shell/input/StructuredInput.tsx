import type { PermissionRequest as PermissionRequestType } from '../../../../shared/types'
import { PermissionRequest } from './structured/PermissionRequest'
import { AdminApprovalRequest } from './structured/AdminApprovalRequest'
import type { StructuredInputState, StructuredResponse } from './structured/types'

interface StructuredInputProps {
  state: StructuredInputState
  onResponse: (response: StructuredResponse) => void
  /** When true, removes container styling (shadow, bg, rounded) - used when wrapped by InputContainer */
  unstyled?: boolean
}

/**
 * StructuredInput - Router component for structured input UIs
 *
 * Routes to the appropriate component based on the input type:
 * - permission: PermissionRequest (bash command approval)
 * - admin_approval: AdminApprovalRequest (elevated action approval)
 */
export function StructuredInput({ state, onResponse, unstyled = false }: StructuredInputProps) {
  switch (state.type) {
    case 'permission':
      return (
        <PermissionRequest
          request={state.data as PermissionRequestType}
          onResponse={onResponse}
          unstyled={unstyled}
        />
      )
    case 'admin_approval':
      return (
        <AdminApprovalRequest
          request={state.data as import('./structured/AdminApprovalRequest').AdminApprovalRequestData}
          onApprove={({ rememberForMinutes }) => onResponse({ type: 'admin_approval', approved: true, rememberForMinutes })}
          onCancel={() => onResponse({ type: 'admin_approval', approved: false })}
          unstyled={unstyled}
        />
      )
    default:
      return null
  }
}
