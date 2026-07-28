import { describe, it, expect } from 'bun:test';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { resolveScriptRuntime } from './resolve-script-runtime.ts';

describe('resolveScriptRuntime', () => {
  it('prefers MKAGENT_UV for python3', () => {
    const prev = process.env.MKAGENT_UV;
    process.env.MKAGENT_UV = '/tmp/custom-uv';

    try {
      const resolved = resolveScriptRuntime('python3', { isPackaged: false });
      expect(resolved.command).toBe('/tmp/custom-uv');
      expect(resolved.argsPrefix).toEqual(['run', '--python', '3.12']);
      expect(resolved.source).toBe('env');
    } finally {
      if (prev === undefined) delete process.env.MKAGENT_UV;
      else process.env.MKAGENT_UV = prev;
    }
  });

  it('prefers bundled uv when env is missing', () => {
    const prevUv = process.env.MKAGENT_UV;
    delete process.env.MKAGENT_UV;

    const base = mkdtempSync(join(tmpdir(), 'runtime-resolver-'));
    const uvPath = join(base, 'resources', 'bin', `${process.platform}-${process.arch}`, process.platform === 'win32' ? 'uv.exe' : 'uv');
    mkdirSync(join(base, 'resources', 'bin', `${process.platform}-${process.arch}`), { recursive: true });
    writeFileSync(uvPath, '');

    try {
      const resolved = resolveScriptRuntime('python3', { isPackaged: true, resourcesBasePath: base });
      expect(resolved.command).toBe(uvPath);
      expect(resolved.source).toBe('bundled');
    } finally {
      if (prevUv === undefined) delete process.env.MKAGENT_UV;
      else process.env.MKAGENT_UV = prevUv;
    }
  });

  it('blocks PATH fallback in packaged mode', () => {
    const prevUv = process.env.MKAGENT_UV;
    const prevBase = process.env.MKAGENT_RESOURCES_BASE;
    const prevRoot = process.env.MKAGENT_APP_ROOT;
    delete process.env.MKAGENT_UV;
    delete process.env.MKAGENT_RESOURCES_BASE;
    delete process.env.MKAGENT_APP_ROOT;

    try {
      expect(() => resolveScriptRuntime('python3', { isPackaged: true })).toThrow(
        'packaged app'
      );
    } finally {
      if (prevUv === undefined) delete process.env.MKAGENT_UV;
      else process.env.MKAGENT_UV = prevUv;
      if (prevBase === undefined) delete process.env.MKAGENT_RESOURCES_BASE;
      else process.env.MKAGENT_RESOURCES_BASE = prevBase;
      if (prevRoot === undefined) delete process.env.MKAGENT_APP_ROOT;
      else process.env.MKAGENT_APP_ROOT = prevRoot;
    }
  });

  it('rejects bare MKAGENT_NODE command in packaged mode', () => {
    const prev = process.env.MKAGENT_NODE;
    process.env.MKAGENT_NODE = 'node';

    try {
      expect(() => resolveScriptRuntime('node', { isPackaged: true })).toThrow(
        'do not allow PATH-based runtime resolution'
      );
    } finally {
      if (prev === undefined) delete process.env.MKAGENT_NODE;
      else process.env.MKAGENT_NODE = prev;
    }
  });

  it('prefers MKAGENT_BUN for bun in dev', () => {
    const prev = process.env.MKAGENT_BUN;
    process.env.MKAGENT_BUN = '/tmp/custom-bun';

    try {
      const resolved = resolveScriptRuntime('bun', { isPackaged: false });
      expect(resolved.command).toBe('/tmp/custom-bun');
      expect(resolved.argsPrefix).toEqual([]);
      expect(resolved.source).toBe('env');
    } finally {
      if (prev === undefined) delete process.env.MKAGENT_BUN;
      else process.env.MKAGENT_BUN = prev;
    }
  });
});
