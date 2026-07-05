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
  extract: ({ data }): Preview[] => {
    try {
      const files = unzipSync(data, { filter: (f) => isCandidate(f.name) })
      const previews: Preview[] = []
      for (const [name, bytes] of Object.entries(files)) {
        const format = imageSig(bytes)
        if (format) previews.push({ data: bytes, format, source: 'zip', name })
      }
      if (previews.length) {
        previews.sort(
          (a, b) => score(b.name!, b.data.length) - score(a.name!, a.data.length),
        )
        return previews
      }
    } catch {
      // fall through to the tolerant scan
    }
    return scanZipImages(data)
      .filter((e) => isCandidate(e.name))
      .sort((a, b) => score(b.name, b.data.length) - score(a.name, a.data.length))
      .map((e) => ({ data: e.data, format: e.format, source: 'zip', name: e.name }))
  },
}

/** An image part that could be the package's preview. */
function isCandidate(name: string): boolean {
  if (!/\.(png|jpe?g|bmp|gif)$/i.test(name)) return false
  return /thumbnail|preview/i.test(name) || /(?:^|\/)plate_\d+\.png$/i.test(name)
}

/**
 * Rank candidates: slicer plate renders first (the nicest preview), ordered by
 * plate number so a multi-plate list reads 1, 2, 3…; then a generic
 * thumbnail/preview part, then PNG, then the largest. Plate scores dominate the
 * others so a Bambu file's default is plate_1.
 */
function score(name: string, length: number): number {
  const lo = name.toLowerCase()
  const plate = lo.match(/(?:^|\/)plate_(\d+)\.png$/)
  // Index-ordered and far above any non-plate score (plate number dominates size).
  if (plate) return 1e13 - Number(plate[1]) * 1e6
  let s = length
  if (/thumbnail|preview/.test(lo)) s += 5e11
  if (/\.png$/.test(lo)) s += 1e9
  return s
}
