/**
 * Security challenge detection for the in-app browser.
 *
 * BrowserPaneManager collects facts about the page (one page-script round trip plus
 * accessibility counts) and `classifySecurityChallenge` turns them into a verdict.
 * Only a strong signal from a known provider, or both kinds of medium evidence, is a
 * challenge the user has to solve. A sparse accessibility tree is never evidence:
 * Radix menus hide the rest of the page from it, and consent screens and error cards
 * are minimal by design.
 */

import type { BrowserSecurityChallenge } from '@mkagent/shared/protocol'

export type { BrowserSecurityChallenge }

/**
 * How long a positive verdict must hold before the page is handed to the user.
 * Interstitials that pass by themselves and pages caught mid-change don't survive it.
 */
export const SECURITY_CHALLENGE_CONFIRM_DELAY_MS = 750

/** Smallest on-screen size (CSS px) for a widget or challenge frame to count as shown; invisible ones render at ~0x0. */
const MIN_SHOWN_WIDTH = 60
const MIN_SHOWN_HEIGHT = 30

/** Where an element sits on screen, as measured by the page script. */
export interface ScreenBox {
  /** checkVisibility() passed (display, visibility, opacity up the tree) and a hit test at its centre lands on it. */
  visible: boolean
  /** Size of the part inside the viewport, CSS px. */
  width: number
  height: number
}

export interface ChallengeFrame extends ScreenBox {
  src: string
}

/** What SECURITY_CHALLENGE_PAGE_SCRIPT reports. */
export interface SecurityChallengePageFacts {
  readyState: string
  title: string
  /** `window._cf_chl_opt`, set by the Cloudflare interstitial's bootstrap script. */
  cfChallengeOptions: boolean
  /** `form#challenge-form` posting to Cloudflare. */
  challengeForm: boolean
  /** `#challenge-stage`, where the Cloudflare interstitial renders its check. */
  challengeStage: boolean
  /** Start of the rendered body text. */
  text: string
  /** Iframes from challenge providers (hCaptcha, reCAPTCHA, DataDome, Cloudflare). */
  frames: ChallengeFrame[]
  /** Turnstile containers (`.cf-turnstile`, `#turnstile-wrapper`). */
  turnstile: ScreenBox[]
  /** PerimeterX `#px-captcha`. */
  pxCaptcha: ScreenBox | null
  /** A popup layer is open: Radix hideOthers, aria-modal, an open menu/listbox/dialog, aria-expanded. */
  overlayOpen: boolean
}

export interface SecurityChallengeFacts {
  /** Page URL when the check started. */
  url: string
  /** webContents.isLoading() when the check started. */
  loading: boolean
  /** The URL changed while the facts were collected. */
  urlChanged: boolean
  /** Null when the page script was skipped or failed. */
  page: SecurityChallengePageFacts | null
  /** Accessibility tree counts; null when unavailable. */
  ax: { nodes: number; actionable: number } | null
}

/**
 * Collects SecurityChallengePageFacts in one executeJavaScript round trip. Visibility is
 * what the user would see (checkVisibility, a hit test, clipped to the viewport), so the
 * challenge frames captcha libraries keep parked off-screen until needed don't count.
 */
