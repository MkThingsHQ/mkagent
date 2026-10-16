import { describe, expect, it } from 'bun:test'
import { Linter } from 'eslint'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const motionRule = require('../no-motion-antipatterns.cjs')
const paletteRule = require('../no-raw-palette-colors.cjs')

function run(ruleName: string, rule: unknown, code: string) {
  const linter = new Linter({ configType: 'eslintrc' })
  linter.defineRule(`craft-styles/${ruleName}`, rule as never)
  return linter.verify(code, {
    parserOptions: { ecmaVersion: 'latest', sourceType: 'module', ecmaFeatures: { jsx: true } },
    rules: { [`craft-styles/${ruleName}`]: 'warn' },
  })
}

describe('no-motion-antipatterns', () => {
  const lint = (code: string) => run('no-motion-antipatterns', motionRule, code)

  it('flags transition-all in class strings and style objects', () => {
    expect(lint('const a = "flex transition-all duration-200"')).toHaveLength(1)
    expect(lint('const a = "hover:transition-all"')).toHaveLength(1)
    expect(lint("const s = { transition: 'all 200ms ease' }")).toHaveLength(1)
  })

  it('allows named transitions', () => {
    expect(lint('const a = "transition-colors transition-[transform,opacity]"')).toHaveLength(0)
    expect(lint("const s = { transition: 'opacity 200ms ease' }")).toHaveLength(0)
  })

  it('requires bounce with visualDuration', () => {
    expect(lint("const t = { type: 'spring', visualDuration: 0.2 }")).toHaveLength(1)
    expect(lint("const t = { type: 'spring', visualDuration: 0.2, bounce: 0 }")).toHaveLength(0)
  })

  it('flags layout properties in motion targets only', () => {
    expect(lint('const el = <motion.div animate={{ width: 200, opacity: 1 }} />')).toHaveLength(1)
    expect(lint('const el = <motion.div initial={{ paddingLeft: 8 }} />')).toHaveLength(1)
    expect(lint('const el = <motion.div animate={{ x: 10, scale: 1 }} style={{ width: 200 }} />')).toHaveLength(0)
  })
})

describe('no-raw-palette-colors', () => {
  const lint = (code: string) => run('no-raw-palette-colors', paletteRule, code)

  it('flags palette colors, with variants and opacity', () => {
    expect(lint('const a = "bg-indigo-500"')).toHaveLength(1)
    expect(lint('const a = "flex hover:text-red-600"')).toHaveLength(1)
    expect(lint('const a = "ring-amber-300/40"')).toHaveLength(1)
    expect(lint('const a = "text-white"')).toHaveLength(1)
    expect(lint('const a = "bg-black/50"')).toHaveLength(1)
  })

  it('flags dark: color utilities', () => {
    expect(lint('const a = "dark:bg-foreground/10"')).toHaveLength(1)
    expect(lint('const a = "dark:data-[state=checked]:bg-background"')).toHaveLength(1)
  })

  it('allows theme roles and non-color utilities', () => {
    expect(lint('const a = "bg-accent-solid text-on-accent text-secondary bg-destructive-tint"')).toHaveLength(0)
    expect(lint('const a = "text-sm text-label-lg border-subtle dark:hidden"')).toHaveLength(0)
  })
})
