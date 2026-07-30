import log from 'electron-log/main'
import { appendFileSync, existsSync, mkdirSync, renameSync, rmSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { CONFIG_DIR } from '@mkagent/shared/config'

export default log

function resolveDebugMode(): boolean {
  if (process.argv.includes('--debug')) return true

  const packagedEnv = process.env.MKAGENT_IS_PACKAGED
  if (packagedEnv === 'true') return false
  if (packagedEnv === 'false') return true

  const isElectronRuntime = typeof process.versions?.electron === 'string'
  if (isElectronRuntime) {
    if (process.defaultApp) return true
    return false
  }

  return true
}

export const isDebugMode = resolveDebugMode()
log.initialize()

if (isDebugMode) {
  log.transports.file.format = ({ message }) => [
    JSON.stringify({
      timestamp: message.date.toISOString(),
      level: message.level,
      scope: message.scope,
      message: message.data,
    }),
  ]

  log.transports.file.maxSize = 5 * 1024 * 1024
  log.transports.console.format = ({ message }) => {
    const scope = message.scope ? `[${message.scope}]` : ''
    const level = message.level.toUpperCase().padEnd(5)
    const data = message.data
      .map((value: unknown) => (typeof value === 'object' ? JSON.stringify(value) : String(value)))
      .join(' ')
    return [`${message.date.toISOString()} ${level} ${scope} ${data}`]
  }
  log.transports.console.level = 'debug'
} else {
  log.transports.file.level = false
  log.transports.console.level = false
}

export const mainLog = log.scope('main')
export const sessionLog = log.scope('session')
export const handlerLog = log.scope('handler')
export const windowLog = log.scope('window')
export const agentLog = log.scope('agent')
export const searchLog = log.scope('search')

export const autoUpdateLogPath = join(CONFIG_DIR, 'logs', 'auto-update.log')
const backupPath = `${autoUpdateLogPath}.1`
const maxBytes = 2 * 1024 * 1024

function write(level: 'info' | 'warn' | 'error', message: string, meta?: unknown) {
  mkdirSync(dirname(autoUpdateLogPath), { recursive: true })
  const line = JSON.stringify({ timestamp: new Date().toISOString(), level, message, meta }) + '\n'
  if (existsSync(autoUpdateLogPath) && statSync(autoUpdateLogPath).size + Buffer.byteLength(line) > maxBytes) {
    rmSync(backupPath, { force: true })
    renameSync(autoUpdateLogPath, backupPath)
  }
  appendFileSync(autoUpdateLogPath, line)
  mainLog[level]('[auto-update]', message, meta)
}

export const autoUpdateLog = {
  info: (message: string, meta?: unknown) => write('info', message, meta),
  warn: (message: string, meta?: unknown) => write('warn', message, meta),
  error: (message: string, meta?: unknown) => write('error', message, meta),
}

export function getLogFilePath(): string | undefined {
  if (!isDebugMode) return undefined
  return log.transports.file.getFile()?.path
}
