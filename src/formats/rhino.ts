import { unzlibSync } from 'fflate'
import type { FormatExtractor, Preview } from '../types'
import { indexOfSeq } from '../util/bytes'
import { dibToPng } from '../util/dib'

// Rhino 3DM files begin with this ASCII banner ("3D Geometry File Format ...").
const RHINO_MAGIC = Uint8Array.from(
  '3D Geometry File Format'.split('').map((c) => c.charCodeAt(0)),
)
const DIB_HDR = Uint8Array.from([0x28, 0x00, 0x00, 0x00]) // biSize = 40

/**
 * Rhino 3DM (openNURBS). The preview lives in a `TCODE_PREVIEWIMAGE` chunk in the
 * properties table as a Windows DIB (`BITMAPINFOHEADER` + pixels). Rather than
 * walk the whole openNURBS chunk tree, we scan for the DIB header and recover its
 * pixels two ways:
 *
 *   - Uncompressed: the pixel bytes follow the header directly (dibToPng reads it).
 *   - Compressed (the common case): openNURBS stores the header, then a small
 *     wrapper, then a zlib stream of the pixels. We inflate the nearby zlib and
 *     accept it only when it decompresses to *exactly* the byte count the header's
 *     dimensions require — a match strong enough to rule out false positives.
 *
 * Verified on Rhino 5 and Rhino 6 files.
 */
export const rhinoExtractor: FormatExtractor = {
  name: 'rhino',
  canHandle: ({ data }) => indexOfSeq(data, RHINO_MAGIC) === 0,
  extract: ({ data }): Preview[] => {
    for (
      let k = indexOfSeq(data, DIB_HDR);
      k >= 0;
      k = indexOfSeq(data, DIB_HDR, k + 1)
    ) {
      if (k + 40 > data.length) break
      const dv = new DataView(data.buffer, data.byteOffset + k, 40)
      const width = Math.abs(dv.getInt32(4, true))
      const height = Math.abs(dv.getInt32(8, true))
      const planes = dv.getUint16(12, true)
      const bpp = dv.getUint16(14, true)
      const compression = dv.getUint32(16, true)
      const clrUsed = dv.getUint32(32, true)
      if (
        planes !== 1 ||
        ![8, 24, 32].includes(bpp) ||
        compression !== 0 ||
        width < 8 ||
        width > 8192 ||
        height < 8 ||
        height > 8192
      ) {
        continue
      }

      // Compressed (common case): find a nearby zlib stream that inflates to
      // exactly the pixel byte count the header calls for — a match strong enough
      // to trust — then rebuild a contiguous DIB. Tried before the uncompressed
      // path so the compression wrapper can't be misread as pixel data.
      const paletteBytes = bpp <= 8 ? (clrUsed || 1 << bpp) * 4 : 0
      const stride = (((width * bpp + 31) >> 5) << 2) >>> 0
      const need = stride * height
      const searchFrom = k + 40 + paletteBytes
      for (
        let o = searchFrom;
        o < searchFrom + 64 && o < data.length - 2;
        o++
      ) {
        if (data[o] !== 0x78) continue
        if (data[o + 1] !== 0x9c && data[o + 1] !== 0xda && data[o + 1] !== 0x01)
          continue
        let pixels: Uint8Array
        try {
          pixels = unzlibSync(data.subarray(o))
        } catch {
          continue
        }
        if (pixels.length !== need) continue
        const dib = new Uint8Array(40 + paletteBytes + need)
        dib.set(data.subarray(k, k + 40 + paletteBytes), 0)
        dib.set(pixels, 40 + paletteBytes)
        const png = dibToPng(dib)
        if (png) return [{ data: png, format: 'png', source: 'rhino' }]
      }

      // Uncompressed: pixels sit right after the header (+palette).
      const direct = dibToPng(data.subarray(k))
      if (direct) return [{ data: direct, format: 'png', source: 'rhino' }]
    }
    return []
  },
}
