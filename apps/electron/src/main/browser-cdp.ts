/**
 * Browser CDP Helpers
 *
 * Uses Electron's webContents.debugger API (Chrome DevTools Protocol) for:
 * - Accessibility tree snapshots with ref-based element identification
 * - Element interaction (click, fill, select) via CDP commands
 *
 * This is the same approach used by Playwright/Stagehand — deterministic,
 * no fragile CSS selectors needed.
 */

import type { WebContents } from 'electron'
import { mainLog } from './logger'

export interface AccessibilityNode {
  ref: string           // "@e1", "@e2", etc.
  role: string          // "button", "link", "textbox", etc.
  name: string          // Accessible name
  value?: string        // Current value (for inputs)
  description?: string  // Additional description
  focused?: boolean
  checked?: boolean
  disabled?: boolean
}

export interface AccessibilitySnapshot {
  url: string
  title: string
  nodes: AccessibilityNode[]
}

export interface ElementBox {
  x: number
  y: number
  width: number
  height: number
}

export interface ElementGeometry {
  ref: string
  role?: string
  name?: string
  box: ElementBox
  clickPoint: { x: number; y: number }
}

export interface ViewportMetrics {
  width: number
  height: number
  dpr: number
  scrollX: number
  scrollY: number
}

// Roles that are typically interactive or contain meaningful content
const INTERACTIVE_ROLES = new Set([
  'button', 'link', 'textbox', 'searchbox', 'combobox',
  'checkbox', 'radio', 'switch', 'slider', 'spinbutton',
  'tab', 'menuitem', 'menuitemcheckbox', 'menuitemradio',
  'option', 'treeitem', 'row', 'cell', 'columnheader',
  'rowheader', 'gridcell',
])

const CONTENT_ROLES = new Set([
  'heading', 'img', 'table', 'list', 'listitem',
  'paragraph', 'blockquote', 'article', 'main',
  'navigation', 'complementary', 'contentinfo', 'banner',
  'form', 'region', 'alert', 'dialog', 'alertdialog',
  'status', 'progressbar', 'meter', 'timer',
])

const MAX_AX_SNAPSHOT_NODES = 500
const FALLBACK_EXCLUDED_ROLES = new Set(['none', 'generic', 'rootwebarea', 'webarea'])

function normalizeAxText(value: unknown): string {
  return String(value ?? '').trim()
}

function incrementCount(map: Map<string, number>, key: string): void {
  map.set(key, (map.get(key) ?? 0) + 1)
}

function summarizeTopCounts(map: Map<string, number>, maxEntries = 8): string {
  return Array.from(map.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxEntries)
    .map(([key, count]) => `${key}:${count}`)
    .join(', ')
}

const CDP_IDLE_DETACH_MS = 5_000

const POLL_INTERVAL_MS = 50
/** How long `select` waits for a listbox or menu to open, and for its options to render. */
const SELECT_POPUP_TIMEOUT_MS = 1_500
const SELECT_OPTION_TIMEOUT_MS = 1_000

/** How a click reached the element: trusted mouse input, or DOM events when that was not possible. */
export interface ClickOutcome {
  via: 'mouse' | 'script'
  /** Why the click fell back to DOM events. */
  note?: string
  point?: { x: number; y: number }
}

/** A Runtime.callFunctionOn argument. */
type CallArgument = { value: unknown } | { objectId: string }

const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms))

function describeException(details: any): string {
  return String(details?.exception?.description ?? details?.text ?? 'page function failed')
}

interface CdpKeyDefinition {
  key: string
  code: string
  keyCode: number
  text?: string
}

const NAMED_KEYS: Record<string, CdpKeyDefinition> = {
  enter: { key: 'Enter', code: 'Enter', keyCode: 13, text: '\r' },
  return: { key: 'Enter', code: 'Enter', keyCode: 13, text: '\r' },
  escape: { key: 'Escape', code: 'Escape', keyCode: 27 },
  esc: { key: 'Escape', code: 'Escape', keyCode: 27 },
  tab: { key: 'Tab', code: 'Tab', keyCode: 9 },
  backspace: { key: 'Backspace', code: 'Backspace', keyCode: 8 },
  delete: { key: 'Delete', code: 'Delete', keyCode: 46 },
  del: { key: 'Delete', code: 'Delete', keyCode: 46 },
  space: { key: ' ', code: 'Space', keyCode: 32, text: ' ' },
  spacebar: { key: ' ', code: 'Space', keyCode: 32, text: ' ' },
  arrowup: { key: 'ArrowUp', code: 'ArrowUp', keyCode: 38 },
  up: { key: 'ArrowUp', code: 'ArrowUp', keyCode: 38 },
  arrowdown: { key: 'ArrowDown', code: 'ArrowDown', keyCode: 40 },
  down: { key: 'ArrowDown', code: 'ArrowDown', keyCode: 40 },
  arrowleft: { key: 'ArrowLeft', code: 'ArrowLeft', keyCode: 37 },
  left: { key: 'ArrowLeft', code: 'ArrowLeft', keyCode: 37 },
  arrowright: { key: 'ArrowRight', code: 'ArrowRight', keyCode: 39 },
  right: { key: 'ArrowRight', code: 'ArrowRight', keyCode: 39 },
  home: { key: 'Home', code: 'Home', keyCode: 36 },
  end: { key: 'End', code: 'End', keyCode: 35 },
  pageup: { key: 'PageUp', code: 'PageUp', keyCode: 33 },
  pagedown: { key: 'PageDown', code: 'PageDown', keyCode: 34 },
}

/** CDP key fields for a key name agents send (Electron accelerator names included); null = unknown. */
export function resolveCdpKey(name: string, shift = false): CdpKeyDefinition | null {
  const trimmed = name.trim()
  if (/^[a-z]$/i.test(trimmed)) {
    const upper = trimmed.toUpperCase()
    const key = shift ? upper : trimmed.toLowerCase()
    return { key, code: `Key${upper}`, keyCode: upper.charCodeAt(0), text: key }
  }
  if (/^[0-9]$/.test(trimmed)) {
    return { key: trimmed, code: `Digit${trimmed}`, keyCode: trimmed.charCodeAt(0), text: trimmed }
  }
  const functionKey = /^f([1-9]|1[0-2])$/i.exec(trimmed)
  if (functionKey) {
    const n = Number(functionKey[1])
    return { key: `F${n}`, code: `F${n}`, keyCode: 111 + n }
  }
  return NAMED_KEYS[trimmed.toLowerCase().replace(/[\s_-]/g, '')] ?? null
}

// ---------------------------------------------------------------------------
// Page functions (Runtime.callFunctionOn, `this` = the element). The marker
// comment names each one in CDP traffic and lets tests tell them apart. A ref
// can point at a text node, so each starts from the nearest element.
// ---------------------------------------------------------------------------

