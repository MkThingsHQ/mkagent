/**
 * Tests for the security challenge classifier.
 *
 * Every false positive this replaced was an ordinary page: an open Radix menu, a page
 * mid-navigation, an OAuth consent screen, an error card, an invisible Turnstile widget.
 */

import { describe, it, expect } from 'bun:test'
import {
  SECURITY_CHALLENGE_PAGE_SCRIPT,
  classifySecurityChallenge,
  countActionableAxNodes,
  type SecurityChallengeFacts,
  type SecurityChallengePageFacts,
} from '../security-challenge'

const ORDINARY_PAGE: SecurityChallengePageFacts = {
  readyState: 'complete',
  title: 'Example',
  cfChallengeOptions: false,
  challengeForm: false,
  challengeStage: false,
  text: 'Welcome to Example.',
  frames: [],
  turnstile: [],
  pxCaptcha: null,
  overlayOpen: false,
}

const NONE = { detected: false, provider: 'none', signals: [], suspected: false }
const SHOWN_WIDGET = { visible: true, width: 300, height: 65 }
const HIDDEN = { visible: false, width: 0, height: 0 }
const TURNSTILE_SRC = 'https://challenges.cloudflare.com/cdn-cgi/challenge-platform/h/b/turnstile/if/ov2/av0/rcv0/0/abc/0x4AAAAAAA/auto/normal'
const HCAPTCHA_CHALLENGE_SRC = 'https://newassets.hcaptcha.com/captcha/v1/abc/static/hcaptcha.html#frame=challenge&id=0abc&host=example.com'

function facts(
  overrides: Omit<Partial<SecurityChallengeFacts>, 'page'> & { page?: Partial<SecurityChallengePageFacts> | null } = {},
): SecurityChallengeFacts {
  const { page, ...rest } = overrides
  return {
    url: 'https://example.com/',
    loading: false,
    urlChanged: false,
    ax: { nodes: 40, actionable: 25 },
    ...rest,
    page: page === null ? null : { ...ORDINARY_PAGE, ...page },
  }
}

