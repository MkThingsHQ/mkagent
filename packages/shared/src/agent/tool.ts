import type { ZodTypeAny } from 'zod';

export interface LocalTool {
  name: string;
  description: string;
  parameters: Record<string, ZodTypeAny>;
  handler: (args: any) => Promise<any>;
}

/** Tool object shape used by retained local tool factories. */
export function tool(
  name: string,
  description: string,
  parameters: Record<string, ZodTypeAny>,
  handler: (args: any) => Promise<any>,
  ..._rest: unknown[]
): LocalTool {
  return { name, description, parameters, handler };
}