const PAGE_HELPERS = `
  const elementOf = (node) => node && node.nodeType === 1 ? node : node && node.parentElement
  const isVisible = (el) => {
    if (!el || !el.isConnected) return false
    const style = getComputedStyle(el)
    if (style.display === 'none' || style.visibility === 'hidden') return false
    const rect = el.getBoundingClientRect()
    return rect.width > 0 && rect.height > 0
  }
  const normalize = (text) => String(text ?? '').replace(/\\s+/g, ' ').trim().toLowerCase()
  const POPUPS = '[role="listbox"], [role="menu"], [cmdk-list]'
  const ITEMS = '[role="option"], [role="menuitem"], [role="menuitemradio"], [role="menuitemcheckbox"], [cmdk-item], option'
  const RECEIVERS = 'a[href], button, input, select, textarea, label, summary, [tabindex]:not([tabindex="-1"]), [role="button"], [role="link"], [role="tab"], [role="option"], [role="menuitem"], [role="menuitemradio"], [role="menuitemcheckbox"], [role="checkbox"], [role="radio"], [role="switch"], [role="treeitem"]'
`

/** Scroll the element to the viewport centre, instantly, unless it is fully visible; then let it paint. */
const SCROLL_INTO_VIEW_FN = `function() { /* craft:scroll-into-view */ ${PAGE_HELPERS}
  const el = elementOf(this)
  if (!el) return false
  const rect = el.getBoundingClientRect()
  const inView = rect.top >= 0 && rect.left >= 0 && rect.bottom <= innerHeight && rect.right <= innerWidth
  // "instant" overrides scroll-behavior: smooth, which left clicks aimed at a box still moving.
  if (!inView) el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' })
  return new Promise((resolve) => {
    let settled = false
    const done = () => { if (!settled) { settled = true; resolve(true) } }
    requestAnimationFrame(() => requestAnimationFrame(done))
    setTimeout(done, 150) // a hidden page may not run animation frames
  })
}`

/** Whether a click at (x, y) lands on the element (or the control it sits in), or what covers it. */
const HIT_TEST_FN = `function(x, y) { /* craft:hit-test */ ${PAGE_HELPERS}
  const el = elementOf(this)
  // Frame coordinates differ from the viewport's: trust the mouse path and its probe there.
  if (!el || window !== window.top) return { ok: true }
  let hit = document.elementFromPoint(x, y)
  while (hit && hit.shadowRoot) {
    const inner = hit.shadowRoot.elementFromPoint(x, y)
    if (!inner || inner === hit) break
    hit = inner
  }
  if (!hit) return { ok: false, covering: 'nothing at that point' }
  const within = (root, node) => { for (let n = node; n; n = n.parentNode || n.host) { if (n === root) return true } return false }
  const receiver = el.closest(RECEIVERS) || el
  if (within(el, hit) || within(receiver, hit)) return { ok: true }
  const classes = typeof hit.className === 'string' ? hit.className.trim().split(/\\s+/).filter(Boolean).slice(0, 2) : []
  return { ok: false, covering: hit.tagName.toLowerCase() + (hit.id ? '#' + hit.id : '') + classes.map((c) => '.' + c).join('') }
}`

/** Record whether the next pointerdown/mousedown/click reaches the element (capture phase, so the page can't hide it). */
const ARM_CLICK_PROBE_FN = `function() { /* craft:arm-click-probe */ ${PAGE_HELPERS}
  const el = elementOf(this)
  if (!el) return false
  const receiver = el.closest(RECEIVERS) || el
  const seen = { down: false, click: false }
  const onEvent = (event) => {
    if (!event.composedPath().includes(receiver)) return
    if (event.type === 'click') seen.click = true
    else seen.down = true
  }
  const types = ['pointerdown', 'mousedown', 'click']
  for (const type of types) window.addEventListener(type, onEvent, true)
  el.__craftClickProbe = { seen, stop: () => { for (const type of types) window.removeEventListener(type, onEvent, true) } }
  return true
}`

const READ_CLICK_PROBE_FN = `function() { /* craft:read-click-probe */ ${PAGE_HELPERS}
  const el = elementOf(this)
  const probe = el && el.__craftClickProbe
  if (!probe) return null
  probe.stop()
  delete el.__craftClickProbe
  return probe.seen
}`

/**
 * Click with DOM events: the pointer and mouse sequence frameworks listen to (Radix opens menus on
 * a mouse-type pointerdown), then element.click() for the activation itself. A cancelled pointerdown
 * suppresses the mouse events, as in a real click.
 */
const SCRIPT_CLICK_FN = `function(x, y) { /* craft:script-click */ ${PAGE_HELPERS}
  const el = elementOf(this)
  if (!el) return false
  const rect = el.getBoundingClientRect()
  const clientX = typeof x === 'number' ? x : rect.left + rect.width / 2
  const clientY = typeof y === 'number' ? y : rect.top + rect.height / 2
  const mouse = { bubbles: true, cancelable: true, composed: true, view: window, clientX, clientY, screenX: clientX, screenY: clientY, button: 0 }
  const pointer = { ...mouse, pointerId: 1, pointerType: 'mouse', isPrimary: true, width: 1, height: 1 }
  const fire = (type, Ctor, init) => {
    try { return el.dispatchEvent(new Ctor(type, init)) } catch { return el.dispatchEvent(new MouseEvent(type, init)) }
  }
  fire('pointerover', PointerEvent, { ...pointer, buttons: 0 })
  fire('mouseover', MouseEvent, { ...mouse, buttons: 0 })
  const downAllowed = fire('pointerdown', PointerEvent, { ...pointer, buttons: 1 })
  if (downAllowed) fire('mousedown', MouseEvent, { ...mouse, buttons: 1, detail: 1 })
  if (typeof el.focus === 'function') el.focus({ preventScroll: true })
  fire('pointerup', PointerEvent, { ...pointer, buttons: 0 })
  if (downAllowed) fire('mouseup', MouseEvent, { ...mouse, buttons: 0, detail: 1 })
  if (typeof el.click === 'function') el.click() // SVG elements have no click()
  else fire('click', MouseEvent, { ...mouse, buttons: 0, detail: 1 })
  return true
}`

/** Empty an input through the native value setter, so React's value tracker sees the change. */
const CLEAR_VALUE_FN = `function() { /* craft:clear-value */
  const proto = this instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : this instanceof HTMLInputElement ? HTMLInputElement.prototype : null
  if (!proto) return false
  Object.getOwnPropertyDescriptor(proto, 'value').set.call(this, '')
  this.dispatchEvent(new Event('input', { bubbles: true }))
  return true
}`

/**
 * After typing: if the input does not hold the value (a controlled input re-rendered over the
 * keystrokes, or some went elsewhere), set it through the native setter so React picks it up.
 */
const SETTLE_VALUE_FN = `function(value) { /* craft:settle-value */
  const proto = this instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : this instanceof HTMLInputElement ? HTMLInputElement.prototype : null
  const isPassword = this instanceof HTMLInputElement && this.type === 'password'
  if (proto && this.value !== value) {
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(this, value)
    this.dispatchEvent(new Event('input', { bubbles: true }))
  }
  this.dispatchEvent(new Event('change', { bubbles: true }))
  return { isPassword }
}`

