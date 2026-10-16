import { describe, expect, it } from 'bun:test'
import { runCommandMessage } from '../run-command-message'

describe('runCommandMessage', () => {
  it('asks for a background Bash run of the command in a bash fence', () => {
    expect(runCommandMessage('bun test')).toBe(
      'Run this in the background (Bash with run_in_background: true), then continue without waiting for it:\n\n```bash\nbun test\n```',
    )
  })

  it('uses a fence longer than any backtick run in the command', () => {
    const message = runCommandMessage('echo "```done```"')
    expect(message).toContain('````bash\necho "```done```"\n````')
  })
})
