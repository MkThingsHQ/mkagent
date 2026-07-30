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

export interface ConfigValidateArgs {
  target: 'config' | 'preferences' | 'permissions' | 'tool-icons' | 'all';
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

  let result: ValidationResult;
  switch (args.target) {
    case 'config':
      result = configResult();
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
      result = mergeResults(configResult(), preferencesResult(), permissionsResult());
      break;
    default:
      return errorResponse(`Unknown validation target: ${String(args.target)}`);
  }

  return successResponse(formatValidationResult(result));
}
