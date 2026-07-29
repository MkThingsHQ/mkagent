#!/usr/bin/env bun
import { chmodSync, copyFileSync, cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import { parseArgs } from 'node:util'

const root = join(import.meta.dir, '..')
const hostPlatform = process.platform === 'win32' ? 'win32' : process.platform
const hostArch = process.arch === 'arm64' ? 'arm64' : 'x64'
const { values } = parseArgs({
  args: Bun.argv.slice(2),
  options: {
    platform: { type: 'string', default: hostPlatform },
    arch: { type: 'string', default: hostArch },
    output: { type: 'string' },
    compress: { type: 'boolean', default: false },
    help: { type: 'boolean', short: 'h', default: false },
  },
})

if (values.help) {
  console.log('Usage: bun run scripts/build-server.ts [--platform=darwin|linux|win32] [--arch=x64|arm64] [--output=path] [--compress]')
  process.exit(0)
}

if (values.platform !== hostPlatform || values.arch !== hostArch) {
  throw new Error(`Headless builds run on their target host. Requested ${values.platform}-${values.arch}, current host is ${hostPlatform}-${hostArch}.`)
}

const output = resolve(values.output ?? join(root, 'dist', `server-${hostPlatform}-${hostArch}`))
const electron = join(root, 'apps', 'electron')
const run = (command: string[], cwd = root) => {
  const result = Bun.spawnSync(command, { cwd, stdout: 'inherit', stderr: 'inherit' })
  if (result.exitCode !== 0) throw new Error(`Command failed (${result.exitCode}): ${command.join(' ')}`)
}

rmSync(output, { recursive: true, force: true })
mkdirSync(output, { recursive: true })

run([process.execPath, 'run', 'webui:build'])
run([process.execPath, 'run', 'scripts/copy-assets.ts'], electron)
run([
  process.execPath,
  'build',
  'packages/server/src/index.ts',
  '--target=bun',
  '--format=esm',
  '--outfile=' + join(output, 'server.js'),
  '--external=koffi',
  '--external=@aws-sdk/client-s3',
  '--external=xlsx',
])

cpSync(join(electron, 'dist', 'resources'), join(output, 'resources'), { recursive: true })
cpSync(join(root, 'apps', 'webui', 'dist'), join(output, 'webui'), { recursive: true })

const runtimeName = process.platform === 'win32' ? 'bun.exe' : 'bun'
const runtime = join(output, 'vendor', 'bun', runtimeName)
mkdirSync(dirname(runtime), { recursive: true })
copyFileSync(process.execPath, runtime)
chmodSync(runtime, 0o755)

const rgName = process.platform === 'win32' ? 'rg.exe' : 'rg'
const rgSource = join(root, 'node_modules', '@vscode', 'ripgrep', 'bin', rgName)
if (!existsSync(rgSource)) throw new Error(`Missing ripgrep binary: ${rgSource}`)
const rgDestination = join(output, 'node_modules', '@vscode', 'ripgrep', 'bin', rgName)
mkdirSync(dirname(rgDestination), { recursive: true })
copyFileSync(rgSource, rgDestination)
chmodSync(rgDestination, 0o755)

cpSync(join(root, 'node_modules', 'xlsx'), join(output, 'node_modules', 'xlsx'), { recursive: true })

if (process.platform === 'win32') {
  writeFileSync(join(output, 'mkagent-server.cmd'), [
    '@echo off',
    'set "ROOT=%~dp0"',
    'set "MKAGENT_BUNDLED_ASSETS_ROOT=%ROOT%"',
    'set "MKAGENT_APP_ROOT=%ROOT%"',
    'set "MKAGENT_RESOURCES_PATH=%ROOT%resources"',
    'set "MKAGENT_WEBUI_DIR=%ROOT%webui"',
    'set "MKAGENT_IS_PACKAGED=true"',
    `set "MKAGENT_UV=%ROOT%resources\\bin\\${hostPlatform}-${hostArch}\\uv.exe"`,
    'set "MKAGENT_SCRIPTS=%ROOT%resources\\scripts"',
    `set "PATH=%ROOT%resources\\bin;%ROOT%resources\\bin\\${hostPlatform}-${hostArch};%ROOT%vendor\\bun;%PATH%"`,
    '"%ROOT%vendor\\bun\\bun.exe" "%ROOT%server.js" %*',
    '',
  ].join('\r\n'))
} else {
  const launcher = join(output, 'mkagent-server')
  writeFileSync(launcher, `#!/usr/bin/env sh
set -eu
ROOT="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
export MKAGENT_BUNDLED_ASSETS_ROOT="$ROOT"
export MKAGENT_APP_ROOT="$ROOT"
export MKAGENT_RESOURCES_PATH="$ROOT/resources"
export MKAGENT_WEBUI_DIR="$ROOT/webui"
export MKAGENT_IS_PACKAGED=true
export MKAGENT_UV="$ROOT/resources/bin/${hostPlatform}-${hostArch}/uv"
export MKAGENT_SCRIPTS="$ROOT/resources/scripts"
export PATH="$ROOT/resources/bin:$ROOT/vendor/bun:$PATH"
exec "$ROOT/vendor/bun/bun" "$ROOT/server.js" "$@"
`)
  chmodSync(launcher, 0o755)
}

writeFileSync(join(output, 'README.md'), `# MkAgent headless server

Set a strong \`MKAGENT_SERVER_TOKEN\` and run \`${process.platform === 'win32' ? 'mkagent-server.cmd' : './mkagent-server'}\`.
The bundled WebUI is served on the RPC port. Non-localhost deployments must configure TLS.
`)

for (const path of [
  join(output, 'server.js'),
  join(output, 'resources', 'pi-agent-server', 'index.js'),
  runtime,
  rgDestination,
  join(output, 'webui', 'index.html'),
]) {
  if (!existsSync(path)) throw new Error(`Missing headless artifact: ${path}`)
}

if (values.compress) {
  if (process.platform === 'win32') {
    console.log('Compression is delegated to the Windows release workflow.')
  } else {
    const archive = `${output}.tar.gz`
    run(['tar', '-czf', archive, '-C', dirname(output), basename(output)])
    console.log(`Created ${archive}`)
  }
}

console.log(`Built MkAgent headless server at ${output}`)
