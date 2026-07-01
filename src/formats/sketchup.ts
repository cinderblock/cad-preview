import type { FormatExtractor, Preview } from '../types'
import { findEmbeddedImage } from '../util/image'

// SKP files begin with FF FE FF 0E then UTF-16LE "SketchUp".
const SKP_MAGIC = Uint8Array.from([
  0xff, 0xfe, 0xff, 0x0e, 0x53, 0x00, 0x6b, 0x00, 0x65, 0x00, 0x74, 0x00, 0x63,
  0x00, 0x68, 0x00, 0x55, 0x00, 0x70, 0x00,
])

/**
 * SketchUp SKP. The file starts with a version header, immediately followed by
 * the thumbnail as an embedded PNG (some files carry additional preview PNGs
 * after it — the first one, right after the header, is the thumbnail). We match
 * the header magic and take the first embedded PNG. Verified on legacy (v6) and
 * modern (VFF) files.
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
  extract: ({ data }): Preview | null => {
    const found = findEmbeddedImage(data)
    if (found && found.format === 'png') {
      return { data: found.data, format: 'png', source: 'sketchup' }
    }
    return null
  },
}
