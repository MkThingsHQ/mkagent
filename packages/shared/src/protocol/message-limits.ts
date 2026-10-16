/**
 * How big one RPC message may be, and what that means for attachments.
 *
 * The WebSocket server closes the connection on a message over its limit, and
 * the client then fails every pending request with "Connection lost". Node's
 * `ws` (Electron) is configured with NODE_WS_MAX_MESSAGE_BYTES; Bun's `ws`
 * replacement (headless server, WebUI) ignores `maxPayload` and stops at
 * 16 MiB (verified on Bun 1.3.10). The server advertises its limit in
 * `handshake_ack.maxMessageBytes`, and the composer checks attachments
 * against it before sending.
 *
 * Browser-safe: no Node imports.
 */

export const NODE_WS_MAX_MESSAGE_BYTES = 100 * 1024 * 1024
export const BUN_WS_MAX_MESSAGE_BYTES = 16 * 1024 * 1024
/** Assumed for a server that does not advertise its limit (older versions): the smaller one. */
export const DEFAULT_MAX_MESSAGE_BYTES = BUN_WS_MAX_MESSAGE_BYTES

/** The message limit of the runtime this code runs in (used by the server). */
export function runtimeMaxMessageBytes(): number {
  return typeof (globalThis as { Bun?: unknown }).Bun !== 'undefined'
    ? BUN_WS_MAX_MESSAGE_BYTES
    : NODE_WS_MAX_MESSAGE_BYTES
}

/**
 * Images over this size are resized before they are sent (`storeAttachment`,
 * Claude API image limit); must equal IMAGE_LIMITS.MAX_SIZE in utils/files.ts
 * (Node-only, so not imported here; a test pins the two together).
 */
export const MAX_SENT_IMAGE_BYTES = 5 * 1024 * 1024

/**
 * Raw attachment bytes one message can carry. Sending uploads each file
 * (`storeAttachment`), then sends all of them again as base64 (4/3 of the raw
 * size) in one `sendMessage` call, which also carries thumbnails, text and
 * metadata: 70% of the message limit keeps that call under it.
 */
export function maxAttachmentBytes(maxMessageBytes: number): number {
  return Math.floor(maxMessageBytes * 0.7)
}

export interface AttachmentSizeInput {
  name: string
  size: number
  type?: string
}

export type AttachmentSizeProblem =
  | { kind: 'file'; name: string; size: number; limit: number }
  | { kind: 'total'; size: number; limit: number }

/**
 * Whether these attachments can be sent in one message to a server with this
 * limit. Every file must fit on its own (it is uploaded in one call), and
 * together they must fit (they are sent in one call); images count at most
 * their resized size.
 */
export function checkAttachmentSizes(
  attachments: readonly AttachmentSizeInput[],
  maxMessageBytes: number,
): AttachmentSizeProblem | null {
  const limit = maxAttachmentBytes(maxMessageBytes)
  const tooBig = attachments.find(attachment => attachment.size > limit)
  if (tooBig) return { kind: 'file', name: tooBig.name, size: tooBig.size, limit }
  const total = attachments.reduce(
    (sum, attachment) => sum + (attachment.type === 'image' ? Math.min(attachment.size, MAX_SENT_IMAGE_BYTES) : attachment.size),
    0,
  )
  return total > limit ? { kind: 'total', size: total, limit } : null
}

/** "59.7 MB" style size for messages about attachment limits (1 MB = 1,000,000 bytes, as in Finder). */
export function formatAttachmentBytes(bytes: number): string {
  if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(1)} MB`
  if (bytes >= 1_000) return `${Math.round(bytes / 1_000)} KB`
  return `${bytes} B`
}
