import { encodePng } from './png'

/**
 * Decode a Windows DIB (bare `BITMAPINFOHEADER` + optional palette + pixels, no
 * 14-byte file header) and re-encode it as a PNG, or null if it isn't a DIB we
 * can decode. Handles an optional 4-byte length prefix (how older SolidWorks
 * stores its "Preview" stream).
 *
 * We emit PNG rather than BMP on purpose: many image pipelines (notably
 * libvips/sharp) don't decode BMP, so a raw DIB/BMP would be dead weight. PNG is
 * universally decodable and browser-native. Compression uses fflate (already a
 * dependency), so no native or extra packages are needed.
 *
 * Supported: uncompressed BI_RGB at 8bpp (palette), 24bpp, and 32bpp, plus
 * BI_RLE8. Other exotic depths return null.
 */
export function dibToPng(buf: Uint8Array): Uint8Array | null {
  for (const off of [0, 4]) {
    const decoded = decodeDib(buf, off)
    if (decoded) return encodePng(decoded.width, decoded.height, decoded.rgb, 3)
  }
  return null
}

interface DecodedDib {
  width: number
  height: number
  /** Top-down RGB, 3 bytes/pixel, width*height*3. */
  rgb: Uint8Array
}

const BI_RGB = 0
const BI_RLE8 = 1

function decodeDib(buf: Uint8Array, off: number): DecodedDib | null {
  if (buf.length < off + 40) return null
  const dv = new DataView(buf.buffer, buf.byteOffset + off, 40)
  const biSize = dv.getUint32(0, true)
  if (biSize !== 40 && biSize !== 108 && biSize !== 124) return null
  const rawWidth = dv.getInt32(4, true)
  const rawHeight = dv.getInt32(8, true)
  const planes = dv.getUint16(12, true)
  const bpp = dv.getUint16(14, true)
  const compression = dv.getUint32(16, true)
  let clrUsed = dv.getUint32(32, true)

  const width = Math.abs(rawWidth)
  const height = Math.abs(rawHeight)
  const topDown = rawHeight < 0
  if (
    planes !== 1 ||
    width < 4 ||
    width > 8192 ||
    height < 4 ||
    height > 8192 ||
    ![8, 24, 32].includes(bpp) ||
    (compression !== BI_RGB && compression !== BI_RLE8) ||
    (compression === BI_RLE8 && bpp !== 8)
  ) {
    return null
  }

  // Palette (BGRA quads) follows the header for indexed images.
  const paletteEntries = bpp <= 8 ? clrUsed || 1 << bpp : 0
  const paletteStart = off + biSize
  const pixelStart = paletteStart + paletteEntries * 4
  if (pixelStart > buf.length) return null
  const palette = buf.subarray(paletteStart, pixelStart)

  const rgb = new Uint8Array(width * height * 3)
  // Emit a source row (0 = bottom row of a bottom-up DIB) into output row y.
  const putRow = (srcRow: number, cb: (x: number) => [number, number, number]) => {
    const y = topDown ? srcRow : height - 1 - srcRow
    let o = y * width * 3
    for (let x = 0; x < width; x++) {
      const [r, g, b] = cb(x)
      rgb[o++] = r
      rgb[o++] = g
      rgb[o++] = b
    }
  }

  if (compression === BI_RGB) {
    const stride = (((width * bpp + 31) >> 5) << 2) >>> 0
    if (pixelStart + stride * height > buf.length) return null
    for (let row = 0; row < height; row++) {
      const base = pixelStart + row * stride
      putRow(row, (x) => {
        if (bpp === 24) {
          const p = base + x * 3
          return [buf[p + 2], buf[p + 1], buf[p]] // BGR -> RGB
        }
        if (bpp === 32) {
          const p = base + x * 4
          return [buf[p + 2], buf[p + 1], buf[p]] // BGRA -> RGB
        }
        const idx = buf[base + x] * 4 // 8bpp palette index
        return [palette[idx + 2], palette[idx + 1], palette[idx]]
      })
    }
    return { width, height, rgb }
  }

  // BI_RLE8: decode run-length-encoded 8-bit indices into rows (bottom-up).
  if (!decodeRle8(buf, pixelStart, width, height, palette, rgb)) return null
  return { width, height, rgb }
}

/** Decode BI_RLE8 pixels straight into the top-down RGB buffer. Returns ok. */
function decodeRle8(
  buf: Uint8Array,
  start: number,
  width: number,
  height: number,
  palette: Uint8Array,
  rgb: Uint8Array,
): boolean {
  let p = start
  let x = 0
  let srcRow = 0 // 0 = bottom row
  const put = (idx: number) => {
    if (x >= width || srcRow >= height) return
    const y = height - 1 - srcRow // RLE is bottom-up
    const o = (y * width + x) * 3
    const q = idx * 4
    rgb[o] = palette[q + 2]
    rgb[o + 1] = palette[q + 1]
    rgb[o + 2] = palette[q]
    x++
  }
  while (p < buf.length) {
    const count = buf[p++]
    if (count > 0) {
      const val = buf[p++]
      for (let i = 0; i < count; i++) put(val)
      continue
    }
    const code = buf[p++]
    if (code === 0) {
      // end of line
      x = 0
      srcRow++
    } else if (code === 1) {
      return true // end of bitmap
    } else if (code === 2) {
      // delta
      x += buf[p++]
      srcRow += buf[p++]
    } else {
      // absolute run of `code` literal indices, padded to a 2-byte boundary
      for (let i = 0; i < code; i++) put(buf[p++])
      if (code & 1) p++
    }
  }
  return true
}
