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
const SERIAL_TESTS = new Set([
  // This suite globally mocks ../browser-cdp. In Bun's concurrent multi-file
  // runner that mock can race with browser-cdp.test.ts and replace the real
  // implementation for all 19 BrowserCDP cases.
  'apps/electron/src/main/__tests__/browser-pane-manager.test.ts',
  'packages/shared/src/agent/__tests__/pi-conversation-flow.integration.test.ts',
])
const tests = files.filter(
  file => /\.(?:test|spec)\.[cm]?[jt]sx?$/.test(file) && !SERIAL_TESTS.has(file),
)
const isolatedTests = files.filter(
  file => file.endsWith('.isolated.ts') || SERIAL_TESTS.has(file),
)

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