describe('classifySecurityChallenge', () => {
  describe('ordinary pages are not challenges', () => {
    it('an open Radix menu, which hides the rest of the page from the accessibility tree', () => {
      const verdict = classifySecurityChallenge(facts({ ax: { nodes: 3, actionable: 2 }, page: { overlayOpen: true } }))
      expect(verdict).toEqual(NONE)
    })

    it('a page mid-navigation, even one already showing challenge markup', () => {
      const interstitial = { title: 'Just a moment...', cfChallengeOptions: true }
      const inTransition: SecurityChallengeFacts[] = [
        facts({ loading: true, page: null }),
        facts({ page: { ...interstitial, readyState: 'interactive' } }),
        facts({ urlChanged: true, page: interstitial }),
        facts({ url: 'about:blank', page: interstitial }),
        facts({ page: null }),
      ]
      for (const pageFacts of inTransition) {
        expect(classifySecurityChallenge(pageFacts)).toEqual(NONE)
      }
    })

    it('an OAuth consent screen with two buttons', () => {
      const verdict = classifySecurityChallenge(facts({
        url: 'https://accounts.google.com/o/oauth2/v2/auth?client_id=abc&scope=email',
        ax: { nodes: 7, actionable: 2 },
        page: { title: 'Sign in - Google Accounts', text: 'Craft Agents wants to access your Google Account. Cancel Allow' },
      }))
      expect(verdict).toEqual({ detected: false, provider: 'none', signals: ['ax:near-empty(2/7)'], suspected: false })
    })

    it('an error card with one to three elements', () => {
      for (const [actionable, nodes] of [[0, 1], [1, 3], [2, 3]] as const) {
        const verdict = classifySecurityChallenge(facts({
          ax: { nodes, actionable },
          page: { title: 'Connect', text: 'Invalid connect link. Ask for a new one.' },
        }))
        expect(verdict).toEqual({ detected: false, provider: 'none', signals: [`ax:near-empty(${actionable}/${nodes})`], suspected: false })
      }
    })

    it('an invisible Turnstile widget embedded in a normal page', () => {
      const verdict = classifySecurityChallenge(facts({
        page: { turnstile: [HIDDEN], frames: [{ src: TURNSTILE_SRC, ...HIDDEN }] },
      }))
      expect(verdict).toEqual(NONE)
    })

    it('a captcha checkbox in a form, and challenge frames that are hidden, parked off-screen or tiny', () => {
      const verdict = classifySecurityChallenge(facts({
        page: {
          frames: [
            { src: 'https://newassets.hcaptcha.com/captcha/v1/abc/static/hcaptcha.html#frame=checkbox&id=0abc', visible: true, width: 303, height: 78 },
            { src: 'https://www.google.com/recaptcha/api2/anchor?k=key&size=normal', visible: true, width: 304, height: 78 },
            { src: HCAPTCHA_CHALLENGE_SRC, visible: false, width: 400, height: 600 },
            { src: 'https://www.google.com/recaptcha/api2/bframe?k=key', ...HIDDEN },
            { src: 'https://geo.captcha-delivery.com/captcha/?initialCid=abc', visible: true, width: 1, height: 1 },
          ],
          pxCaptcha: HIDDEN,
        },
      }))
      expect(verdict).toEqual(NONE)
    })

    it('Cloudflare tokens left in the URL after the challenge was passed', () => {
      const verdict = classifySecurityChallenge(facts({ url: 'https://example.com/docs?__cf_chl_tk=abc123' }))
      expect(verdict).toEqual({ detected: false, provider: 'none', signals: ['url:cf-chl-token'], suspected: false })
    })
  })

  describe('medium evidence', () => {
    it('a visible Turnstile widget alone is only suspected', () => {
      const verdict = classifySecurityChallenge(facts({ page: { turnstile: [SHOWN_WIDGET] } }))
      expect(verdict).toEqual({ detected: false, provider: 'cloudflare', signals: ['widget:turnstile'], suspected: true })
    })

    it('Cloudflare wording alone is only suspected, however many phrases match', () => {
      const verdict = classifySecurityChallenge(facts({
        page: { text: 'Why sites say "Verify you are human by completing the action below" or "Checking if the site connection is secure"' },
      }))
      expect(verdict).toEqual({
        detected: false,
        provider: 'cloudflare',
        signals: ['text:verify-human', 'text:checking-browser'],
        suspected: true,
      })
    })

    it('a form labelling its visible Turnstile widget is only suspected', () => {
      const verdict = classifySecurityChallenge(facts({
        page: { text: 'Sign in. Please verify you are human.', turnstile: [SHOWN_WIDGET] },
      }))
      expect(verdict).toEqual({ detected: false, provider: 'cloudflare', signals: ['widget:turnstile'], suspected: true })
    })

    it('Cloudflare wording next to a visible Turnstile widget is a challenge', () => {
      const verdict = classifySecurityChallenge(facts({
        page: { text: 'Performing security verification', frames: [{ src: TURNSTILE_SRC, ...SHOWN_WIDGET }] },
      }))
      expect(verdict).toEqual({
        detected: true,
        provider: 'cloudflare',
        signals: ['text:security-verification', 'widget:turnstile'],
        suspected: false,
      })
    })
  })

  describe('challenge pages', () => {
    it('a Cloudflare interstitial (title and _cf_chl_opt)', () => {
      const verdict = classifySecurityChallenge(facts({
        ax: { nodes: 3, actionable: 1 },
        page: {
          title: 'Just a moment...',
          cfChallengeOptions: true,
          challengeStage: true,
          text: 'example.com\nVerify you are human by completing the action below.',
        },
      }))
      expect(verdict).toEqual({
        detected: true,
        provider: 'cloudflare',
        signals: ['js:cf-chl-opt', 'dom:challenge-stage', 'title:just-a-moment', 'text:verify-human', 'ax:near-empty(1/3)'],
        suspected: false,
      })
    })

    it('a Google /sorry/ page', () => {
      for (const url of [
        'https://www.google.com/sorry/index?continue=https://www.google.com/search%3Fq%3Dcraft',
        'https://www.google.co.uk/sorry/index?continue=https://www.google.co.uk/search%3Fq%3Dcraft',
      ]) {
        const verdict = classifySecurityChallenge(facts({ url, page: { title: url } }))
        expect(verdict).toEqual({ detected: true, provider: 'google', signals: ['url:google-sorry'], suspected: false })
      }
      // Only Google's own host counts, not a page that mentions the path.
      expect(classifySecurityChallenge(facts({ url: 'https://notgoogle.com/sorry/index' }))).toEqual(NONE)
    })

    it('a visible hCaptcha challenge frame', () => {
      const verdict = classifySecurityChallenge(facts({
        page: { frames: [{ src: HCAPTCHA_CHALLENGE_SRC, visible: true, width: 400, height: 600 }] },
      }))
      expect(verdict).toEqual({ detected: true, provider: 'hcaptcha', signals: ['frame:hcaptcha'], suspected: false })
    })

    it('other providers: reCAPTCHA challenge, DataDome, PerimeterX, Cloudflare block page, form and platform URL', () => {
      const cases: Array<[provider: string, signal: string, pageFacts: SecurityChallengeFacts]> = [
        ['recaptcha', 'frame:recaptcha', facts({ page: { frames: [{ src: 'https://www.google.com/recaptcha/api2/bframe?hl=en&k=key', visible: true, width: 400, height: 580 }] } })],
        ['recaptcha', 'frame:recaptcha', facts({ page: { frames: [{ src: 'https://www.recaptcha.net/recaptcha/enterprise/bframe?k=key', visible: true, width: 400, height: 580 }] } })],
        ['datadome', 'frame:datadome', facts({ page: { frames: [{ src: 'https://geo.captcha-delivery.com/captcha/?initialCid=abc', visible: true, width: 1280, height: 800 }] } })],
        ['perimeterx', 'dom:px-captcha', facts({ page: { pxCaptcha: { visible: true, width: 310, height: 100 } } })],
        ['cloudflare', 'title:attention-required', facts({ page: { title: 'Attention Required! | Cloudflare' } })],
        ['cloudflare', 'dom:challenge-form', facts({ page: { challengeForm: true } })],
        ['cloudflare', 'url:cdn-cgi-challenge', facts({ url: 'https://example.com/cdn-cgi/challenge-platform/h/b/flow/ov1' })],
      ]
      for (const [provider, signal, pageFacts] of cases) {
        expect(classifySecurityChallenge(pageFacts)).toEqual({ detected: true, provider, signals: [signal], suspected: false })
      }
    })
  })
})

