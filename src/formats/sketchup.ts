import type { FormatExtractor, Preview } from '../types'
import { indexOfSeq } from '../util/bytes'

// SKP files begin with FF FE FF 0E then UTF-16LE "SketchUp".
const SKP_MAGIC = Uint8Array.from([
  0xff, 0xfe, 0xff, 0x0e, 0x53, 0x00, 0x6b, 0x00, 0x65, 0x00, 0x74, 0x00, 0x63,
  0x00, 0x68, 0x00, 0x55, 0x00, 0x70, 0x00,
])
const PNG_SIG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const PNG_IEND = Uint8Array.from([0x49, 0x45, 0x4e, 0x44]) // "IEND"

/**
 * SketchUp SKP. The file starts with a version header, immediately followed by
 * the thumbnail as an embedded PNG; some files carry additional preview PNGs
 * after it (scene/viewpoint previews). We match the header magic and return every
 * embedded PNG — the first, right after the header, is the thumbnail. Verified on
 * legacy (v6) and modern (VFF) files.
 */
export const sketchupExtractor: FormatExtractor = {
  name: 'sketchup',
  canHandle: ({ data }) => {
    if (data.length < SKP_MAGIC.length) return false
    for (let i = 0; i < SKP_MAGIC.length; i++) {
      if (data[i] !== SKP_MAGIC[i]) return false
    }
    return true
  },
  extract: ({ data }): Preview[] => {
    const previews: Preview[] = []
    let from = 0
    for (let n = 1; ; n++) {
      const start = indexOfSeq(data, PNG_SIG, from)
      if (start < 0) break
      const iend = indexOfSeq(data, PNG_IEND, start)
      const end = iend >= 0 ? iend + 8 : data.length
      previews.push({
        data: data.subarray(start, end),
        format: 'png',
        source: 'sketchup',
        name: n === 1 ? 'thumbnail' : `preview-${n}`,
      })
      from = end
    }
    return previews
  },
}
