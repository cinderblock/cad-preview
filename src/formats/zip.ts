import { unzipSync } from 'fflate'
import type { ExtractContext, FormatExtractor, Preview } from '../types'
import { imageSig } from '../util/image'

/**
 * ZIP / OPC packages that embed a thumbnail part: 3MF (/Metadata/thumbnail.png),
 * FreeCAD .FCStd (thumbnails/Thumbnail.png), Fusion .f3d, and friends. We only
 * decompress entries whose name looks like a thumbnail/preview image — never the
 * (potentially huge) geometry parts.
 */
export const zipExtractor: FormatExtractor = {
  name: 'zip',
  canHandle: ({ data }) =>
    // ZIP local file header "PK\x03\x04" (OPC packages start here too).
    data.length >= 4 && data[0] === 0x50 && data[1] === 0x4b,
  extract: ({ data }): Preview | null => {
    const files = unzipSync(data, {
      filter: (f) =>
        /(thumbnail|preview)/i.test(f.name) &&
        /\.(png|jpe?g|bmp|gif)$/i.test(f.name),
    })
    const entries = Object.entries(files).filter(([, b]) => imageSig(b))
    if (!entries.length) return null
    // Prefer PNG, then the largest.
    entries.sort(
      ([an, ab], [bn, bb]) =>
        Number(/\.png$/i.test(bn)) - Number(/\.png$/i.test(an)) ||
        bb.length - ab.length,
    )
    const bytes = entries[0][1]
    const format = imageSig(bytes)
    if (!format) return null
    return { data: bytes, format, source: 'zip' }
  },
}
