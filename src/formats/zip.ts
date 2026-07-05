import { unzipSync } from 'fflate'
import type { FormatExtractor, Preview } from '../types'
import { imageSig } from '../util/image'
import { scanZipImages } from '../util/zipscan'

/**
 * ZIP / OPC packages that embed a thumbnail part: 3MF (/Metadata/thumbnail.png),
 * FreeCAD .FCStd (thumbnails/Thumbnail.png), Fusion .f3d (Previews/…png), and
 * slicer 3MF projects. Bambu Studio 3MF files, in particular, often have no
 * generic `thumbnail`/`preview` part — the good render is `Metadata/plate_N.png`
 * (the sliced build-plate image). We recognize those too, and prefer them (they
 * tend to be the largest, cleanest preview). Auxiliary maps (`top_`, `pick_`,
 * `*_no_light`, `*_small`) are ignored.
 *
 * We only decompress candidate image parts — never the (potentially huge)
 * geometry. If the strict reader chokes (a non-standard / streaming ZIP), we fall
 * back to a manual local-header scan with the same preferences.
 */
export const zipExtractor: FormatExtractor = {
  name: 'zip',
  canHandle: ({ data }) =>
    // ZIP local file header "PK\x03\x04" (OPC packages start here too).
    data.length >= 4 && data[0] === 0x50 && data[1] === 0x4b,
  extract: ({ data }): Preview | null => {
    try {
      const files = unzipSync(data, { filter: (f) => isCandidate(f.name) })
      const entries = Object.entries(files).filter(([, b]) => imageSig(b))
      if (entries.length) {
        entries.sort(
          ([an, ab], [bn, bb]) => score(bn, bb.length) - score(an, ab.length),
        )
        const bytes = entries[0][1]
        const format = imageSig(bytes)
        if (format) return { data: bytes, format, source: 'zip' }
      }
    } catch {
      // fall through to the tolerant scan
    }
    const scanned = scanZipImages(data).filter((e) => isCandidate(e.name))
    if (!scanned.length) return null
    scanned.sort((a, b) => score(b.name, b.data.length) - score(a.name, a.data.length))
    return { data: scanned[0].data, format: scanned[0].format, source: 'zip' }
  },
}

/** An image part that could be the package's preview. */
function isCandidate(name: string): boolean {
  if (!/\.(png|jpe?g|bmp|gif)$/i.test(name)) return false
  return /thumbnail|preview/i.test(name) || /(?:^|\/)plate_\d+\.png$/i.test(name)
}

/**
 * Rank candidates: a slicer plate render first (nicest — and earlier plates win),
 * then a generic thumbnail/preview part, then PNG, then the largest.
 */
function score(name: string, length: number): number {
  const lo = name.toLowerCase()
  let s = length
  const plate = lo.match(/(?:^|\/)plate_(\d+)\.png$/)
  if (plate) s += 1e12 - Number(plate[1]) * 1e3
  else if (/thumbnail|preview/.test(lo)) s += 5e11
  if (/\.png$/.test(lo)) s += 1e9
  return s
}
