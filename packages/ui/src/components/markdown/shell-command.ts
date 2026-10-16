/**
 * The shell command a code block (or a pasted console snippet) stands for — what its "Run in
 * background" button runs. Shell blocks are commands as written; console blocks mix commands
 * (`$ ` prompt lines, with `\` continuations) and their output, of which only the commands count.
 * Anything else has no command: a play button must never guess.
 */

const SHELL_LANGUAGES = new Set(['bash', 'sh', 'shell', 'zsh', 'fish'])
const CONSOLE_LANGUAGES = new Set(['console', 'shell-session', 'shellsession', 'sh-session', 'terminal'])
const PROMPT = /^\s*\$\s+/

/** The `$ ` lines of a console transcript (plus their `\` continuation lines), prompts removed. */
function promptCommands(lines: readonly string[]): string | null {
  const commands: string[] = []
  let continuing = false
  for (const line of lines) {
    if (continuing) {
      commands[commands.length - 1] += `\n${line}`
    } else if (PROMPT.test(line)) {
      commands.push(line.replace(PROMPT, ''))
    } else {
      continue
    }
    continuing = /\\\s*$/.test(line)
  }
  const result = commands.map(command => command.trimEnd()).filter(Boolean)
  return result.length > 0 ? result.join('\n') : null
}

/** The command of a fenced code block, or null when it holds none (other languages, output only). */
export function shellCommandFromBlock(code: string, language?: string): string | null {
  const lang = (language ?? '').toLowerCase()
  const lines = code.replace(/\r\n/g, '\n').split('\n')
  if (CONSOLE_LANGUAGES.has(lang)) return promptCommands(lines)
  if (!SHELL_LANGUAGES.has(lang)) return null
  const nonEmpty = lines.filter(line => line.trim())
  if (nonEmpty.length === 0) return null
  // A bash block written as a transcript (every line a `$ ` prompt) still runs without the prompts
  if (nonEmpty.every(line => PROMPT.test(line))) return promptCommands(lines)
  return code.trim()
}

/**
 * The command of pasted text when it is a console snippet: a single fenced shell/console block, or
 * text whose first line is a `$ ` prompt. Plain text is never treated as a command.
 */
export function consoleSnippetCommand(text: string): string | null {
  const normalized = text.replace(/\r\n/g, '\n')
  const fence = normalized.match(/^\s*```([\w-]*)[ \t]*\n([\s\S]*?)\n\s*```\s*$/)
  if (fence) return shellCommandFromBlock(fence[2] ?? '', fence[1] || 'console')
  const lines = normalized.split('\n')
  const first = lines.find(line => line.trim())
  return first && PROMPT.test(first) ? promptCommands(lines) : null
}
