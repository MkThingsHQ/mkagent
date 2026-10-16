/**
 * PermissionsDataTable
 *
 * Typed Data Table for displaying source permissions.
 * Features: searchable patterns, sortable columns, max-height scroll, fullscreen view.
 */

import * as React from 'react'
import { useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import type { ColumnDef } from '@tanstack/react-table'
import { Info_DataTable, SortableHeader, INFO_TABLE_HEADER_CLASS, INFO_TABLE_SORTABLE_HEADER_CLASS } from './Info_DataTable'
import { Info_Badge } from './Info_Badge'
import { Info_StatusBadge } from './Info_StatusBadge'
import { Info_FullscreenButton } from './Info_FullscreenButton'
import { Tooltip, TooltipTrigger, TooltipContent } from '@mkagent/ui'
import { DataTableOverlay } from '@mkagent/ui'
import { cn } from '@/lib/utils'
import { useTheme } from '@/hooks/useTheme'
import { toast } from 'sonner'

export type PermissionAccess = 'allowed' | 'blocked'
export type PermissionType = 'tool' | 'bash' | 'api' | 'mcp'

export interface PermissionRow {
  access: PermissionAccess
  type: PermissionType
  pattern: string
  comment?: string | null
}

interface PermissionsDataTableProps {
  data: PermissionRow[]
  /** Hide the type column (for MCP sources that only show pattern/comment) */
  hideTypeColumn?: boolean
  /** Show search input */
  searchable?: boolean
  /** Max height with scroll */
  maxHeight?: number
  /** Enable fullscreen button (shows Maximize2 icon on hover) */
  fullscreen?: boolean
  /** Title for the fullscreen overlay header */
  fullscreenTitle?: string
  className?: string
}

/**
 * PatternBadge - Clickable pattern badge with truncation and tooltip
 * - Dynamic width with max-width of 240px
 * - CSS truncation via text-ellipsis
 * - Tooltip shows full pattern on hover (only for patterns 30+ chars)
 * - Click to copy pattern to clipboard with toast notification
 */
function PatternBadge({ pattern }: { pattern: string }) {
  const { t } = useTranslation()
  const handleClick = async () => {
    try {
      await navigator.clipboard.writeText(pattern)
      toast.success(t('toast.patternCopied'))
    } catch {
      toast.error(t('toast.failedToCopyPattern'))
    }
  }

  const badge = (
    <button type="button" onClick={handleClick} className="-my-0.5 rounded-xs py-0.5 text-left">
      <Info_Badge color="muted" className="font-mono font-normal select-none">
        <span className="block overflow-hidden whitespace-nowrap text-ellipsis max-w-[240px]">
          {pattern}
        </span>
      </Info_Badge>
    </button>
  )

  // Only show tooltip for longer patterns (30+ chars)
  if (pattern.length >= 30) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>{badge}</TooltipTrigger>
        <TooltipContent className="font-mono max-w-md break-all">{pattern}</TooltipContent>
      </Tooltip>
    )
  }

  return badge
}

// Column definitions with sorting
function getColumnsWithType(t: TFunction): ColumnDef<PermissionRow>[] {
  return [
    {
      accessorKey: 'access',
      header: ({ column }) => <SortableHeader column={column} title={t("table.access")} className={INFO_TABLE_SORTABLE_HEADER_CLASS} />,
      cell: ({ row }) => (
        <div className="p-1.5 pl-2.5">
          <Info_StatusBadge status={row.original.access} className="whitespace-nowrap" />
        </div>
      ),
      minSize: 80,
    },
    {
      accessorKey: 'type',
      header: ({ column }) => <SortableHeader column={column} title={t("common.type")} className={INFO_TABLE_SORTABLE_HEADER_CLASS} />,
      cell: ({ row }) => (
        <div className="p-1.5 pl-2.5">
          <Info_Badge color="default" className="capitalize whitespace-nowrap">
            {row.original.type}
          </Info_Badge>
        </div>
      ),
      minSize: 80,
    },
    {
      accessorKey: 'pattern',
      header: ({ column }) => <SortableHeader column={column} title={t("table.pattern")} className={INFO_TABLE_SORTABLE_HEADER_CLASS} />,
      cell: ({ row }) => (
        <div className="p-1.5 pl-2.5">
          <PatternBadge pattern={row.original.pattern} />
        </div>
      ),
      minSize: 100,
    },
    {
      id: 'comment',
      accessorKey: 'comment',
      header: () => <span className={cn("p-1.5 pl-2.5", INFO_TABLE_HEADER_CLASS)}>{t("table.comment")}</span>,
      cell: ({ row }) => (
        <div className="p-1.5 pl-2.5 min-w-0">
          <span className="truncate block text-label text-secondary">
            {row.original.comment || '—'}
          </span>
        </div>
      ),
      meta: { fillWidth: true, truncate: true },
    },
  ]
}

