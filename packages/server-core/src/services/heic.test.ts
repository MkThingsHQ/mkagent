import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { describe, expect, it } from 'bun:test'
import {
  isHeicMime,
  isHeicExtension,
  isHeicBuffer,
  decodeHeicToJpeg,
  ensureDecodableImage,
} from './heic'

// A 320x240 HEIC (ftyp brand "heix" / "mif1") produced by `sips -s format heic`.
// Small enough to embed; exercises the real heic-convert decode path.
const HEIC_FIXTURE_BASE64 =
  'AAAAJGZ0eXBoZWl4AAAAAG1pZjFNaVByTWlIQW1pYWZoZWl4AAABhm1ldGEAAAAAAAAAIWhkbHIAAAAAAAAAAHBpY3QAAAAAAAAAAAAAAAAAAAAAJGRpbmYAAAAcZHJlZgAAAAAAAAABAAAADHVybCAAAAABAAAADnBpdG0AAAAAAAEAAAAjaWluZgAAAAAAAQAAABVpbmZlAgAAAAABAABodmMxAAAAAOZpcHJwAAAAxWlwY28AAAATY29scm5jbHgAAgACAAaAAAAADGNsbGkAywBAAAAAFGlzcGUAAAAAAAABQAAAAPAAAAAJaXJvdAAAAAAQcGl4aQAAAAADCgoKAAAAcWh2Y0MBAiAAAACwAAAAAAA88AD8/fr6AAALA6AAAQAYQAEMAf//AiAAAAMAsAAAAwAAAwA8FwJAoQABACJCAQECIAAAAwCwAAADAAADADygCggPE2IF7kWVTcCAgYAgogABAAlEAcBgnLIRFNkAAAAZaXBtYQAAAAAAAAABAAEGgQIDBYaEAAAAHmlsb2MAAAAARAAAAQABAAAAAQAAAboAAAGRAAAAAW1kYXQAAAAAAAABoQAAAY0oAa+IPHdL06NM8nhNkn0g3ndTBr39mz8JdQjMh9tzUr99AlshR2yj+b/Nnlzx/vk63ypyhdfi27wRugQwkOlYcUOBAQZQWzIQlO1BMiuxWd2kmFoF4tk9LZK3t+T/HUtQ3nna/UPny16EP6+KYhG+K1x0fPC/KiI6N3UTNfwmXf+TywVgZ63YqASry4KAcM53k7ZjLtUGorJCPWRdrCHeLHb0Dm7zn5dpmEvWJ//qjJXCvJj62kRL1bHoev2AOKLxJN9IgOiCY3NNnweAL2Gga78wXVN4X894baneJpKVpHJFoiEOgEpgZ8L1EEL58Y9tXxH+3/YF5K2bfaBpX2YqQZ9RFiI8OvqqgE2DPI2teIyrSI4Egx448AZIMBGNypUhPdbNAR/ldRz56gPU96l94E1tmw/8n+NIlBu+lQw0nXYoXRa1Ty5atw06oArsmkn3XW4xhUcOkXFc8PYNZAFmx0nY6lvLeDFSkXxCbkBS8jvm/VKugWv7/CoVqy8YtPGASCzfWY2AAAADAAOm'

const heicBuffer = Buffer.from(HEIC_FIXTURE_BASE64, 'base64')
// 1x1 PNG.
const pngBuffer = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO5n2WQAAAAASUVORK5CYII=',
  'base64',
)

describe('isHeicMime', () => {
  it('matches HEIC/HEIF mime types case-insensitively', () => {
    expect(isHeicMime('image/heic')).toBe(true)
    expect(isHeicMime('image/heif')).toBe(true)
    expect(isHeicMime('IMAGE/HEIC-SEQUENCE')).toBe(true)
  })
  it('rejects other mime types and nullish input', () => {
    expect(isHeicMime('image/png')).toBe(false)
    expect(isHeicMime('image/jpeg')).toBe(false)
    expect(isHeicMime(undefined)).toBe(false)
    expect(isHeicMime(null)).toBe(false)
  })
})

describe('isHeicExtension', () => {
  it('matches .heic/.heif paths case-insensitively', () => {
    expect(isHeicExtension('/a/b/IMG_0001.HEIC')).toBe(true)
    expect(isHeicExtension('photo.heif')).toBe(true)
  })
  it('rejects other extensions', () => {
    expect(isHeicExtension('photo.jpg')).toBe(false)
    expect(isHeicExtension('photo')).toBe(false)
  })
})

describe('isHeicBuffer', () => {
  it('detects a real HEIC file by ftyp brand', () => {
    expect(isHeicBuffer(heicBuffer)).toBe(true)
  })
  it('rejects non-HEIC and truncated buffers', () => {
    expect(isHeicBuffer(pngBuffer)).toBe(false)
    expect(isHeicBuffer(Buffer.from([0, 0, 0]))).toBe(false)
  })
})

describe('decodeHeicToJpeg', () => {
  it('decodes a HEIC buffer to a valid JPEG', async () => {
    const jpeg = await decodeHeicToJpeg(heicBuffer)
    // JPEG SOI/EOI markers.
    expect(jpeg[0]).toBe(0xff)
    expect(jpeg[1]).toBe(0xd8)
    expect(jpeg[jpeg.length - 2]).toBe(0xff)
    expect(jpeg[jpeg.length - 1]).toBe(0xd9)
  })
})

describe('ensureDecodableImage', () => {
  it('transcodes a HEIC buffer to JPEG', async () => {
    const out = await ensureDecodableImage(heicBuffer)
    expect(Buffer.isBuffer(out)).toBe(true)
    const buf = out as Buffer
    expect(buf[0]).toBe(0xff)
    expect(buf[1]).toBe(0xd8)
  })
  it('passes non-HEIC buffers through unchanged', async () => {
    const out = await ensureDecodableImage(pngBuffer)
    expect(out).toBe(pngBuffer)
  })
  it('passes non-HEIC paths through unchanged', async () => {
    const out = await ensureDecodableImage('/tmp/photo.png')
    expect(out).toBe('/tmp/photo.png')
  })
})


it('preserves AVIF even with the generic HEIF mif1 container brand', () => {
  const buffer = Buffer.alloc(24)
  buffer.writeUInt32BE(24, 0)
  buffer.write('ftypmif1', 4)
  buffer.write('avif', 16)
  expect(isHeicBuffer(buffer)).toBe(false)
})

it('decodes real HEIF files by path for platform thumbnail processors', async () => {
  const root = mkdtempSync(join(tmpdir(), 'mkagent-heif-'))
  try {
    const path = join(root, 'photo.HEIF')
    writeFileSync(path, heicBuffer)
    const output = await ensureDecodableImage(path) as Buffer
    expect(output.subarray(0, 2)).toEqual(Buffer.from([255, 216]))
    const sharp = (await import('sharp')).default
    expect(await sharp(output).metadata()).toMatchObject({ format: 'jpeg', width: 320, height: 240 })
  } finally { rmSync(root, { recursive: true, force: true }) }
})
