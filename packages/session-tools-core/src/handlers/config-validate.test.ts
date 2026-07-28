import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { SessionToolContext } from '../context.ts';
import { handleConfigValidate } from './config-validate.ts';

function createContext(workspacePath: string): SessionToolContext {
  return {
    sessionId: 'test-session',
    workspacePath,
    skillsPath: join(workspacePath, 'skills'),
    plansFolderPath: join(workspacePath, 'plans'),
    callbacks: { onPlanSubmitted: () => {} },
    fs: {
      exists: path => existsSync(path),
      readFile: path => readFileSync(path, 'utf-8'),
      readFileBuffer: path => readFileSync(path),
      writeFile: (path, content) => writeFileSync(path, content),
      isDirectory: path => existsSync(path) && statSync(path).isDirectory(),
      readdir: path => readdirSync(path),
      stat: path => {
        const stats = statSync(path);
        return { size: stats.size, isDirectory: () => stats.isDirectory() };
      },
    },
  };
}

describe('config_validate', () => {
  let workspacePath: string;

  beforeEach(() => {
    workspacePath = mkdtempSync(join(tmpdir(), 'mkagent-config-validate-'));
  });

  afterEach(() => {
    rmSync(workspacePath, { recursive: true, force: true });
  });

  it('accepts a valid workspace permissions file', async () => {
    writeFileSync(join(workspacePath, 'permissions.json'), '{}');
    const result = await handleConfigValidate(createContext(workspacePath), {
      target: 'permissions',
    });
    expect(result.content[0]?.text).toContain('Validation passed');
  });

  it('uses defaults when workspace permissions are absent', async () => {
    const result = await handleConfigValidate(createContext(workspacePath), {
      target: 'permissions',
    });
    expect(result.content[0]?.text).toContain('Validation passed');
  });
});
