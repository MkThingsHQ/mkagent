/**
 * Bash Command Validator
 *
 * Uses bash-parser to create a proper AST and validate commands in Explore mode.
 * This enables compound commands like `git status && git log` to be allowed
 * when all parts are safe, while still blocking dangerous constructs.
 *
 * AST Node Types:
 * - Command: Simple command with name and args
 * - LogicalExpression: && (and) or || (or) chains
 * - Pipeline: Piped commands (|)
 * - Subshell: Commands in parentheses (...)
 * - Redirect: File redirections (>, >>, <)
 * - CommandExpansion: $(...) substitution
 */

/// <reference path="./bash-parser.d.ts" />
import bashParser from 'bash-parser';
import { debug } from '../utils/debug.ts';
import type { CompiledBashPattern } from './mode-types.ts';

// ============================================================
// Types
// ============================================================

/**
 * Result of validating a bash command AST.
 * Tracks which subcommands passed/failed for detailed error messages.
 */
export interface BashValidationResult {
  allowed: boolean;
  /** Primary reason for rejection (if not allowed) */
  reason?: BashValidationReason;
  /** Individual results for compound commands */
  subcommandResults?: SubcommandResult[];
}

export interface SubcommandResult {
  /** The command text that was validated */
  command: string;
  allowed: boolean;
  reason?: string;
}

/**
 * Detailed reason why validation failed.
 * Used to generate helpful error messages.
 */
export type BashValidationReason =
  | { type: 'pipeline'; explanation: string }
  | { type: 'redirect'; op: string; explanation: string }
  | { type: 'command_expansion'; explanation: string }
  | { type: 'process_substitution'; explanation: string }
  | { type: 'parameter_expansion'; explanation: string }
  | { type: 'env_assignment'; explanation: string }
  | { type: 'unsafe_command'; command: string; explanation: string }
  | { type: 'parse_error'; error: string }
  | { type: 'compound_partial_fail'; failedCommands: string[]; passedCommands: string[] }
  | { type: 'background_execution'; explanation: string };

// ============================================================
// AST Node Types (from bash-parser)
// ============================================================

interface ASTNode {
  type: string;
}

interface WordNode extends ASTNode {
  type: 'Word';
  text: string;
  expansion?: ExpansionNode[];
}

interface CommandNode extends ASTNode {
  type: 'Command';
  name?: WordNode;
  prefix?: ASTNode[];
  suffix?: ASTNode[];
  /** True if command runs in background with & operator */
  async?: boolean;
}

interface LogicalExpressionNode extends ASTNode {
  type: 'LogicalExpression';
  op: 'and' | 'or';
  left: ASTNode;
  right: ASTNode;
}

interface PipelineNode extends ASTNode {
  type: 'Pipeline';
  commands: ASTNode[];
}

interface SubshellNode extends ASTNode {
  type: 'Subshell';
  list: CompoundListNode;
}

interface CompoundListNode extends ASTNode {
  type: 'CompoundList';
  commands: ASTNode[];
}

interface RedirectNode extends ASTNode {
  type: 'Redirect';
  op: { text: string; type: string };
  file: WordNode;
}

interface ExpansionNode {
  type: string;
  command?: string;
  commandAST?: ScriptNode;
}

interface ScriptNode extends ASTNode {
  type: 'Script';
  commands: ASTNode[];
}

// ============================================================
// Dangerous Argument Patterns
// ============================================================

/**
 * Program-level argument inspectors. Some read-only tools gain write or execute
 * powers through their own arguments (`find -exec`, awk `system()`, `sed -i`,
 * `sort -o`, `gh api -X DELETE`). The shell AST cannot see these, so each
 * inspector reads the parsed argv and returns a reason when the invocation is
 * not read-only.
 *
 * Checked BEFORE the regex allowlist pattern match in validateCommand(). They
 * live in code rather than in default.json because an installed default.json
 * only ever gains patterns on upgrade (ensureDefaultPermissions), so a narrowed
 * pattern would never reach existing installs.
 */
