import { describe, test, expect } from 'bun:test'
import {
  formatPathsToRelative,
  formatSinglePathToRelative,
  formatToolInputPaths,
} from '../files'

// ---------------------------------------------------------------------------
// Regression for OSS #1056: session.jsonl stored tool records with a dot
// inserted into absolute paths. Two causes: relativizing against a cwd of `/`
// (Finder-launched app) turned `/Users/x` into `./Users/x`, and the unanchored
// root-name regex matched `/home` inside `/Volumes/home/Drive`, producing
// `/Volumes./home/Drive`.
// ---------------------------------------------------------------------------

// Every row from the reporter's tables, ground truth on the left.
const REPORTED_PATHS = [
  '/Volumes/home/Drive',
  '/Users/samflorentine/.mkagent',
  '/Volumes./home',
  '//sam@192.168.1.100/home',
  '/opt/homebrew',
  '/Users/x',
  '/Users/samflorentine/x',
  '/etc/hosts',
  '/var/log/x',
  '/Volumes/home/Databases',
  '/private/tmp/x',
  '/Volumes/Databases/Eagle',
  '/Volumes/Media/x',
  '/Volumes/Sam/x',
  '/Applications/x',
  '/Library/x',
  '/System/x',
  '/bin/ls',
  '/usr/bin/env',
  '/a/bbb',
  '/aaa/bbb',
  '/Volumes/x',
  '/Volumes',
  '~/x',
  'relative/path/x',
]

const REPORTER_COMMAND = [
  'echo "MARKER_A=/Volumes/home/Drive"',
  'echo "MARKER_B=/Users/samflorentine/.mkagent"',
  'echo "MARKER_C=/Volumes./home"',
  'echo "MARKER_D=//sam@192.168.1.100/home"',
  'echo "MARKER_E=/opt/homebrew"',
].join('\n')

describe('path relativizing with a root or missing cwd (#1056)', () => {
  test.each(REPORTED_PATHS)('cwd "/" leaves %s unchanged', (path) => {
    expect(formatPathsToRelative(path, '/')).toBe(path)
    expect(formatSinglePathToRelative(path, '/')).toBe(path)
  })

  test.each(REPORTED_PATHS)('no cwd leaves %s unchanged', (path) => {
    expect(formatPathsToRelative(path)).toBe(path)
    expect(formatSinglePathToRelative(path)).toBe(path)
  })

  test('reporter command is persisted verbatim for a root cwd', () => {
    expect(formatPathsToRelative(REPORTER_COMMAND, '/')).toBe(REPORTER_COMMAND)
    expect(formatToolInputPaths({ command: REPORTER_COMMAND }, '/')).toEqual({ command: REPORTER_COMMAND })
  })

  test('drive roots and trailing separators count as root', () => {
    expect(formatSinglePathToRelative('C:\\Users\\x', 'C:\\')).toBe('C:\\Users\\x')
    expect(formatSinglePathToRelative('/Users/x', '//')).toBe('/Users/x')
    expect(formatPathsToRelative('/Users/x', '')).toBe('/Users/x')
  })
})

describe('path relativizing inside a real working directory', () => {
  const cwd = '/Users/gyula/project'

  test('paths inside cwd become ./ relative', () => {
    expect(formatSinglePathToRelative('/Users/gyula/project/src/a.ts', cwd)).toBe('./src/a.ts')
    expect(formatPathsToRelative('/Users/gyula/project/src/a.ts', cwd)).toBe('./src/a.ts')
  })

  test('trailing slash on cwd does not change the result', () => {
    expect(formatSinglePathToRelative('/Users/gyula/project/src/a.ts', cwd + '/')).toBe('./src/a.ts')
  })

  test('paths outside cwd stay absolute', () => {
    expect(formatSinglePathToRelative('/Users/gyula/other/a.ts', cwd)).toBe('/Users/gyula/other/a.ts')
    expect(formatPathsToRelative('/opt/homebrew/bin/node', cwd)).toBe('/opt/homebrew/bin/node')
  })

  test('a sibling directory sharing a prefix is not inside cwd', () => {
    expect(formatSinglePathToRelative('/Users/gyula/project-2/a.ts', cwd)).toBe('/Users/gyula/project-2/a.ts')
    expect(formatPathsToRelative('/Users/gyula/project-2/a.ts', cwd)).toBe('/Users/gyula/project-2/a.ts')
  })

  test('the cwd itself is returned unchanged', () => {
    expect(formatSinglePathToRelative(cwd, cwd)).toBe(cwd)
  })

  test('embedded root names are not matched even when cwd makes them look inside', () => {
    // Unanchored matching used to rewrite `/home/x/y` inside `/mnt/home/x/y` to `./y`.
    expect(formatPathsToRelative('/mnt/home/x/y', '/home/x')).toBe('/mnt/home/x/y')
    expect(formatPathsToRelative('/Volumes/home/x/y', '/home/x')).toBe('/Volumes/home/x/y')
    expect(formatPathsToRelative('//host/home/x/y', '/home/x')).toBe('//host/home/x/y')
    expect(formatPathsToRelative('~/home/x/y', '/home/x')).toBe('~/home/x/y')
    expect(formatPathsToRelative('./home/x/y', '/home/x')).toBe('./home/x/y')
  })

  test('root name must be a complete segment', () => {
    expect(formatPathsToRelative('/Usersfoo/gyula/project/a.ts', cwd)).toBe('/Usersfoo/gyula/project/a.ts')
    expect(formatPathsToRelative('/homes/gyula/project/a.ts', '/homes/gyula/project')).toBe('/homes/gyula/project/a.ts')
  })

  test('paths embedded in prose and shell text are relativized individually', () => {
    const text = 'Read /Users/gyula/project/src/a.ts and "/Users/gyula/project/src/b.ts": ok, /Users/gyula/other/c.ts kept'
    expect(formatPathsToRelative(text, cwd)).toBe(
      'Read ./src/a.ts and "./src/b.ts": ok, /Users/gyula/other/c.ts kept'
    )
    expect(formatPathsToRelative('cat /Users/gyula/project/a.ts:12', cwd)).toBe('cat ./a.ts:12')
    expect(formatPathsToRelative('--out=/Users/gyula/project/dist', cwd)).toBe('--out=./dist')
  })
})

describe('formatToolInputPaths', () => {
  const cwd = '/Users/gyula/project'

  test('relativizes path keys and embedded paths, leaves other values alone', () => {
    const input = {
      file_path: '/Users/gyula/project/src/a.ts',
      command: 'cat /Users/gyula/project/src/a.ts',
      description: 'no paths here',
      count: 3,
      nested: { path: '/Users/gyula/project/src/a.ts' },
    }
    expect(formatToolInputPaths(input, cwd)).toEqual({
      file_path: './src/a.ts',
      command: 'cat ./src/a.ts',
      description: 'no paths here',
      count: 3,
      nested: { path: '/Users/gyula/project/src/a.ts' },
    })
  })

  test('without a cwd values are copied unchanged', () => {
    const input = { file_path: '/Users/gyula/project/src/a.ts', command: 'ls /tmp' }
    expect(formatToolInputPaths(input)).toEqual(input)
    expect(formatToolInputPaths(input, '/')).toEqual(input)
  })

  test('undefined input passes through', () => {
    expect(formatToolInputPaths(undefined, cwd)).toBeUndefined()
  })
})
