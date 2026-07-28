export interface LlmValidationResult {
  success: boolean;
  error?: string;
}

/** Convert provider errors into concise connection-test feedback. */
export function parseValidationError(message: string): string {
  const lower = message.toLowerCase();
  if (lower.includes('econnrefused') || lower.includes('enotfound') || lower.includes('fetch failed')) {
    return 'Cannot connect to API server. Check the URL and ensure the server is running.';
  }
  if (lower.includes('401') || lower.includes('unauthorized') || lower.includes('authentication')) {
    return 'Authentication failed. Check your API key.';
  }
  if (lower.includes('403') || lower.includes('forbidden') || lower.includes('permission')) {
    return 'Access denied. Check your API key permissions.';
  }
  if (lower.includes('429') || lower.includes('rate limit') || lower.includes('quota')) {
    return 'Rate limited or quota exceeded. Try again later.';
  }
  if (lower.includes('402') || lower.includes('credit') || lower.includes('billing')) {
    return 'Billing issue. Check your account credits or payment method.';
  }
  if (lower.includes('model not found') || lower.includes('invalid model')) {
    return 'Model not found. Check the connection configuration.';
  }
  if (lower.includes('404')) {
    return 'Endpoint not found. Check the custom endpoint protocol and URL.';
  }
  if (['500', '502', '503', 'service unavailable'].some(value => lower.includes(value))) {
    return 'API temporarily unavailable. Try again in a few seconds.';
  }
  return message.slice(0, 200);
}
