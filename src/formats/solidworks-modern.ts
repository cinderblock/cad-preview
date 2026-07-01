import { inflateSync } from 'fflate'
import type { ExtractContext, FormatExtractor, Preview } from '../types'
import { indexOfSeq } from '../util/bytes'
import { dibToBmp, imageSig } from '../util/image'

// Fixed magic that tags a stream record in the modern SolidWorks container.
const SW_STREAM_MAGIC = Uint8Array.from([0x27, 0x56, 0x67, 0x96, 0x56, 0x77])

/**
 * Modern (~2015+) SolidWorks .sldprt/.sldasm/.slddrw — the proprietary binary
 * format that replaced OLE compound documents. The first 4 bytes are a per-file
 * random value (so there's no file magic to dispatch on — we gate on extension),
 * and the body is a series of raw-DEFLATE streams. The preview is a 640×480 PNG
 * stored as one such stream, immediately after the 6-byte stream magic
 * 27 56 67 96 56 77 (which also carries a uint32-LE compressed length just ahead).
 *
 * The magic also appears in the file header, so we scan every occurrence, probe
 * the few framing bytes after each, and prefer a real image (the preview is a
 * PNG); a DIB is only a last resort since its header can false-match inflated
 * data. Verified across parts and assemblies from desktop SolidWorks,
 * McMaster-Carr, and 3DEXPERIENCE-saved files — no SolidWorks install required.
 */
export const solidworksModernExtractor: FormatExtractor = {
  name: 'solidworks-modern',
  canHandle: ({ lower }) => /\.sld(prt|asm|drw)$/.test(lower),
  extract: ({ data }): Preview | null => {
    let dibFallback: Uint8Array | null = null
    let from = 0
    for (;;) {
      const m = indexOfSeq(data, SW_STREAM_MAGIC, from)
      if (m < 0) break
      from = m + 1
      const streamStart = m + SW_STREAM_MAGIC.length
      for (
        let o = streamStart;
        o < streamStart + 8 && o < data.length - 4;
        o++
      ) {
        let out: Uint8Array
        try {
          out = inflateSync(data.subarray(o))
        } catch {
          continue
        }
        const format = imageSig(out)
        if (format) return { data: out, format, source: 'solidworks-modern' }
        if (!dibFallback) dibFallback = dibToBmp(out)
      }
    }
    if (dibFallback) {
      return { data: dibFallback, format: 'bmp', source: 'solidworks-modern' }
    }
    return null
  },
}
