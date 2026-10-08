import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rewriteBashWithRtk } from '../rtk-rewrite.ts';
import { meetsMinVersion, RTK_MIN_SAFE_VERSION } from '../rtk-detector.ts';

// A /bin/sh fake can take longer than the production 200 ms budget under test load.
const SLOW_SPAWN_MS = 5_000;

let dir: string;
let fakeRtk: string;

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'rtk-rewrite-'));
  fakeRtk = join(dir, 'rtk');
  // Mimics `rtk rewrite "<cmd>"`: prefixes the command with rtk and signals "rewrite" (exit 0).
  writeFileSync(fakeRtk, '#!/bin/sh\n[ "$1" = rewrite ] || exit 1\necho "rtk $2"\nexit 0\n');
  chmodSync(fakeRtk, 0o755);
});

afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe('rewriteBashWithRtk', () => {
  it('rewrites a plain command through rtk', () => {
    expect(rewriteBashWithRtk('Bash', { command: 'grep -n foo a.ts' }, fakeRtk, [], undefined, SLOW_SPAWN_MS)).toEqual({
      modified: true,
      input: { command: 'rtk grep -n foo a.ts' },
    });
  });

  it('leaves `command` and `builtin` prefixed commands alone (the POSIX bypass)', () => {
    for (const command of ['command grep -n foo a.ts', '  command cat a.ts', 'builtin echo hi']) {
      expect(rewriteBashWithRtk('Bash', { command }, fakeRtk, [])).toEqual({ modified: false, input: { command } });
    }
  });

  it('leaves excluded base commands alone', () => {
    expect(rewriteBashWithRtk('Bash', { command: 'grep -n foo a.ts' }, fakeRtk, ['grep']).modified).toBe(false);
    expect(rewriteBashWithRtk('Bash', { command: 'ls -la' }, fakeRtk, ['grep'], undefined, SLOW_SPAWN_MS).modified).toBe(true);
  });

  it('does nothing without a usable rtk or for other tools', () => {
    expect(rewriteBashWithRtk('Bash', { command: 'ls' }, null, []).modified).toBe(false);
    expect(rewriteBashWithRtk('Read', { command: 'ls' }, fakeRtk, []).modified).toBe(false);
  });
});

describe('rtk version gate', () => {
  it('treats releases before the safe minimum as outdated', () => {
    expect(RTK_MIN_SAFE_VERSION).toBe('0.44.0');
    const safe = { major: 0, minor: 44, patch: 0 };
    expect(meetsMinVersion('0.40.0', safe)).toBe(false);
    expect(meetsMinVersion('0.43.9', safe)).toBe(false);
    expect(meetsMinVersion('0.44.0', safe)).toBe(true);
    expect(meetsMinVersion('0.50.0', safe)).toBe(true);
    expect(meetsMinVersion('1.0.0', safe)).toBe(true);
    expect(meetsMinVersion('rtk 0.50.0', safe)).toBe(true);
    expect(meetsMinVersion('garbage', safe)).toBe(false);
  });
});
