import { afterEach, describe, expect, it } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const watcherUrl = pathToFileURL(join(import.meta.dir, '..', 'watcher.ts')).href;
const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function runWatcherScript(source: string): unknown {
  const root = mkdtempSync(join(tmpdir(), 'mkagent-watcher-retained-'));
  roots.push(root);
  const result = Bun.spawnSync([process.execPath, '--eval', source], {
    env: { ...process.env, CONFIG_DIR: join(root, 'config'), TEST_ROOT: root },
    stdout: 'pipe',
    stderr: 'pipe',
  });
  expect(result.exitCode, result.stderr.toString()).toBe(0);
  const line = result.stdout.toString().split('\n').find(value => value.startsWith('RESULT:'));
  expect(line, result.stdout.toString()).toBeDefined();
  return JSON.parse(line!.slice('RESULT:'.length));
}

describe('ConfigWatcher retained behavior', () => {
  it('watches nested preset themes and default permissions directories', () => {
    const result = runWatcherScript(`
      import { existsSync, rmSync, writeFileSync } from 'node:fs';
      import { join } from 'node:path';
      const { ConfigWatcher } = await import(${JSON.stringify(watcherUrl)});
      const root = process.env.TEST_ROOT;
      const events = [];
      const watcher = new ConfigWatcher(join(root, 'workspace'), {
        onPresetThemeChange: (id, theme) => events.push(['theme', id, theme ? 'present' : 'deleted']),
        onPresetThemesListChange: themes => events.push(['themes-list', themes.length]),
        onDefaultPermissionsChange: () => events.push(['permissions']),
      });
      watcher.start();
      await new Promise(resolve => setTimeout(resolve, 150));
      const themePath = join(root, 'config', 'themes', 'custom.json');
      writeFileSync(themePath, JSON.stringify({ name: 'Custom' }));
      await new Promise(resolve => setTimeout(resolve, 250));
      writeFileSync(join(root, 'config', 'permissions', 'default.json'), '{}');
      await new Promise(resolve => setTimeout(resolve, 250));
      rmSync(themePath);
      await new Promise(resolve => setTimeout(resolve, 250));
      watcher.stop();
      console.log('RESULT:' + JSON.stringify({ events, themeDeleted: !existsSync(themePath) }));
    `) as { events: Array<[string, ...unknown[]]>; themeDeleted: boolean };

    expect(result.events).toContainEqual(['permissions']);
    expect(result.events).toContainEqual(['theme', 'custom', 'present']);
    expect(result.events).toContainEqual(['theme', 'custom', 'deleted']);
    expect(result.events.filter(event => event[0] === 'themes-list').length).toBeGreaterThanOrEqual(2);
    expect(result.themeDeleted).toBe(true);
  });

  it('validates config and preferences and only emits real LLM changes', () => {
    const result = runWatcherScript(`
      import { mkdirSync, writeFileSync } from 'node:fs';
      import { join } from 'node:path';
      const root = process.env.TEST_ROOT;
      const configDir = join(root, 'config');
      mkdirSync(configDir, { recursive: true });
      const configPath = join(configDir, 'config.json');
      const valid = { workspaces: [], activeWorkspaceId: null, activeSessionId: null, llmConnections: [] };
      writeFileSync(configPath, JSON.stringify(valid));
      const { ConfigWatcher } = await import(${JSON.stringify(watcherUrl)});
      const events = [];
      const watcher = new ConfigWatcher(join(root, 'workspace'), {
        onConfigChange: config => events.push('config:' + (config.llmConnections?.length ?? 0)),
        onLlmConnectionsChange: () => events.push('llm'),
        onPreferencesChange: () => events.push('preferences'),
        onValidationError: (file) => events.push('invalid:' + file),
      });
      watcher.start();
      await new Promise(resolve => setTimeout(resolve, 150));
      writeFileSync(configPath, JSON.stringify({ ...valid, notificationsEnabled: false }));
      await new Promise(resolve => setTimeout(resolve, 300));
      writeFileSync(configPath, JSON.stringify({
        ...valid,
        llmConnections: [{ slug: 'deepseek', name: 'DeepSeek', providerType: 'pi', authType: 'api_key', createdAt: 1 }],
      }));
      await new Promise(resolve => setTimeout(resolve, 300));
      writeFileSync(configPath, '{bad');
      await new Promise(resolve => setTimeout(resolve, 250));
      writeFileSync(join(configDir, 'preferences.json'), JSON.stringify({ uiLanguage: 'invalid' }));
      await new Promise(resolve => setTimeout(resolve, 300));
      watcher.stop();
      console.log('RESULT:' + JSON.stringify(events));
    `) as string[];

    expect(result).toContain('config:0');
    expect(result).toContain('config:1');
    expect(result.filter(event => event === 'llm')).toHaveLength(1);
    expect(result).toContain('invalid:config.json');
    expect(result).toContain('invalid:preferences.json');
    expect(result).not.toContain('preferences');
  });

  it('keeps duplicate watcher ownership and resolves workspace IDs canonically', () => {
    const result = runWatcherScript(`
      import { existsSync } from 'node:fs';
      import { join } from 'node:path';
      const { ConfigWatcher, _getActiveWatchers } = await import(${JSON.stringify(watcherUrl)});
      const expected = join(process.env.CONFIG_DIR, 'workspaces', 'alpha');
      const first = new ConfigWatcher('alpha', {});
      const duplicate = new ConfigWatcher('alpha', {});
      first.start();
      duplicate.start();
      const afterStart = {
        registered: _getActiveWatchers().has(expected),
        directoryExists: existsSync(expected),
        firstRunning: first.isWatching(),
        duplicateRunning: duplicate.isWatching(),
      };
      duplicate.stop();
      const afterDuplicateStop = _getActiveWatchers().has(expected);
      first.stop();
      const afterOwnerStop = _getActiveWatchers().has(expected);
      console.log('RESULT:' + JSON.stringify({ afterStart, afterDuplicateStop, afterOwnerStop }));
    `) as {
      afterStart: Record<string, boolean>;
      afterDuplicateStop: boolean;
      afterOwnerStop: boolean;
    };

    expect(result.afterStart).toEqual({
      registered: true,
      directoryExists: true,
      firstRunning: true,
      duplicateRunning: false,
    });
    expect(result.afterDuplicateStop).toBe(true);
    expect(result.afterOwnerStop).toBe(false);
  });

  it('downloads a Skill URL icon and re-emits the materialized Skill', () => {
    const result = runWatcherScript(`
      import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
      import { join } from 'node:path';
      const root = process.env.TEST_ROOT;
      const skillDir = join(root, 'workspace', 'skills', 'icon-skill');
      mkdirSync(skillDir, { recursive: true });
      const server = Bun.serve({
        port: 0,
        fetch: () => new Response('<svg xmlns="http://www.w3.org/2000/svg"/>', {
          headers: { 'content-type': 'image/svg+xml' },
        }),
      });
      const { ConfigWatcher } = await import(${JSON.stringify(watcherUrl)});
      const iconPaths = [];
      const watcher = new ConfigWatcher(join(root, 'workspace'), {
        onSkillChange: (_slug, skill) => iconPaths.push(skill?.iconPath ?? null),
      });
      watcher.start();
      writeFileSync(join(skillDir, 'SKILL.md'), [
        '---',
        'name: Icon Skill',
        'description: Downloads its icon',
        'icon: http://127.0.0.1:' + server.port + '/icon.svg',
        '---',
        'Instructions',
      ].join('\\n'));
      const iconPath = join(skillDir, 'icon.svg');
      const deadline = Date.now() + 3000;
      while (!existsSync(iconPath) && Date.now() < deadline) {
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      await new Promise(resolve => setTimeout(resolve, 250));
      watcher.stop();
      server.stop(true);
      console.log('RESULT:' + JSON.stringify({ exists: existsSync(iconPath), iconPaths }));
    `) as { exists: boolean; iconPaths: Array<string | null> };

    expect(result.exists).toBe(true);
    expect(result.iconPaths.some(Boolean)).toBe(true);
  });
});
