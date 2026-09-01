/**
 * ChatGPT backend search provider — for ChatGPT Plus / OpenAI OAuth users.
 *
 * Uses the same Responses API format as the public OpenAI API, but hits the
 * ChatGPT backend endpoint which accepts OAuth access tokens instead of API keys.
 *
 * Auth flow mirrors the Pi SDK's `openai-codex-responses.js`:
 *   - Bearer token: the OAuth access token
 *   - chatgpt-account-id: extracted from the JWT's claims
 */

import type { WebSearchProvider, WebSearchResult } from '../types.ts';
import { parseResponsesApiResults, type ResponsesApiResponse } from './responses-api-parser.ts';
import { isModelRejectionError } from '../../../model-resolution.ts';
import { stripPiPrefix } from '../../../custom-endpoint-models.ts';
import { PI_PREFERRED_DEFAULTS } from '../../../../../shared/src/config/llm-connections.ts';

/**
 * Codex backend request contract (search path):
 * - model: derived from the active connection (see `candidateModels`), NOT hardcoded.
 *   Pinning a single model caused a total search outage once that model was retired
 *   (craft-agents-oss#1023) — the account rejected it with a 400 and search never
 *   recovered. Candidates come from the shared openai-codex catalog and an unsupported
 *   model is retried against the next candidate.
 * - store: false
 * - stream: true (backend may return JSON or SSE)
 * - instructions + tool_choice + text.verbosity
 * - OpenAI-Beta: responses=experimental header
 *
 * If this payload changes, update:
 *   - ./chatgpt.test.ts
 *   - ../SEARCH_PAYLOAD_CONTRACT.md
 */
// Search model candidates for the ChatGPT backend, in preference order. Sourced from the
// shared openai-codex catalog so they track the models the rest of the app offers and can't
// drift into a stale hardcoded value. The plumbed active model (if any) is tried first.
const CODEX_SEARCH_MODELS: readonly string[] = PI_PREFERRED_DEFAULTS['openai-codex'] ?? [];
const FALLBACK_SEARCH_MODEL = CODEX_SEARCH_MODELS[0] ?? 'gpt-5.6-sol';
// Bound the failover chain: the active model plus a few catalog fallbacks. The catalog's
// tail (o3/gpt-4o era) is the least likely to be accepted by a ChatGPT-plan account, so a
// longer chain adds sequential 400 round-trips before the DDG fallback, not recovery odds.
const MAX_MODEL_CANDIDATES = 4;
const API_BASE = 'https://chatgpt.com/backend-api/codex';
const JWT_CLAIM_PATH = 'https://api.openai.com/auth';
const ERROR_TEXT_LIMIT = 600;
const SEARCH_INSTRUCTIONS = 'You are a web search assistant. Return concise, factual search results with source citations when available.';
const SEARCH_TEXT_VERBOSITY = 'medium';

interface SearchAttempt {
  toolType: 'web_search' | 'web_search_preview';
  label: string;
}

const SEARCH_ATTEMPTS: SearchAttempt[] = [
  { toolType: 'web_search', label: 'web_search' },
  { toolType: 'web_search_preview', label: 'web_search_preview' },
];

/**
 * Extract the `chatgpt_account_id` from a ChatGPT OAuth access token (JWT).
 * Returns null if the token is malformed or the claim is missing.
 */
export function extractChatGptAccountId(accessToken: string): string | null {
  try {
    const parts = accessToken.split('.');
    if (parts.length !== 3) return null;

    const payload = JSON.parse(atob(parts[1]!));
    const accountId = payload?.[JWT_CLAIM_PATH]?.chatgpt_account_id;

    return typeof accountId === 'string' && accountId.length > 0 ? accountId : null;
  } catch {
    return null;
  }
}

export class ChatGPTBackendSearchProvider implements WebSearchProvider {
  name = 'ChatGPT';

  constructor(
    private accessToken: string,
    private accountId: string,
    private options?: { model?: string },
  ) {}

