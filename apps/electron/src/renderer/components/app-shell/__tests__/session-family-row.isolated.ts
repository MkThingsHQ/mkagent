import { describe, expect, it, mock } from 'bun:test'
import { createElement, Fragment, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

// Isolate app-wide hooks; render the actual SessionItem and EntityRow slots.
mock.module('@/context/AppShellContext', () => ({ useAppShellContext: () => ({ isCompactMode: false }) }))
mock.module('@/actions', () => ({ useActionLabel: () => ({ hotkey: '' }) }))
mock.module('react-i18next', () => ({ useTranslation: () => ({ t: (key: string, options?: { count?: number }) => `${key}${options?.count == null ? '' : ` ${options.count}`}` }) }))
mock.module('../SessionMenu', () => ({ SessionMenu: () => null }))
mock.module('../BatchSessionMenu', () => ({ BatchSessionMenu: () => null }))
mock.module('../CompactSessionMenu', () => ({ CompactSessionMenu: () => null }))

const wrapper = ({ children }: { children?: ReactNode }) => createElement(Fragment, null, children)
mock.module('@mkagent/ui', () => ({
  Spinner: () => createElement('span', null, 'working'),
  ...Object.fromEntries(['DropdownMenu', 'DropdownMenuTrigger', 'DropdownMenuSub', 'DropdownMenuShortcut', 'StyledDropdownMenuContent', 'StyledDropdownMenuItem', 'StyledDropdownMenuSeparator', 'StyledDropdownMenuSubTrigger', 'StyledDropdownMenuSubContent'].map(name => [name, wrapper])),
}))

const { SessionItem, chipButtonProps } = await import('../SessionItem')
const { SessionListProvider } = await import('@/context/SessionListContext')
const context = {
  contentSearchResults: new Map(), isMultiSelectActive: false,
  onRenameClick() {}, onMarkUnread() {}, onDelete: async () => true,
  onSelectSessionById() {}, onOpenInNewWindow() {}, onFocusZone() {}, onKeyDown() {},
}

function render(collapsed: boolean, processing = false) {
  return renderToStaticMarkup(createElement(SessionListProvider, { value: context }, createElement(SessionItem, {
    item: { id: 'parent', workspaceId: 'ws', name: 'Parent session', lastMessageAt: 0, isProcessing: processing },
    index: 0, itemProps: {}, isSelected: false, isFirstInGroup: true, isInMultiSelect: false,
    onSelect() {}, subSessions: { count: 2, collapsed, onToggle() {} },
  })))
}

describe('session-family row', () => {
  it('renders the accessible collapse control and count through the real row slots', () => {
    expect(render(false)).toContain('aria-expanded="true"')
    expect(render(false)).toContain('session.hideSubSessions 2')
    expect(render(false)).toContain('session.subSessionCount 2')
    expect(render(true)).toContain('aria-expanded="false"')
    expect(render(true)).toContain('session.showSubSessions 2')
  })

  it('keeps the collapse control alongside a working state', () => {
    const html = render(false, true)
    expect(html).toContain('session.runState.working')
    expect(html).toContain('session.hideSubSessions 2')
    expect(html).not.toContain('session.subSessionCount 2')
  })

  it('toggles by Enter or Space without selecting the row', () => {
    let activations = 0
    let stops = 0
    const props = chipButtonProps(() => activations++)
    const event = (key: string) => ({ key, preventDefault() {}, stopPropagation() { stops++ } })
    props.onKeyDown(event('ArrowDown') as never)
    expect(activations).toBe(0)
    props.onKeyDown(event('Enter') as never)
    props.onKeyDown(event(' ') as never)
    expect(activations).toBe(2)
    expect(stops).toBe(2)
  })
})
