import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import type { BackendHostRuntimeContext } from '../types.ts';

export interface ResolvedBackendRuntimePaths {
  interceptorBundlePath?: string;
  piServerPath?: string;
  nodeRuntimePath?: string;
  bundledRuntimePath?: string;
}

export interface ResolvedBackendHostTooling {
  ripgrepPath?: string;
}

function firstExistingPath(candidates: string[]): string | undefined {
  return candidates.find(candidate => existsSync(candidate));
}

function resolveUpwards(base: string, relativePath: string, maxLevels = 4): string | undefined {
  let directory = resolve(base);
  for (let level = 0; level <= maxLevels; level++) {
    const candidate = join(directory, relativePath);
    if (existsSync(candidate)) return candidate;
    const parent = dirname(directory);
    if (parent === directory) break;
    directory = parent;
  }
  return undefined;
}

function resolveBundledRuntimePath(hostRuntime: BackendHostRuntimeContext): string | undefined {
  const binary = process.platform === 'win32' ? 'bun.exe' : 'bun';
  const base = process.platform === 'win32'
    ? hostRuntime.resourcesPath || hostRuntime.appRootPath
    : hostRuntime.appRootPath;
  const bundled = join(base, 'vendor', 'bun', binary);
  if (existsSync(bundled)) return bundled;
  if (hostRuntime.isPackaged) return undefined;
  try {
    const command = process.platform === 'win32' ? 'where' : 'which';
    const system = execFileSync(command, ['bun'], { encoding: 'utf-8' }).trim();
    return system && existsSync(system) ? system : undefined;
  } catch {
    return undefined;
  }
}

function resolveInterceptorBundlePath(hostRuntime: BackendHostRuntimeContext): string | undefined {
  if (hostRuntime.interceptorBundlePath && existsSync(hostRuntime.interceptorBundlePath)) {
    return hostRuntime.interceptorBundlePath;
  }
  if (!hostRuntime.isPackaged) {
    const source = resolveUpwards(
      hostRuntime.appRootPath,
      join('packages', 'shared', 'src', 'unified-network-interceptor.ts'),
      10,
    );
    if (source) return source;
  }
  return resolveUpwards(hostRuntime.appRootPath, join('dist', 'interceptor.cjs'))
    ?? resolveUpwards(hostRuntime.appRootPath, join('apps', 'electron', 'dist', 'interceptor.cjs'));
}

function resolvePiServerPath(hostRuntime: BackendHostRuntimeContext): string | undefined {
  if (hostRuntime.isPackaged) {
    return firstExistingPath([
      join(hostRuntime.appRootPath, 'resources', 'pi-agent-server', 'index.js'),
      join(hostRuntime.appRootPath, 'dist', 'resources', 'pi-agent-server', 'index.js'),
    ]);
  }
  return resolveUpwards(
    hostRuntime.appRootPath,
    join('packages', 'pi-agent-server', 'dist', 'index.js'),
  );
}

function resolveRipgrepPath(hostRuntime: BackendHostRuntimeContext): string | undefined {
  const binary = process.platform === 'win32' ? 'rg.exe' : 'rg';
  const relative = join('node_modules', '@vscode', 'ripgrep', 'bin', binary);
  const vendored = resolveUpwards(hostRuntime.appRootPath, relative, 10)
    ?? (existsSync(join(process.cwd(), relative)) ? join(process.cwd(), relative) : undefined);
  if (vendored || hostRuntime.isPackaged) return vendored;
  try {
    const command = process.platform === 'win32' ? 'where' : 'which';
    const system = execFileSync(command, ['rg'], { encoding: 'utf-8' }).trim();
    return system && existsSync(system) ? system : undefined;
  } catch {
    return undefined;
  }
}

export function resolveBackendRuntimePaths(
  hostRuntime: BackendHostRuntimeContext,
): ResolvedBackendRuntimePaths {
  const bundledRuntimePath = hostRuntime.nodeRuntimePath ?? resolveBundledRuntimePath(hostRuntime);
  return {
    interceptorBundlePath: resolveInterceptorBundlePath(hostRuntime),
    piServerPath: resolvePiServerPath(hostRuntime),
    nodeRuntimePath: hostRuntime.nodeRuntimePath ?? bundledRuntimePath ?? process.execPath,
    bundledRuntimePath,
  };
}

export function resolveBackendHostTooling(
  hostRuntime: BackendHostRuntimeContext,
): ResolvedBackendHostTooling {
  return { ripgrepPath: resolveRipgrepPath(hostRuntime) };
}
