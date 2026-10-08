import { afterEach, describe, expect, it } from 'bun:test';
import { mkdtempSync, mkdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  collectGitDeveloperContext,
  formatStableGitDeveloperContext,
  formatVolatileGitDeveloperContext,
} from '../developer-context.ts';
import { getProjectContextFilesPrompt } from '../system.ts';

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe('git developer context', () => {
  it('returns null outside git repositories', () => {
    const dir = mkdtempSync(join(tmpdir(), 'craft-prompt-non-git-'));
    tempDirs.push(dir);

    expect(collectGitDeveloperContext(dir)).toBeNull();
    expect(formatStableGitDeveloperContext(dir)).toBeNull();
    expect(formatVolatileGitDeveloperContext(dir)).toBeNull();
  });

  it('emits stable repo metadata with sibling worktree guidance', () => {
    const { root, packageDir } = createGitFixture();

    const block = formatStableGitDeveloperContext(packageDir);

    expect(block).not.toBeNull();
    expect(block!).toContain('<developer_context kind="git_repository" scope="stable">');
    expect(block!).toContain(`repoRoot: ${root}`);
    expect(block!).toContain('repoParent:');
    expect(block!).toContain('selectedPathWithinRepo: packages/shared');
    expect(block!).toContain('create it as a sibling of repoRoot inside repoParent');
  });

  it('emits bounded volatile git status', () => {
    const { packageDir } = createGitFixture();
    writeFileSync(join(packageDir, 'changed.txt'), 'dirty');

    const block = formatVolatileGitDeveloperContext(packageDir);

    expect(block).not.toBeNull();
    expect(block!).toContain('<developer_context kind="git_repository" scope="volatile">');
    expect(block!).toContain('worktreeState: dirty');
    expect(block!).toContain('changedFilesSample:');
    expect(block!).toContain('packages/shared/changed.txt');
  });

  it('lists root and selected-path context files relative to git context_root', () => {
    const { root, packageDir } = createGitFixture();

    const block = getProjectContextFilesPrompt(packageDir);

    expect(block).toContain(`context_root="${root}"`);
    expect(block).toContain('- CLAUDE.md (root)');
    expect(block).toContain('- packages/shared/CLAUDE.md');
  });
});

function createGitFixture(): { root: string; packageDir: string } {
  const root = mkdtempSync(join(tmpdir(), 'craft-prompt-git-'));
  tempDirs.push(root);
  const packageDir = join(root, 'packages', 'shared');
  mkdirSync(packageDir, { recursive: true });
  writeFileSync(join(root, 'CLAUDE.md'), '# Root instructions\n');
  writeFileSync(join(packageDir, 'CLAUDE.md'), '# Package instructions\n');

  const init = spawnSync('git', ['init'], { cwd: root, encoding: 'utf8' });
  if (init.status !== 0) {
    throw new Error(`git init failed: ${init.stderr}`);
  }

  return { root: realpathSync.native(root), packageDir: realpathSync.native(packageDir) };
}
