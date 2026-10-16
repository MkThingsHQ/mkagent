import { describe, expect, it } from 'bun:test'
import { consoleSnippetCommand, shellCommandFromBlock } from '../shell-command'

describe('shellCommandFromBlock', () => {
  it('takes shell blocks as written', () => {
    expect(shellCommandFromBlock('bun install\nbun test\n', 'bash')).toBe('bun install\nbun test')
    expect(shellCommandFromBlock('ls -la', 'sh')).toBe('ls -la')
    expect(shellCommandFromBlock('  \n', 'zsh')).toBeNull()
  })

  it('keeps only the commands of a console transcript, with continuations', () => {
    const transcript = [
      '$ list-md.sh apps/electron',
      'apps/electron/CLAUDE.md',
      '$ docker run \\',
      '    -p 8080:80 nginx',
      'Unable to find image',
      '$ echo $?',
      '1',
    ].join('\n')
    expect(shellCommandFromBlock(transcript, 'console')).toBe('list-md.sh apps/electron\ndocker run \\\n    -p 8080:80 nginx\necho $?')
    expect(shellCommandFromBlock('just output\nno prompts', 'console')).toBeNull()
  })

  it('strips prompts from a bash block written as a transcript, and ignores other languages', () => {
    expect(shellCommandFromBlock('$ git status\n$ git diff', 'bash')).toBe('git status\ngit diff')
    expect(shellCommandFromBlock('console.log(1)', 'js')).toBeNull()
    expect(shellCommandFromBlock('ls', undefined)).toBeNull()
  })
})

describe('consoleSnippetCommand', () => {
  it('recognizes a fenced block or text starting with a prompt', () => {
    expect(consoleSnippetCommand('```bash\nbun test\n```')).toBe('bun test')
    expect(consoleSnippetCommand('```\n$ ls\nfile.txt\n```')).toBe('ls')
    expect(consoleSnippetCommand('$ ls -la\ntotal 8\n')).toBe('ls -la')
  })

  it('never treats plain text as a command', () => {
    expect(consoleSnippetCommand('please run the tests')).toBeNull()
    expect(consoleSnippetCommand('It costs\n$ 5 per month')).toBeNull()
    expect(consoleSnippetCommand('```ts\nconst a = 1\n```')).toBeNull()
  })
})
