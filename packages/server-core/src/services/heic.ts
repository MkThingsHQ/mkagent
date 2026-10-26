/**
 * HEIC/HEIF support.
 *
 * iOS emits HEIC for photos and screenshots, but nothing in our image stack can
 * read it natively: Chromium has no HEIC codec for <img> previews, Electron's
 * nativeImage returns an empty image, and sharp's prebuilt binaries ship without
 * libheif (decoding it needs a source-built libvips). So we transcode HEIC/HEIF
 * to JPEG at ingestion with the pure-JS `heic-convert` decoder; every downstream
 * consumer (model upload, thumbnailing, preview) then works with plain JPEG.
 */

import { readFile } from 'node:fs/promises'
import { extname } from 'node:path'

/** MIME types that identify HEIC/HEIF still images and sequences. */
const HEIC_MIME_TYPES = new Set([
  'image/heic',
  'image/heif',
  'image/heic-sequence',
  'image/heif-sequence',
])

/** File extensions that identify HEIC/HEIF images. */
const HEIC_EXTENSIONS = new Set(['.heic', '.heif'])

/**
 * ISO-BMFF `ftyp` brands used by HEIC/HEIF files. iOS screenshots report a
 * `heic`/`heix` major brand with a `mif1` compatible brand; matching the whole
 * known set covers single-image and sequence variants from any encoder.
 */
const HEIC_FTYP_BRANDS = new Set([
  'heic', 'heix', 'heim', 'heis',
  'hevc', 'hevx', 'hevm', 'hevs',
  'mif1', 'msf1', 'miaf', 'heif',
])

export function isHeicMime(mimeType?: string | null): boolean {
  return !!mimeType && HEIC_MIME_TYPES.has(mimeType.toLowerCase())
}

export function isHeicExtension(path: string): boolean {
  return HEIC_EXTENSIONS.has(extname(path).toLowerCase())
}

/**
 * Detect HEIC/HEIF by ISO-BMFF magic bytes: a `ftyp` box (bytes 4..8) whose
 * major brand (bytes 8..12) is a known HEIC/HEIF brand. The brand set includes
 * the generic container brands (mif1/msf1), so the major brand alone identifies
 * every real-world HEIC. Content sniffing is the only signal for drag/paste
 * buffers, which carry no path and sometimes a wrong or empty MIME type.
 */
export function isHeicBuffer(buffer: Buffer): boolean {
  if (buffer.length < 12) return false
  if (buffer.toString('latin1', 4, 8) !== 'ftyp') return false
  const boxSize = buffer.readUInt32BE(0)
  const end = Math.min(boxSize, buffer.length)
  const brands = [buffer.toString('latin1', 8, 12)]
  for (let offset = 16; offset + 4 <= end; offset += 4) brands.push(buffer.toString('latin1', offset, offset + 4))
  if (brands.some(brand => brand === 'avif' || brand === 'avis')) return false
  return brands.some(brand => HEIC_FTYP_BRANDS.has(brand.trim()))
}

/** Decode the primary image of a HEIC/HEIF buffer to a JPEG buffer. */
export async function decodeHeicToJpeg(buffer: Buffer, quality = 0.92): Promise<Buffer> {
  const convert = (await import('heic-convert')).default
  const out = await convert({ buffer, format: 'JPEG', quality })
  return Buffer.from(out)
}

/**
 * Normalize an image-processor input so downstream decoders (sharp /
 * nativeImage) can read it: HEIC/HEIF inputs are transcoded to a JPEG buffer,
 * everything else is returned untouched. Accepts a Buffer or a file path.
 */
export async function ensureDecodableImage(input: Buffer | string): Promise<Buffer | string> {
  if (typeof input === 'string') {
    if (!isHeicExtension(input)) return input
    return decodeHeicToJpeg(await readFile(input))
  }
  if (!isHeicBuffer(input)) return input
  return decodeHeicToJpeg(input)
}
