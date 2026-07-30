# Attachments

Desktop supports file selection, paste, drag/drop, persistence, and recovery. WebUI uploads use an authenticated multipart endpoint with file-count, file-size, and safe-name validation, then enter the same attachment read pipeline.

## Sources

| Source | Where |
|---|---|
| File picker | Desktop chat footer → Attach button |
| Paste | Cmd/Ctrl-V in the chat input |
| Drag & drop | Drag from Finder/Explorer/Nautilus onto the chat surface |
| Persisted | Recovered on session resume from `sessions/<id>/attachments/` |
| WebUI upload | `POST /api/attachments` on the headless server |
| CLI | `send <session-id> --attachment <path>` |

All paths converge on the same attachment validator in `@mkagent/shared/agent/attachments`.

## Validation

| Field | Allowed |
|---|---|
| Single-file size | up to 50 MB by default; configurable per workspace |
| Total session attachments | unbounded but session JSONL events truncate over 1 MB single events |
| File name | `/^[A-Za-z0-9._-]+$/` after Unicode normalization; path traversal segments are rejected |
| MIME sniffing | the first 1 KB is sniffed; the declared MIME is overridden if mismatch is suspicious |
| Storage root | forced inside `~/.mkagent/workspaces/<slug>/sessions/<id>/attachments/` |

A failed validation posts a `permission_denied` / `validation_failed` event to the JSONL stream and a same-text toast in the renderer.

## Read pipeline

After landing on disk, attachments are exposed to Pi through a typed attachment descriptor:

```ts
type Attachment = {
  id: string         // UUIDv4
  filename: string   // safe form
  mimeType: string   // sniffed
  size: number       // bytes
  storagePath: string// absolute path under sessions/<id>/attachments/
  uploadedAt: number // epoch ms
}
```

Pi receives the descriptor for each tool call it makes; the actual file content is read by the tool that wants it. Pi does not see the raw upload form, only the validated descriptor.

## Image attachments

Images can be attached, previewed, and rendered in Markdown. The renderer uses `sharp` for re-encoding, and Shiki/KaTeX for code and math rendering. MkAgent **does not** include an image-generation model or `gen_image` tool.

## Persistence

Attachments persist with the session. Deleting a session purges its attachments after the trash retention window. Exporting a session bundles its attachments; the export is single-zip and re-validates every file on import.

## Security

- Path canonicalization rejects `..` segments before storage.
- Symlinks are resolved at upload; `O_NOFOLLOW`-equivalent semantics on POSIX.
- Symlink-attack staging paths (`/tmp/mkagent-*`) cannot escape the workspace root.
- WebUI cookie-based sessions; the upload endpoint reads the same JWT used for RPC.
- Sentry breadcrumbs redact attachment filenames containing credential-looking substrings; they are not uploaded.

## Limitations

- Streaming uploads above 50 MB are not supported; the cap is configurable but a single file is the unit.
- Image EXIF is preserved; if you'd rather strip EXIF, run an external tool before attaching.
