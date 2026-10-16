/**
 * ESLint Rule: no-motion-antipatterns
 *
 * Motion guardrails from the design system (design spec §6.6, implementation plan A0):
 * - no `transition-all` / `transition: all` (animate named properties only);
 * - motion/react `visualDuration` must be paired with `bounce` (motion 12 otherwise silently runs
 *   a 100/10 spring with ~16% overshoot) — use SPRING presets from @mkagent/ui/motion;
 * - never animate layout properties (width, height, margin*, padding*, top/left/right/bottom) in
 *   motion `animate`/`initial`/`exit`/`while*` objects — use transform/opacity and FLIP.
 */

const LAYOUT_PROPS = new Set([
  'width', 'height', 'minWidth', 'minHeight', 'maxWidth', 'maxHeight',
  'margin', 'marginTop', 'marginRight', 'marginBottom', 'marginLeft', 'marginInline', 'marginBlock',
  'padding', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'paddingInline', 'paddingBlock',
  'top', 'left', 'right', 'bottom', 'inset',
])
const MOTION_TARGET_ATTRS = new Set(['animate', 'initial', 'exit', 'whileHover', 'whileTap', 'whileFocus', 'whileDrag', 'whileInView'])

function propertyName(prop) {
  if (!prop || prop.type !== 'Property' || prop.computed) return null
  if (prop.key.type === 'Identifier') return prop.key.name
  if (prop.key.type === 'Literal' && typeof prop.key.value === 'string') return prop.key.value
  return null
}

/** @type {import('eslint').Rule.RuleModule} */
module.exports = {
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Disallow transition-all, unpaired visualDuration and layout-property animation.',
      category: 'Best Practices',
      recommended: true,
    },
    schema: [],
    messages: {
      transitionAll: 'Avoid transition-all: list the properties that change (e.g. transition-colors, transition-[transform,opacity]).',
      visualDurationWithoutBounce: 'visualDuration without bounce becomes a 100/10 spring with ~16% overshoot. Pass bounce, or use SPRING presets from @mkagent/ui/motion.',
      layoutAnimation: 'Animating "{{prop}}" runs layout every frame. Animate transform/opacity instead (x/y/scale, or FLIP).',
    },
  },

  create(context) {
    function checkText(node, text) {
      if (!text) return
      if (/(^|[\s:'"`])transition-all(?=$|[\s'"`])/.test(text)) {
        context.report({ node, messageId: 'transitionAll' })
      }
    }

    return {
      Literal(node) {
        if (typeof node.value === 'string') checkText(node, node.value)
      },

      TemplateElement(node) {
        checkText(node, node.value.cooked ?? '')
      },

      ObjectExpression(node) {
        const names = node.properties.map(propertyName)
        if (names.includes('visualDuration') && !names.includes('bounce')) {
          context.report({ node, messageId: 'visualDurationWithoutBounce' })
        }
        // style={{ transition: 'all 200ms' }}
        for (const prop of node.properties) {
          if (propertyName(prop) !== 'transition') continue
          const value = prop.value
          if (value && value.type === 'Literal' && typeof value.value === 'string' && /(^|,)\s*all\b/.test(value.value)) {
            context.report({ node: value, messageId: 'transitionAll' })
          }
        }
      },

      JSXAttribute(node) {
        if (node.name.type !== 'JSXIdentifier' || !MOTION_TARGET_ATTRS.has(node.name.name)) return
        const expression = node.value && node.value.type === 'JSXExpressionContainer' ? node.value.expression : null
        if (!expression || expression.type !== 'ObjectExpression') return
        for (const prop of expression.properties) {
          const name = propertyName(prop)
          if (name && LAYOUT_PROPS.has(name)) {
            context.report({ node: prop, messageId: 'layoutAnimation', data: { prop: name } })
          }
        }
      },
    }
  },
}
