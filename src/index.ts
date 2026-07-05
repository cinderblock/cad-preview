import { allExtractors } from './registry'
import type { ExtractContext, Preview } from './types'

export type {
  ExtractContext,
  FormatExtractor,
  ImageFormat,
  Preview,
} from './types'
export { builtinExtractors, registerExtractor } from './registry'
export { imageSig, findEmbeddedImage } from './util/image'
export { dibToPng } from './util/dib'

/** Options for {@link extractPreview}. */
export interface ExtractOptions {
  /**
   * Original filename. Only needed for formats that have no file magic to
   * dispatch on (currently modern SolidWorks .sld* files) — pass it whenever you
   * have it so those files are recognized.
   */
  filename?: string
}

/**
 * Extract every embedded preview from a CAD/3D file, best-first (empty array if
 * none). Some formats hold several — e.g. a Bambu Studio 3MF has one render per
 * build plate, a DWF has one per sheet, an OLE compound doc can carry several
 * image streams, a SketchUp file can embed scene previews. The first element is
 * the same one {@link extractPreview} returns; use {@link Preview.name} to tell
 * them apart.
 *
 * Dispatch is by file content (magic bytes) where possible, falling back to the
 * filename extension only for formats that need it; the first extractor that
 * yields at least one preview wins.
 *
 * @example
 * const all = extractPreviews(bytes, { filename: 'print.3mf' })
 * // -> [{ name: 'Metadata/plate_1.png', … }, { name: 'Metadata/plate_2.png', … }]
 */
export function extractPreviews(
  data: Uint8Array,
  opts: ExtractOptions = {},
): Preview[] {
  if (data.length < 8) return []
  const ctx: ExtractContext = {
    data,
    filename: opts.filename,
    lower: opts.filename ? opts.filename.toLowerCase() : '',
  }
  for (const extractor of allExtractors()) {
    if (!extractor.canHandle(ctx)) continue
    try {
      const previews = extractor.extract(ctx)
      if (previews.length) return previews
    } catch {
      // A malformed/misdetected file shouldn't crash the caller — try the next
      // extractor and ultimately fall back to an empty list.
    }
  }
  return []
}

/**
 * Extract the single best embedded preview image from a CAD/3D file, or null if
 * none is present — the default pick when a file has several (see
 * {@link extractPreviews} for all of them).
 *
 * The returned bytes are a ready-to-use raster image (PNG/JPEG/BMP/GIF); check
 * {@link Preview.format} for which. No native tools or CAD software required —
 * pure JS, safe in the browser, Node, and Bun.
 *
 * @example
 * const preview = extractPreview(bytes, { filename: 'part.sldprt' })
 * if (preview) await sharp(preview.data).resize(256).webp().toFile('t.webp')
 */
export function extractPreview(
  data: Uint8Array,
  opts: ExtractOptions = {},
): Preview | null {
  return extractPreviews(data, opts)[0] ?? null
}
