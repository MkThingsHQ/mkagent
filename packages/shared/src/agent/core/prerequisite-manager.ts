/**
 * PrerequisiteManager - Prerequisite Reading System
 *
 * Blocks tool calls until specified files have been read in the current context window.
 * State resets on compaction since the LLM loses the guide content.
 *
 * Key responsibilities:
 * - Track Read and shell reads (cat, head, sed -n ...)
 * - Check Browser and Skill prerequisites before tool execution
 * - Reset state on context compaction
 */

/// <reference path="../bash-parser.d.ts" />
import bashParser from 'bash-parser';
import { existsSync } from 'node:fs';
import { basename, isAbsolute, resolve, join } from 'node:path';
import { expandPath } from './path-processor.ts';
import { CONFIG_DIR, getBrowserToolEnabled } from '../../config/storage.ts';

// ============================================================
// Types
// ============================================================

export interface PrerequisiteRule {
  /** Match tool names that require prerequisites */
  toolMatcher: (toolName: string) => boolean;
  /** Resolve the required file path for a matched tool. Returns null to skip. */
  resolveRequiredPath: (toolName: string, workspaceRootPath: string) => string | null;
  /** Block message template. {filePath} is replaced with the required path. */
  blockMessage: string;
  /** If true, always block until file is read (no graceful fallback). */
  strict?: boolean;
}

export interface PrerequisiteCheckResult {
  allowed: boolean;
  blockReason?: string;
}

export interface PrerequisiteManagerConfig {
  workspaceRootPath: string;
  onDebug?: (message: string) => void;
  pathExists?: (path: string) => boolean;
  browserToolEnabled?: () => boolean;
  browserToolsDocPath?: string;
}

// ============================================================
// Constants
// ============================================================

/** Global browser tools docs path required before browser tool usage. */
const BROWSER_TOOLS_DOC_PATH = resolve(join(CONFIG_DIR, 'docs', 'browser-tools.md'));

// ============================================================
// Rules
// ============================================================

/**
 * Static prerequisite rules. Each rule defines:
 * - Which tools it applies to
 * - What file must be read first
 * - What message to show when blocking
 */
const RULES: PrerequisiteRule[] = [
  // Built-in browser tool: require browser-tools.md first.
  // Only matches the session-scoped tool (not external MCP browser tools like mcp__playwright__*),
  // and skipped entirely when the built-in browser tool is disabled.
  {
    // Name first: every other tool call skips the config read.
    toolMatcher: (toolName: string) =>
      (toolName === 'browser_tool' || toolName === 'mcp__session__browser_tool'),
    resolveRequiredPath: () => BROWSER_TOOLS_DOC_PATH,
    blockMessage:
      'You must read the browser tools guide before using browser automation. Read {filePath} first (Read tool or `cat` in Bash), then retry.',
    strict: true,
  },
];

// ============================================================
// Shell Reads
// ============================================================

/** Commands that print a file for the model, whole or in part (like Read with offset/limit). */
const FILE_READERS = new Set(['cat', 'bat', 'less', 'more', 'nl', 'head', 'tail', 'sed']);

/** Cheap pre-check so most Bash calls skip the shell parse. */
const MENTIONS_FILE_READER = new RegExp(`\\b(?:${[...FILE_READERS].join('|')})\\b`);

/** Prefixes expandPath turns into the home directory. */
const HOME_PREFIX = /^(?:~|\$HOME|\$\{HOME\})(?=\/|$)/;

/** The bash-parser AST nodes walked below (bash-validator.ts types the full set). */
interface ShellWord {
  type: 'Word';
  text: string;
  expansion?: Array<{ type: string; parameter?: string }>;
}

interface ShellRedirect {
  type: 'Redirect';
  op: { text: string };
  file: ShellWord;
  numberIo?: { text: string };
}

interface ShellNode {
  type: string;
  /** Script, CompoundList, Pipeline */
  commands?: ShellNode[];
  /** Subshell */
  list?: ShellNode;
  /** LogicalExpression */
  left?: ShellNode;
  right?: ShellNode;
  /** Command */
  name?: ShellWord;
  prefix?: Array<{ type: string }>;
  suffix?: Array<{ type: string }>;
  async?: boolean;
}

