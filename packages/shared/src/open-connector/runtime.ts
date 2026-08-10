import { randomBytes } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { CONFIG_DIR } from '../config/paths.ts';

export interface OpenConnectorSecrets {
  version: 1;
  adminToken: string;
  runtimeToken: string;
  encryptionKey: string;
  createdAt: number;
}

const SECRETS_FILE = 'secrets.json';
const DEFAULT_PORT = 38991;

function randomSecret(): string {
  return randomBytes(32).toString('base64url');
}

export function getOpenConnectorPort(): number {
  const raw = process.env.MKAGENT_OPEN_CONNECTOR_PORT;
  const parsed = raw ? Number(raw) : DEFAULT_PORT;
  return Number.isInteger(parsed) && parsed > 0 && parsed < 65536 ? parsed : DEFAULT_PORT;
}

export function getOpenConnectorBaseUrl(): string {
  return `http://127.0.0.1:${getOpenConnectorPort()}`;
}

export function getOpenConnectorMcpUrl(): string {
  return `${getOpenConnectorBaseUrl()}/mcp`;
}

export function getOpenConnectorDataDir(): string {
  return join(CONFIG_DIR, 'connectors', 'open-connector');
}

export function getOpenConnectorSecretsPath(): string {
  return join(getOpenConnectorDataDir(), SECRETS_FILE);
}

export function loadOpenConnectorSecrets(): OpenConnectorSecrets | null {
  const secretsPath = getOpenConnectorSecretsPath();
  if (!existsSync(secretsPath)) return null;

  try {
    const parsed = JSON.parse(readFileSync(secretsPath, 'utf8')) as Partial<OpenConnectorSecrets>;
    if (
      parsed.version === 1 &&
      typeof parsed.adminToken === 'string' &&
      typeof parsed.runtimeToken === 'string' &&
      typeof parsed.encryptionKey === 'string' &&
      typeof parsed.createdAt === 'number' &&
      parsed.adminToken.trim() &&
      parsed.runtimeToken.trim() &&
      parsed.encryptionKey.trim()
    ) {
      return parsed as OpenConnectorSecrets;
    }
  } catch {
    return null;
  }

  return null;
}

export function ensureOpenConnectorSecrets(): OpenConnectorSecrets {
  const secretsPath = getOpenConnectorSecretsPath();
  const existing = loadOpenConnectorSecrets();
  if (existing) {
    protectSecretsFile();
    return existing;
  }
  if (existsSync(secretsPath)) {
    throw new Error(`OpenConnector secrets file is invalid: ${secretsPath}`);
  }

  mkdirSync(getOpenConnectorDataDir(), { recursive: true, mode: 0o700 });
  const secrets: OpenConnectorSecrets = {
    version: 1,
    adminToken: randomSecret(),
    runtimeToken: randomSecret(),
    encryptionKey: randomSecret(),
    createdAt: Date.now(),
  };

  writeFileSync(secretsPath, `${JSON.stringify(secrets, null, 2)}\n`, { mode: 0o600 });
  protectSecretsFile();
  return secrets;
}

function protectSecretsFile(): void {
  try {
    chmodSync(getOpenConnectorDataDir(), 0o700);
    chmodSync(getOpenConnectorSecretsPath(), 0o600);
  } catch {
    // Best effort only: Windows and some filesystems do not support POSIX modes.
  }
}
