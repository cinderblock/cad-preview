import { gunzipSync } from 'fflate'
import { decompress as zstdDecompress } from 'fzstd'
import type { FormatExtractor, Preview } from '../types'
import { encodePng } from '../util/png'

// Uncompressed .blend files start with "BLENDER".
const BLENDER_MAGIC = Uint8Array.from('BLENDER'.split('').map((c) => c.charCodeAt(0)))

const isGzip = (d: Uint8Array) => d.length > 2 && d[0] === 0x1f && d[1] === 0x8b
const isZstd = (d: Uint8Array) =>
  d.length > 4 && d[0] === 0x28 && d[1] === 0xb5 && d[2] === 0x2f && d[3] === 0xfd

/**
 * Blender .blend. After a 12-byte header ("BLENDER", a pointer-size flag, an
 * endianness flag, and a 3-char version) comes a sequence of file-blocks, each a
 * header {4-char code, int32 size, pointer, int32 SDNA index, int32 count}
 * followed by `size` bytes of data. The thumbnail is a "TEST" block whose data is
 * {int32 width, int32 height, then width*height RGBA pixels}, stored bottom-up.
 *
 * We validate by requiring the block size to equal 8 + width*height*4 exactly.
 * Compressed files are decompressed first: legacy gzip (whole-stream) via fflate,
 * and Blender 3.0+ zstd via fzstd. The thumbnail sits near the start, so parsing
 * stays cheap.
 */
export const blenderExtractor: FormatExtractor = {
  name: 'blender',
  canHandle: ({ data, lower }) =>
    startsWith(data, BLENDER_MAGIC) ||
    // Compressed .blend has no "BLENDER" magic — gate on extension.
    ((isGzip(data) || isZstd(data)) && lower.endsWith('.blend')),
  extract: ({ data }): Preview | null => {
    if (isGzip(data) || isZstd(data)) {
      try {
        data = isGzip(data) ? gunzipSync(data) : zstdDecompress(data)
      } catch {
        return null
      }
      if (!startsWith(data, BLENDER_MAGIC)) return null
    }
    const ptrSize = data[7] === 0x2d ? 8 : 4 // '-' = 8-byte pointers, '_' = 4
    const little = data[8] !== 0x56 // 'V' = big-endian, 'v' = little
    const dv = new DataView(data.buffer, data.byteOffset, data.length)
    const headerLen = 8 + ptrSize + 8 // code + size + pointer + sdna + count

    let p = 12
    for (let guard = 0; guard < 100000 && p + headerLen <= data.length; guard++) {
      const code = String.fromCharCode(data[p], data[p + 1], data[p + 2], data[p + 3])
      const size = dv.getInt32(p + 4, little)
      const dataStart = p + headerLen
      if (code === 'ENDB' || size < 0) break
      if (code === 'TEST') {
        const width = dv.getInt32(dataStart, little)
        const height = dv.getInt32(dataStart + 4, little)
        if (
          width < 4 ||
          width > 4096 ||
          height < 4 ||
          height > 4096 ||
          size !== 8 + width * height * 4 ||
          dataStart + 8 + width * height * 4 > data.length
        ) {
          return null
        }
        const src = data.subarray(dataStart + 8)
        // Blender stores the thumbnail bottom-up; flip to top-down RGBA.
        const rgba = new Uint8Array(width * height * 4)
        const rowBytes = width * 4
        for (let y = 0; y < height; y++) {
          rgba.set(
            src.subarray((height - 1 - y) * rowBytes, (height - y) * rowBytes),
            y * rowBytes,
          )
        }
        return { data: encodePng(width, height, rgba, 4), format: 'png', source: 'blender' }
      }
      p = dataStart + size
    }
    return null
  },
}

function startsWith(data: Uint8Array, prefix: Uint8Array): boolean {
  if (data.length < prefix.length) return false
  for (let i = 0; i < prefix.length; i++) if (data[i] !== prefix[i]) return false
  return true
}
