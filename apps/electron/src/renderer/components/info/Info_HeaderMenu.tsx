/**
 * Info_HeaderMenu
 *
 * The "⋯" actions menu in a detail page header (mockup source detail: "More source actions").
 * Detail pages put their title in the hero, so the menu that used to hang off the header title
 * lives here — same menu content, a named icon trigger.
 */

import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { MoreHorizontal } from 'lucide-react'
import { HeaderIconButton } from '@/components/ui/HeaderIconButton'
import { DropdownMenu, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { StyledDropdownMenuContent } from '@/components/ui/styled-dropdown'

export function Info_HeaderMenu({
  children,
  label,
}: {
  /** Menu items (e.g. <SourceMenu />) */
  children: React.ReactNode
  /** Accessible name for the trigger (defaults to "More") */
  label?: string
}) {
  const { t } = useTranslation()
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <HeaderIconButton
          aria-label={label ?? t('common.more')}
          icon={<MoreHorizontal className="size-4" />}
        />
      </DropdownMenuTrigger>
      <StyledDropdownMenuContent align="end">
        {children}
      </StyledDropdownMenuContent>
    </DropdownMenu>
  )
}
