import type { ImageFormat } from '../types'
import { indexOfSeq } from './bytes'
import { dibToPng } from './dib'

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

/**
 * Find a raster image *embedded inside* a larger byte blob (not necessarily at
 * offset 0), or null. Handles the common case where a container stores the
 * preview after a small header — e.g. Autodesk Inventor tucks a PNG partway into
 * an (obfuscated-name) OLE stream, and OLE property-set thumbnails (Solid Edge,
 * 3ds Max, …) carry a DIB.
 *
 * Only the 8-byte PNG signature and a *decodable* DIB header are matched, since
 * both are specific enough not to false-match arbitrary binary data. DIB headers
 * are recognized by their little-endian biSize (40 = BITMAPINFOHEADER, 108 =
 * BITMAPV4, 124 = BITMAPV5); dibToPng then validates dimensions and that the
 * pixel data is actually present. (A bare JPEG "FF D8 FF" is too short to scan
 * for safely, so it isn't.)
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
  for (let k = 0; k + 4 <= b.length; k++) {
    // Cheap gate: a DIB header starts with a little-endian biSize of 40/108/124
    // and the next byte is 0 (sizes are small), so most positions bail instantly.
    if (b[k + 1] !== 0 || b[k + 2] !== 0 || b[k + 3] !== 0) continue
    if (b[k] !== 40 && b[k] !== 108 && b[k] !== 124) continue
    const converted = dibToPng(b.subarray(k))
    if (converted) return { data: converted, format: 'png' }
  }
  return null
}
