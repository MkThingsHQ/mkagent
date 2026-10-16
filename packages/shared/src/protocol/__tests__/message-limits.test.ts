import { describe, expect, it } from 'bun:test'
import { IMAGE_LIMITS } from '../../utils/files.ts'
import {
  BUN_WS_MAX_MESSAGE_BYTES,
  MAX_SENT_IMAGE_BYTES,
  NODE_WS_MAX_MESSAGE_BYTES,
  checkAttachmentSizes,
  formatAttachmentBytes,
  maxAttachmentBytes,
  runtimeMaxMessageBytes,
} from '../message-limits.ts'

const pdf = (name: string, size: number) => ({ name, size, type: 'pdf' })
const image = (name: string, size: number) => ({ name, size, type: 'image' })

describe('checkAttachmentSizes', () => {
  it('refuses two lecture PDFs that would not fit in one message on the desktop server', () => {
    // 261011-noble-ember: sent together they made a 121.6 MiB message and the send failed with "Connection lost"
    const lectures = [pdf('1. előadás prezentáció.pdf', 35_926_966), pdf('2. előadás prezentáció.pdf', 59_740_351)]
    expect(checkAttachmentSizes(lectures, NODE_WS_MAX_MESSAGE_BYTES)).toEqual({
      kind: 'total',
      size: 95_667_317,
      limit: maxAttachmentBytes(NODE_WS_MAX_MESSAGE_BYTES),
    })
    // One at a time they fit
    for (const lecture of lectures) expect(checkAttachmentSizes([lecture], NODE_WS_MAX_MESSAGE_BYTES)).toBeNull()
  })

  it('names a single file that can never be sent', () => {
    expect(checkAttachmentSizes([pdf('a.pdf', 1_000), pdf('huge.pdf', 80 * 1024 * 1024)], NODE_WS_MAX_MESSAGE_BYTES))
      .toMatchObject({ kind: 'file', name: 'huge.pdf' })
    // The Bun server (headless, WebUI) takes far less: a 15 MB file already fails there
    expect(checkAttachmentSizes([pdf('scan.pdf', 15_000_000)], BUN_WS_MAX_MESSAGE_BYTES)).toMatchObject({ kind: 'file' })
  })

  it('counts images at their resized size, since big ones are resized before sending', () => {
    const photos = [image('a.jpg', 8_000_000), image('b.jpg', 8_000_000)]
    expect(checkAttachmentSizes(photos, BUN_WS_MAX_MESSAGE_BYTES)).toBeNull()
    expect(checkAttachmentSizes([...photos, image('c.jpg', 8_000_000)], BUN_WS_MAX_MESSAGE_BYTES)).toMatchObject({ kind: 'total' })
    expect(MAX_SENT_IMAGE_BYTES).toBe(IMAGE_LIMITS.MAX_SIZE)
  })

  it('leaves room for base64 and the rest of the message', () => {
    const limit = maxAttachmentBytes(NODE_WS_MAX_MESSAGE_BYTES)
    expect(Math.ceil(limit / 3) * 4).toBeLessThan(NODE_WS_MAX_MESSAGE_BYTES * 0.95)
  })
})

describe('message limits', () => {
  it('uses the limit of the runtime it runs in', () => {
    expect(runtimeMaxMessageBytes()).toBe(typeof Bun !== 'undefined' ? BUN_WS_MAX_MESSAGE_BYTES : NODE_WS_MAX_MESSAGE_BYTES)
  })

  it('formats sizes like Finder does', () => {
    expect(formatAttachmentBytes(59_740_351)).toBe('59.7 MB')
    expect(formatAttachmentBytes(85_557)).toBe('86 KB')
    expect(formatAttachmentBytes(512)).toBe('512 B')
  })
})