type ArgumentInspector = (commandParts: string[]) => string | null;

const FIND_DANGEROUS_ARGS = new Set(['-exec', '-execdir', '-ok', '-okdir', '-delete']);

function getDangerousFindReason(commandParts: string[]): string | null {
  const arg = commandParts.slice(1).find(part => FIND_DANGEROUS_ARGS.has(part));
  return arg ? `"${arg}" allows arbitrary command execution or file modification within "find"` : null;
}

function getDangerousAwkReason(commandParts: string[]): string | null {
  // commandParts[0] is awk/gawk/mawk/nawk - inspect script/args only
  const scriptText = commandParts.slice(1).join(' ');

  if (/\bsystem\s*\(/i.test(scriptText)) {
    return 'awk system() executes arbitrary shell commands';
  }

  // command | getline executes an external command and reads from it
  if (/\|\s*getline\b/i.test(scriptText)) {
    return 'awk command pipes to getline execute external commands';
  }

  // print ... | "cmd" (or with quoted command forms) executes external commands
  if (/\bprint\b[^\n]*\|\s*["'`]/i.test(scriptText)) {
    return 'awk print-to-command pipes execute external commands';
  }

  return null;
}

/**
 * `s<d>pattern<d>replacement<d>flags` with any delimiter; the flags are captured.
 * Bodies may contain newlines: bash-parser turns `\n` inside quotes into a real one.
 */
const SED_SUBSTITUTION = /s([^\\\n])((?:\\.|(?!\1)[^\\])*)\1((?:\\.|(?!\1)[^\\])*)\1([a-zA-Z0-9]*)/g;
/** `y<d>source<d>dest<d>` transliteration: rewrites the pattern space only. */
const SED_TRANSLITERATE = /y([^\\\n])((?:\\.|(?!\1)[^\\])*)\1((?:\\.|(?!\1)[^\\])*)\1/g;
/** `/regex/` line addresses (optionally with the I/M modifiers). */
const SED_REGEX_ADDRESS = /\/(?:\\.|[^/\\])*\/[IM]*/g;
/**
 * `:label` definitions and `b`/`t`/`T` branches to a label, possibly after an
 * address or `!` (`$!ba`). Harmless, and common in multi-line idioms.
 */
const SED_LABELS_AND_BRANCHES = /(^|[;{}\s!\d$,])(?::\w+|[btT]\w*)/g;
/** What may remain once addresses, substitutions and labels are gone: line numbers and print-style commands. */
const SED_READ_ONLY_REMAINDER = /^[\s\d,$~+!;{}pPl=nNdDgGhHxqQzFv]*$/;

function getUnsafeSedScriptReason(script: string): string | null {
  let unsafeFlags: string | null = null;
  const withoutSubstitutions = script.replace(SED_SUBSTITUTION, (_match, _delimiter, _pattern, _replacement, flags: string) => {
    if (/[we]/.test(flags)) unsafeFlags = flags;
    return ' ';
  });
  if (unsafeFlags !== null) {
    return (unsafeFlags as string).includes('e')
      ? 'sed s///e executes the pattern space as a shell command'
      : 'sed s///w writes to a file';
  }
  const remainder = withoutSubstitutions
    .replace(SED_TRANSLITERATE, ' ')
    .replace(SED_REGEX_ADDRESS, ' ')
    .replace(SED_LABELS_AND_BRANCHES, '$1 ');
  if (!SED_READ_ONLY_REMAINDER.test(remainder)) {
    return 'sed script contains commands that may write files or run programs (only print-style commands are allowed)';
  }
  return null;
}

/**
 * sed is read-only only when it prints: -i/--in-place edits files, `w`/`W` and
 * s///w write files, `e` and s///e (GNU) run programs, and -f/--file load a
 * script that cannot be inspected.
 */
function getDangerousSedReason(commandParts: string[]): string | null {
  const args = commandParts.slice(1);
  const scripts: string[] = [];
  let scriptFromOption = false;
  let operands = 0;
  const addOperand = (operand: string) => {
    // The first operand is the script unless -e/--expression supplied one; the rest are input files.
    if (!scriptFromOption && operands === 0) scripts.push(operand);
    operands++;
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (arg === '--') {
      args.slice(i + 1).forEach(addOperand);
      break;
    }
    if (arg.startsWith('--')) {
      const eq = arg.indexOf('=');
      const name = eq === -1 ? arg : arg.slice(0, eq);
      const inlineValue = eq === -1 ? undefined : arg.slice(eq + 1);
      if (name === '--in-place') return 'sed --in-place edits files';
      if (name === '--file') return 'sed --file runs a script that cannot be inspected';
      if (name === '--expression') {
        scriptFromOption = true;
        scripts.push(inlineValue ?? args[++i] ?? '');
      } else if (name === '--line-length' && inlineValue === undefined && /^\d+$/.test(args[i + 1] ?? '')) {
        i++;
      }
      continue;
    }
    if (arg.startsWith('-') && arg.length > 1) {
      for (let j = 1; j < arg.length; j++) {
        const flag = arg[j];
        if (flag === 'i') return 'sed -i edits files in place';
        if (flag === 'f') return 'sed -f runs a script that cannot be inspected';
        if (flag === 'e') {
          scriptFromOption = true;
          scripts.push(arg.slice(j + 1) || args[++i] || '');
          break;
        }
        if (flag === 'l') {
          // GNU: -l N (line-wrap length). BSD: -l takes no value.
          if (j === arg.length - 1 && /^\d+$/.test(args[i + 1] ?? '')) i++;
          break;
        }
      }
      continue;
    }
    addOperand(arg);
  }

  for (const script of scripts) {
    const reason = getUnsafeSedScriptReason(script);
    if (reason) return reason;
  }
  return null;
}

/** sort writes files with -o/--output and runs a program with --compress-program. */
function getDangerousSortReason(commandParts: string[]): string | null {
  const args = commandParts.slice(1);
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (arg === '--') break;
    if (arg.startsWith('--')) {
      const name = arg.split('=', 1)[0];
      if (name === '--output') return 'sort --output writes to a file';
      if (name === '--compress-program') return 'sort --compress-program runs an external program';
      continue;
    }
    if (arg.startsWith('-') && arg.length > 1) {
      for (let j = 1; j < arg.length; j++) {
        const flag = arg[j]!;
        if (flag === 'o') return 'sort -o writes to a file';
        // These take a value: the rest of the cluster, or the next argument.
        if ('ktST'.includes(flag)) {
          if (j === arg.length - 1) i++;
          break;
        }
      }
    }
  }
  return null;
}

/** `gh api` long options that take a value (`--name value` or `--name=value`). */
const GH_API_VALUE_OPTIONS = new Set(['cache', 'field', 'header', 'hostname', 'input', 'jq', 'method', 'preview', 'raw-field', 'template']);
/** `gh api` short options that take a value (`-X value` or `-Xvalue`), by long name. */
const GH_API_VALUE_FLAGS: Record<string, string> = {
  F: 'field', H: 'header', X: 'method', f: 'raw-field', p: 'preview', q: 'jq', t: 'template',
};

/** Split one `gh api` option into its long name and value, consuming the next argument when needed. */
function readGhApiOption(args: string[], index: number): { name: string; value: string; next: number } | null {
  const arg = args[index]!;
  if (arg.startsWith('--')) {
    const eq = arg.indexOf('=');
    const name = eq === -1 ? arg.slice(2) : arg.slice(2, eq);
    if (!GH_API_VALUE_OPTIONS.has(name)) return null;
    return eq === -1
      ? { name, value: args[index + 1] ?? '', next: index + 1 }
      : { name, value: arg.slice(eq + 1), next: index };
  }
  // Boolean flags (-i) may be clustered in front of a value flag: -iX DELETE, -iXDELETE.
  let j = 1;
  while (j < arg.length && !(arg[j]! in GH_API_VALUE_FLAGS)) j++;
  if (j >= arg.length) return null;
  const name = GH_API_VALUE_FLAGS[arg[j]!]!;
  return j + 1 < arg.length
    ? { name, value: arg.slice(j + 1), next: index }
    : { name, value: args[index + 1] ?? '', next: index + 1 };
}

/**
 * `gh api` is read-only only for GET requests: -X/--method picks the method, and
 * -f/-F/--field/--raw-field/--input switch the default from GET to POST.
 * GraphQL always goes over POST, so it is judged by its query instead.
 */
function getDangerousGhReason(commandParts: string[]): string | null {
  if (commandParts[1] !== 'api') return null;
  const args = commandParts.slice(2);
  const methods: string[] = [];
  const fields: string[] = [];
  let usesInput = false;
  let endpoint: string | undefined;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (!arg.startsWith('-') || arg === '-') {
      endpoint ??= arg;
      continue;
    }
    const option = readGhApiOption(args, i);
    if (!option) continue;
    i = option.next;
    const { name, value } = option;

    if (name === 'method') methods.push(value.toUpperCase());
    else if (name === 'field' || name === 'raw-field') fields.push(value);
    else if (name === 'input') usesInput = true;
    else if (name === 'header' && /x-http-method|method-override/i.test(value)) {
      return 'gh api method-override header changes the request method';
    }
  }

  if (endpoint === 'graphql') {
    if (usesInput) return 'gh api graphql --input sends a query that cannot be inspected';
    if (fields.some(field => /^query=@/.test(field))) return 'gh api graphql reads the query from a file that cannot be inspected';
    if (fields.some(field => /\bmutation\b/i.test(field))) return 'gh api graphql mutation changes remote state';
    return null;
  }

  const mutating = methods.find(method => method !== 'GET' && method !== 'HEAD');
  if (mutating) return `gh api -X ${mutating} changes remote state`;
  if (methods.length === 0 && (fields.length > 0 || usesInput)) {
    return 'gh api sends a POST request when -f/-F/--field/--raw-field/--input are used without --method GET';
  }
  return null;
}