/**
 * Absolute paths of the files a Bash command prints for the model with a reader
 * (cat, head, sed -n …). Searching or counting a file (grep, wc), even through a
 * pipe, does not show it, and neither does sending the output to a file.
 */
function getBashReadPaths(command: string): string[] {
  // bash-parser parses heredoc bodies as commands, so their lines would look like reads.
  if (!MENTIONS_FILE_READER.test(command) || command.includes('<<')) return [];
  const paths: string[] = [];
  try {
    collectReads(bashParser(command) as ShellNode, paths);
  } catch {
    return []; // unparseable: count nothing
  }
  return paths;
}

function collectReads(node: ShellNode, paths: string[]): void {
  switch (node.type) {
    case 'Script':
    case 'CompoundList':
      for (const child of node.commands ?? []) collectReads(child, paths);
      break;
    case 'Subshell':
      if (node.list) collectReads(node.list, paths);
      break;
    case 'LogicalExpression':
      if (node.left) collectReads(node.left, paths);
      if (node.right) collectReads(node.right, paths);
      break;
    case 'Pipeline': {
      // The output reaches the model only if every later command is a reader too (`| head -50`).
      const commands = node.commands ?? [];
      commands.forEach((child, i) => {
        if (commands.slice(i + 1).every((next) => readerFiles(next) !== null)) collectReads(child, paths);
      });
      break;
    }
    case 'Command':
      paths.push(...(readerFiles(node) ?? []));
      break;
  }
}

/**
 * The files a reader command prints, or null when the node is not a reader whose
 * output reaches the model (any other command, a background job, output sent to a file).
 */
function readerFiles(node: ShellNode): string[] | null {
  if (node.type !== 'Command' || !node.name || node.async) return null;
  const redirects = [...(node.prefix ?? []), ...(node.suffix ?? [])].filter(
    (item): item is ShellRedirect => item.type === 'Redirect',
  );
  if (redirects.some(sendsStdoutToFile)) return null;

  const words = (node.suffix ?? []).filter((item): item is ShellWord => item.type === 'Word');
  let argv = [node.name, ...words].map(shellWordText);
  // `command cat` runs cat; `command -v cat` only looks it up (and is no reader below).
  if (argv[0] === 'command') argv = argv.slice(argv[1] === '-p' ? 2 : 1);
  const name = argv[0] ? basename(argv[0]) : null; // also /bin/cat, /usr/bin/sed
  if (!name || !FILE_READERS.has(name)) return null;

  const operands = name === 'sed' ? sedInputFiles(argv.slice(1)) : readerOperands(argv.slice(1));
  if (!operands) return null;
  for (const redirect of redirects) {
    if (redirect.op.text === '<') operands.push(shellWordText(redirect.file));
  }
  return operands.flatMap((operand) => {
    const path = operand === null ? null : toReadPath(operand);
    return path ? [path] : [];
  });
}

/** `>`, `>>`, `>|` and `>&` to a file keep stdout from the model; `2>` and `>&2` do not. */
function sendsStdoutToFile(redirect: ShellRedirect): boolean {
  if ((redirect.numberIo?.text ?? '1') !== '1') return false;
  if (redirect.op.text === '>&') return !/^\d+$/.test(redirect.file.text);
  return redirect.op.text === '>' || redirect.op.text === '>>' || redirect.op.text === '>|';
}

/**
 * A word as the shell expands it, or null when that depends on more than $HOME.
 * bash-parser strips quotes only from words without expansions.
 */
