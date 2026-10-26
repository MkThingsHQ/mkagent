import { describe, expect, it } from 'bun:test'
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const root = resolve(import.meta.dir, '../../../../..')
function run(config: string, code: string) {
  const result = Bun.spawnSync([process.execPath, '--eval', code], {
    cwd: root, env: { ...process.env, CONFIG_DIR: config }, stdout: 'pipe', stderr: 'pipe',
  })
  expect(result.stderr.toString()).toBe('')
  expect(result.exitCode).toBe(0)
  return JSON.parse(result.stdout.toString())
}

describe('local display and workspace persistence', () => {
  it('preserves preferences and reads zoom across independent process restarts', () => {
    const dir = mkdtempSync(join(tmpdir(), 'mkagent-zoom-'))
    try {
      writeFileSync(join(dir, 'preferences.json'), JSON.stringify({ name: 'Local user', uiLanguage: 'zh-Hans' }))
      const module = JSON.stringify(join(root, 'packages/shared/src/config/preferences.ts'))
      expect(run(dir, `import {setPersistedDefaultZoomLevel,getPersistedDefaultZoomLevel} from ${module}; setPersistedDefaultZoomLevel(125); console.log(JSON.stringify(getPersistedDefaultZoomLevel()))`)).toBe(125)
      expect(run(dir, `import {getPersistedDefaultZoomLevel} from ${module}; console.log(JSON.stringify(getPersistedDefaultZoomLevel()))`)).toBe(125)
      expect(JSON.parse(readFileSync(join(dir, 'preferences.json'), 'utf8'))).toMatchObject({ name: 'Local user', uiLanguage: 'zh-Hans', defaultZoomLevel: 125 })
      expect(existsSync(join(dir, 'config.json'))).toBe(false)
    } finally { rmSync(dir, { recursive: true, force: true }) }
  })

  it('unregisters active/non-active workspaces without deleting root or legacy sessions, and reopens the same folder', () => {
    const dir = mkdtempSync(join(tmpdir(), 'mkagent-unregister-'))
    try {
      const module = JSON.stringify(join(root, 'packages/shared/src/config/storage.ts'))
      writeFileSync(join(dir, 'config.json'), JSON.stringify({ workspaces: [], activeWorkspaceId: null, activeSessionId: null, llmConnections: [] }))
      const folder = join(dir, 'original')
      mkdirSync(folder)
      const data = run(dir, `import {addWorkspace,removeWorkspace,getWorkspaces} from ${module};
        const a=addWorkspace({name:'Original',rootPath:${JSON.stringify(folder)}});
        const b=addWorkspace({name:'Other',rootPath:${JSON.stringify(join(dir, 'other'))}});
        console.log(JSON.stringify({a,b}));`)
      const legacy = join(dir, 'workspaces', data.a.id)
      mkdirSync(legacy, { recursive: true })
      writeFileSync(join(legacy, 'sessions.json'), 'legacy sentinel')
      mkdirSync(join(folder, 'sessions'), { recursive: true })
      writeFileSync(join(folder, 'sessions', 'sentinel.jsonl'), 'session sentinel')
      expect(run(dir, `import {removeWorkspace,getWorkspaces} from ${module}; console.log(JSON.stringify(await removeWorkspace(${JSON.stringify(data.a.id)})))`)).toBe(true)
      expect(readFileSync(join(legacy, 'sessions.json'), 'utf8')).toBe('legacy sentinel')
      expect(readFileSync(join(folder, 'sessions', 'sentinel.jsonl'), 'utf8')).toBe('session sentinel')
      expect(run(dir, `import {addWorkspace,getWorkspaces} from ${module}; const w=addWorkspace({name:'Original',rootPath:${JSON.stringify(folder)}}); console.log(JSON.stringify(w.id))`)).toBe(data.a.id)
      expect(run(dir, `import {removeWorkspace} from ${module}; console.log(JSON.stringify(await removeWorkspace(${JSON.stringify(data.b.id)})))`)).toBe(true)
    } finally { rmSync(dir, { recursive: true, force: true }) }
  })
})
