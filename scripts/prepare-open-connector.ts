import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join, relative, sep } from 'node:path'

const rootDir = join(import.meta.dir, '..')
export const openConnectorDir = join(rootDir, 'vendor', 'open-connector')
const installStamp = join(openConnectorDir, 'node_modules', '.mkagent-package-lock.sha256')
const npmExecutable = 'npm'

interface OpenConnectorPackage {
  dependencies?: Record<string, string>
}

function runChecked(executable: string, args: string[], cwd = rootDir): void {
  const result = spawnSync(executable, args, {
    cwd,
    stdio: 'inherit',
    shell: process.platform === 'win32' && executable === npmExecutable,
  })
  if (result.error) throw result.error
  if (result.status !== 0) {
    throw new Error(`${executable} ${args.join(' ')} exited with code ${result.status ?? 'unknown'}`)
  }
}

function isNonEmptyFile(path: string): boolean {
  return existsSync(path) && statSync(path).isFile() && statSync(path).size > 0
}

function containsFile(directory: string, suffix: string): boolean {
  return existsSync(directory)
    && statSync(directory).isDirectory()
    && readdirSync(directory, { withFileTypes: true }).some(entry => entry.isFile() && entry.name.endsWith(suffix))
}

function packageLockHash(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex')
}

function missingRuntimeDependencies(runtimeRoot: string): string[] {
  const packageJsonPath = join(runtimeRoot, 'package.json')
  if (!isNonEmptyFile(packageJsonPath)) return ['package.json']
  const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as OpenConnectorPackage
  return Object.keys(packageJson.dependencies ?? {}).filter(name =>
    !isNonEmptyFile(join(runtimeRoot, 'node_modules', ...name.split('/'), 'package.json')),
  )
}

function ensureCheckout(): void {
  const packageJsonPath = join(openConnectorDir, 'package.json')
  if (isNonEmptyFile(packageJsonPath)) return

  console.log('Initializing OpenConnector submodule...')
  runChecked('git', ['submodule', 'update', '--init', '--recursive', '--', 'vendor/open-connector'])
  if (!isNonEmptyFile(packageJsonPath)) {
    throw new Error(`OpenConnector submodule is unavailable at ${openConnectorDir}`)
  }
}

export function validateOpenConnectorRuntime(runtimeRoot = openConnectorDir): void {
  const requiredFiles = [
    'package.json',
    'src/server/index.ts',
    'src/providers/registry.generated.ts',
    'src/providers/registry.cloudflare.generated.ts',
    'dist/web/index.html',
    'node_modules/@hono/node-server/package.json',
  ]
  const missingFiles = requiredFiles.filter(path => !isNonEmptyFile(join(runtimeRoot, path)))
  if (missingFiles.length > 0) {
    throw new Error(`OpenConnector runtime is incomplete; missing: ${missingFiles.join(', ')}`)
  }
  if (!containsFile(join(runtimeRoot, 'migrations'), '.sql')) {
    throw new Error('OpenConnector runtime has no SQL migrations')
  }
  if (!containsFile(join(runtimeRoot, 'catalog', 'apps'), '.json')) {
    throw new Error('OpenConnector runtime has no generated provider catalog')
  }
  const missingDependencies = missingRuntimeDependencies(runtimeRoot)
  if (missingDependencies.length > 0) {
    throw new Error(`OpenConnector runtime is missing production dependencies: ${missingDependencies.join(', ')}`)
  }
}

export async function prepareOpenConnector(): Promise<string> {
  ensureCheckout()

  const packageLockPath = join(openConnectorDir, 'package-lock.json')
  if (!isNonEmptyFile(packageLockPath)) {
    throw new Error(`OpenConnector package lock is missing at ${packageLockPath}`)
  }

  const expectedHash = packageLockHash(packageLockPath)
  const installedHash = isNonEmptyFile(installStamp) ? readFileSync(installStamp, 'utf8').trim() : ''
  if (installedHash !== expectedHash || missingRuntimeDependencies(openConnectorDir).length > 0) {
    console.log('Installing OpenConnector dependencies...')
    runChecked(npmExecutable, ['ci', '--no-audit', '--no-fund'], openConnectorDir)
    mkdirSync(join(openConnectorDir, 'node_modules'), { recursive: true })
    writeFileSync(installStamp, `${expectedHash}\n`)
  } else {
    console.log('OpenConnector dependencies match package-lock.json')
  }

  console.log('Generating OpenConnector catalog and provider registries...')
  runChecked(npmExecutable, ['run', 'generate:catalog'], openConnectorDir)

  console.log('Typechecking and building OpenConnector...')
  runChecked(npmExecutable, ['run', 'build'], openConnectorDir)

  console.log('Building OpenConnector web console...')
  runChecked(npmExecutable, ['run', 'build:web'], openConnectorDir)

  validateOpenConnectorRuntime()
  console.log('OpenConnector runtime is ready')
  return openConnectorDir
}

export function copyOpenConnectorRuntime(destination: string): void {
  validateOpenConnectorRuntime()
  rmSync(destination, { recursive: true, force: true })
  mkdirSync(dirname(destination), { recursive: true })
  cpSync(openConnectorDir, destination, {
    recursive: true,
    force: true,
    verbatimSymlinks: true,
    filter: source => {
      const path = relative(openConnectorDir, source)
      return path === '' || !path.split(sep).includes('.git')
    },
  })

  runChecked(
    npmExecutable,
    ['prune', '--omit=dev', '--ignore-scripts', '--no-audit', '--no-fund', '--workspaces=false'],
    destination,
  )
  validateOpenConnectorRuntime(destination)
  if (existsSync(join(destination, '.git'))) {
    throw new Error('Packaged OpenConnector runtime unexpectedly contains .git metadata')
  }
  console.log(`Copied production OpenConnector runtime to ${destination}`)
}

if (import.meta.main) {
  await prepareOpenConnector()
}