/** Native <select>: choose by value, else by visible text. null = not a native select. */
const SELECT_NATIVE_FN = `function(value) { /* craft:select-native */ ${PAGE_HELPERS}
  if (!(this instanceof HTMLSelectElement)) return null
  const wanted = normalize(value)
  const label = (option) => normalize(option.label || option.textContent)
  const options = Array.from(this.options)
  const match = options.find((o) => o.value === value)
    || options.find((o) => normalize(o.value) === wanted || label(o) === wanted)
    || options.find((o) => label(o).startsWith(wanted))
    || options.find((o) => label(o).includes(wanted))
  if (!match) return { ok: false, options: options.slice(0, 30).map((o) => (o.label || o.textContent || o.value).trim()) }
  if (match.disabled) return { ok: false, reason: 'option "' + (match.label || match.textContent).trim() + '" is disabled' }
  Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(this, match.value)
  this.dispatchEvent(new Event('input', { bubbles: true }))
  this.dispatchEvent(new Event('change', { bubbles: true }))
  return { ok: this.value === match.value }
}`

/** Remember which popups were already open, so a newly opened one can be told apart. Returns whether the trigger is expanded. */
const POPUP_BASELINE_FN = `function() { /* craft:popup-baseline */ ${PAGE_HELPERS}
  window.__craftPopupBaseline = new WeakSet(Array.from(document.querySelectorAll(POPUPS)).filter(isVisible))
  return this.getAttribute && this.getAttribute('aria-expanded') === 'true'
}`

/** The listbox or menu the trigger opened: aria-controls/owns, else an open (data-state) or newly shown popup. */
const FIND_POPUP_FN = `function() { /* craft:find-popup */ ${PAGE_HELPERS}
  const trigger = elementOf(this)
  if (!trigger) return null
  for (const id of [trigger.getAttribute('aria-controls'), trigger.getAttribute('aria-owns')]) {
    const linked = id ? document.getElementById(id) : null
    if (isVisible(linked) && (linked.matches(POPUPS) || linked.querySelector(ITEMS))) return linked
  }
  const baseline = window.__craftPopupBaseline
  const candidates = Array.from(document.querySelectorAll(POPUPS)).filter((el) => isVisible(el) && !el.contains(trigger))
  return candidates.find((el) => el.getAttribute('data-state') === 'open')
    || candidates.find((el) => !(baseline && baseline.has(el)))
    || null
}`

/** The enabled, visible option whose text or value matches: exact, then prefix, then substring. */
const FIND_OPTION_FN = `function(value) { /* craft:find-option */ ${PAGE_HELPERS}
  const wanted = normalize(value)
  if (!wanted) return null
  const items = Array.from(this.querySelectorAll(ITEMS)).filter((el) => isVisible(el)
    && el.getAttribute('aria-disabled') !== 'true' && !el.hasAttribute('data-disabled') && !el.disabled)
  const labels = (el) => [el.textContent, el.getAttribute('aria-label'), el.getAttribute('data-value'), el.getAttribute('value')].map(normalize).filter(Boolean)
  return items.find((el) => labels(el).some((l) => l === wanted))
    || items.find((el) => labels(el).some((l) => l.startsWith(wanted)))
    || items.find((el) => labels(el).some((l) => l.includes(wanted)))
    || null
}`

const LIST_OPTIONS_FN = `function() { /* craft:list-options */ ${PAGE_HELPERS}
  return Array.from(this.querySelectorAll(ITEMS)).filter(isVisible).slice(0, 20).map((el) => normalize(el.textContent)).filter(Boolean)
}`

const OPTION_TEXT_FN = `function() { /* craft:option-text */
  return String(this.textContent ?? '').replace(/\\s+/g, ' ').trim()
}`

/** A search box that filters the list: the trigger itself (combobox input) or one in the popup's container. */
const FIND_SEARCH_INPUT_FN = `function(trigger) { /* craft:find-search-input */ ${PAGE_HELPERS}
  const TEXT_INPUTS = 'input:not([type]), input[type="text"], input[type="search"], [cmdk-input]'
  if (trigger && trigger.matches && trigger.matches(TEXT_INPUTS)) return trigger
  const scope = this.closest('[cmdk-root], [role="dialog"], [data-radix-popper-content-wrapper]') || this
  return Array.from(scope.querySelectorAll(TEXT_INPUTS)).find(isVisible) || null
}`

const TYPE_SEARCH_FN = `function(value) { /* craft:type-search */
  if (typeof this.focus === 'function') this.focus()
  const proto = this instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
  Object.getOwnPropertyDescriptor(proto, 'value').set.call(this, value)
  this.dispatchEvent(new Event('input', { bubbles: true }))
  return true
}`

/** The choice took: the trigger shows it, the option is marked selected, or the popup closed. */
const VERIFY_SELECTION_FN = `function(popup, option, text) { /* craft:verify-selection */ ${PAGE_HELPERS}
  const trigger = elementOf(this)
  const shown = normalize([trigger && trigger.value, trigger && trigger.getAttribute('aria-valuetext'), trigger && trigger.textContent].filter(Boolean).join(' '))
  const reflects = !!text && shown.includes(normalize(text))
  const marked = !!option && (option.getAttribute('aria-selected') === 'true' || option.getAttribute('aria-checked') === 'true' || option.getAttribute('data-state') === 'checked')
  const closed = !popup || !isVisible(popup)
  return { ok: reflects || marked || closed }
}`

export class BrowserCDP {
  private webContents: WebContents
  private attached = false
  private pendingCommands = 0
  private detachListenerRegistered = false
  private idleDetachTimer: ReturnType<typeof setTimeout> | null = null
  // Map from "@eN" refs to backend node IDs for the current snapshot.
  private refMap: Map<string, number> = new Map()
  // Map from "@eN" refs to semantic details captured during snapshot.
  private refDetails: Map<string, { role: string; name: string }> = new Map()
  // Stable mapping for backend DOM nodes across snapshots.
  private backendNodeRefMap: Map<number, string> = new Map()
  private nextRefCounter = 0

  constructor(webContents: WebContents) {
    this.webContents = webContents
  }

  private async ensureAttached(): Promise<void> {
    if (this.attached) return
    try {
      this.webContents.debugger.attach('1.3')
      this.attached = true
    } catch (err) {
      // May already be attached
      if (String(err).includes('Already attached')) {
        this.attached = true
      } else {
        throw err
      }
    }

    if (!this.detachListenerRegistered) {
      this.detachListenerRegistered = true
      this.webContents.debugger.on('detach', () => {
        this.attached = false
      })
    }
  }

  private resetIdleDetachTimer(): void {
    if (this.idleDetachTimer) {
      clearTimeout(this.idleDetachTimer)
    }
    this.idleDetachTimer = setTimeout(() => {
      if (this.attached) {
        mainLog.info('[browser-cdp] idle detach — detaching debugger after inactivity')
        this.detach()
      }
    }, CDP_IDLE_DETACH_MS)
  }