const ARGUMENT_INSPECTORS: Record<string, ArgumentInspector> = {
  find: getDangerousFindReason,
  awk: getDangerousAwkReason,
  gawk: getDangerousAwkReason,
  mawk: getDangerousAwkReason,
  nawk: getDangerousAwkReason,
  sed: getDangerousSedReason,
  gsed: getDangerousSedReason,
  sort: getDangerousSortReason,
  gsort: getDangerousSortReason,
  gh: getDangerousGhReason,
};

// ============================================================
// Validation Logic
// ============================================================

/**
 * Validate a bash command using AST analysis.
 *
 * @param command - The bash command string to validate
 * @param patterns - Compiled regex patterns for allowed commands
 * @returns Validation result with detailed reason if rejected
 */
export function validateBashCommand(
  command: string,
  patterns: CompiledBashPattern[]
): BashValidationResult {
  // Parse the command into an AST
  let ast: ScriptNode;
  try {
    ast = bashParser(command) as ScriptNode;
  } catch (error) {
    debug('[BashValidator] Parse error:', error);
    return {
      allowed: false,
      reason: {
        type: 'parse_error',
        error: error instanceof Error ? error.message : String(error),
      },
    };
  }

  // Validate the AST recursively
  const subcommandResults: SubcommandResult[] = [];
  const result = validateNode(ast, patterns, subcommandResults);

  return {
    ...result,
    subcommandResults: subcommandResults.length > 0 ? subcommandResults : undefined,
  };
}

