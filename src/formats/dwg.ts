import type { FormatExtractor, Preview } from '../types'
import { indexOfSeq } from '../util/bytes'
import { dibToPng } from '../util/dib'
import { imageSig } from '../util/image'

// Marks the start of the preview-image section in a DWG file.
const SENTINEL = Uint8Array.from([
  0x1f, 0x25, 0x6d, 0x07, 0xd4, 0x36, 0x28, 0x28, 0x9d, 0x57, 0xca, 0x3f, 0x9d,
  0x44, 0x10, 0x2b,
])

/**
 * AutoCAD DWG (R13–R2018+, "AC10xx"). The file header holds a 4-byte pointer at
 * offset 0x0D to a preview-image section: a 16-byte sentinel, an overall size, a
 * count, then entries of {code, address, size}. code 2 is a headerless Windows
 * DIB, code 6 (R2013+) is a PNG, code 3 is a WMF (skipped). We prefer PNG, then
 * the DIB (transcoded to PNG). Verified on R2000 (DIB) and R2018 (PNG) files.
 */
export const dwgExtractor: FormatExtractor = {
  name: 'dwg',
  canHandle: ({ data }) =>
    data.length >= 0x11 &&
    data[0] === 0x41 && // 'A'
    data[1] === 0x43 && // 'C'
    data[2] === 0x31 && // '1'
    data[3] === 0x30, // '0'
  extract: ({ data }): Preview[] => {
    const dv = new DataView(data.buffer, data.byteOffset, data.length)
    // The header pointer usually lands on the sentinel; fall back to a scan.
    let p = dv.getUint32(0x0d, true)
    if (!sentinelAt(data, p)) {
      p = indexOfSeq(data, SENTINEL)
      if (p < 0) return []
    }
    p += SENTINEL.length
    if (p + 5 > data.length) return []
    p += 4 // overall size
    const count = data[p]
    p += 1
    if (count > 16) return []

    let png: Uint8Array | null = null
    let dib: Uint8Array | null = null
    for (let i = 0; i < count; i++) {
      if (p + 9 > data.length) break
      const code = data[p]
      const addr = dv.getUint32(p + 1, true)
      const size = dv.getUint32(p + 5, true)
      p += 9
      if (addr + size > data.length || size < 4) continue
      const slice = data.subarray(addr, addr + size)
      if (code === 6) {
        if (imageSig(slice) === 'png') png = slice
      } else if (code === 2) {
        const conv = dibToPng(slice)
        if (conv) dib = conv
      }
    }
    // A DWG has at most one PNG and one DIB entry; PNG (newer) preferred.
    const previews: Preview[] = []
    if (png) previews.push({ data: png, format: 'png', source: 'dwg', name: 'png' })
    if (dib) previews.push({ data: dib, format: 'png', source: 'dwg', name: 'bmp' })
    return previews
  },
}

function sentinelAt(data: Uint8Array, pos: number): boolean {
  if (pos < 0 || pos + SENTINEL.length > data.length) return false
  for (let i = 0; i < SENTINEL.length; i++) {
    if (data[pos + i] !== SENTINEL[i]) return false
  }
  return true
}
