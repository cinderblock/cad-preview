import { inflateSync } from 'fflate'
import type { ImageFormat } from '../types'
import { indexOfSeq } from './bytes'
import { imageSig } from './image'

const PK_LOCAL = Uint8Array.from([0x50, 0x4b, 0x03, 0x04])

export interface ZipImageEntry {
  name: string
  data: Uint8Array
  format: ImageFormat
}

/**
 * Manually walk a ZIP's local file headers and return every entry that is an
 * image (by extension + decoded signature). Unlike a full ZIP reader this doesn't
 * need the central directory and tolerates non-standard containers — e.g. an
 * Autodesk DWF (a ZIP behind a "(DWF V..." prefix, with streaming entries that
 * trip strict parsers). Handles stored (method 0) and DEFLATE (method 8) entries;
 * for DEFLATE we inflate from the data offset and let the stream self-terminate,
 * so a missing/streamed compressed-size doesn't matter.
 *
 * `from` is where to start scanning (0 works even with a leading prefix).
 */
export function scanZipImages(data: Uint8Array, from = 0): ZipImageEntry[] {
  const dv = new DataView(data.buffer, data.byteOffset, data.length)
  const out: ZipImageEntry[] = []
  let i = indexOfSeq(data, PK_LOCAL, from)
  for (let guard = 0; i >= 0 && guard < 10000; guard++) {
    if (i + 30 > data.length) break
    const method = dv.getUint16(i + 8, true)
    const compSize = dv.getUint32(i + 18, true)
    const nlen = dv.getUint16(i + 26, true)
    const elen = dv.getUint16(i + 28, true)
    const nameStart = i + 30
    const dataStart = nameStart + nlen + elen
    if (nameStart + nlen <= data.length && dataStart < data.length) {
      let name = ''
      for (let k = 0; k < nlen; k++) name += String.fromCharCode(data[nameStart + k])
      if (/\.(png|jpe?g|bmp|gif)$/i.test(name)) {
        let bytes: Uint8Array | null = null
        if (method === 0) {
          bytes =
            compSize > 0
              ? data.subarray(dataStart, dataStart + compSize)
              : data.subarray(dataStart)
        } else if (method === 8) {
          try {
            bytes = inflateSync(data.subarray(dataStart))
          } catch {
            bytes = null
          }
        }
        const format = bytes && imageSig(bytes)
        if (bytes && format) out.push({ name, data: bytes, format })
      }
    }
    // Advance by scanning for the next local header — robust to streaming
    // entries whose sizes aren't in the local header. A false "PK\x03\x04" inside
    // compressed data just yields a non-image name and is skipped.
    i = indexOfSeq(data, PK_LOCAL, i + 4)
  }
  return out
}