/**
 * The argv of `command` when it is exactly one plain command: no `&&`/`||`/`;`/`|`
 * chains, subshells, background jobs, redirects, environment assignments or
 * expansions. `null` for anything else, including parse errors.
 *
 * For decisions about one command that must not carry over to whatever else is
 * chained onto it (Ask-mode "Always Allow").
 */
export function parseSimpleCommand(command: string): string[] | null {
  let ast: ScriptNode;
  try {
    ast = bashParser(command) as ScriptNode;
  } catch {
    return null;
  }
  if (ast.commands.length !== 1 || ast.commands[0]?.type !== 'Command') return null;
  const node = ast.commands[0] as CommandNode;
  if (node.async || !node.name || node.prefix?.length || checkWordForExpansions(node.name)) return null;

  const argv = [node.name.text];
  for (const item of node.suffix ?? []) {
    if (item.type !== 'Word' || checkWordForExpansions(item as WordNode)) return null;
    argv.push((item as WordNode).text);
  }
  return argv;
}

/**
 * Recursively validate an AST node.
 */
function validateNode(
  node: ASTNode,
  patterns: CompiledBashPattern[],
  results: SubcommandResult[]
): BashValidationResult {
  switch (node.type) {
    case 'Script':
      return validateScript(node as ScriptNode, patterns, results);

    case 'Command':
      return validateCommand(node as CommandNode, patterns, results);

    case 'LogicalExpression':
      return validateLogicalExpression(node as LogicalExpressionNode, patterns, results);

    case 'Pipeline':
      // Validate each command in the pipeline individually.
      // If all commands are in the allowlist, the pipeline is safe.
      // e.g., `git log | head` is allowed because both commands are read-only.
      return validatePipeline(node as PipelineNode, patterns, results);

    case 'Subshell':
      return validateSubshell(node as SubshellNode, patterns, results);

    case 'CompoundList':
      return validateCompoundList(node as CompoundListNode, patterns, results);

    default:
      // Unknown node type — fail closed. bash-parser may produce node types
      // we don't explicitly handle (If, While, For, Case, Function, etc.).
      // Block them rather than silently allowing arbitrary constructs.
      debug('[BashValidator] Unknown node type (blocked):', node.type);
      return {
        allowed: false,
        reason: {
          type: 'parse_error',
          error: `Unsupported shell construct: "${node.type}". Only simple commands, pipelines, logical expressions (&&/||), and subshells are supported in Explore mode`,
        },
      };
  }
}

