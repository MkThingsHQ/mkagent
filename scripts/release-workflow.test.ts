import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const repoRoot = join(import.meta.dir, '..');

function workflowSteps(path: string): string[] {
  return readFileSync(join(repoRoot, path), 'utf8').split(/\n {6}- /);
}

describe('GitHub workflow download resilience', () => {
  for (const workflowPath of ['.github/workflows/ci.yml', '.github/workflows/release.yml']) {
    test(`${workflowPath} authenticates and retries dependency installs`, () => {
      const installSteps = workflowSteps(workflowPath).filter(step =>
        step.includes('bun install --frozen-lockfile'),
      );

      expect(installSteps.length).toBeGreaterThan(0);
      for (const step of installSteps) {
        expect(step).toContain('GITHUB_TOKEN: ${{ github.token }}');
        expect(step).toContain('scripts/run-with-retry.ts');
      }
    });
  }

  test('release packaging retries transient Electron downloads', () => {
    const packageStep = workflowSteps('.github/workflows/release.yml').find(step =>
      step.startsWith('name: Package desktop'),
    );

    expect(packageStep).toBeDefined();
    expect(packageStep).toContain('scripts/run-with-retry.ts');
    expect(packageStep).toContain('bunx electron-builder');
  });
});
