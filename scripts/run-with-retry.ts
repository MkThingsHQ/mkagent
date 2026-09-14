#!/usr/bin/env bun

export interface RetryOptions {
  attempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
}

interface RetryDependencies {
  run(command: string[]): Promise<number>;
  sleep(delayMs: number): Promise<void>;
  log(message: string): void;
}

const defaultDependencies: RetryDependencies = {
  async run(command) {
    const child = Bun.spawn(command, {
      cwd: process.cwd(),
      env: process.env,
      stdin: 'inherit',
      stdout: 'inherit',
      stderr: 'inherit',
    });
    return child.exited;
  },
  sleep: Bun.sleep,
  log: message => console.error(message),
};

export async function runWithRetry(
  command: string[],
  options: RetryOptions,
  dependencies: RetryDependencies = defaultDependencies,
): Promise<number> {
  if (command.length === 0) throw new Error('missing command after --');
  if (!Number.isInteger(options.attempts) || options.attempts < 1) {
    throw new Error('attempts must be a positive integer');
  }

  for (let attempt = 1; attempt <= options.attempts; attempt += 1) {
    const exitCode = await dependencies.run(command);
    if (exitCode === 0) return 0;
    if (attempt === options.attempts) return exitCode;

    const delayMs = Math.min(
      options.baseDelayMs * 2 ** (attempt - 1),
      options.maxDelayMs,
    );
    dependencies.log(
      `Command failed with exit code ${exitCode} (attempt ${attempt}/${options.attempts}); retrying in ${delayMs}ms`,
    );
    await dependencies.sleep(delayMs);
  }

  return 1;
}

function readPositiveInteger(flag: string, value: string | undefined): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`${flag} must be a positive integer`);
  }
  return parsed;
}

export function parseRetryArguments(args: string[]): {
  command: string[];
  options: RetryOptions;
} {
  const delimiter = args.indexOf('--');
  if (delimiter < 0) throw new Error('usage: run-with-retry [options] -- <command> [args...]');

  const options: RetryOptions = {
    attempts: 4,
    baseDelayMs: 2_000,
    maxDelayMs: 30_000,
  };
  for (let index = 0; index < delimiter; index += 2) {
    const flag = args[index];
    const value = args[index + 1];
    if (flag === '--attempts') options.attempts = readPositiveInteger(flag, value);
    else if (flag === '--base-delay-ms') options.baseDelayMs = readPositiveInteger(flag, value);
    else if (flag === '--max-delay-ms') options.maxDelayMs = readPositiveInteger(flag, value);
    else throw new Error(`unknown option: ${flag}`);
  }

  const command = args.slice(delimiter + 1);
  if (command.length === 0) throw new Error('missing command after --');
  return { command, options };
}

if (import.meta.main) {
  try {
    const { command, options } = parseRetryArguments(Bun.argv.slice(2));
    process.exit(await runWithRetry(command, options));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(2);
  }
}