export const SECURITY_CHALLENGE_PAGE_SCRIPT = String.raw`(() => {
  const viewWidth = window.innerWidth || 0;
  const viewHeight = window.innerHeight || 0;
  const box = (el) => {
    const rect = el.getBoundingClientRect();
    const left = Math.max(rect.left, 0);
    const top = Math.max(rect.top, 0);
    const width = Math.min(rect.right, viewWidth) - left;
    const height = Math.min(rect.bottom, viewHeight) - top;
    if (!(width > 0 && height > 0)) return { visible: false, width: 0, height: 0 };
    const hit = el.checkVisibility({ opacityProperty: true, visibilityProperty: true })
      ? document.elementFromPoint(left + width / 2, top + height / 2)
      : null;
    return { visible: !!hit && (hit === el || el.contains(hit)), width: Math.round(width), height: Math.round(height) };
  };
  const frames = [];
  for (const frame of document.querySelectorAll('iframe')) {
    if (frames.length >= 20) break;
    const src = frame.src || '';
    if (/hcaptcha\.com|\/recaptcha\/|captcha-delivery\.com|challenges\.cloudflare\.com/i.test(src)) {
      frames.push({ src: src.slice(0, 500), ...box(frame) });
    }
  }
  const px = document.getElementById('px-captcha');
  return {
    readyState: document.readyState,
    title: document.title || '',
    cfChallengeOptions: typeof window._cf_chl_opt !== 'undefined',
    challengeForm: !!document.querySelector('form#challenge-form[action*="__cf_chl_"], form#challenge-form[action*="/cdn-cgi/"]'),
    challengeStage: !!document.getElementById('challenge-stage'),
    text: ((document.body && document.body.innerText) || '').slice(0, 2000),
    frames,
    turnstile: Array.from(document.querySelectorAll('.cf-turnstile, #turnstile-wrapper')).slice(0, 10).map(box),
    pxCaptcha: px ? box(px) : null,
    overlayOpen: !!document.querySelector('[data-aria-hidden], [aria-modal="true"], [role="menu"][data-state="open"], [role="listbox"][data-state="open"], [role="dialog"][data-state="open"], [aria-expanded="true"]'),
  };
})()`

const ACTIONABLE_AX_ROLES = new Set([
  'button', 'link', 'textbox', 'searchbox', 'combobox', 'checkbox', 'radio', 'switch',
  'menuitem', 'menuitemcheckbox', 'menuitemradio', 'tab', 'option', 'slider', 'spinbutton', 'listbox',
])

export function countActionableAxNodes(nodes: ReadonlyArray<{ role: string; disabled?: boolean }>): number {
  return nodes.filter((node) => ACTIONABLE_AX_ROLES.has((node.role || '').toLowerCase()) && !node.disabled).length
}

export function noSecurityChallenge(): BrowserSecurityChallenge {
  return { detected: false, provider: 'none', signals: [], suspected: false }
}

const JUST_A_MOMENT_TITLES = new Set(['Just a moment...', 'Just a moment…'])
const CLOUDFLARE_BLOCK_TITLE = 'Attention Required! | Cloudflare'
const GOOGLE_HOST = /(?:^|\.)google(?:\.com|\.co)?\.[a-z]{2,3}$/

/** The interstitial's own sentences; a bare "verify you are human" also labels widgets embedded in forms. */
const CLOUDFLARE_PHRASES: Array<[signal: string, pattern: RegExp]> = [
  ['text:verify-human', /Verify you are human by completing the action below/i],
  ['text:checking-browser', /Checking (if the site connection is secure|your browser before accessing)/i],
  ['text:security-verification', /Performing security verification/i],
]

function parseUrl(value: string): URL | null {
  try {
    return new URL(value)
  } catch {
    return null
  }
}

function isHost(hostname: string, domain: string): boolean {
  return hostname === domain || hostname.endsWith(`.${domain}`)
}

function isShown(box: ScreenBox): boolean {
  return box.visible && box.width >= MIN_SHOWN_WIDTH && box.height >= MIN_SHOWN_HEIGHT
}

/**
 * Provider of a frame that is itself a challenge. Checkbox widgets (hCaptcha checkbox,
 * reCAPTCHA anchor) sit in ordinary forms and only open a challenge once clicked.
 */
