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
const DIB_HDR = Uint8Array.from([0x28, 0x00, 0x00, 0x00]) // biSize = 40

/**
 * Find a raster image *embedded inside* a larger byte blob (not necessarily at
 * offset 0), or null. Handles the common case where a container stores the
 * preview after a small header — e.g. Autodesk Inventor tucks a PNG partway into
 * an (obfuscated-name) OLE stream, and OLE property-set thumbnails carry a DIB.
 *
 * Only the 8-byte PNG signature and a *decodable* DIB header are matched, since
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
    const png = dibToPng(b.subarray(k))
    if (png) return { data: png, format: 'png' }
  }
  return null
}
