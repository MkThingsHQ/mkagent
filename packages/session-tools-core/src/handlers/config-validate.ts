import { join } from 'node:path';
import { getConfigDir } from '@mkagent/shared/config';
import type { SessionToolContext } from '../context.ts';
import { errorResponse, successResponse } from '../response.ts';
import type { ToolResult, ValidationResult } from '../types.ts';
import {
  formatValidationResult,
  mergeResults,
  validateJsonFileHasFields,
} from '../validation.ts';
import { getSourceConfigPath } from '../source-helpers.ts';

export interface ConfigValidateArgs {
  target: 'config' | 'sources' | 'preferences' | 'permissions' | 'tool-icons' | 'all';
  sourceSlug?: string;
}

export async function handleConfigValidate(
  ctx: SessionToolContext,
  args: ConfigValidateArgs
): Promise<ToolResult> {
  const configRoot = getConfigDir();

  if (ctx.validators) {
    try {
      let result: ValidationResult;
      switch (args.target) {
        case 'config':
          result = ctx.validators.validateConfig();
          break;
        case 'sources':
          result = args.sourceSlug
            ? ctx.validators.validateSource(ctx.workspacePath, args.sourceSlug)
            : ctx.validators.validateAllSources(ctx.workspacePath);
          break;
        case 'preferences':
          result = ctx.validators.validatePreferences();
          break;
        case 'permissions':
          result = ctx.validators.validatePermissions(ctx.workspacePath);
          break;
        case 'tool-icons':
          result = ctx.validators.validateToolIcons();
          break;
        case 'all':
          result = ctx.validators.validateAll(ctx.workspacePath);
          break;
      }
      return successResponse(formatValidationResult(result));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return errorResponse(`Config validation failed: ${message}`);
    }
  }

  const configResult = () =>
    validateJsonFileHasFields(join(configRoot, 'config.json'), ['workspaces']);
  const preferencesResult = () =>
    validateJsonFileHasFields(join(configRoot, 'preferences.json'), []);
  const permissionsResult = () => {
    const path = join(ctx.workspacePath, 'permissions.json');
    return ctx.fs.exists(path)
      ? validateJsonFileHasFields(path, [])
      : { valid: true, errors: [], warnings: [] };
  };
  const toolIconsResult = () =>
    validateJsonFileHasFields(join(configRoot, 'tool-icons', 'tool-icons.json'), [
      'version',
      'tools',
    ]);
  const sourcesResult = () => {
    if (args.sourceSlug) {
      return validateJsonFileHasFields(
        getSourceConfigPath(ctx.workspacePath, args.sourceSlug),
        ['slug', 'name', 'type'],
      );
    }
    const sourcesDir = join(ctx.workspacePath, 'sources');
    if (!ctx.fs.exists(sourcesDir)) {
      return { valid: true, errors: [], warnings: [] } satisfies ValidationResult;
    }
    const results: ValidationResult[] = [];
    for (const entry of ctx.fs.readdir(sourcesDir)) {
      const entryPath = join(sourcesDir, entry);
      if (!ctx.fs.isDirectory(entryPath)) continue;
      const sourceResult = validateJsonFileHasFields(
        join(entryPath, 'config.json'),
        ['slug', 'name', 'type'],
      );
      if (!sourceResult.valid) {
        sourceResult.errors = sourceResult.errors.map(error => ({
          ...error,
          path: `${entry}/${error.path}`,
        }));
      }
      results.push(sourceResult);
    }
    return mergeResults(...results);
  };

  let result: ValidationResult;
  switch (args.target) {
    case 'config':
      result = configResult();
      break;
    case 'sources':
      result = sourcesResult();
      break;
    case 'preferences':
      result = preferencesResult();
      break;
    case 'permissions':
      result = permissionsResult();
      break;
    case 'tool-icons':
      result = toolIconsResult();
      break;
    case 'all':
      result = mergeResults(configResult(), sourcesResult(), preferencesResult(), permissionsResult());
      break;
    default:
      return errorResponse(`Unknown validation target: ${String(args.target)}`);
  }

  return successResponse(formatValidationResult(result));
}
