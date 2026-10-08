/**
 * Centralized path configuration for MkAgent.
 *
 * `CONFIG_DIR` is the one place that decides where the app keeps its state
 * (`~/.mkagent` by default). Every other module joins onto it; never join
 * `homedir()` with `.mkagent` directly (OSS #1062).
 *
 * Supports multi-instance development via the MKAGENT_CONFIG_DIR environment
 * variable. When running from a numbered folder (e.g., craft-tui-agent-1), the
 * detect-instance.sh script sets MKAGENT_CONFIG_DIR to ~/.mkagent-1, allowing
 * multiple instances to run simultaneously with separate configurations.
 *
 * Default (non-numbered folders): ~/.mkagent/
 * Instance 1 (-1 suffix): ~/.mkagent-1/
 * Instance 2 (-2 suffix): ~/.mkagent-2/
 *
 * Two modules re-derive this from the environment on purpose because they must
 * stay import-free: `interceptor-common.ts` (preloaded into the Pi subprocess)
 * and session-tools-core `handlers/config-validate.ts` (no dependency on shared).
 */

import { homedir } from 'os';
import { join } from 'path';

export const DEFAULT_CONFIG_DIR_NAME = '.mkagent';
export function resolveConfigDir(env: NodeJS.ProcessEnv = process.env, home: string = homedir()): string {
  const override = env.CONFIG_DIR?.trim();
  return override ? override : join(home, DEFAULT_CONFIG_DIR_NAME);
}
export function getConfigDir(): string { return resolveConfigDir(); }
export const CONFIG_DIR = getConfigDir();
