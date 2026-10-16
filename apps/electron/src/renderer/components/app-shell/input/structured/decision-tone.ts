import type { StructuredInputState } from './types'
import type { DecisionTone } from './DecisionCard'

/** Lite permission and admin prompts use the needs-attention material. */
export function getDecisionTone(state: StructuredInputState | undefined): DecisionTone | null { return state ? 'info' : null }
