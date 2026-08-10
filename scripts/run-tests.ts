#!/usr/bin/env bun

const sourceRoots = ['apps', 'packages', 'scripts']
const tracked = Bun.spawnSync(
  ['git', 'ls-files', '--cached', '--others', '--exclude-standard', '-z', '--', ...sourceRoots],
  { stdout: 'pipe', stderr: 'pipe' },
)

if (tracked.exitCode !== 0) {
  throw new Error(`Unable to discover MkAgent tests: ${tracked.stderr.toString().trim()}`)
}

const files = tracked.stdout.toString().split('\0').filter(Boolean)
const tests = files.filter(file => /\.(?:test|spec)\.[cm]?[jt]sx?$/.test(file))
const isolatedTests = files.filter(file => file.endsWith('.isolated.ts'))

function runTests(testFiles: string[]): void {
  if (testFiles.length === 0) return
  const result = Bun.spawnSync([process.execPath, 'test', ...testFiles], {
    stdout: 'inherit',
    stderr: 'inherit',
  })
  if (result.exitCode !== 0) process.exit(result.exitCode)
}

console.log(`Running ${tests.length} MkAgent test files`)
runTests(tests)

for (const file of isolatedTests) {
  console.log(`Running isolated test: ${file}`)
  runTests([`./${file}`])
}
