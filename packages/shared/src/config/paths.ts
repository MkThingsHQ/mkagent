/**
 * Centralized path configuration for MkAgent.
 *
 * Supports multi-instance development via CONFIG_DIR environment variable.
 * When running from a numbered development folder, the instance detector
 * script sets CONFIG_DIR to ~/.mkagent-1, allowing multiple instances to run
 * simultaneously with separate configurations.
 *
 * Default (non-numbered folders): ~/.mkagent/
 * Instance 1 (-1 suffix): ~/.mkagent-1/
 * Instance 2 (-2 suffix): ~/.mkagent-2/
 */

import { homedir } from 'os';
import { join } from 'path';

export function getConfigDir(): string {
  return process.env.CONFIG_DIR || join(homedir(), '.mkagent');
}

// Allow override via environment variable for multi-instance dev
// Falls back to default ~/.mkagent/ for production and non-numbered dev folders
export const CONFIG_DIR = getConfigDir();