  async search(query: string, count: number): Promise<WebSearchResult[]> {
    const attemptErrors: string[] = [];
    const models = this.candidateModels();

    for (let modelIndex = 0; modelIndex < models.length; modelIndex++) {
      const model = models[modelIndex]!;
      const hasMoreModels = modelIndex < models.length - 1;
      let modelRejected = false;

      for (let attemptIndex = 0; attemptIndex < SEARCH_ATTEMPTS.length; attemptIndex++) {
        const attempt = SEARCH_ATTEMPTS[attemptIndex]!;
        const hasMoreAttempts = attemptIndex < SEARCH_ATTEMPTS.length - 1;

        const requestBody = {
          model,
          store: false,
          stream: true,
          instructions: SEARCH_INSTRUCTIONS,
          tools: [{ type: attempt.toolType }],
          tool_choice: 'auto',
          parallel_tool_calls: true,
          text: { verbosity: SEARCH_TEXT_VERBOSITY },
          input: [
            {
              role: 'user',
              content: [
                {
                  type: 'input_text',
                  text: `Search the web for: ${query}\n\nReturn the top ${count} results with title, URL, and a brief description.`,
                },
              ],
            },
          ],
        };

        const requestFingerprint = buildRequestFingerprint(requestBody);

        const response = await fetch(`${API_BASE}/responses`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.accessToken}`,
            'chatgpt-account-id': this.accountId,
            'OpenAI-Beta': 'responses=experimental',
          },
          body: JSON.stringify(requestBody),
          signal: AbortSignal.timeout(30_000),
        });

        const contentType = response.headers.get('content-type') || 'unknown';

        if (response.ok) {
          try {
            const data = await parseResponsePayload(response);
            return parseResponsesApiResults(data, query, count);
          } catch (parseError) {
            const parseMessage = parseError instanceof Error ? parseError.message : String(parseError);
            attemptErrors.push(
              `${attempt.label} parse failed [${requestFingerprint}, content-type=${contentType}]: ${compactErrorText(parseMessage)}`,
            );

            if (hasMoreAttempts) {
              continue;
            }

            throw new Error(`ChatGPT search failed: ${summarizeAttemptErrors(attemptErrors)}`);
          }
        }

        const errorText = await response.text();
        const compactError = compactErrorText(errorText);
        attemptErrors.push(
          `${attempt.label} failed (HTTP ${response.status}) [${requestFingerprint}, content-type=${contentType}]: ${compactError}`,
        );

        // Unsupported-model refusal (e.g. the account rejects a retired model): the tool type
        // is irrelevant, so abandon this model and try the next candidate instead of wasting the
        // remaining tool-type retry on the same dead model. This is what makes search self-heal
        // when a pinned/derived model falls out of the account's supported set (#1023).
        // The predicate requires the message to name the model, so a hosted-tool refusal that
        // also says "is not supported" still takes the tool-type retry below, not this branch.
        if (response.status === 400 && isModelRejectionError(errorText, model)) {
          modelRejected = true;
          break;
        }

        // Other 400 → likely schema/tool incompatibility → retry with the next tool type.
        const canRetry = response.status === 400;
        if (!(canRetry && hasMoreAttempts)) {
          throw new Error(`ChatGPT search failed: ${summarizeAttemptErrors(attemptErrors)}`);
        }
      }

      // The model was rejected as unsupported: advance to the next candidate if one exists.
      if (modelRejected && hasMoreModels) {
        continue;
      }
      if (modelRejected) {
        throw new Error(`ChatGPT search failed: ${summarizeAttemptErrors(attemptErrors)}`);
      }
    }

    throw new Error(`ChatGPT search failed: ${summarizeAttemptErrors(attemptErrors)}`);
  }

  /**
   * Build the ordered, de-duplicated list of bare model IDs to try: the plumbed active model
   * first (so search uses the model the user is actually on), then the shared openai-codex
   * catalog as fallbacks, capped at MAX_MODEL_CANDIDATES. Never empty — always yields at
   * least FALLBACK_SEARCH_MODEL.
   */
  private candidateModels(): string[] {
    const ordered = [this.options?.model, ...CODEX_SEARCH_MODELS, FALLBACK_SEARCH_MODEL];
    const seen = new Set<string>();
    const models: string[] = [];
    for (const raw of ordered) {
      if (!raw) continue;
      const bare = stripPiPrefix(raw);
      if (bare && !seen.has(bare)) {
        seen.add(bare);
        models.push(bare);
      }
    }
    return models.length > 0 ? models.slice(0, MAX_MODEL_CANDIDATES) : [FALLBACK_SEARCH_MODEL];
  }
}

async function parseResponsePayload(response: Response): Promise<ResponsesApiResponse> {
  const contentType = response.headers.get('content-type') || '';
  const raw = await response.text();

  const looksLikeSse =
    contentType.includes('text/event-stream') ||
    raw.startsWith('event:') ||
    raw.includes('\ndata:') ||
    raw.includes('\n\nevent:');

  if (looksLikeSse) {
    return parseSseResponsePayload(raw);
  }

  try {
    return JSON.parse(raw) as ResponsesApiResponse;
  } catch {
    throw new Error(`ChatGPT search response parse failed: expected JSON or SSE payload, got: ${compactErrorText(raw)}`);
  }
}

function parseSseResponsePayload(sseText: string): ResponsesApiResponse {
  let completed: ResponsesApiResponse | null = null;

  for (const chunk of sseText.split('\n\n')) {
    const dataLines = chunk
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.startsWith('data:'))
      .map(line => line.slice(5).trim())
      .filter(Boolean);

    for (const line of dataLines) {
      if (line === '[DONE]') continue;
      let event: any;
      try {
        event = JSON.parse(line);
      } catch {
        continue;
      }

      if (event?.type === 'response.completed' || event?.type === 'response.done') {
        if (event.response && typeof event.response === 'object') {
          completed = event.response as ResponsesApiResponse;
        }
      }
    }
  }

  if (!completed) {
    throw new Error('ChatGPT search stream returned no completed response payload');
  }

  return completed;
}

/**
 * Join attempt errors for a thrown message, bounded: entries are individually capped at
 * ERROR_TEXT_LIMIT, but a full failover sweep (MAX_MODEL_CANDIDATES × tool types) can still
 * accumulate several KB. Keep the first two and the final attempt — the final one reflects
 * the state the sweep actually gave up in.
 */
function summarizeAttemptErrors(errors: string[]): string {
  if (errors.length <= 3) return errors.join('; ');
  const omitted = errors.length - 3;
  return [
    ...errors.slice(0, 2),
    `(+${omitted} more attempt${omitted === 1 ? '' : 's'})`,
    errors[errors.length - 1]!,
  ].join('; ');
}

function buildRequestFingerprint(body: {
  model: string;
  store: boolean;
  stream: boolean;
  tools: Array<{ type: string }>;
  tool_choice: string;
  text?: { verbosity?: string };
}): string {
  const toolType = body.tools[0]?.type || 'unknown';
  const verbosity = body.text?.verbosity || 'unset';

  return `tool=${toolType}, model=${body.model}, store=${String(body.store)}, stream=${String(body.stream)}, tool_choice=${body.tool_choice}, text.verbosity=${verbosity}`;
}

function compactErrorText(text: string): string {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (!normalized) return 'Bad Request';
  return normalized.slice(0, ERROR_TEXT_LIMIT);
}
