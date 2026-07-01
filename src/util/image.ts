import type { ImageFormat } from '../types'

/** Detect a raster image by its leading byte signature, or null. */
export function imageSig(b: Uint8Array): ImageFormat | null {
  if (b.length < 4) return null
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47)
    return 'png'
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpeg'
  if (b[0] === 0x42 && b[1] === 0x4d) return 'bmp'
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return 'gif'
  return null
}

/**
 * Wrap a Windows DIB (a bare `BITMAPINFOHEADER` + palette + pixels, with no
 * 14-byte `BITMAPFILEHEADER`) into a complete BMP that image decoders accept, or
 * null if `buf` isn't a plausible DIB. Handles an optional 4-byte length prefix,
 * which is how older SolidWorks stores its "Preview" stream.
 */
export function dibToBmp(buf: Uint8Array): Uint8Array | null {
  for (const off of [0, 4]) {
    // BITMAPINFOHEADER: biSize in {40,108,124}, biPlanes=1, biBitCount valid.
    if (buf.length < off + 40) continue
    const dv = new DataView(buf.buffer, buf.byteOffset + off, 40)
    const biSize = dv.getUint32(0, true)
    if (biSize !== 40 && biSize !== 108 && biSize !== 124) continue
    const width = dv.getInt32(4, true)
    const height = dv.getInt32(8, true)
    const planes = dv.getUint16(12, true)
    const bpp = dv.getUint16(14, true)
    let clrUsed = dv.getUint32(32, true)
    if (
      planes !== 1 ||
      ![1, 4, 8, 16, 24, 32].includes(bpp) ||
      Math.abs(width) < 4 ||
      Math.abs(width) > 8192 ||
      Math.abs(height) < 4 ||
      Math.abs(height) > 8192
    ) {
      continue
    }
    const dib = buf.subarray(off)
    // Palette size (bytes) for indexed formats: default to 2^bpp entries.
    if (clrUsed === 0 && bpp <= 8) clrUsed = 1 << bpp
    const paletteBytes = bpp <= 8 ? clrUsed * 4 : 0
    const pixelOffset = 14 + biSize + paletteBytes
    const out = new Uint8Array(14 + dib.length)
    const hv = new DataView(out.buffer)
    out[0] = 0x42 // 'B'
    out[1] = 0x4d // 'M'
    hv.setUint32(2, out.length, true) // bfSize
    hv.setUint32(10, pixelOffset, true) // bfOffBits
    out.set(dib, 14)
    return out
  }
  return null
}
