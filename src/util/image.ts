import type { ImageFormat } from '../types'
import { indexOfSeq } from './bytes'

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

const PNG_SIG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const PNG_IEND = Uint8Array.from([0x49, 0x45, 0x4e, 0x44]) // "IEND"
const DIB_HDR = Uint8Array.from([0x28, 0x00, 0x00, 0x00]) // biSize = 40

/**
 * Find a raster image *embedded inside* a larger byte blob (not necessarily at
 * offset 0), or null. Handles the common case where a container stores the
 * preview after a small header — e.g. Autodesk Inventor tucks a PNG partway into
 * an (obfuscated-name) OLE stream, and OLE property-set thumbnails carry a DIB.
 *
 * Only the 8-byte PNG signature and a *validated* DIB header are matched, since
 * both are specific enough not to false-match arbitrary binary data. (A bare
 * JPEG "FF D8 FF" is too short to scan for safely, so it isn't.)
 */
export function findEmbeddedImage(
  b: Uint8Array,
): { data: Uint8Array; format: ImageFormat } | null {
  const png = indexOfSeq(b, PNG_SIG)
  if (png >= 0) {
    // Trim to the end of the IEND chunk when present, else take the rest.
    const iend = indexOfSeq(b, PNG_IEND, png)
    const end = iend >= 0 ? iend + 8 : b.length
    return { data: b.subarray(png, end), format: 'png' }
  }
  for (
    let k = indexOfSeq(b, DIB_HDR);
    k >= 0;
    k = indexOfSeq(b, DIB_HDR, k + 1)
  ) {
    const bmp = dibToBmp(b.subarray(k))
    if (bmp) return { data: bmp, format: 'bmp' }
  }
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
    const compression = dv.getUint32(16, true)
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
    // For uncompressed (BI_RGB) bitmaps the pixel data must actually be present,
    // else this is a coincidental 40-byte "header" in unrelated binary data (a
    // real false-positive risk when scanning inside a container). RLE/other
    // compressions have a variable, smaller payload, so only gate BI_RGB.
    if (compression === 0) {
      const stride = Math.floor((Math.abs(width) * bpp + 31) / 32) * 4
      const need = biSize + paletteBytes + stride * Math.abs(height)
      if (dib.length < need) continue
    }
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
