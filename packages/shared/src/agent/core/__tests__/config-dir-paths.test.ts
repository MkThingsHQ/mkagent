import { describe, expect, it } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const CONFIG_VALIDATOR_URL = pathToFileURL(join(import.meta.dir, '..', 'config-validator.ts')).href
const PATH_PROCESSOR_URL = pathToFileURL(join(import.meta.dir, '..', 'path-processor.ts')).href
const MODE_MANAGER_URL = pathToFileURL(join(import.meta.dir, '..', '..', 'mode-manager.ts')).href

describe('CONFIG_DIR path handling', () => {
  it('recognizes configuration and workspace paths under a custom data directory', () => {
    const configDir = mkdtempSync(join(tmpdir(), 'mkagent-config-dir-'))

    try {
      const script = `
        import { join } from 'node:path';
        import { ConfigValidator } from ${JSON.stringify(CONFIG_VALIDATOR_URL)};
        import { PathProcessor } from ${JSON.stringify(PATH_PROCESSOR_URL)};
        import { getPathHint } from ${JSON.stringify(MODE_MANAGER_URL)};

        const root = process.env.CONFIG_DIR;
        const workspaceRoot = join(root, 'workspaces', 'alpha');
        const plansDir = join(workspaceRoot, 'sessions', 'session-1', 'plans');
        console.log(JSON.stringify({
          config: new ConfigValidator().isCraftAgentConfig(join(root, 'config.json')),
          permissions: new PathProcessor().isConfigFile(join(workspaceRoot, 'permissions.json')),
          workspaceHint: getPathHint(join(workspaceRoot, 'notes.md'), plansDir),
          outsideHint: getPathHint(join(root, '..', 'outside.md'), plansDir),
        }));
      `
      const run = Bun.spawnSync([process.execPath, '--eval', script], {
        env: { ...process.env, CONFIG_DIR: configDir },
        stdout: 'pipe',
        stderr: 'pipe',
      })

      expect(run.exitCode).toBe(0)
      expect(JSON.parse(run.stdout.toString())).toEqual({
        config: true,
        permissions: true,
        workspaceHint: 'Hint: Write to the session plans or data folder, not the workspace root.',
        outsideHint: 'Hint: Files must be written to the session plans or data folder. Use plansFolderPath or dataFolderPath from <session_state>.',
      })
    } finally {
      rmSync(configDir, { recursive: true, force: true })
    }
  })
})