/**
 * Validate a Script node (top-level).
 */
function validateScript(
  node: ScriptNode,
  patterns: CompiledBashPattern[],
  results: SubcommandResult[]
): BashValidationResult {
  for (const cmd of node.commands) {
    const result = validateNode(cmd, patterns, results);
    if (!result.allowed) {
      return result;
    }
  }
  return { allowed: true };
}

/**
 * Validate a simple Command node.
 * Checks for:
 * 1. Command name matches safe patterns
 * 2. No redirects in suffix
 * 3. No command expansions in any word
 */
function validateCommand(
  node: CommandNode,
  patterns: CompiledBashPattern[],
  results: SubcommandResult[]
): BashValidationResult {
  // Check for background execution (&) - always blocked as it allows
  // running commands asynchronously which could hide malicious activity
  if (node.async) {
    return {
      allowed: false,
      reason: {
        type: 'background_execution',
        explanation: 'Background execution (&) runs commands asynchronously which could hide malicious activity',
      },
    };
  }

  // Build the full command string for pattern matching
  const commandParts: string[] = [];

  // Add command name
  if (node.name) {
    // Check for expansions in command name
    const expansionCheck = checkWordForExpansions(node.name);
    if (expansionCheck) {
      return { allowed: false, reason: expansionCheck };
    }
    commandParts.push(node.name.text);
  }

  // Add prefix (assignments, redirects before command)
  if (node.prefix) {
    for (const item of node.prefix) {
      if (item.type === 'Redirect') {
        const redirect = item as RedirectNode;
        // Allow safe redirects (input redirects and output to /dev/null)
        if (!isRedirectSafe(redirect)) {
          return {
            allowed: false,
            reason: {
              type: 'redirect',
              op: redirect.op.text,
              explanation: getRedirectExplanation(redirect.op.text),
            },
          };
        }
      }

      // Block environment variable assignments in command prefix.
      // e.g., PATH=/evil ls, LD_PRELOAD=/evil/lib.so ls, FOO=bar cmd
      // These modify the command's environment, potentially enabling
      // PATH hijacking or library injection (LD_PRELOAD).
      if (item.type === 'AssignmentWord') {
        return {
          allowed: false,
          reason: {
            type: 'env_assignment',
            explanation: `Environment variable assignment "${(item as WordNode).text}" modifies command behavior (e.g., PATH hijacking, LD_PRELOAD injection)`,
          },
        };
      }
    }
  }

  // Add suffix (arguments, redirects after command)
  if (node.suffix) {
    for (const item of node.suffix) {
      if (item.type === 'Redirect') {
        const redirect = item as RedirectNode;
        // Allow safe redirects (input redirects and output to /dev/null)
        if (!isRedirectSafe(redirect)) {
          return {
            allowed: false,
            reason: {
              type: 'redirect',
              op: redirect.op.text,
              explanation: getRedirectExplanation(redirect.op.text),
            },
          };
        }
      } else if (item.type === 'Word') {
        const word = item as WordNode;

        // Check for command expansions in arguments
        const expansionCheck = checkWordForExpansions(word);
        if (expansionCheck) {
          return { allowed: false, reason: expansionCheck };
        }

        commandParts.push(word.text);
      }
    }
  }

  // Check for command arguments that enable sub-command execution or writes.
  // e.g., `find -exec touch file \;` — the `-exec` flag runs arbitrary commands.
  // These are program-level features invisible to the shell AST.
  const inspector = node.name ? ARGUMENT_INSPECTORS[node.name.text.toLowerCase()] : undefined;
  const argumentReason = inspector?.(commandParts);
  if (argumentReason) {
    const command = commandParts.join(' ');
    results.push({ command, allowed: false, reason: argumentReason });
    return {
      allowed: false,
      reason: { type: 'unsafe_command', command, explanation: argumentReason },
    };
  }

  // Build the command string and check against patterns
  const commandStr = commandParts.join(' ');

  // Check if command matches any safe pattern
  const matchesPattern = patterns.some(pattern => pattern.regex.test(commandStr));

  const subResult: SubcommandResult = {
    command: commandStr,
    allowed: matchesPattern,
    reason: matchesPattern ? undefined : 'Not in read-only allowlist',
  };
  results.push(subResult);

  if (!matchesPattern) {
    return {
      allowed: false,
      reason: {
        type: 'unsafe_command',
        command: commandStr,
        explanation: 'Command is not in the read-only allowlist',
      },
    };
  }

  return { allowed: true };
}

