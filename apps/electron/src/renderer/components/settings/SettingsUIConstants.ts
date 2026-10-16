/**
 * SettingsUIConstants
 *
 * Centralized style definitions for consistent settings UI appearance
 * (design spec §7.12: 56px rows in raised cards, Label type roles, solved text tiers).
 */

export const settingsUI = {
  /** Label style for setting titles (13/18 500) */
  label: 'text-label font-medium text-foreground',

  /** Description style for setting subtitles (12/18 secondary) */
  description: 'text-label-sm leading-4.5 text-secondary',

  /** Smaller description for compact contexts (e.g., menu options, usage notes) */
  descriptionSmall: 'text-label-sm text-tertiary',

  /** Gap between label and description (applied to description as margin-top) */
  labelDescriptionGap: 'mt-px',

  /** Gap for label group containers (applied as space-y) */
  labelGroup: 'space-y-0',

  /** Row geometry inside a card: ≥ 56px tall, 14px side padding, 16px gap to the control */
  row: 'min-h-14 gap-4 px-3.5 py-2.5',

  /** Row geometry outside a card */
  rowBare: 'gap-4 py-3',

  /** Inner padding for free-form card content (fields, notes) */
  cardPadding: 'px-3.5 py-3',

  /** Inline text link (solved accent text, 40% underline) */
  link: 'text-accent underline decoration-current/40 underline-offset-2 hover:decoration-current',

  /** Free-form explanatory text inside a card */
  prose: 'space-y-1.5 text-label leading-5 text-secondary',
}