function challengeFrameProvider(src: string): string | null {
  const url = parseUrl(src)
  if (!url) return null
  if (isHost(url.hostname, 'hcaptcha.com')) return /[#&?]frame=checkbox/.test(src) ? null : 'hcaptcha'
  if ((isHost(url.hostname, 'google.com') || isHost(url.hostname, 'recaptcha.net'))
    && /^\/recaptcha\/(?:api2|enterprise)\/bframe/.test(url.pathname)) return 'recaptcha'
  if (isHost(url.hostname, 'captcha-delivery.com')) return 'datadome'
  return null
}

function isTurnstileFrame(src: string): boolean {
  return parseUrl(src)?.hostname === 'challenges.cloudflare.com'
}

export function classifySecurityChallenge(facts: SecurityChallengeFacts): BrowserSecurityChallenge {
  const { page } = facts
  const url = parseUrl(facts.url)
  // No verdict on a page in transition: the facts may describe the old page, the new one, or neither.
  if (facts.loading || facts.urlChanged || !page || page.readyState !== 'complete'
    || (url?.protocol !== 'https:' && url?.protocol !== 'http:')) {
    return noSecurityChallenge()
  }

  // Strong: any one of these is a challenge page, and names its provider.
  const strong: Array<{ signal: string; provider: string }> = []
  const title = page.title.trim()
  if (page.cfChallengeOptions) strong.push({ signal: 'js:cf-chl-opt', provider: 'cloudflare' })
  if (page.challengeForm) strong.push({ signal: 'dom:challenge-form', provider: 'cloudflare' })
  if (page.challengeStage) strong.push({ signal: 'dom:challenge-stage', provider: 'cloudflare' })
  if (JUST_A_MOMENT_TITLES.has(title)) strong.push({ signal: 'title:just-a-moment', provider: 'cloudflare' })
  if (title === CLOUDFLARE_BLOCK_TITLE) strong.push({ signal: 'title:attention-required', provider: 'cloudflare' })
  if (url.pathname.startsWith('/cdn-cgi/challenge-platform/')) strong.push({ signal: 'url:cdn-cgi-challenge', provider: 'cloudflare' })
  if (GOOGLE_HOST.test(url.hostname) && url.pathname.startsWith('/sorry/')) strong.push({ signal: 'url:google-sorry', provider: 'google' })
  for (const frame of page.frames) {
    const provider = isShown(frame) ? challengeFrameProvider(frame.src) : null
    if (provider) strong.push({ signal: `frame:${provider}`, provider })
  }
  if (page.pxCaptcha && isShown(page.pxCaptcha)) strong.push({ signal: 'dom:px-captcha', provider: 'perimeterx' })

  // Medium: Cloudflare's wording and a visible Turnstile widget. Each also turns up on
  // ordinary pages (an article quoting the wording, a widget guarding a form), so it takes both.
  const phrases = CLOUDFLARE_PHRASES.filter(([, pattern]) => pattern.test(page.text)).map(([signal]) => signal)
  const widget = page.turnstile.some(isShown) || page.frames.some((frame) => isShown(frame) && isTurnstileFrame(frame.src))
  const mediumKinds = (phrases.length > 0 ? 1 : 0) + (widget ? 1 : 0)

  // Context, never decisive: Cloudflare's __cf_chl_* tokens stay in the URL after the
  // challenge is passed, and a sparse tree is normal for consent screens and error cards
  // (and meaningless while a popup layer hides the rest of the page from it).
  const context: string[] = []
  if ([...url.searchParams.keys()].some((key) => key.startsWith('__cf_chl_'))) context.push('url:cf-chl-token')
  if (!page.overlayOpen && facts.ax && facts.ax.nodes > 0 && facts.ax.actionable <= 2) {
    context.push(`ax:near-empty(${facts.ax.actionable}/${facts.ax.nodes})`)
  }

  const signals = [...strong.map((s) => s.signal), ...phrases, ...(widget ? ['widget:turnstile'] : []), ...context]
  if (strong.length > 0) return { detected: true, provider: strong[0].provider, signals, suspected: false }
  if (mediumKinds === 2) return { detected: true, provider: 'cloudflare', signals, suspected: false }
  if (mediumKinds === 1) return { detected: false, provider: 'cloudflare', signals, suspected: true }
  return { detected: false, provider: 'none', signals, suspected: false }
}