/**
 * Validate a LogicalExpression (&&, ||).
 * Both sides must be valid for the expression to be allowed.
 */
function validateLogicalExpression(
  node: LogicalExpressionNode,
  patterns: CompiledBashPattern[],
  results: SubcommandResult[]
): BashValidationResult {
  // Validate left side
  const leftResult = validateNode(node.left, patterns, results);
  if (!leftResult.allowed) {
    return leftResult;
  }

  // Validate right side
  const rightResult = validateNode(node.right, patterns, results);
  if (!rightResult.allowed) {
    return rightResult;
  }

  return { allowed: true };
}

/**
 * Validate a Pipeline node (cmd1 | cmd2 | ...).
 * Each command in the pipeline must be valid for the whole pipeline to be allowed.
 */
function validatePipeline(
  node: PipelineNode,
  patterns: CompiledBashPattern[],
  results: SubcommandResult[]
): BashValidationResult {
  for (const cmd of node.commands) {
    const result = validateNode(cmd, patterns, results);
    if (!result.allowed) {
      return result;
    }
  }
  return { allowed: true };
}

/**
 * Validate a Subshell node (...).
 * The inner commands must all be valid.
 */
function validateSubshell(
  node: SubshellNode,
  patterns: CompiledBashPattern[],
  results: SubcommandResult[]
): BashValidationResult {
  return validateNode(node.list, patterns, results);
}

