import log from 'electron-log/main'
import { appendFileSync, existsSync, mkdirSync, renameSync, rmSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

export default log

export const isDebugMode = process.argv.includes('--debug') || process.defaultApp || process.env.MKAGENT_IS_PACKAGED === 'false'
log.initialize()
log.transports.file.maxSize = 5 * 1024 * 1024
log.transports.console.level = isDebugMode ? 'debug' : false

export const mainLog = log.scope('main')
export const sessionLog = log.scope('session')
export const handlerLog = log.scope('handler')
export const windowLog = log.scope('window')
export const agentLog = log.scope('agent')
export const searchLog = log.scope('search')

export const autoUpdateLogPath = join(homedir(), '.mkagent', 'logs', 'auto-update.log')
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
  return log.transports.file.getFile().path
}