function getColumnsWithoutType(t: TFunction): ColumnDef<PermissionRow>[] {
  return [
    {
      accessorKey: 'access',
      header: ({ column }) => <SortableHeader column={column} title={t("table.access")} className={INFO_TABLE_SORTABLE_HEADER_CLASS} />,
      cell: ({ row }) => (
        <div className="p-1.5 pl-2.5">
          <Info_StatusBadge status={row.original.access} className="whitespace-nowrap" />
        </div>
      ),
      minSize: 80,
    },
    {
      accessorKey: 'pattern',
      header: ({ column }) => <SortableHeader column={column} title={t("table.pattern")} className={INFO_TABLE_SORTABLE_HEADER_CLASS} />,
      cell: ({ row }) => (
        <div className="p-1.5 pl-2.5">
          <PatternBadge pattern={row.original.pattern} />
        </div>
      ),
      minSize: 100,
    },
    {
      id: 'comment',
      accessorKey: 'comment',
      header: () => <span className={cn("p-1.5 pl-2.5", INFO_TABLE_HEADER_CLASS)}>{t("table.comment")}</span>,
      cell: ({ row }) => (
        <div className="p-1.5 pl-2.5 min-w-0">
          <span className="truncate block text-label text-secondary">
            {row.original.comment || '—'}
          </span>
        </div>
      ),
      meta: { fillWidth: true, truncate: true },
    },
  ]
}

export function PermissionsDataTable({
  data,
  hideTypeColumn = false,
  searchable = false,
  maxHeight = 400,
  fullscreen = false,
  fullscreenTitle = 'Permissions',
  className,
}: PermissionsDataTableProps) {
  const { t } = useTranslation()
  const [isFullscreen, setIsFullscreen] = useState(false)
  const { isDark } = useTheme()
  const columnsWithType = useMemo(() => getColumnsWithType(t), [t])
  const columnsWithoutType = useMemo(() => getColumnsWithoutType(t), [t])
  const columns = hideTypeColumn ? columnsWithoutType : columnsWithType

  // Fullscreen button for toolbar - shown on hover
  const fullscreenButton = fullscreen ? (
    <Info_FullscreenButton onClick={() => setIsFullscreen(true)} />
  ) : undefined

  return (
    <>
      <Info_DataTable
        columns={columns}
        data={data}
        searchable={searchable ? { placeholder: t("table.searchPatterns") } : false}
        maxHeight={maxHeight}
        emptyContent={t("table.noPermissionsConfigured")}
        floatingAction={fullscreenButton}
        className={cn(fullscreen && 'group', className)}
      />

      {/* Fullscreen overlay - renders the table without scroll constraints */}
      {fullscreen && (
        <DataTableOverlay
          isOpen={isFullscreen}
          onClose={() => setIsFullscreen(false)}
          title={fullscreenTitle}
          subtitle={t("table.ruleCount", { count: data.length })}
          theme={isDark ? 'dark' : 'light'}
        >
          <Info_DataTable
            columns={columns}
            data={data}
            searchable={searchable ? { placeholder: t("table.searchPatterns") } : false}
            emptyContent={t("table.noPermissionsConfigured")}
          />
        </DataTableOverlay>
      )}
    </>
  )
}
