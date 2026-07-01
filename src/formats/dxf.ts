import type { FormatExtractor, Preview } from '../types'
import { dibToPng } from '../util/dib'
import { imageSig } from '../util/image'

/**
 * AutoCAD DXF (ASCII). An optional THUMBNAILIMAGE section holds the preview as a
 * Windows DIB, hex-encoded across group-code 310 lines:
 *
 *   0 / SECTION / 2 / THUMBNAILIMAGE / 90 / <byteCount> / 310 / <hex…> / … / 0 / ENDSEC
 *
 * We find the section, concatenate the 310 hex payloads, decode to bytes, and run
 * the resulting DIB (or PNG, in rare writers) through dibToPng. Gated on the .dxf
 * extension since ASCII DXF has no file magic. The section is optional and often
 * absent, in which case this returns null.
 */
export const dxfExtractor: FormatExtractor = {
  name: 'dxf',
  canHandle: ({ lower }) => lower.endsWith('.dxf'),
  extract: ({ data }): Preview | null => {
    // DXF is line-oriented ASCII; decode as latin1 so bytes map 1:1 to chars.
    const text = latin1(data)
    const marker = text.indexOf('THUMBNAILIMAGE')
    if (marker < 0) return null

    const lines = text.slice(marker).split('\n')
    let hex = ''
    // Walk (code, value) pairs, collecting group-code 310 payloads until the
    // section ends (a group code 0).
    for (let i = 1; i + 1 < lines.length; i += 2) {
      const code = lines[i].trim()
      const value = lines[i + 1].trim()
      if (code === '0') break // start of the next entity / ENDSEC
      if (code === '310') hex += value
    }
    if (hex.length < 8) return null

    const bytes = hexToBytes(hex)
    if (!bytes) return null
    if (imageSig(bytes) === 'png') {
      return { data: bytes, format: 'png', source: 'dxf' }
    }
    const png = dibToPng(bytes)
    if (png) return { data: png, format: 'png', source: 'dxf' }
    return null
  },
}

function latin1(data: Uint8Array): string {
  let s = ''
  // Chunk to avoid call-stack limits on large files.
  for (let i = 0; i < data.length; i += 0x8000) {
    s += String.fromCharCode(...data.subarray(i, i + 0x8000))
  }
  return s
}

function hexToBytes(hex: string): Uint8Array | null {
  const clean = hex.replace(/[^0-9a-fA-F]/g, '')
  if (clean.length < 2) return null
  const n = clean.length >> 1
  const out = new Uint8Array(n)
  for (let i = 0; i < n; i++) {
    out[i] = parseInt(clean.substr(i * 2, 2), 16)
  }
  return out
}
