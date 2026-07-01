import * as CFB from 'cfb'
import type { ExtractContext, FormatExtractor, Preview } from '../types'
import { toU8 } from '../util/bytes'
import { dibToBmp, imageSig } from '../util/image'

/**
 * OLE2 compound documents: older SolidWorks (.sldprt/.sldasm/.slddrw, ≤2014),
 * Autodesk Inventor (.ipt/.iam), and other structured-storage CAD files. These
 * embed a real image stream — a PNG ("PreviewPNG") or a headerless DIB in a
 * "Preview" stream (which has no BM/PNG magic, so we wrap it via dibToBmp).
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
    let best: { bytes: Uint8Array; score: number } | null = null
    cf.FullPaths.forEach((path, i) => {
      const entry = cf.FileIndex[i]
      // type 2 === stream
      if (!entry || entry.type !== 2) return
      const raw = toU8(entry.content)
      if (!raw) return
      // Usable if it's already an image, or a raw DIB we can wrap into a BMP.
      const img = imageSig(raw) ? raw : dibToBmp(raw)
      if (!img) return
      const lower = path.toLowerCase()
      // Prefer a preview/thumbnail-named stream, then PNG, then the largest image
      // (the visible preview is usually the biggest embedded bitmap).
      let score = img.length
      if (/preview|thumbnail/.test(lower)) score += 1e12
      if (/png/.test(lower)) score += 1e9
      if (!best || score > best.score) best = { bytes: img, score }
    })
    if (!best) return null
    const bytes = (best as { bytes: Uint8Array }).bytes
    const format = imageSig(bytes)
    if (!format) return null
    return { data: bytes, format, source: 'ole' }
  },
}