  detach(): void {
    if (this.idleDetachTimer) {
      clearTimeout(this.idleDetachTimer)
      this.idleDetachTimer = null
    }
    if (this.attached) {
      try {
        this.webContents.debugger.detach()
      } catch { /* ignore */ }
      this.attached = false
    }
  }

  private async send(method: string, params?: Record<string, unknown>): Promise<any> {
    this.pendingCommands++
    if (this.idleDetachTimer) {
      clearTimeout(this.idleDetachTimer)
      this.idleDetachTimer = null
    }
    try {
      await this.ensureAttached()
      return await this.webContents.debugger.sendCommand(method, params)
    } finally {
      this.pendingCommands--
      if (this.pendingCommands === 0) this.resetIdleDetachTimer()
    }
  }

  private allocateRef(backendDOMNodeId?: number): string {
    if (backendDOMNodeId !== undefined) {
      const existing = this.backendNodeRefMap.get(backendDOMNodeId)
      if (existing) {
        return existing
      }
    }

    this.nextRefCounter += 1
    const ref = `@e${this.nextRefCounter}`

    if (backendDOMNodeId !== undefined) {
      this.backendNodeRefMap.set(backendDOMNodeId, ref)
    }

    return ref
  }

  // ---------------------------------------------------------------------------
  // Accessibility Snapshot
  // ---------------------------------------------------------------------------

  async getAccessibilitySnapshot(): Promise<AccessibilitySnapshot> {
    const tree = await this.send('Accessibility.getFullAXTree')
    const nodes = Array.isArray(tree?.nodes) ? tree.nodes as any[] : []

    this.refMap.clear()
    this.refDetails.clear()
    const result: AccessibilityNode[] = []
    const fallbackCandidates: Array<{
      backendDOMNodeId: number
      role: string
      name: string
      value?: string
      description?: string
      focused?: boolean
      checked?: boolean
      disabled?: boolean
    }> = []

    const rawRoleCounts = new Map<string, number>()
    const droppedReasonCounts = new Map<string, number>()

    const seenBackendNodeIds = new Set<number>()

    const pushAccessNode = (entry: {
      backendDOMNodeId?: number
      role: string
      name: string
      value?: string
      description?: string
      focused?: boolean
      checked?: boolean
      disabled?: boolean
    }): boolean => {
      if (result.length >= MAX_AX_SNAPSHOT_NODES) return false

      if (entry.backendDOMNodeId !== undefined) {
        if (seenBackendNodeIds.has(entry.backendDOMNodeId)) {
          return true
        }
        seenBackendNodeIds.add(entry.backendDOMNodeId)
      }

      const ref = this.allocateRef(entry.backendDOMNodeId)

      if (entry.backendDOMNodeId !== undefined) {
        this.refMap.set(ref, entry.backendDOMNodeId)
      }
      this.refDetails.set(ref, { role: entry.role, name: entry.name })

      const accessNode: AccessibilityNode = {
        ref,
        role: entry.role,
        name: entry.name,
      }

      if (entry.value !== undefined) accessNode.value = entry.value
      if (entry.description) accessNode.description = entry.description
      if (entry.focused) accessNode.focused = true
      if (entry.checked) accessNode.checked = true
      if (entry.disabled) accessNode.disabled = true

      result.push(accessNode)
      return true
    }

    for (const node of nodes) {
      const role = normalizeAxText(node.role?.value).toLowerCase()
      const name = normalizeAxText(node.name?.value)
      const rawValue = node.value?.value
      const hasValue = rawValue !== undefined && rawValue !== ''
      const value = hasValue ? String(rawValue) : undefined
      const description = normalizeAxText(node.description?.value) || undefined
      const backendDOMNodeId = typeof node.backendDOMNodeId === 'number' ? node.backendDOMNodeId : undefined

      incrementCount(rawRoleCounts, role || '(empty)')

      let focused = false
      let checked = false
      let disabled = false
      let focusable = false

      const props = node.properties as any[] | undefined
      if (props) {
        for (const prop of props) {
          if (prop.name === 'focused' && prop.value?.value === true) focused = true
          if (prop.name === 'checked' && prop.value?.value !== 'false') checked = prop.value?.value === true || prop.value?.value === 'true'
          if (prop.name === 'disabled' && prop.value?.value === true) disabled = true
          if (prop.name === 'focusable' && prop.value?.value === true) focusable = true
        }
      }

      const isInteractive = INTERACTIVE_ROLES.has(role)
      const isContent = CONTENT_ROLES.has(role) && !!name
      const hasPrimarySignal = isInteractive || isContent || hasValue
      const isGenericWithoutName = (!role || role === 'generic' || role === 'none') && !name

      if (!hasPrimarySignal) {
        incrementCount(droppedReasonCounts, 'no-primary-signal')
      } else if (isGenericWithoutName) {
        incrementCount(droppedReasonCounts, 'generic-without-name')
      }

      const shouldKeepPrimary = hasPrimarySignal && !isGenericWithoutName

      if (shouldKeepPrimary) {
        pushAccessNode({
          backendDOMNodeId,
          role,
          name,
          value,
          description,
          focused,
          checked,
          disabled,
        })

        if (result.length >= MAX_AX_SNAPSHOT_NODES) break
        continue
      }

      const fallbackEligible = !!backendDOMNodeId
        && !FALLBACK_EXCLUDED_ROLES.has(role)
        && (!!name || hasValue || focusable || focused)

      if (fallbackEligible) {
        fallbackCandidates.push({
          backendDOMNodeId,
          role,
          name,
          value,
          description,
          focused,
          checked,
          disabled,
        })
      }
    }

    let fallbackKept = 0
    if (result.length === 0 && fallbackCandidates.length > 0) {
      for (const candidate of fallbackCandidates) {
        const pushed = pushAccessNode(candidate)
        if (!pushed) break
        fallbackKept++
      }

      mainLog.info(
        `[browser-cdp] snapshot fallback engaged url=${this.webContents.getURL()} raw=${nodes.length} kept=${result.length} fallbackKept=${fallbackKept} roles=[${summarizeTopCounts(rawRoleCounts)}] dropped=[${summarizeTopCounts(droppedReasonCounts)}]`,
      )
    }

    if (result.length === 0 && nodes.length > 0) {
      mainLog.warn(
        `[browser-cdp] snapshot produced zero nodes url=${this.webContents.getURL()} raw=${nodes.length} roles=[${summarizeTopCounts(rawRoleCounts)}] dropped=[${summarizeTopCounts(droppedReasonCounts)}]`,
      )
    }

    return {
      url: this.webContents.getURL(),
      title: this.webContents.getTitle(),
      nodes: result,
    }
  }

  // ---------------------------------------------------------------------------
  // Screenshot Annotation Helpers
  // ---------------------------------------------------------------------------