function shellWordText(word: ShellWord): string | null {
  if (!word.expansion) return word.text;
  if (word.expansion.some((part) => part.type !== 'ParameterExpansion' || part.parameter !== 'HOME')) return null;
  return word.text.replace(/["']/g, '');
}

/** File operands: everything that is not a flag, and everything after `--` (`-` is stdin). */
function readerOperands(args: Array<string | null>): Array<string | null> {
  const end = args.indexOf('--');
  const options = end === -1 ? args : args.slice(0, end);
  const rest = end === -1 ? [] : args.slice(end + 1);
  return [...options.filter((arg) => !arg?.startsWith('-')), ...rest];
}

/**
 * sed's input files: its operands minus the script, which is the first one unless
 * -e/-f gave it. null for -i/-I, which edit files in place and print nothing.
 */
function sedInputFiles(args: Array<string | null>): Array<string | null> | null {
  const operands: Array<string | null> = [];
  let scriptFromOption = false;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i] ?? null;
    if (arg === '--') {
      operands.push(...args.slice(i + 1));
      break;
    }
    if (arg?.startsWith('--')) {
      const option = arg.split('=', 1)[0];
      if (option === '--in-place') return null;
      if (option === '--expression' || option === '--file') {
        scriptFromOption = true;
        if (!arg.includes('=')) i++;
      }
    } else if (arg?.startsWith('-') && arg.length > 1) {
      for (let j = 1; j < arg.length; j++) {
        if (arg[j] === 'i' || arg[j] === 'I') return null;
        if (arg[j] === 'e' || arg[j] === 'f') {
          scriptFromOption = true;
          if (j === arg.length - 1) i++; // the script is the next argument
          break;
        }
      }
    } else {
      operands.push(arg);
    }
  }
  return scriptFromOption ? operands : operands.slice(1);
}

/** Absolute form of a path operand; null for relative ones, since the shell's cwd is not known here. */
function toReadPath(operand: string): string | null {
  return isAbsolute(operand) || HOME_PREFIX.test(operand) ? expandPath(operand) : null;
}

// ============================================================
// PrerequisiteManager
// ============================================================

export class PrerequisiteManager {
  /** Max times to block a tool for the same prerequisite before allowing through */
  private static readonly MAX_REJECTIONS = 1;

  private readFiles: Set<string> = new Set();
  private rejectionCounts: Map<string, number> = new Map();
  private pendingSkillPaths: Set<string> = new Set();
  private workspaceRootPath: string;
  private onDebug?: (message: string) => void;
  private pathExists: (path: string) => boolean;
  private browserToolEnabled: () => boolean;
  private browserToolsDocPath: string;

  constructor(config: PrerequisiteManagerConfig) {
    this.workspaceRootPath = config.workspaceRootPath;
    this.onDebug = config.onDebug;
    this.pathExists = config.pathExists ?? existsSync;
    this.browserToolEnabled = config.browserToolEnabled ?? getBrowserToolEnabled;
    this.browserToolsDocPath = config.browserToolsDocPath ?? BROWSER_TOOLS_DOC_PATH;
  }

  /**
   * Register skill SKILL.md paths as prerequisites.
   * All tool calls (except Read, and Bash reading one of these files) are blocked
   * until the files have been read.
   */
  registerSkillPrerequisites(paths: string[]): void {
    for (const path of paths) {
      const expanded = expandPath(path);
      this.pendingSkillPaths.add(expanded);
      this.onDebug?.(`Prerequisite: registered skill prerequisite ${expanded}`);
    }
  }

  /**
   * Check if a tool call's prerequisites are met.
   * Iterates rules, checks if required files have been read.
   * After MAX_REJECTIONS blocks for the same path, allows through gracefully.
   */
  checkPrerequisites(toolName: string): PrerequisiteCheckResult {
    // Check dynamic skill prerequisites first
    const skillResult = this.checkSkillPrerequisites(toolName);
    if (!skillResult.allowed) return skillResult;

    for (const rule of RULES) {
      if (!rule.toolMatcher(toolName)) continue;
      if (!this.browserToolEnabled()) continue;

      const resolvedPath = rule.resolveRequiredPath(toolName, this.workspaceRootPath);
      const requiredPath = resolvedPath === BROWSER_TOOLS_DOC_PATH ? this.browserToolsDocPath : resolvedPath;
      if (!requiredPath || !this.pathExists(requiredPath)) continue;

      if (!this.readFiles.has(requiredPath)) {
        const count = (this.rejectionCounts.get(requiredPath) ?? 0) + 1;
        this.rejectionCounts.set(requiredPath, count);

        const blockReason = rule.blockMessage.replace('{filePath}', requiredPath);

        if (rule.strict) {
          this.onDebug?.(`Prerequisite blocked (strict): ${toolName} requires ${requiredPath}`);
          return { allowed: false, blockReason };
        }

        if (count <= PrerequisiteManager.MAX_REJECTIONS) {
          this.onDebug?.(`Prerequisite blocked (${count}/${PrerequisiteManager.MAX_REJECTIONS}): ${toolName} requires ${requiredPath}`);
          return { allowed: false, blockReason };
        }
        // Exceeded max rejections — allow through gracefully
        this.onDebug?.(`Prerequisite: allowing ${toolName} after ${count} rejections (max reached)`);
      }
    }

    return { allowed: true };
  }

