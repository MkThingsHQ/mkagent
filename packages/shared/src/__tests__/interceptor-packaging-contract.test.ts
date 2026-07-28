import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const repoRoot = join(import.meta.dir, '..', '..', '..', '..');

function readRepoFile(relativePath: string): string {
  return readFileSync(join(repoRoot, relativePath), 'utf-8');
}

describe('interceptor packaging contract', () => {
  it('builds the interceptor bundle and includes Electron dist output', () => {
    const builderYml = readRepoFile('apps/electron/electron-builder.yml');
    const buildScript = readRepoFile('scripts/electron-build-main.ts');

    expect(buildScript).toContain('packages/shared/src/unified-network-interceptor.ts');
    expect(buildScript).toContain('interceptor.cjs');
    expect(builderYml).toContain('dist/**/*');
  });
});
