/**
 * RTK binary detector.
 *
 * Resolves the path to the rtk binary (https://github.com/rtk-ai/rtk) by
 * looking it up on the user's PATH, then verifies it meets the minimum
 * version required by `rtk rewrite` (added in 0.23.0) and the minimum safe
 * version ({@link RTK_MIN_SAFE_VERSION}). Older rtk releases corrupt the output
 * the agent sees: before 0.43 `rtk grep` mangles match lines that contain a
 * colon, `rtk wc` ignores `<` input redirects (prints 0), and `rtk read | head`
 * panics on the closed pipe. An outdated binary is reported (`outdated`) so the
 * UI can ask for an update, and is never used for rewrites.
 *
 * Result is cached per process — restart the app to pick up an install
 * or upgrade.
 *
 * Bundling rtk in `apps/electron/resources/bin/` is a separate concern
 * (see plans/rtk-integration-path-a.md); this MVP detects only.
 */

import { execFileSync } from 'node:child_process';

const REQUIRED_MIN_VERSION = { major: 0, minor: 23, patch: 0 } as const;
const SAFE_MIN_VERSION = { major: 0, minor: 44, patch: 0 } as const;

/** Oldest rtk whose rewrites keep grep/wc/read output faithful (verified against 0.43/0.44/0.50). */
export const RTK_MIN_SAFE_VERSION = `${SAFE_MIN_VERSION.major}.${SAFE_MIN_VERSION.minor}.${SAFE_MIN_VERSION.patch}`;

/** Upstream installer: checksum-verified, installs to `~/.local/bin` (rtk's default location). */
export const RTK_UPDATE_COMMAND = 'curl -fsSL https://raw.githubusercontent.com/rtk-ai/rtk/refs/heads/master/install.sh | sh';

interface CachedStatus {
  path: string | null;
  version: string | null;
  /** Found on PATH but older than {@link RTK_MIN_SAFE_VERSION}: not used. */
  outdated: boolean;
  /** Absolute path of the binary found on PATH, usable or not (the update prompt names it). */
  foundPath: string | null;
}

let cachedStatus: CachedStatus | undefined = undefined;

/**
 * Status of the rtk binary for UI display.
 */
export interface RtkStatus {
  installed: boolean;
  path: string | null;
  version: string | null;
  /** Installed but older than `minSafeVersion`; rewrites are off until it is updated. */
  outdated: boolean;
  minSafeVersion: string;
  /** Where the outdated binary lives (so the update targets the one on PATH). */
  foundPath: string | null;
  updateCommand: string;
}

/**
 * Get the absolute path to the rtk binary, or null if not installed
 * or installed version is below the minimum safe version.
 */
export function getRtkPath(): string | null {
  return resolveStatus().path;
}

/**
 * Get installation status for the rtk binary. Used by Settings UI to decide
 * between an "install" prompt and the enable/disable toggle.
 */
export function getRtkStatus(opts?: { forceRecheck?: boolean }): RtkStatus {
  if (opts?.forceRecheck) resetRtkPathCache();
  const { path, version, outdated, foundPath } = resolveStatus();
  return {
    installed: path !== null || outdated,
    path,
    version,
    outdated,
    minSafeVersion: RTK_MIN_SAFE_VERSION,
    foundPath,
    updateCommand: RTK_UPDATE_COMMAND,
  };
}

/**
 * Token-savings stats from `rtk gain --format json`. Returns null if rtk
 * is not installed, the spawn fails, or the JSON can't be parsed. The Settings
 * UI uses this to render an efficiency meter beneath the RTK toggle.
 */
export interface RtkGainStats {
  totalCommands: number;
  totalInput: number;
  totalOutput: number;
  totalSaved: number;
  avgSavingsPct: number;
  totalTimeMs: number;
  avgTimeMs: number;
}

export function getRtkGain(): RtkGainStats | null {
  const rtkPath = getRtkPath();
  if (!rtkPath) return null;

  try {
    const out = execFileSync(rtkPath, ['gain', '--format', 'json'], {
      encoding: 'utf-8',
      timeout: 2000,
      env: { ...process.env, RTK_TELEMETRY_DISABLED: '1' },
    });
    const parsed = JSON.parse(out) as { summary?: Partial<Record<keyof RtkGainStats | 'total_commands' | 'total_input' | 'total_output' | 'total_saved' | 'avg_savings_pct' | 'total_time_ms' | 'avg_time_ms', number>> };
    const s = parsed.summary;
    if (!s) return null;
    return {
      totalCommands: Number(s.total_commands ?? 0),
      totalInput: Number(s.total_input ?? 0),
      totalOutput: Number(s.total_output ?? 0),
      totalSaved: Number(s.total_saved ?? 0),
      avgSavingsPct: Number(s.avg_savings_pct ?? 0),
      totalTimeMs: Number(s.total_time_ms ?? 0),
      avgTimeMs: Number(s.avg_time_ms ?? 0),
    };
  } catch {
    return null;
  }
}

/** Clears the cached detection result so the next call probes PATH fresh. */
export function resetRtkPathCache(): void {
  cachedStatus = undefined;
}

function resolveStatus(): CachedStatus {
  if (cachedStatus !== undefined) return cachedStatus;

  const rtkPath = findRtkOnPath();
  if (!rtkPath) {
    cachedStatus = { path: null, version: null, outdated: false, foundPath: null };
    return cachedStatus;
  }

  const version = readRtkVersion(rtkPath);
  if (!version || !meetsMinVersion(version, SAFE_MIN_VERSION)) {
    // Too old for `rtk rewrite` at all, or old enough to corrupt output: offer an update either way.
    const outdated = !!version && meetsMinVersion(version, REQUIRED_MIN_VERSION);
    cachedStatus = { path: null, version, outdated, foundPath: rtkPath };
    return cachedStatus;
  }

  cachedStatus = { path: rtkPath, version, outdated: false, foundPath: rtkPath };
  return cachedStatus;
}

function findRtkOnPath(): string | null {
  const whichCmd = process.platform === 'win32' ? 'where' : 'which';
  try {
    const result = execFileSync(whichCmd, ['rtk'], { encoding: 'utf-8', timeout: 2000 }).trim();
    // `where` returns multiple lines on Windows — take the first.
    return result.split('\n')[0]?.trim() || null;
  } catch {
    return null;
  }
}

function readRtkVersion(rtkPath: string): string | null {
  try {
    const out = execFileSync(rtkPath, ['--version'], { encoding: 'utf-8', timeout: 2000 }).trim();
    return out.match(/\d+\.\d+\.\d+/)?.[0] ?? null;
  } catch {
    return null;
  }
}

/** `version` (x.y.z) is at least `min`. Exported for tests. */
export function meetsMinVersion(version: string, min: { major: number; minor: number; patch: number }): boolean {
  const m = version.match(/(\d+)\.(\d+)\.(\d+)/);
  if (!m) return false;
  const major = Number(m[1]);
  const minor = Number(m[2]);
  const patch = Number(m[3]);
  if (major !== min.major) return major > min.major;
  if (minor !== min.minor) return minor > min.minor;
  return patch >= min.patch;
}
