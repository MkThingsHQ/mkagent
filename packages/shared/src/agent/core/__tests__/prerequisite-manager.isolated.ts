/**
 * Tests for the retained Browser and Skill prerequisite reading system.
 */
import { beforeEach, describe, expect, it } from 'bun:test';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { PrerequisiteManager } from '../prerequisite-manager.ts';

let mockExistsPaths = new Set<string>();
const WORKSPACE_ROOT = '/test/workspace';
const BROWSER_DOC_PATH = resolve(join(homedir(), '.mkagent', 'docs', 'browser-tools.md'));

/** `path` with the home directory spelled `prefix` (`~`, `$HOME`, `${HOME}`), as an agent would type it. */
function homeSpelled(path: string, prefix: string): string {
  return path.startsWith(`${homedir()}/`) ? prefix + path.slice(homedir().length) : path;
}

describe('PrerequisiteManager', () => {
  let manager: PrerequisiteManager;
  let debugMessages: string[];

  beforeEach(() => {
    debugMessages = [];
    mockExistsPaths = new Set();
    manager = new PrerequisiteManager({
      workspaceRootPath: WORKSPACE_ROOT,
      onDebug: message => debugMessages.push(message),
      pathExists: path => mockExistsPaths.has(path),
      browserToolEnabled: () => true,
      browserToolsDocPath: BROWSER_DOC_PATH,
    });
  });

  describe('Browser instructions', () => {
    it('does not block unrelated built-in tools', () => {
      expect(manager.checkPrerequisites('Read').allowed).toBe(true);
      expect(manager.checkPrerequisites('Bash').allowed).toBe(true);
      expect(manager.checkPrerequisites('Write').allowed).toBe(true);
    });

    it('blocks the retained browser tool until its documentation is read', () => {
      mockExistsPaths.add(BROWSER_DOC_PATH);
      const result = manager.checkPrerequisites('browser_tool');
      expect(result.allowed).toBe(false);
      expect(result.blockReason).toContain(BROWSER_DOC_PATH);
    });

    it('blocks the session-prefixed browser tool until its documentation is read', () => {
      mockExistsPaths.add(BROWSER_DOC_PATH);
      expect(manager.checkPrerequisites('mcp__session__browser_tool').allowed).toBe(false);
    });

    it('allows the browser tool when the documentation is not installed', () => {
      expect(manager.checkPrerequisites('browser_tool').allowed).toBe(true);
    });

    it('allows the browser tool after its documentation is read', () => {
      mockExistsPaths.add(BROWSER_DOC_PATH);
      expect(manager.checkPrerequisites('browser_tool').allowed).toBe(false);
      manager.trackReadTool({ file_path: BROWSER_DOC_PATH });
      expect(manager.checkPrerequisites('browser_tool').allowed).toBe(true);
    });

    it('never bypasses the strict browser prerequisite after repeated attempts', () => {
      mockExistsPaths.add(BROWSER_DOC_PATH);
      expect(manager.checkPrerequisites('browser_tool').allowed).toBe(false);
      expect(manager.checkPrerequisites('browser_tool').allowed).toBe(false);
    });
  });

  describe('checkBashPrerequisites', () => {
    describe('guide reads', () => {
      it('counts cat of the browser guide via ~ for the strict browser rule', () => {
        const docsPath = BROWSER_DOC_PATH;
        mockExistsPaths.add(docsPath);
        expect(manager.checkPrerequisites('browser_tool').allowed).toBe(false);

        expect(manager.checkBashPrerequisites(`cat ${homeSpelled(docsPath, '~')}`).allowed).toBe(true);
        expect(manager.checkPrerequisites('browser_tool').allowed).toBe(true);
      });

      it('counts a quoted $HOME path piped into head', () => {
        const docsPath = BROWSER_DOC_PATH;
        mockExistsPaths.add(docsPath);

        manager.checkBashPrerequisites(`cat "${homeSpelled(docsPath, '$HOME')}" | head -50`);
        expect(manager.checkPrerequisites('browser_tool').allowed).toBe(true);
      });

      it('counts a ${HOME} path', () => {
        manager.checkBashPrerequisites(`cat "${homeSpelled(BROWSER_DOC_PATH, '${HOME}')}"`);
        expect(manager.hasRead(BROWSER_DOC_PATH)).toBe(true);
      });

      it('counts sed -n with a line range', () => {
        const docsPath = BROWSER_DOC_PATH;
        mockExistsPaths.add(docsPath);

        manager.checkBashPrerequisites(`sed -n '1,200p' ${docsPath}`);
        expect(manager.checkPrerequisites('browser_tool').allowed).toBe(true);
      });

    });

    describe('what counts', () => {
      const file = '/test/docs/guide.md';

      it.each([
        [`cat ${file}`],
        [`/bin/cat ${file}`],
        [`command cat ${file}`],
        [`cat -n -- ${file}`],
        [`cat < ${file}`],
        [`/usr/bin/sed -n 1,50p ${file}`],
        [`sed '1,200p' ${file}`],
        [`sed -n -e '1,20p' ${file}`],
        [`bat --paging=never ${file}`],
        [`less ${file}`],
        [`more ${file}`],
        [`nl -ba ${file}`],
        [`tail -n +1 ${file}`],
        [`cat ${file} | head -50 | tail -10`],
        [`cat ${file} 2>/dev/null || echo missing`],
        [`ls /test/docs && cat ${file}`],
        [`echo start; cat ${file}`],
        [`pwd\ncat ${file}`],
        [`(cat ${file})`],
      ])('%s', (command) => {
        expect(manager.checkBashPrerequisites(command).allowed).toBe(true);
        expect(manager.hasRead(file)).toBe(true);
      });

      it('reads a quoted path with spaces', () => {
        manager.checkBashPrerequisites(`cat "/test/my docs/guide.md"`);
        expect(manager.hasRead('/test/my docs/guide.md')).toBe(true);
      });
    });

    describe('what does not count', () => {
      const file = '/test/docs/guide.md';

      it.each([
        [`echo ${file}`],
        [`grep foo ${file}`],
        [`rg foo ${file}`],
        [`rm ${file}`],
        [`wc -l ${file}`],
        [`cat ${file} | grep foo`],
        [`cat ${file} | wc -l`],
        [`cat ${file} > /tmp/copy.md`],
        [`cat ${file} | head -5 >> /tmp/copy.md`],
        [`sed -i '' 's/a/b/' ${file}`],
        [`sed -i.bak 's/a/b/' ${file}`],
        [`cat ${file} &`],
        [`command -v cat ${file}`],
        [`cat > /tmp/notes.md <<'EOF'\ncat ${file}\nEOF`],
        [`cat "unterminated ${file}`],
        ['cat $GUIDE_DIR/guide.md'],
      ])('%s', (command) => {
        expect(manager.checkBashPrerequisites(command).allowed).toBe(true);
        expect(manager.hasRead(file)).toBe(false);
        expect(debugMessages.some((m) => m.includes('tracked read'))).toBe(false);
      });

      it('skips relative paths: the shell cwd is not known', () => {
        manager.checkBashPrerequisites('cat sources/linear/guide.md');
        expect(debugMessages.some((m) => m.includes('tracked read'))).toBe(false);
      });
    });

    describe('skill prerequisites', () => {
      const skillPath = '/test/workspace/skills/my-skill/SKILL.md';

      it('clears a skill read with cat, so other tools run again', () => {
        manager.registerSkillPrerequisites([skillPath]);

        expect(manager.checkBashPrerequisites(`cat ${skillPath}`).allowed).toBe(true);
        expect(manager.hasRead(skillPath)).toBe(true);
        expect(manager.checkPrerequisites('WebSearch').allowed).toBe(true);
      });

      it('clears a skill read through a ~ path', () => {
        const homeSkill = join(homedir(), '.agents', 'skills', 'my-skill', 'SKILL.md');
        manager.registerSkillPrerequisites([homeSkill]);

        manager.checkBashPrerequisites(`cat ${homeSpelled(homeSkill, '~')}`);
        expect(manager.checkPrerequisites('WebSearch').allowed).toBe(true);
      });

      it('clears every skill a command reads', () => {
        const alpha = '/test/workspace/skills/alpha/SKILL.md';
        const beta = '/test/workspace/skills/beta/SKILL.md';
        manager.registerSkillPrerequisites([alpha, beta]);

        manager.checkBashPrerequisites(`cat ${alpha} && cat ${beta}`);
        expect(manager.checkPrerequisites('WebSearch').allowed).toBe(true);
      });

      it('lets a read of one pending skill through while another is still pending', () => {
        const alpha = '/test/workspace/skills/alpha/SKILL.md';
        const beta = '/test/workspace/skills/beta/SKILL.md';
        manager.registerSkillPrerequisites([alpha, beta]);

        expect(manager.checkBashPrerequisites(`cat ${alpha}`).allowed).toBe(true);
        expect(manager.checkPrerequisites('WebSearch').allowed).toBe(false);
      });

      it('holds other Bash calls at the skill gate, and their reads do not count', () => {
        const docsPath = BROWSER_DOC_PATH;
        manager.registerSkillPrerequisites([skillPath]);

        const held = manager.checkBashPrerequisites(`cat ${docsPath}`);
        expect(held.allowed).toBe(false);
        expect(held.blockReason).toContain(skillPath);
        expect(manager.hasRead(docsPath)).toBe(false);

        // The gate gives way on the next call, which runs and counts
        expect(manager.checkBashPrerequisites(`cat ${docsPath}`).allowed).toBe(true);
        expect(manager.hasRead(docsPath)).toBe(true);
      });

      it('applies the skill gate to a Bash call without a command', () => {
        manager.registerSkillPrerequisites([skillPath]);
        expect(manager.checkBashPrerequisites('').allowed).toBe(false);
      });

      it('logs when a Bash read clears a skill prerequisite', () => {
        manager.registerSkillPrerequisites([skillPath]);

        manager.checkBashPrerequisites(`cat ${skillPath}`);
        expect(debugMessages.some((m) => m.includes('cleared skill prerequisite via Bash'))).toBe(true);
      });
    });
  });

  describe('Skill instructions', () => {
    const skillPath = '/test/workspace/skills/example/SKILL.md';

    it('blocks other tools until the registered Skill is read', () => {
      manager.registerSkillPrerequisites([skillPath]);
      expect(manager.checkPrerequisites('WebSearch').allowed).toBe(false);
      manager.trackReadTool({ path: skillPath });
      expect(manager.checkPrerequisites('WebSearch').allowed).toBe(true);
    });

    it('allows Read so the prerequisite can be satisfied', () => {
      manager.registerSkillPrerequisites([skillPath]);
      expect(manager.checkPrerequisites('Read').allowed).toBe(true);
    });

    it('clears Skill prerequisites read through Bash', () => {
      manager.registerSkillPrerequisites([skillPath]);
      expect(manager.checkBashPrerequisites(`cat ${skillPath}`).allowed).toBe(true);
      expect(manager.checkPrerequisites('WebSearch').allowed).toBe(true);
    });

    it('ignores unrelated Bash commands', () => {
      manager.registerSkillPrerequisites([skillPath]);
      expect(manager.checkBashPrerequisites('ls -la /tmp').allowed).toBe(false);
    });

    it('falls back after the bounded rejection count', () => {
      manager.registerSkillPrerequisites([skillPath]);
      expect(manager.checkPrerequisites('WebSearch').allowed).toBe(false);
      expect(manager.checkPrerequisites('WebSearch').allowed).toBe(true);
    });

    it('restores rejection behavior when state is reset', () => {
      manager.registerSkillPrerequisites([skillPath]);
      manager.checkPrerequisites('WebSearch');
      manager.checkPrerequisites('WebSearch');
      manager.resetReadState();
      manager.registerSkillPrerequisites([skillPath]);
      expect(manager.checkPrerequisites('WebSearch').allowed).toBe(false);
    });
  });

  describe('debug logging', () => {
    it('logs blocks, tracked reads, and resets', () => {
      mockExistsPaths.add(BROWSER_DOC_PATH);
      manager.checkPrerequisites('browser_tool');
      manager.trackReadTool({ file_path: BROWSER_DOC_PATH });
      manager.resetReadState();

      expect(debugMessages.some(message => message.includes('Prerequisite blocked'))).toBe(true);
      expect(debugMessages.some(message => message.includes('tracked read'))).toBe(true);
      expect(debugMessages.some(message => message.includes('reset read state'))).toBe(true);
    });
  });
});
