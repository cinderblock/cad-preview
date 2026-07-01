import * as CFB from 'cfb'
import type { FormatExtractor, ImageFormat, Preview } from '../types'
import { toU8 } from '../util/bytes'
import { dibToBmp, findEmbeddedImage, imageSig } from '../util/image'

/**
 * OLE2 compound documents: older SolidWorks (.sldprt/.sldasm/.slddrw, ≤2014),
 * Autodesk Inventor (.ipt/.iam), Solid Edge, and other structured-storage CAD
 * files. The preview shows up in a few shapes:
 *
 *   - A stream that *is* an image — a PNG ("PreviewPNG") or a headerless DIB in a
 *     "Preview" stream (no BM/PNG magic, so we wrap it via dibToBmp).
 *   - An image embedded *inside* a stream at a non-zero offset — Inventor stores
 *     its PNG partway into an obfuscated-name stream; OLE property-set thumbnails
 *     carry a DIB. findEmbeddedImage locates those.
 *
 * We collect every candidate and pick the best: preview/thumbnail-named first,
 * then PNG, then the largest (the visible preview is usually the biggest bitmap).
 */
export const oleExtractor: FormatExtractor = {
  name: 'ole',
  canHandle: ({ data }) =>
    data.length >= 8 &&
    data[0] === 0xd0 &&
    data[1] === 0xcf &&
    data[2] === 0x11 &&
    data[3] === 0xe0,
  extract: ({ data }): Preview | null => {
    const cf = CFB.read(data, { type: 'buffer' })
    let best: { data: Uint8Array; format: ImageFormat; score: number } | null =
      null
    cf.FullPaths.forEach((path, i) => {
      const entry = cf.FileIndex[i]
      // type 2 === stream
      if (!entry || entry.type !== 2) return
      const raw = toU8(entry.content)
      if (!raw) return

      // Prefer a whole-stream image, then a whole-stream DIB, then an image
      // embedded somewhere inside the stream.
      let found: { data: Uint8Array; format: ImageFormat } | null = null
      const wholeFmt = imageSig(raw)
      if (wholeFmt) {
        found = { data: raw, format: wholeFmt }
      } else {
        const bmp = dibToBmp(raw)
        if (bmp) found = { data: bmp, format: 'bmp' }
        else found = findEmbeddedImage(raw)
      }
      if (!found) return

      const lower = path.toLowerCase()
      let score = found.data.length
      if (/preview|thumbnail/.test(lower)) score += 1e12
      if (found.format === 'png') score += 1e9
      if (!best || score > best.score) best = { ...found, score }
    })
    if (!best) return null
    const { data: bytes, format } = best as {
      data: Uint8Array
      format: ImageFormat
    }
    return { data: bytes, format, source: 'ole' }
  },
}
