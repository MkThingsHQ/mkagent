import { describe, expect, it } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SettingsManager } from '@earendil-works/pi-coding-agent';
import {
  MKAGENT_PI_EPHEMERAL_MAX_BACKOFF_MS,
  MKAGENT_PI_EPHEMERAL_QUERY_DEADLINE_MS,
  MKAGENT_PI_EPHEMERAL_RETRY_SETTINGS,
  MKAGENT_PI_RETRY_SETTINGS,
  createMkAgentSettingsManager,
} from './session-settings.ts';

describe('createMkAgentSettingsManager', () => {
  it('pins the agent-level auto-retry policy', () => {
    const settings = createMkAgentSettingsManager();
    expect(settings.getRetryEnabled()).toBe(true);
    expect(settings.getRetrySettings()).toEqual({
      enabled: true,
      maxRetries: MKAGENT_PI_RETRY_SETTINGS.maxRetries,
      baseDelayMs: MKAGENT_PI_RETRY_SETTINGS.baseDelayMs,
    });
  });

  it('enables provider-level (pre-stream) retries that the SDK leaves off by default', () => {
    const settings = createMkAgentSettingsManager();
    expect(settings.getProviderRetrySettings()).toMatchObject({
      maxRetries: MKAGENT_PI_RETRY_SETTINGS.provider.maxRetries,
      maxRetryDelayMs: MKAGENT_PI_RETRY_SETTINGS.provider.maxRetryDelayMs,
    });
    // Documents the SDK default this policy overrides. If a future SDK turns
    // provider retries on by itself, this assertion is the cue to revisit.
    expect(SettingsManager.inMemory().getProviderRetrySettings().maxRetries).toBeUndefined();
  });

  it('uses a smaller retry policy for bounded ephemeral queries', () => {
    const settings = createMkAgentSettingsManager('ephemeral');
    expect(settings.getRetrySettings()).toEqual({
      enabled: true,
      maxRetries: MKAGENT_PI_EPHEMERAL_RETRY_SETTINGS.maxRetries,
      baseDelayMs: MKAGENT_PI_EPHEMERAL_RETRY_SETTINGS.baseDelayMs,
    });
    expect(settings.getProviderRetrySettings()).toMatchObject({
      maxRetries: MKAGENT_PI_EPHEMERAL_RETRY_SETTINGS.provider.maxRetries,
      maxRetryDelayMs: MKAGENT_PI_EPHEMERAL_RETRY_SETTINGS.provider.maxRetryDelayMs,
    });
    expect(MKAGENT_PI_EPHEMERAL_MAX_BACKOFF_MS).toBe(66_000);
    expect(MKAGENT_PI_EPHEMERAL_QUERY_DEADLINE_MS).toBe(115_000);
    expect(MKAGENT_PI_EPHEMERAL_MAX_BACKOFF_MS).toBeLessThan(
      MKAGENT_PI_EPHEMERAL_QUERY_DEADLINE_MS,
    );
  });

  it('keeps auto-compaction enabled', () => {
    expect(createMkAgentSettingsManager().getCompactionEnabled()).toBe(true);
  });

  it('ignores a .pi/settings.json in the working directory', () => {
    // A repo used as the session's working directory may ship Pi project
    // settings. The SDK's default SettingsManager.create(cwd, agentDir) merges
    // them (project scope is trusted by default) — a repo could silently turn
    // off retries or compaction for MkAgent sessions. The in-memory manager must
    // not see them.
    const cwd = mkdtempSync(join(tmpdir(), 'mkagent-pi-settings-'));
    try {
      mkdirSync(join(cwd, '.pi'));
      writeFileSync(
        join(cwd, '.pi', 'settings.json'),
        JSON.stringify({ retry: { enabled: false }, compaction: { enabled: false } }),
      );

      // Proves the default path would have honored the repo file…
      const fromDisk = SettingsManager.create(cwd, join(cwd, 'agent-dir'));
      expect(fromDisk.getRetryEnabled()).toBe(false);
      expect(fromDisk.getCompactionEnabled()).toBe(false);

      // …and that MkAgent's manager does not.
      const settings = createMkAgentSettingsManager();
      expect(settings.getRetryEnabled()).toBe(true);
      expect(settings.getCompactionEnabled()).toBe(true);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('returns a fresh manager per call so sessions cannot leak settings into each other', () => {
    const a = createMkAgentSettingsManager('ephemeral');
    const b = createMkAgentSettingsManager('ephemeral');
    expect(a).not.toBe(b);
    a.setRetryEnabled(false);
    expect(a.getRetryEnabled()).toBe(false);
    expect(b.getRetryEnabled()).toBe(true);
  });
});