/**
 * Validate a CompoundList (list of commands in subshell or similar).
 */
function validateCompoundList(
  node: CompoundListNode,
  patterns: CompiledBashPattern[],
  results: SubcommandResult[]
): BashValidationResult {
  for (const cmd of node.commands) {
    const result = validateNode(cmd, patterns, results);
    if (!result.allowed) {
      return result;
    }
  }
  return { allowed: true };
}

/**
 * Check a Word node for dangerous expansions.
 * Returns a rejection reason if found, null if safe.
 */
function checkWordForExpansions(word: WordNode): BashValidationReason | null {
  if (!word.expansion) {
    return null;
  }

  for (const exp of word.expansion) {
    if (exp.type === 'CommandExpansion') {
      return {
        type: 'command_expansion',
        explanation: `Command substitution $(...) executes embedded commands (found in: ${word.text})`,
      };
    }

    // Process substitution <(...) or >(...)
    // bash-parser may represent these differently, check for common patterns
    if (exp.type === 'ProcessSubstitution') {
      return {
        type: 'process_substitution',
        explanation: `Process substitution executes commands (found in: ${word.text})`,
      };
    }

    // Parameter expansion ($VAR, ${VAR}, ${VAR:-default}) can make commands
    // behave unpredictably based on environment state.
    // e.g., `cat $HOME/.ssh/id_rsa` reads sensitive files via expansion.
    if (exp.type === 'ParameterExpansion') {
      return {
        type: 'parameter_expansion',
        explanation: `Variable expansion \${...} makes command behavior dependent on environment state (found in: ${word.text})`,
      };
    }
  }

  return null;
}

/**
 * Safe input redirect operators that don't write to files.
 */
const SAFE_INPUT_REDIRECTS = new Set([
  '<',    // Input redirect - read-only
  '<&',   // Duplicate input file descriptor
]);

/**
 * Check if a redirect is safe (read-only or to /dev/null).
 *
 * Safe redirects:
 * - Input redirects: <, <&
 * - Output redirects to /dev/null (e.g., >/dev/null, 2>/dev/null)
 * - File descriptor duplication (e.g., 2>&1) - just duplicates, doesn't write to file
 */
function isRedirectSafe(redirect: RedirectNode): boolean {
  const op = redirect.op.text;

  // Input redirects are always safe (read-only)
  if (SAFE_INPUT_REDIRECTS.has(op)) {
    return true;
  }

  const target = redirect.file?.text;

  // Output redirects to /dev/null are safe
  if (target === '/dev/null') {
    return true;
  }

  // File descriptor duplication (e.g., 2>&1) is safe - it just redirects to another fd
  // These have targets like "1", "2" (file descriptor numbers)
  if (op === '>&' && target && /^\d+$/.test(target)) {
    return true;
  }

  return false;
}

/**
 * Get explanation for a redirect operator.
 */
function getRedirectExplanation(op: string): string {
  const explanations: Record<string, string> = {
    '>': 'overwrites file contents',
    '>>': 'appends to file',
    '>&': 'redirects file descriptors',
    '>|': 'forces overwrite (clobber)',
    '<<': 'here-document could inject arbitrary content',
  };

  return explanations[op] || `redirect operator "${op}" modifies file I/O`;
}

/**
 * Check if the command string contains dangerous control characters.
 *
 * Note: Newlines and carriage returns are NOT blocked here because bash-parser
 * correctly parses them as command separators, and the AST validation will
 * check each command individually. Only null bytes are blocked as they could
 * cause issues at lower levels (C bindings, string handling).
 */
export function hasControlCharacters(command: string): { char: string; explanation: string } | null {
  const dangerous: Record<string, string> = {
    '\x00': 'Null byte can truncate strings unexpectedly',
  };

  for (const char of command) {
    if (dangerous[char]) {
      return { char: '\\0', explanation: dangerous[char] };
    }
  }

  return null;
}