describe('countActionableAxNodes', () => {
  it('counts enabled nodes with actionable roles', () => {
    expect(countActionableAxNodes([
      { role: 'button' },
      { role: 'Link' },
      { role: 'textbox', disabled: true },
      { role: 'heading' },
      { role: 'menuitem' },
    ])).toBe(3)
  })
})

// No DOM library in this repo, so the page script runs against the handful of DOM calls it makes.
describe('SECURITY_CHALLENGE_PAGE_SCRIPT', () => {
  interface FakeElement {
    src: string
    rendered: boolean
    rect: { left: number; top: number; width: number; height: number }
    getBoundingClientRect: () => { left: number; top: number; right: number; bottom: number; width: number; height: number }
    checkVisibility: () => boolean
    contains: (other: unknown) => boolean
  }

  function element(rect: FakeElement['rect'], options: { src?: string; rendered?: boolean } = {}): FakeElement {
    const el: FakeElement = {
      src: options.src ?? '',
      rendered: options.rendered ?? true,
      rect,
      getBoundingClientRect: () => ({ ...rect, right: rect.left + rect.width, bottom: rect.top + rect.height }),
      checkVisibility: () => el.rendered,
      contains: (other) => other === el,
    }
    return el
  }

  function runPageScript(dom: {
    title?: string
    text?: string
    cfChallengeOptions?: boolean
    /** Elements by the exact selector the script queries, in paint order. */
    selectors?: Record<string, FakeElement[]>
    ids?: Record<string, FakeElement>
  }): SecurityChallengePageFacts {
    const selectors = dom.selectors ?? {}
    const painted = Object.values(selectors).flat().reverse()
    const fakeWindow: Record<string, unknown> = { innerWidth: 1280, innerHeight: 800 }
    if (dom.cfChallengeOptions) fakeWindow._cf_chl_opt = { cType: 'managed' }
    const fakeDocument = {
      readyState: 'complete',
      title: dom.title ?? 'Example',
      body: { innerText: dom.text ?? '' },
      querySelectorAll: (selector: string) => selectors[selector] ?? [],
      querySelector: (selector: string) => selectors[selector]?.[0] ?? null,
      getElementById: (id: string) => dom.ids?.[id] ?? null,
      elementFromPoint: (x: number, y: number) => painted.find((el) => el.rendered
        && x >= el.rect.left && x < el.rect.left + el.rect.width
        && y >= el.rect.top && y < el.rect.top + el.rect.height) ?? null,
    }
    return new Function('window', 'document', `return ${SECURITY_CHALLENGE_PAGE_SCRIPT}`)(fakeWindow, fakeDocument)
  }

  it('measures challenge frames as the user sees them', () => {
    const ad = element({ left: 0, top: 0, width: 300, height: 250 }, { src: 'https://ads.example.net/slot' })
    const parked = element({ left: 0, top: -10000, width: 400, height: 580 }, { src: 'https://www.google.com/recaptcha/api2/bframe?k=a' })
    const hiddenInPlace = element({ left: 100, top: 100, width: 400, height: 580 }, { src: 'https://www.google.com/recaptcha/api2/bframe?k=b', rendered: false })
    const challenge = element({ left: 440, top: 100, width: 400, height: 600 }, { src: HCAPTCHA_CHALLENGE_SRC })
    const invisibleTurnstile = element({ left: 0, top: 0, width: 0, height: 0 })

    const page = runPageScript({
      selectors: { iframe: [ad, parked, hiddenInPlace, challenge], '.cf-turnstile, #turnstile-wrapper': [invisibleTurnstile] },
    })

    expect(page.frames).toEqual([
      { src: parked.src, visible: false, width: 0, height: 0 },
      { src: hiddenInPlace.src, visible: false, width: 400, height: 580 },
      { src: challenge.src, visible: true, width: 400, height: 600 },
    ])
    expect(page.turnstile).toEqual([{ visible: false, width: 0, height: 0 }])
    expect(classifySecurityChallenge({ url: 'https://example.com/signup', loading: false, urlChanged: false, page, ax: null }))
      .toEqual({ detected: true, provider: 'hcaptcha', signals: ['frame:hcaptcha'], suspected: false })
  })

  it('reports the page state the classifier reads', () => {
    const page = runPageScript({ title: 'Just a moment...', text: 'Verify you are human', cfChallengeOptions: true })
    expect(page).toEqual({
      readyState: 'complete',
      title: 'Just a moment...',
      cfChallengeOptions: true,
      challengeForm: false,
      challengeStage: false,
      text: 'Verify you are human',
      frames: [],
      turnstile: [],
      pxCaptcha: null,
      overlayOpen: false,
    })
  })
})
