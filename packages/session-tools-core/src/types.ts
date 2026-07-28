export interface DeveloperFeedback {
  id: string;
  timestamp: string;
  sessionId: string;
  message: string;
}

export interface CallbackMessage {
  __callback__: string;
  [key: string]: unknown;
}

export interface TextContent {
  type: 'text';
  text: string;
}

export interface ToolResult {
  content: TextContent[];
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
}

export interface ValidationIssue {
  path: string;
  message: string;
  suggestion?: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
}
