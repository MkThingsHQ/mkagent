import * as React from 'react'
import { motion } from 'motion/react'
import {
  Bot,
  Check,
  CheckCircle2,
  Circle,
  CircleX,
  FilePen,
  FilePenLine,
  FilePlus2,
  FileText,
  FolderSearch,
  Globe,
  ListTodo,
  NotebookPen,
  Pencil,
  Plug,
  Search,
  Sparkles,
  SquareTerminal,
  TextSearch,
  Wrench,
  XCircle,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '../../../lib/utils'
import { TWEEN } from '../../../motion/presets'
import { Spinner } from '../../ui/LoadingIndicator'
import type { ActivityStatus } from '../TurnCard'
import { SIZE_CONFIG } from './turn-classes'

/** Built-in icons for native tools (the backend sends no icon for these). */
const TOOL_ICONS: Record<string, LucideIcon> = {
  Read: FileText,
  Write: FilePlus2,
  Edit: FilePen,
  MultiEdit: FilePen,
  NotebookEdit: NotebookPen,
  Bash: SquareTerminal,
  BashOutput: SquareTerminal,
  KillShell: SquareTerminal,
  Grep: TextSearch,
  Glob: FolderSearch,
  WebFetch: Globe,
  WebSearch: Search,
  Task: Bot,
  Agent: Bot,
  TaskOutput: Bot,
  TodoWrite: ListTodo,
  Skill: Sparkles,
}

function getToolIcon(toolName?: string): LucideIcon {
  if (!toolName) return Wrench
  if (toolName.startsWith('mcp__')) return Plug
  if (toolName.startsWith('browser_')) return Globe
  return TOOL_ICONS[toolName] ?? Wrench
}

/** Emoji or image icon from tool metadata (skills, sources, CLI brands). */
function CustomIcon({ icon }: { icon: string }) {
  // Emojis can be 1-4+ characters due to ZWJ sequences
  const isLikelyEmoji = icon.length <= 8 && !/^(https?:\/\/|data:)/.test(icon)
  if (isLikelyEmoji) {
    return (
      <span className={cn(SIZE_CONFIG.iconSize, 'flex shrink-0 items-center justify-center text-caption leading-none')}>
        {icon}
      </span>
    )
  }
  return <img src={icon} alt="" className={cn(SIZE_CONFIG.iconSize, 'shrink-0 rounded-xs object-contain')} />
}

/**
 * Leading icon of a tool row (spec §7.4: icon in tertiary): the tool's own icon from its
 * metadata, else a built-in icon for the tool type.
 */
export function ToolIcon({ toolName, customIcon }: { toolName?: string; customIcon?: string }) {
  if (customIcon) return <CustomIcon icon={customIcon} />
  const Icon = getToolIcon(toolName)
  return <Icon aria-hidden className={cn(SIZE_CONFIG.iconSize, 'shrink-0 text-tertiary')} />
}

/**
 * Trailing result glyph of a tool row: ✓ done, ✗ failed, the working spinner while running.
 * Shapes differ per state, so status never depends on color alone.
 */
export function ResultGlyph({ status }: { status: ActivityStatus }) {
  switch (status) {
    case 'running':
    case 'backgrounded':
      return <Spinner className={cn(SIZE_CONFIG.spinnerSize, 'text-accent')} />
    case 'pending':
      return <Circle aria-hidden className={cn(SIZE_CONFIG.iconSize, 'shrink-0 text-tertiary')} />
    case 'completed':
      return <Check aria-hidden className={cn(SIZE_CONFIG.iconSize, 'shrink-0 text-success')} />
    case 'error':
      return <CircleX aria-hidden className={cn(SIZE_CONFIG.iconSize, 'shrink-0 text-destructive')} />
  }
}

/**
 * Status icon for an activity - exported for reuse in inline execution.
 * Supports custom icons from skill/source metadata when completed.
 * Edit/Write tools show tool-specific icons; others show checkmark or custom icon.
 * A status change swaps the icon with a 150ms fade (no wait for the old one to leave).
 */
export function ActivityStatusIcon({
  status,
  toolName,
  customIcon,
}: {
  status: ActivityStatus
  toolName?: string
  /** Custom icon from tool metadata - emoji or data URL (base64) */
  customIcon?: string
}) {
  const renderIcon = () => {
    // For completed status with custom icon, use it instead of checkmark
    if (status === 'completed' && customIcon) return <CustomIcon icon={customIcon} />

    switch (status) {
      case 'pending':
        return <Circle aria-hidden className={cn(SIZE_CONFIG.iconSize, 'shrink-0 text-tertiary')} />
      case 'running':
      case 'backgrounded':
        return (
          <span className={cn(SIZE_CONFIG.iconSize, 'flex shrink-0 items-center justify-center')}>
            <Spinner className={cn(SIZE_CONFIG.spinnerSize, 'text-accent')} />
          </span>
        )
      case 'completed':
        // Edit and Write tools get their own icons instead of the check
        if (toolName === 'Edit') return <Pencil aria-hidden className={cn(SIZE_CONFIG.iconSize, 'shrink-0 text-accent')} />
        if (toolName === 'Write') return <FilePenLine aria-hidden className={cn(SIZE_CONFIG.iconSize, 'shrink-0 text-accent')} />
        return <CheckCircle2 aria-hidden className={cn(SIZE_CONFIG.iconSize, 'shrink-0 text-success')} />
      case 'error':
        return <XCircle aria-hidden className={cn(SIZE_CONFIG.iconSize, 'shrink-0 text-destructive')} />
    }
  }

  // The first render shows the icon as is (session switch / reload stay instant); later status
  // changes remount the keyed span, which fades in — the old icon leaves in the same frame.
  const hasMounted = React.useRef(false)
  React.useEffect(() => {
    hasMounted.current = true
  }, [])

  return (
    <motion.span
      key={status}
      initial={hasMounted.current ? { opacity: 0 } : false}
      animate={{ opacity: 1 }}
      transition={TWEEN.fast}
      className="flex shrink-0"
    >
      {renderIcon()}
    </motion.span>
  )
}
