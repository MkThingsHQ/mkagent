import { describe, expect, it } from 'bun:test'
import { readFileSync } from 'fs'
import { join } from 'path'
import { cn, TOKEN_SCALES } from '../utils'

const tokensCss = readFileSync(join(import.meta.dir, '../../styles/tokens.css'), 'utf-8')
// Only the Tailwind theme blocks: :root also declares --text-secondary etc. as color roles
const themeCss = [...tokensCss.matchAll(/^@theme[^{\n]*\{([^}]*)\}/gm)].map((block) => block[1]).join('\n')

/** Names declared in the @theme blocks for a Tailwind namespace, e.g. --text-label → "label". */
function themeNames(namespace: string): string[] {
  const names = new Set<string>()
  for (const match of themeCss.matchAll(new RegExp(`^\\s*--${namespace}-([\\w-]+?)(?:--[\\w-]+)?:`, 'gm'))) names.add(match[1]!)
  return [...names]
}

describe('cn: token-aware class merging', () => {
  it('keeps a type role next to a text color', () => {
    expect(cn('text-label', 'text-on-accent')).toBe('text-label text-on-accent')
    expect(cn('text-label-sm text-secondary')).toBe('text-label-sm text-secondary')
  })

  it('resolves conflicts inside a token scale', () => {
    expect(cn('text-sm', 'text-label')).toBe('text-label')
    expect(cn('h-control', 'h-7')).toBe('h-7')
    expect(cn('shadow-xs', 'shadow-elev-2')).toBe('shadow-elev-2')
    expect(cn('ease-out', 'ease-out-subtle')).toBe('ease-out-subtle')
    expect(cn('duration-micro', 'duration-200')).toBe('duration-200')
  })

  it('knows every scale declared in tokens.css', () => {
    expect(themeNames('text').filter((name) => !name.startsWith('color-')).sort()).toEqual([...TOKEN_SCALES.text].sort())
    expect(themeNames('shadow').filter((name) => name.startsWith('elev-')).sort()).toEqual([...TOKEN_SCALES.shadow].sort())
    expect(themeNames('spacing').sort()).toEqual([...TOKEN_SCALES.spacing].sort())
    expect(themeNames('transition-duration').sort()).toEqual([...TOKEN_SCALES.duration].sort())
    expect(themeNames('ease').filter((name) => name !== 'out').sort()).toEqual([...TOKEN_SCALES.ease].sort())
  })
})
