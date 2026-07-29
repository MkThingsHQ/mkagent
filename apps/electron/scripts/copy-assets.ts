import { chmodSync, copyFileSync, cpSync, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs'
import { basename, join } from 'node:path'

const appDir = join(import.meta.dir, '..')
const rootDir = join(appDir, '..', '..')
const source = join(appDir, 'resources')
const destination = join(appDir, 'dist', 'resources')
const targetPlatform = process.env.MKAGENT_TARGET_PLATFORM ?? process.platform
const targetArch = process.env.MKAGENT_TARGET_ARCH ?? process.arch
const hasExplicitTarget = Boolean(process.env.MKAGENT_TARGET_PLATFORM || process.env.MKAGENT_TARGET_ARCH)
const platformKey = `${targetPlatform}-${targetArch}`

const docNames = [
  'browser-tools.md',
  'data-tables.md',
  'html-preview.md',
  'image-preview.md',
  'llm-tool.md',
  'markdown-preview.md',
  'mermaid.md',
  'pdf-preview.md',
  'permissions.md',
  'skills.md',
  'themes.md',
  'tool-icons.md',
]
const toolNames = ['markitdown', 'pdf-tool', 'xlsx-tool', 'docx-tool', 'pptx-tool', 'img-tool', 'ical-tool', 'doc-diff']

rmSync(destination, { recursive: true, force: true })
mkdirSync(destination, { recursive: true })

for (const directory of ['permissions', 'themes']) {
  cpSync(join(source, directory), join(destination, directory), { recursive: true })
}

mkdirSync(join(destination, 'tool-icons'), { recursive: true })
for (const name of readdirSync(join(source, 'tool-icons'))) {
  if (name === 'craft-agent.svg') continue
  copyFileSync(join(source, 'tool-icons', name), join(destination, 'tool-icons', name))
}

mkdirSync(join(destination, 'docs'), { recursive: true })
for (const name of docNames) copyFileSync(join(source, 'docs', name), join(destination, 'docs', name))

mkdirSync(join(destination, 'scripts'), { recursive: true })
for (const name of readdirSync(join(source, 'scripts'))) {
  const path = join(source, 'scripts', name)
  if (name.endsWith('.py')) copyFileSync(path, join(destination, 'scripts', name))
}

mkdirSync(join(destination, 'bin'), { recursive: true })
for (const name of toolNames) {
  for (const suffix of ['', '.cmd']) {
    const path = join(source, 'bin', name + suffix)
    if (existsSync(path)) copyFileSync(path, join(destination, 'bin', name + suffix))
  }
}

copyFileSync(join(source, 'config-defaults.json'), join(destination, 'config-defaults.json'))
copyFileSync(
  join(rootDir, 'packages', 'shared', 'src', 'agent', 'powershell-parser.ps1'),
  join(destination, 'powershell-parser.ps1'),
)

const piPackage = join(rootDir, 'packages', 'pi-agent-server')
const piBuild = Bun.spawnSync([process.execPath, 'run', 'build'], { cwd: piPackage, stdout: 'inherit', stderr: 'inherit' })
if (piBuild.exitCode !== 0) throw new Error('Unable to build Pi server')
const piServer = join(piPackage, 'dist', 'index.js')
mkdirSync(join(destination, 'pi-agent-server'), { recursive: true })
copyFileSync(piServer, join(destination, 'pi-agent-server', 'index.js'))

const uvBinary = targetPlatform === 'win32' ? 'uv.exe' : 'uv'
const preparedUv = join(source, 'bin', platformKey, uvBinary)
const uv = existsSync(preparedUv)
  ? preparedUv
  : targetPlatform === process.platform && targetArch === process.arch
    ? Bun.which('uv')
    : null
if (!uv) throw new Error(`uv is not prepared for ${platformKey}`)
const uvDestination = join(destination, 'bin', platformKey, uvBinary)
mkdirSync(join(destination, 'bin', platformKey), { recursive: true })
copyFileSync(uv, uvDestination)
chmodSync(uvDestination, 0o755)

const bunDestination = join(appDir, 'vendor', 'bun', targetPlatform === 'win32' ? 'bun.exe' : 'bun')
mkdirSync(join(appDir, 'vendor', 'bun'), { recursive: true })
if (!hasExplicitTarget) {
  copyFileSync(process.execPath, bunDestination)
} else if (!existsSync(bunDestination)) {
  throw new Error(`Bun is not prepared for ${platformKey}`)
}
chmodSync(bunDestination, 0o755)

console.log(`Copied packaged resources for ${platformKey} (${basename(process.execPath)})`)
