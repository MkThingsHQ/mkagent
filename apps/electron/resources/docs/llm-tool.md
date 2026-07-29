# LLM Tool (`call_llm`)

Invoke a secondary LLM for focused subtasks. The tool loads text file content automatically from paths you provide and delegates the completion to the active Pi connection.

## When to Use

| Use case | Features |
|----------|----------|
| Summarize a large file | `attachments` |
| Classify content | `outputFormat: "classification"` |
| Extract structured data | `outputSchema` |
| Isolate a focused subtask | `systemPrompt`, `model` |
| Process several independent inputs | multiple parallel calls |

Use the configured Pi provider, compatible endpoint, or local model. `call_llm` does not use subscription or OAuth credentials.

## Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `prompt` | string | Instructions for the LLM (required) |
| `attachments` | array | Text file paths or path/range objects |
| `model` | string | Model from the configured registry; defaults to the summarization model |
| `systemPrompt` | string | Optional system prompt |
| `maxTokens` | number | Maximum output tokens (1-64000) |
| `temperature` | number | Sampling temperature from 0 to 1 |
| `outputFormat` | enum | One predefined structured output format |
| `outputSchema` | object | Custom JSON Schema; cannot be combined with `outputFormat` |

## Attachments

```typescript
// Simple text file
attachments: ["/src/auth.ts"]

// Large file: select a line range
attachments: [{ path: "/logs/app.log", startLine: 1000, endLine: 1500 }]

// Multiple text files
attachments: ["/src/component.tsx", "/src/component.test.tsx"]
```

### Line ranges

For files larger than 2000 lines or 500KB, specify a range no larger than 2000 lines:

```typescript
{ path: "/path/to/large-file.log", startLine: 100, endLine: 600 }
```

Relative attachment paths resolve from the session directory. Prefer absolute paths when the file is outside that directory.

### Supported formats

- UTF-8 text files such as `.ts`, `.js`, `.py`, `.md`, and `.json`
- Up to 20 attachments per call
- Up to 2MB total attachment content

Image and other binary attachments are not supported by the retained Pi `call_llm` path.

## Output formats

| Format | Returns |
|--------|---------|
| `summary` | `{ summary, key_points[], word_count }` |
| `classification` | `{ category, confidence, reasoning }` |
| `extraction` | `{ items[], count }` |
| `analysis` | `{ findings[], issues[], recommendations[] }` |
| `comparison` | `{ similarities[], differences[], verdict }` |
| `validation` | `{ valid, errors[], warnings[] }` |

For a custom shape, pass `outputSchema`. The tool injects the schema into the request and asks the model to return only matching JSON.

## Parallel processing

Call the tool multiple times in one message for independent work:

```text
call_llm(prompt: "Summarize", attachments: ["/file1.ts"])
call_llm(prompt: "Summarize", attachments: ["/file2.ts"])
call_llm(prompt: "Summarize", attachments: ["/file3.ts"])
```

Useful cases include analyzing several files, batch classification, and generating independent alternatives.

## Examples

### Summarize a file

```typescript
call_llm({
  prompt: "Summarize the main functionality",
  attachments: ["/src/auth/handler.ts"]
})
```

### Extract structured data

```typescript
call_llm({
  prompt: "Extract all API endpoints from this file",
  attachments: ["/src/routes.ts"],
  outputSchema: {
    type: "object",
    properties: {
      endpoints: {
        type: "array",
        items: {
          type: "object",
          properties: {
            method: { type: "string" },
            path: { type: "string" },
            handler: { type: "string" }
          }
        }
      }
    },
    required: ["endpoints"]
  }
})
```

### Classify content

```typescript
call_llm({
  prompt: "Classify this support ticket by urgency and category",
  attachments: ["/tickets/latest.txt"],
  outputFormat: "classification"
})
```

## Error handling

| Error | Cause | Recovery |
|-------|-------|----------|
| File not found | Path does not exist | Check spelling and use an absolute path |
| File too large | More than 2000 lines or 500KB | Select a line range |
| Line range too large | More than 2000 selected lines | Reduce or split the range |
| Binary file detected | Attachment is not text | Convert it to text first |
| Permission denied | File cannot be read | Check permissions and allowed paths |
| Empty file | File has no content | Skip it |
| Unknown model | Model is not available | Select a configured model |
| Provider error | Endpoint or credential failed | Test the connection in Settings → AI |

## When NOT to Use

- You can complete the small subtask directly.
- The subtask needs conversation history; `call_llm` starts without it.
- The subtask needs file, shell, or browser tools; use a session/subagent instead.
- The input is a simple one-line value that does not benefit from isolation.
