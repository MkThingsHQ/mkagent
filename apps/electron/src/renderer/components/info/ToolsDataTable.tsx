/**
 * ToolsDataTable
 *
 * Typed Data Table for displaying MCP tools.
 * Features: searchable tools, sortable columns, max-height scroll.
 */

import * as React from 'react'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import type { TFunction } from 'i18next'
import type { ColumnDef } from '@tanstack/react-table'
import { Info_DataTable, SortableHeader, INFO_TABLE_HEADER_CLASS, INFO_TABLE_SORTABLE_HEADER_CLASS } from './Info_DataTable'
import { Info_StatusBadge } from './Info_StatusBadge'

export type ToolPermission = 'allowed' | 'requires-permission'

export interface ToolRow {
  name: string
  description: string
  permission: ToolPermission
}

interface ToolsDataTableProps {
  data: ToolRow[]
  /** Show loading spinner */
  loading?: boolean
  /** Show error message */
  error?: string
  /** Max height with scroll (default: 400) */
  maxHeight?: number
  className?: string
}

/** Tools list (mockup `.tools-list`): mono tool name, its description, then the access chip. */
function getColumns(t: TFunction): ColumnDef<ToolRow>[] {
  return [
    {
      accessorKey: 'name',
      header: ({ column }) => <SortableHeader column={column} title={t("table.tool")} className={INFO_TABLE_SORTABLE_HEADER_CLASS} />,
      cell: ({ row }) => (
        <div className="p-1.5 pl-2.5">
          <code className="whitespace-nowrap font-mono text-mono-ui font-medium text-foreground">
            {row.original.name}
          </code>
        </div>
      ),
      minSize: 100,
    },
    {
      id: 'description',
      accessorKey: 'description',
      header: () => <span className={cn("p-1.5 pl-2.5", INFO_TABLE_HEADER_CLASS)}>{t("common.description")}</span>,
      // Descriptions wrap to two lines (mockup .tools-list) so long ones neither stretch the row nor
      // push the access column out of view
      cell: ({ row }) => (
        <div className="p-1.5 pl-2.5 min-w-0">
          <span className="line-clamp-2 break-words text-label text-secondary">{row.original.description}</span>
        </div>
      ),
      meta: { fillWidth: true },
    },
    {
      accessorKey: 'permission',
      header: ({ column }) => <SortableHeader column={column} title={t("table.access")} className={INFO_TABLE_SORTABLE_HEADER_CLASS} />,
      cell: ({ row }) => (
        <div className="p-1.5 pl-2.5 pr-3.5">
          <Info_StatusBadge status={row.original.permission} className="whitespace-nowrap" />
        </div>
      ),
      minSize: 80,
    },
  ]
}

export function ToolsDataTable({
  data,
  loading,
  error,
  maxHeight = 400,
  className,
}: ToolsDataTableProps) {
  const { t } = useTranslation()
  const columns = useMemo(() => getColumns(t), [t])

  return (
    <Info_DataTable
      columns={columns}
      data={data}
      loading={loading}
      error={error}
      maxHeight={maxHeight}
      emptyContent={t("table.noToolsAvailable")}
      className={className}
    />
  )
}
