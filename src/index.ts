import { allExtractors } from './registry'
import type { ExtractContext, Preview } from './types'

export type {
  ExtractContext,
  FormatExtractor,
  ImageFormat,
  Preview,
} from './types'
export { builtinExtractors, registerExtractor } from './registry'
export { imageSig, dibToBmp } from './util/image'

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
 * Extract the embedded preview image from a CAD/3D file, or null if none is
 * present. Tries each registered format extractor in turn and returns the first
 * hit. Dispatch is by file content (magic bytes) where possible, falling back to
 * the filename extension only for formats that need it.
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
  if (data.length < 8) return null
  const ctx: ExtractContext = {
    data,
    filename: opts.filename,
    lower: opts.filename ? opts.filename.toLowerCase() : '',
  }
  for (const extractor of allExtractors()) {
    if (!extractor.canHandle(ctx)) continue
    try {
      const preview = extractor.extract(ctx)
      if (preview) return preview
    } catch {
      // A malformed/misdetected file shouldn't crash the caller — try the next
      // extractor and ultimately fall back to null.
    }
  }
  return null
}
