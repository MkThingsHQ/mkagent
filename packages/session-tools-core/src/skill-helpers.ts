import { closeSync, existsSync, openSync, readSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

export function getSkillPath(workspacePath: string, slug: string): string {
  return join(workspacePath, 'skills', slug);
}

export function getSkillMdPath(workspacePath: string, slug: string): string {
  return join(getSkillPath(workspacePath, slug), 'SKILL.md');
}

export function skillExists(workspacePath: string, slug: string): boolean {
  const path = getSkillPath(workspacePath, slug);
  return existsSync(path) && statSync(path).isDirectory();
}

export function skillMdExists(workspacePath: string, slug: string): boolean {
  return existsSync(getSkillMdPath(workspacePath, slug));
}

export function listSkillSlugs(workspacePath: string): string[] {
  const skillsPath = join(workspacePath, 'skills');
  if (!existsSync(skillsPath)) return [];
  return readdirSync(skillsPath).filter(entry => {
    const path = join(skillsPath, entry);
    return statSync(path).isDirectory() && existsSync(join(path, 'SKILL.md'));
  });
}

export function resolveSessionWorkingDirectory(
  workspacePath: string,
  sessionId: string
): string | undefined {
  try {
    const sessionPath = join(workspacePath, 'sessions', sessionId, 'session.jsonl');
    if (!existsSync(sessionPath)) return undefined;
    const fd = openSync(sessionPath, 'r');
    try {
      const buffer = Buffer.alloc(8192);
      const bytesRead = readSync(fd, buffer, 0, buffer.length, 0);
      const firstLine = buffer.toString('utf-8', 0, bytesRead).split('\n')[0] ?? '';
      if (!firstLine) return undefined;
      const header = JSON.parse(firstLine) as { workingDirectory?: unknown };
      return typeof header.workingDirectory === 'string' ? header.workingDirectory : undefined;
    } finally {
      closeSync(fd);
    }
  } catch {
    return undefined;
  }
}
