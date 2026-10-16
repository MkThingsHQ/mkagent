/**
 * ESLint Rule: no-raw-palette-colors
 *
 * Colors come from theme roles (packages/ui/src/styles/tokens.css), which are contrast-solved for
 * every theme and mode. Tailwind palette colors (bg-indigo-500, text-white …) ignore the theme,
 * and `dark:` color utilities fork the palette per mode instead of using a role that already
 * adapts (design spec §2.1, implementation plan A0/A3).
 *
 * Flags class strings such as:
 *   bg-indigo-500, hover:text-red-600, ring-amber-300/40, text-white, bg-black/50, dark:bg-foreground/10
 */

const PALETTE = 'slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose'
const COLOR_UTILITIES = 'bg|text|border|border-[trblxyse]|ring|ring-offset|outline|from|via|to|fill|stroke|decoration|divide|placeholder|caret|accent|shadow'

const PALETTE_UTILITY = new RegExp(`^!?(?:${COLOR_UTILITIES})-(?:(?:${PALETTE})-\\d{2,3}|white|black)(?:\\/[\\d.]+)?!?$`)

// A dark: utility is a color one unless its value is a size, width, alignment or style keyword.
const NON_COLOR_VALUE = /^(?:\d|\[\d|xs|sm|base|lg|xl|\dxl|caption|label|copy|title|display|mono-ui|left|right|center|justify|start|end|none|solid|dashed|dotted|double|hidden|cover|contain|auto|fixed|repeat|no-repeat|clip|origin|linear|radial|conic|inset|offset|wrap|nowrap|balance|pretty|ellipsis|[trblxyse](?:$|-))/
const DARK_COLOR_UTILITY = new RegExp(`^!?(?:${COLOR_UTILITIES.replace('|shadow', '')})-(.+)$`)

/** Split a class into its variants and utility, ignoring ':' inside arbitrary [brackets]. */
function splitVariants(token) {
  const parts = []
  let depth = 0
  let current = ''
  for (const ch of token) {
    if (ch === '[') depth++
    else if (ch === ']') depth--
    if (ch === ':' && depth === 0) {
      parts.push(current)
      current = ''
    } else {
      current += ch
    }
  }
  parts.push(current)
  return { variants: parts.slice(0, -1), utility: parts[parts.length - 1] }
}

/** @type {import('eslint').Rule.RuleModule} */
module.exports = {
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Disallow Tailwind palette colors and dark: color utilities; use theme roles.',
      category: 'Best Practices',
      recommended: true,
    },
    schema: [],
    messages: {
      paletteColor: 'Use a theme role (text-secondary, bg-accent-solid, bg-destructive-tint …) instead of the palette color "{{token}}".',
      darkColor: 'Avoid dark: color utilities ("{{token}}"); theme roles already adapt to the mode.',
    },
  },

  create(context) {
    function checkText(node, text) {
      if (!text) return
      for (const token of text.split(/[\s'"`]+/)) {
        if (!token || !/[a-z]-/.test(token)) continue
        const { variants, utility } = splitVariants(token)
        if (PALETTE_UTILITY.test(utility)) {
          context.report({ node, messageId: 'paletteColor', data: { token } })
          return
        }
        const dark = variants.includes('dark') && utility.match(DARK_COLOR_UTILITY)
        if (dark && !NON_COLOR_VALUE.test(dark[1])) {
          context.report({ node, messageId: 'darkColor', data: { token } })
          return
        }
      }
    }

    return {
      Literal(node) {
        if (typeof node.value === 'string') checkText(node, node.value)
      },
      TemplateElement(node) {
        checkText(node, node.value.cooked ?? '')
      },
    }
  },
}
