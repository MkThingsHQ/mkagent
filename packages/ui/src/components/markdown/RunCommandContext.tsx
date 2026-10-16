import * as React from 'react'

/**
 * Runs a shell command as a background task (the host decides how; in the app it asks the agent,
 * so permissions apply). Provided by the chat transcript: code blocks with a command show a
 * "Run in background" button only where a handler exists, and never while their text streams.
 */
export type RunCommandHandler = (command: string) => void

const RunCommandContext = React.createContext<RunCommandHandler | null>(null)

export const RunCommandProvider = RunCommandContext.Provider

export function useRunCommand(): RunCommandHandler | null {
  return React.useContext(RunCommandContext)
}