  async getElementGeometry(ref: string): Promise<ElementGeometry> {
    const backendNodeId = this.requireBackendNodeId(ref)

    const { model } = await this.send('DOM.getBoxModel', { backendNodeId })
    const content = model.content as number[]

    const xs = [content[0], content[2], content[4], content[6]]
    const ys = [content[1], content[3], content[5], content[7]]

    const minX = Math.min(...xs)
    const maxX = Math.max(...xs)
    const minY = Math.min(...ys)
    const maxY = Math.max(...ys)

    const clickX = (content[0] + content[2] + content[4] + content[6]) / 4
    const clickY = (content[1] + content[3] + content[5] + content[7]) / 4

    const details = this.refDetails.get(ref)

    return {
      ref,
      role: details?.role,
      name: details?.name,
      box: {
        x: minX,
        y: minY,
        width: maxX - minX,
        height: maxY - minY,
      },
      clickPoint: { x: clickX, y: clickY },
    }
  }

  async getElementGeometryBySelector(selector: string): Promise<ElementGeometry> {
    const result = await this.send('Runtime.evaluate', {
      expression: `(() => {
        const candidates = Array.from(document.querySelectorAll(${JSON.stringify(selector)}));
        if (candidates.length === 0) return null;

        const isVisible = (el) => {
          if (!(el instanceof Element)) return false;
          const style = window.getComputedStyle(el);
          if (!style || style.display === 'none' || style.visibility === 'hidden') return false;
          if (Number(style.opacity || '1') === 0) return false;
          const rect = el.getBoundingClientRect();
          if (rect.width <= 0 || rect.height <= 0) return false;
          return true;
        };

        const el = candidates.find(isVisible) || candidates[0];
        const rect = el.getBoundingClientRect();
        const tag = (el.tagName && typeof el.tagName === 'string') ? el.tagName.toLowerCase() : 'element';
        const text = (typeof el.textContent === 'string') ? el.textContent.slice(0, 120) : '';
        return {
          x: rect.left,
          y: rect.top,
          width: rect.width,
          height: rect.height,
          cx: rect.left + rect.width / 2,
          cy: rect.top + rect.height / 2,
          tag,
          text,
        };
      })()`,
      returnByValue: true,
    })

    const value = result?.result?.value
    if (!value) {
      throw new Error(`No element found for selector "${selector}"`)
    }

    if (Number(value.width) <= 0 || Number(value.height) <= 0) {
      throw new Error(`Element found for selector "${selector}" has zero size`)
    }

    return {
      ref: `selector:${selector}`,
      role: String(value.tag || 'element'),
      name: String(value.text || '').trim(),
      box: {
        x: Number(value.x),
        y: Number(value.y),
        width: Number(value.width),
        height: Number(value.height),
      },
      clickPoint: {
        x: Number(value.cx),
        y: Number(value.cy),
      },
    }
  }

  async getViewportMetrics(): Promise<ViewportMetrics> {
    const result = await this.send('Runtime.evaluate', {
      expression: `(() => ({
        width: window.innerWidth,
        height: window.innerHeight,
        dpr: window.devicePixelRatio || 1,
        scrollX: window.scrollX || 0,
        scrollY: window.scrollY || 0
      }))()`,
      returnByValue: true,
    })

    const v = result?.result?.value ?? {}
    return {
      width: Number(v.width || 0),
      height: Number(v.height || 0),
      dpr: Number(v.dpr || 1),
      scrollX: Number(v.scrollX || 0),
      scrollY: Number(v.scrollY || 0),
    }
  }

  async renderTemporaryOverlay(params: {
    geometries: ElementGeometry[]
    includeMetadata?: boolean
    metadataText?: string
    includeClickPoints?: boolean
  }): Promise<void> {
    const payload = {
      geometries: params.geometries,
      includeMetadata: !!params.includeMetadata,
      metadataText: params.metadataText || '',
      includeClickPoints: params.includeClickPoints !== false,
    }

    await this.send('Runtime.evaluate', {
      expression: `(() => {
        const existing = document.getElementById('__mkagent_screenshot_overlay__');
        if (existing) existing.remove();

        const root = document.createElement('div');
        root.id = '__mkagent_screenshot_overlay__';
        root.style.position = 'fixed';
        root.style.inset = '0';
        root.style.pointerEvents = 'none';
        root.style.zIndex = '2147483647';

        const payload = ${JSON.stringify(payload)};

        for (const g of payload.geometries || []) {
          const box = document.createElement('div');
          box.style.position = 'fixed';
          box.style.left = g.box.x + 'px';
          box.style.top = g.box.y + 'px';
          box.style.width = g.box.width + 'px';
          box.style.height = g.box.height + 'px';
          box.style.border = '2px solid rgba(59, 130, 246, 0.95)';
          box.style.borderRadius = '6px';

          root.appendChild(box);

          const label = document.createElement('div');
          label.style.position = 'fixed';
          label.style.left = g.box.x + 'px';
          label.style.top = Math.max(4, g.box.y - 24) + 'px';
          label.style.padding = '2px 6px';
          label.style.borderRadius = '6px';
          label.style.font = '12px -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif';
          label.style.background = 'rgba(15, 23, 42, 0.92)';
          label.style.color = 'white';
          label.style.maxWidth = '70vw';
          label.style.whiteSpace = 'nowrap';
          label.style.overflow = 'hidden';
          label.style.textOverflow = 'ellipsis';
          const labelText = [g.ref, g.role, g.name].filter(Boolean).join(' • ');
          label.textContent = labelText;
          root.appendChild(label);

          if (payload.includeClickPoints && g.clickPoint) {
            const point = document.createElement('div');
            point.style.position = 'fixed';
            point.style.left = (g.clickPoint.x - 4) + 'px';
            point.style.top = (g.clickPoint.y - 4) + 'px';
            point.style.width = '8px';
            point.style.height = '8px';
            point.style.borderRadius = '999px';
            point.style.background = 'rgba(239, 68, 68, 0.98)';

            root.appendChild(point);
          }
        }

        if (payload.includeMetadata && payload.metadataText) {
          const meta = document.createElement('div');
          meta.style.position = 'fixed';
          meta.style.right = '8px';
          meta.style.bottom = '8px';
          meta.style.padding = '4px 8px';
          meta.style.borderRadius = '6px';
          meta.style.font = '11px -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif';
          meta.style.background = 'rgba(15, 23, 42, 0.92)';
          meta.style.color = 'white';
          meta.textContent = payload.metadataText;
          root.appendChild(meta);
        }

        document.documentElement.appendChild(root);
      })()`,
    })
  }

  async clearTemporaryOverlay(): Promise<void> {
    await this.send('Runtime.evaluate', {
      expression: `(() => {
        const existing = document.getElementById('__mkagent_screenshot_overlay__');
        if (existing) existing.remove();
      })()`,
    })
  }

  // ---------------------------------------------------------------------------
  // Mouse and keyboard input
  //
  // Trusted input goes through CDP (Input.dispatch*): it needs no window focus,
  // and agent windows are usually hidden, where webContents.sendInputEvent drops
  // events (Electron requires the window to be focused). CDP also takes CSS
  // pixels, the unit of every DOM geometry here. sendInputEvent is the fallback
  // when a CDP call throws.
  // ---------------------------------------------------------------------------

