/**
 * The message a "Run in background" button sends: it asks the agent to start the command as a
 * background Bash task (so the permission mode applies and a task chip shows it) and not to wait.
 * The fence is longer than any backtick run in the command, so the command can't end it early.
 */
export function runCommandMessage(command: string): string {
  const longestRun = Math.max(0, ...(command.match(/`+/g) ?? []).map(run => run.length))
  const fence = '`'.repeat(Math.max(3, longestRun + 1))
  return [
    'Run this in the background (Bash with run_in_background: true), then continue without waiting for it:',
    '',
    `${fence}bash`,
    command,
    fence,
  ].join('\n')
}