  /**
   * Check dynamic skill prerequisites.
   * If pending skill paths exist and the tool is NOT a Read targeting one of them, block.
   */
  private checkSkillPrerequisites(toolName: string): PrerequisiteCheckResult {
    if (this.pendingSkillPaths.size === 0) return { allowed: true };

    // Allow Read tool through — trackReadTool will clear the prerequisite
    if (toolName === 'Read') return { allowed: true };

    const pendingList = [...this.pendingSkillPaths].join(', ');
    const key = `skill:${pendingList}`;
    const count = (this.rejectionCounts.get(key) ?? 0) + 1;
    this.rejectionCounts.set(key, count);

    if (count <= PrerequisiteManager.MAX_REJECTIONS) {
      const blockReason = `You must read the skill instruction files before proceeding. Use Read or \`cat\` via Bash to read: ${pendingList}`;
      this.onDebug?.(`Skill prerequisite blocked (${count}/${PrerequisiteManager.MAX_REJECTIONS}): ${toolName} — pending: ${pendingList}`);
      return { allowed: false, blockReason };
    }

    // Exceeded max rejections — allow through and clear
    this.onDebug?.(`Skill prerequisite: allowing ${toolName} after ${count} rejections (max reached)`);
    this.pendingSkillPaths.clear();
    return { allowed: true };
  }

  /**
   * Track a Read tool call. Extracts file_path from tool input,
   * normalizes it, and adds to the read set.
   * Also clears matching pending skill paths.
   */
  trackReadTool(toolInput: Record<string, unknown>): void {
    const filePath = (toolInput.file_path as string) || (toolInput.path as string);
    if (!filePath) return;
    this.markRead(expandPath(filePath), 'Read');
  }

  /**
   * Prerequisite check for a Bash call, run from the pre-tool-use pipeline.
   * Files the command prints with a reader (cat, head, sed -n …) count as read,
   * like the Read tool. Reading a pending skill file is how the agent clears it,
   * so such a call gets past the skill gate.
   */
  checkBashPrerequisites(command: string): PrerequisiteCheckResult {
    const paths = getBashReadPaths(command);
    if (!paths.some((path) => this.pendingSkillPaths.has(path))) {
      const result = this.checkPrerequisites('Bash');
      if (!result.allowed) return result; // held at the skill gate, so nothing was read
    }
    for (const path of paths) this.markRead(path, 'Bash');
    return { allowed: true };
  }

  /** Add a file to the read set and clear its skill prerequisite. */
  private markRead(path: string, via: 'Read' | 'Bash'): void {
    this.readFiles.add(path);
    if (this.pendingSkillPaths.delete(path)) {
      this.onDebug?.(`Prerequisite: cleared skill prerequisite via ${via}: ${path}`);
    }
    this.onDebug?.(`Prerequisite: tracked read of ${path} (${via})`);
  }

  /**
   * Reset read state. Called on context compaction since the LLM
   * loses the guide content and needs to re-read.
   * Also clears pending skill paths (model lost the directive).
   */
  resetReadState(): void {
    const count = this.readFiles.size;
    const skillCount = this.pendingSkillPaths.size;
    this.readFiles.clear();
    this.rejectionCounts.clear();
    this.pendingSkillPaths.clear();
    this.onDebug?.(`Prerequisite: reset read state (cleared ${count} reads, ${skillCount} skill prerequisites)`);
  }

  /**
   * Check if a specific file has been read (for testing).
   */
  hasRead(filePath: string): boolean {
    return this.readFiles.has(expandPath(filePath));
  }
}