  /**
   * Generate a series of intermediate points between two coordinates.
   * Adds slight curve and jitter for realistic mouse movement.
   */
  private generateTrajectory(
    fromX: number, fromY: number,
    toX: number, toY: number,
    steps: number,
  ): Array<{ x: number; y: number }> {
    const points: Array<{ x: number; y: number }> = []
    for (let i = 1; i <= steps; i++) {
      const t = i / steps
      // Slight arc: offset perpendicular to the line
      const arcOffset = Math.sin(t * Math.PI) * Math.min(15, Math.sqrt((toX - fromX) ** 2 + (toY - fromY) ** 2) * 0.05)
      const dx = toX - fromX
      const dy = toY - fromY
      const len = Math.sqrt(dx * dx + dy * dy) || 1
      const perpX = -dy / len
      const perpY = dx / len
      // Small per-step jitter (±2px)
      const jitterX = (Math.random() - 0.5) * 4
      const jitterY = (Math.random() - 0.5) * 4
      points.push({
        x: Math.round(fromX + dx * t + perpX * arcOffset + jitterX),
        y: Math.round(fromY + dy * t + perpY * arcOffset + jitterY),
      })
    }
    // Ensure last point is exactly the target
    if (points.length > 0) {
      points[points.length - 1] = { x: Math.round(toX), y: Math.round(toY) }
    }
    return points
  }

  private sendMouseEvent(type: 'mouseMove' | 'mouseDown' | 'mouseUp', x: number, y: number, button?: 'left' | 'right' | 'middle', clickCount?: number): void {
    const event: Record<string, unknown> = { type, x: Math.round(x), y: Math.round(y) }
    if (button) event.button = button
    if (clickCount !== undefined) event.clickCount = clickCount
    this.webContents.sendInputEvent(event as any)
  }

