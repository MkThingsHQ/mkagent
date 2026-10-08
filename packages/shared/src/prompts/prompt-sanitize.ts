/**
 * Shared helpers for text injected into XML-ish prompt context blocks.
 *
 * These functions are deliberately small and dependency-free so they can be
 * used by config, prompt, and agent-core modules without creating heavy import
 * chains. They do not attempt to sanitize user intent; they only keep injected
 * data from breaking prompt block boundaries or forging extra one-line fields.
 */

/** Strip C0 controls except tab/newline/CR, preserving multiline markdown. */
export function stripPromptControlChars(value: string): string {
  // eslint-disable-next-line no-control-regex
  return value.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '');
}

/** Strip all C0 controls, including newlines/tabs, for single-line fields. */
export function stripPromptLineControlChars(value: string): string {
  // eslint-disable-next-line no-control-regex
  return value.replace(/[\x00-\x1f\x7f]/g, '');
}

/**
 * Neutralize literal closing tags so injected data cannot terminate the
 * surrounding prompt block early. Matching is case- and whitespace-insensitive.
 */
export function defangPromptClosingTags(value: string, tagNames: readonly string[]): string {
  return tagNames.reduce((acc, tagName) => {
    const re = new RegExp(`<\\s*/\\s*${escapeRegExp(tagName)}\\s*>`, 'gi');
    return acc.replace(re, `&lt;/${tagName}&gt;`);
  }, value);
}

/** Sanitize multiline prompt body text while preserving normal markdown shape. */
export function sanitizePromptBody(value: string, tagNames: readonly string[] = []): string {
  return defangPromptClosingTags(stripPromptControlChars(value), tagNames);
}

/** Sanitize a one-line prompt value such as a filename, slug, or path. */
export function sanitizePromptLine(value: string, tagNames: readonly string[] = []): string {
  return defangPromptClosingTags(stripPromptLineControlChars(value), tagNames);
}

/** Escape a value that will be placed inside a quoted XML-ish attribute. */
export function escapePromptXmlAttr(value: string): string {
  return stripPromptLineControlChars(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Redact credentials embedded in URL authority components before prompt use. */
export function redactPromptUrlCredentials(value: string): string {
  return value.replace(/([a-z][a-z0-9+.-]*:\/\/)([^\s/@]+)@/gi, '$1***@');
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