  /** A left click through CDP, approached along a short trajectory like a person would. */
  private async clickAtCDP(x: number, y: number): Promise<void> {
    const targetX = Math.round(x)
    const targetY = Math.round(y)
    const startX = targetX + (Math.random() - 0.5) * 60
    const startY = targetY + (Math.random() - 0.5) * 60
    for (const point of this.generateTrajectory(startX, startY, targetX, targetY, 3 + Math.floor(Math.random() * 3))) {
      await this.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: point.x, y: point.y, button: 'none', buttons: 0 })
    }
    await this.send('Input.dispatchMouseEvent', {
      type: 'mousePressed',
      x: targetX,
      y: targetY,
      button: 'left',
      buttons: 1,
      clickCount: 1,
    })
    await sleep(20 + Math.random() * 40)
    await this.send('Input.dispatchMouseEvent', {
      type: 'mouseReleased',
      x: targetX,
      y: targetY,
      button: 'left',
      buttons: 0,
      clickCount: 1,
    })
  }

  private async clickAtNative(x: number, y: number): Promise<void> {
    const startX = x + (Math.random() - 0.5) * 60
    const startY = y + (Math.random() - 0.5) * 60
    for (const point of this.generateTrajectory(startX, startY, x, y, 3 + Math.floor(Math.random() * 3))) {
      this.sendMouseEvent('mouseMove', point.x, point.y)
      await sleep(4 + Math.random() * 8)
    }
    this.sendMouseEvent('mouseDown', x, y, 'left', 1)
    await sleep(20 + Math.random() * 40)
    this.sendMouseEvent('mouseUp', x, y, 'left', 1)
  }

  private async dragCDP(x1: number, y1: number, x2: number, y2: number): Promise<void> {
    const dx = x2 - x1
    const dy = y2 - y1
    const distance = Math.sqrt(dx * dx + dy * dy)
    const steps = Math.max(5, Math.min(20, Math.round(distance / 20)))
    let lastX = x1
    let lastY = y1

    await this.send('Input.dispatchMouseEvent', {
      type: 'mousePressed',
      x: x1,
      y: y1,
      button: 'left',
      buttons: 1,
      clickCount: 1,
    })

    try {
      for (let i = 1; i <= steps; i++) {
        const t = i / steps
        const x = Math.round(x1 + dx * t)
        const y = Math.round(y1 + dy * t)
        await this.send('Input.dispatchMouseEvent', {
          type: 'mouseMoved',
          x,
          y,
          button: 'left',
          buttons: 1,
        })
        lastX = x
        lastY = y

        if (i < steps) {
          await sleep(10)
        }
      }
    } finally {
      await this.send('Input.dispatchMouseEvent', {
        type: 'mouseReleased',
        x: lastX,
        y: lastY,
        button: 'left',
        buttons: 0,
        clickCount: 1,
      })
    }
  }

  private async dragNative(x1: number, y1: number, x2: number, y2: number): Promise<void> {
    const dx = x2 - x1
    const dy = y2 - y1
    const distance = Math.sqrt(dx * dx + dy * dy)
    const steps = Math.max(5, Math.min(20, Math.round(distance / 20)))

    this.sendMouseEvent('mouseMove', x1, y1)
    await sleep(10)
    this.sendMouseEvent('mouseDown', x1, y1, 'left', 1)
    await sleep(30)

    let lastX = x1
    let lastY = y1
    try {
      const trajectory = this.generateTrajectory(x1, y1, x2, y2, steps)
      for (let i = 0; i < trajectory.length; i++) {
        const point = trajectory[i]!
        this.sendMouseEvent('mouseMove', point.x, point.y)
        lastX = point.x
        lastY = point.y
        if (i < trajectory.length - 1) {
          await sleep(8 + Math.random() * 12)
        }
      }
    } finally {
      // Always release, even on error
      await sleep(20)
      this.sendMouseEvent('mouseUp', lastX, lastY, 'left', 1)
    }
  }

  /**
   * Whether CDP input can be used. Native input is only the fallback for a debugger that won't
   * attach: retrying after a CDP failure part-way through would click or drag twice.
   */
  private async canUseCdpInput(): Promise<boolean> {
    try {
      await this.ensureAttached()
      return true
    } catch (error) {
      mainLog.warn(`[browser-cdp] debugger unavailable, using native input: ${error instanceof Error ? error.message : String(error)}`)
      return false
    }
  }

  async clickAtCoordinates(x: number, y: number): Promise<void> {
    if (await this.canUseCdpInput()) await this.clickAtCDP(x, y)
    else await this.clickAtNative(x, y)
  }

  async drag(x1: number, y1: number, x2: number, y2: number): Promise<void> {
    if (await this.canUseCdpInput()) await this.dragCDP(x1, y1, x2, y2)
    else await this.dragNative(x1, y1, x2, y2)
  }

  async typeText(text: string): Promise<void> {
    for (const char of text) {
      await this.send('Input.dispatchKeyEvent', { type: 'keyDown', text: char })
      await this.send('Input.dispatchKeyEvent', { type: 'keyUp', text: char })
    }
  }

  /**
   * Press a key through CDP. Returns false for keys left to the native path: unknown names,
   * Ctrl/Cmd shortcuts (on macOS editing commands such as Cmd+A run through the app menu, which
   * CDP key events bypass), and a debugger that won't attach.
   */
  async pressKey(name: string, modifiers: ReadonlyArray<'shift' | 'control' | 'alt' | 'meta'> = []): Promise<boolean> {
    const definition = resolveCdpKey(name, modifiers.includes('shift'))
    if (!definition || modifiers.includes('control') || modifiers.includes('meta')) return false
    if (!(await this.canUseCdpInput())) return false
    const mask = (modifiers.includes('alt') ? 1 : 0) | (modifiers.includes('shift') ? 8 : 0)
    const text = modifiers.includes('alt') ? undefined : definition.text
    const base = {
      key: definition.key,
      code: definition.code,
      // Let Chromium derive the native key code; Windows values drop keys on macOS.
      windowsVirtualKeyCode: definition.keyCode,
      modifiers: mask,
    }
    await this.send('Input.dispatchKeyEvent', {
      ...base,
      type: text ? 'keyDown' : 'rawKeyDown',
      ...(text ? { text, unmodifiedText: text } : {}),
    })
    await this.send('Input.dispatchKeyEvent', { ...base, type: 'keyUp' })
    return true
  }

  async setClipboard(text: string): Promise<void> {
    await this.send('Runtime.evaluate', {
      expression: `navigator.clipboard.writeText(${JSON.stringify(text)})`,
      awaitPromise: true,
      userGesture: true,
    })
  }

  async getClipboard(): Promise<string> {
    const result = await this.send('Runtime.evaluate', {
      expression: 'navigator.clipboard.readText()',
      awaitPromise: true,
      userGesture: true,
    })
    return (result as any).result?.value ?? ''
  }

  // ---------------------------------------------------------------------------
  // Element Interaction
  // ---------------------------------------------------------------------------

  private requireBackendNodeId(ref: string): number {
    const backendNodeId = this.refMap.get(ref)
    if (!backendNodeId) {
      throw new Error(`Element ${ref} not found. Run browser_snapshot first to get current element refs.`)
    }
    return backendNodeId
  }

  /** Run a page function with `this` bound to the object; returns its JSON value. */
  private async callValue<T>(objectId: string, functionDeclaration: string, args: CallArgument[] = [], awaitPromise = false): Promise<T | undefined> {
    const response = await this.send('Runtime.callFunctionOn', {
      objectId,
      functionDeclaration,
      arguments: args,
      returnByValue: true,
      awaitPromise,
    })
    if (response?.exceptionDetails) throw new Error(describeException(response.exceptionDetails))
    return response?.result?.value as T | undefined
  }

  /** Run a page function that returns an element; returns its object id, or null. */
  private async callElement(objectId: string, functionDeclaration: string, args: CallArgument[] = []): Promise<string | null> {
    const response = await this.send('Runtime.callFunctionOn', { objectId, functionDeclaration, arguments: args })
    if (response?.exceptionDetails) throw new Error(describeException(response.exceptionDetails))
    return response?.result?.objectId ?? null
  }

  /** Poll a page function until it returns an element (React and Radix mount popups after the click). */
  private async pollElement(objectId: string, functionDeclaration: string, args: CallArgument[], timeoutMs: number): Promise<string | null> {
    const deadline = Date.now() + timeoutMs
    for (;;) {
      const found = await this.callElement(objectId, functionDeclaration, args)
      if (found || Date.now() >= deadline) return found
      await sleep(POLL_INTERVAL_MS)
    }
  }

  private async releaseObject(objectId: string | null | undefined): Promise<void> {
    if (!objectId) return
    try {
      await this.send('Runtime.releaseObject', { objectId })
    } catch {
      // The page navigated away and took the object with it.
    }
  }

  /** The centre of the element's largest visible part, in viewport CSS pixels; null when none is visible. */
  private async clickablePoint(objectId: string): Promise<{ x: number; y: number } | null> {
    let quads: number[][]
    let viewport: { clientWidth?: number; clientHeight?: number } | undefined
    try {
      const [contentQuads, metrics] = await Promise.all([
        this.send('DOM.getContentQuads', { objectId }),
        this.send('Page.getLayoutMetrics'),
      ])
      quads = Array.isArray(contentQuads?.quads) ? contentQuads.quads : []
      viewport = metrics?.cssLayoutViewport ?? metrics?.layoutViewport
    } catch {
      return null // not rendered (display: none, detached)
    }
    const width = Number(viewport?.clientWidth) || Number.POSITIVE_INFINITY
    const height = Number(viewport?.clientHeight) || Number.POSITIVE_INFINITY

    let best: { x: number; y: number } | null = null
    let bestArea = 1 // ignore slivers a person could not hit either
    for (const quad of quads) {
      const xs = [quad[0]!, quad[2]!, quad[4]!, quad[6]!]
      const ys = [quad[1]!, quad[3]!, quad[5]!, quad[7]!]
      const left = Math.max(0, Math.min(...xs))
      const right = Math.min(width, Math.max(...xs))
      const top = Math.max(0, Math.min(...ys))
      const bottom = Math.min(height, Math.max(...ys))
      const area = (right - left) * (bottom - top)
      if (right > left && bottom > top && area > bestArea) {
        bestArea = area
        best = { x: (left + right) / 2, y: (top + bottom) / 2 }
      }
    }
    return best
  }

  /**
   * Click an element the way a person would, and make sure it got the click.
   *
   * A trusted CDP click lands on the centre of the element's visible part once a hit test shows
   * nothing covers that point, and a capture-phase probe confirms the pointerdown reached it.
   * Otherwise (covered, off screen, or the click never arrived) the element gets DOM pointer and
   * mouse events plus element.click(), which is what made an OAuth consent page's Authorize
   * button respond.
   */
  private async clickObject(objectId: string, label: string, options: { scrolled?: boolean } = {}): Promise<ClickOutcome> {
    if (!options.scrolled) await this.callValue(objectId, SCROLL_INTO_VIEW_FN, [], true)
    const point = await this.clickablePoint(objectId)
    let note: string
    if (point) {
      const hit = await this.callValue<{ ok: boolean; covering?: string }>(objectId, HIT_TEST_FN, [{ value: point.x }, { value: point.y }])
      if (hit?.ok !== false) {
        await this.callValue(objectId, ARM_CLICK_PROBE_FN)
        let dispatched = true
        try {
          await this.clickAtCDP(point.x, point.y)
        } catch (error) {
          dispatched = false
          mainLog.warn(`[browser-cdp] CDP click failed for ${label}: ${error instanceof Error ? error.message : String(error)}`)
        }
        let seen: { down: boolean; click: boolean } | null | undefined
        try {
          seen = await this.callValue<{ down: boolean; click: boolean } | null>(objectId, READ_CLICK_PROBE_FN)
        } catch {
          // The click navigated and destroyed the page context: it arrived.
          return { via: 'mouse', point }
        }
        if (dispatched && (seen?.down || seen?.click)) return { via: 'mouse', point }
        note = dispatched ? 'the mouse click did not reach it' : 'mouse input failed'
      } else {
        note = `it was covered by ${hit.covering ?? 'another element'}`
      }
    } else {
      note = 'no part of it was visible in the viewport'
    }

    await this.callValue(objectId, SCRIPT_CLICK_FN, [{ value: point?.x ?? null }, { value: point?.y ?? null }])
    mainLog.info(`[browser-cdp] script click on ${label}: ${note}`)
    return { via: 'script', note, ...(point ? { point } : {}) }
  }

  async clickElement(ref: string): Promise<ElementGeometry & ClickOutcome> {
    const backendNodeId = this.requireBackendNodeId(ref)

    let objectId: string | undefined
    try {
      const { object } = await this.send('DOM.resolveNode', { backendNodeId })
      objectId = object.objectId as string
      await this.callValue(objectId, SCROLL_INTO_VIEW_FN, [], true)
      // Measured before the click: a menu item is gone once it has been clicked.
      const geometry = await this.getElementGeometry(ref)
      const outcome = await this.clickObject(objectId, ref, { scrolled: true })
      return {
        ...geometry,
        ...outcome,
        clickPoint: outcome.point ?? geometry.clickPoint,
      }
    } catch (err) {
      mainLog.error(`[browser-cdp] Click failed for ${ref}:`, err)
      throw new Error(`Failed to click ${ref}: ${err}`)
    } finally {
      await this.releaseObject(objectId)
    }
  }

  async fillElement(ref: string, value: string): Promise<ElementGeometry & { isPassword: boolean }> {
    const backendNodeId = this.requireBackendNodeId(ref)

    let objectId: string | undefined
    try {
      await this.send('DOM.focus', { backendNodeId })
      const { object } = await this.send('DOM.resolveNode', { backendNodeId })
      objectId = object.objectId as string
      await this.callValue(objectId, CLEAR_VALUE_FN)

      // Type the new value character by character for realistic input
      for (const char of value) {
        await this.send('Input.dispatchKeyEvent', { type: 'keyDown', text: char })
        await this.send('Input.dispatchKeyEvent', { type: 'keyUp', text: char })
      }

      const settled = await this.callValue<{ isPassword?: boolean }>(objectId, SETTLE_VALUE_FN, [{ value }])
      const geometry = await this.getElementGeometry(ref)
      return { ...geometry, isPassword: !!settled?.isPassword }
    } catch (err) {
      mainLog.error(`[browser-cdp] Fill failed for ${ref}:`, err)
      throw new Error(`Failed to fill ${ref}: ${err}`)
    } finally {
      await this.releaseObject(objectId)
    }
  }

  /**
   * Choose an option in a native <select> (by value or visible text) or in a custom one: open it
   * with a real click, wait for its listbox or menu (Radix mounts it in a portal after the click),
   * type into its search box if the option isn't rendered, click the option, and check it took.
   */
  async selectOption(ref: string, value: string): Promise<ElementGeometry> {
    const backendNodeId = this.requireBackendNodeId(ref)

    const held: Array<string | null> = []
    try {
      const { object } = await this.send('DOM.resolveNode', { backendNodeId })
      const triggerId = object.objectId as string
      held.push(triggerId)

      const native = await this.callValue<{ ok: boolean; reason?: string; options?: string[] } | null>(triggerId, SELECT_NATIVE_FN, [{ value }])
      if (native) {
        if (!native.ok) {
          throw new Error(native.reason ?? `no option matches "${value}"${native.options?.length ? ` (options: ${native.options.join(', ')})` : ''}`)
        }
        return await this.getElementGeometry(ref)
      }

      const alreadyOpen = await this.callValue<boolean>(triggerId, POPUP_BASELINE_FN)
      let popupId = alreadyOpen ? await this.callElement(triggerId, FIND_POPUP_FN) : null
      if (!popupId) {
        await this.clickObject(triggerId, ref)
        popupId = await this.pollElement(triggerId, FIND_POPUP_FN, [], SELECT_POPUP_TIMEOUT_MS)
      }
      held.push(popupId)
      if (!popupId) throw new Error(`clicking ${ref} opened no listbox or menu`)

      let optionId = await this.pollElement(popupId, FIND_OPTION_FN, [{ value }], SELECT_OPTION_TIMEOUT_MS)
      if (!optionId) {
        // Searchable lists (comboboxes, command menus) render only what matches their filter.
        const inputId = await this.callElement(popupId, FIND_SEARCH_INPUT_FN, [{ objectId: triggerId }])
        held.push(inputId)
        if (inputId) {
          await this.callValue(inputId, TYPE_SEARCH_FN, [{ value }])
          optionId = await this.pollElement(popupId, FIND_OPTION_FN, [{ value }], SELECT_OPTION_TIMEOUT_MS)
        }
      }
      held.push(optionId)
      if (!optionId) {
        const available = await this.callValue<string[]>(popupId, LIST_OPTIONS_FN).catch(() => undefined)
        throw new Error(`option "${value}" not found${available?.length ? ` (options: ${available.join(', ')})` : ''}`)
      }

      const optionText = (await this.callValue<string>(optionId, OPTION_TEXT_FN)) ?? value
      await this.clickObject(optionId, `option "${optionText}"`)
      const verifyArgs: CallArgument[] = [{ objectId: popupId }, { objectId: optionId }, { value: optionText }]
      let verdict = await this.callValue<{ ok: boolean }>(triggerId, VERIFY_SELECTION_FN, verifyArgs).catch(() => ({ ok: true }))
      if (!verdict?.ok) {
        // Keyboard fallback: listboxes and menus all choose the focused item on Enter.
        await this.callValue(optionId, 'function() { /* craft:focus */ if (typeof this.focus === "function") this.focus(); return true }')
        await this.pressKey('Enter')
        verdict = await this.callValue<{ ok: boolean }>(triggerId, VERIFY_SELECTION_FN, verifyArgs).catch(() => ({ ok: true }))
      }
      if (!verdict?.ok) throw new Error(`clicked option "${optionText}", but ${ref} did not change`)

      return await this.getElementGeometry(ref)
    } catch (err) {
      mainLog.error(`[browser-cdp] Select failed for ${ref}:`, err)
      throw new Error(`Failed to select option in ${ref}: ${err}`)
    } finally {
      for (const id of held) await this.releaseObject(id)
    }
  }

  async setFileInputFiles(ref: string, filePaths: string[]): Promise<ElementGeometry> {
    const backendNodeId = this.requireBackendNodeId(ref)

    try {
      await this.send('DOM.setFileInputFiles', {
        files: filePaths,
        backendNodeId,
      })

      return await this.getElementGeometry(ref)
    } catch (err) {
      mainLog.error(`[browser-cdp] setFileInputFiles failed for ${ref}:`, err)
      throw new Error(`Failed to set files on ${ref}: ${err}`)
    }
  }
}
