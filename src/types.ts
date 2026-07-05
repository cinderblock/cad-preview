/** A detected raster image type, keyed by its byte signature. */
export type ImageFormat = 'png' | 'jpeg' | 'bmp' | 'gif'

/** The extracted preview image and where it came from. */
export interface Preview {
  /** Raw image bytes, ready to hand to an encoder, `<img>`, or file. */
  data: Uint8Array
  /** Image type, detected from the bytes (not the filename). */
  format: ImageFormat
  /** Name of the extractor that produced it (e.g. "solidworks-modern"). */
  source: string
  /**
   * Identifier for this specific preview within the file, when the file holds
   * several — e.g. an internal part/stream name like "Metadata/plate_1.png" or a
   * synthetic label like "sheet-2". Lets callers tell multiple previews apart and
   * label a chooser. Undefined when the extractor doesn't distinguish them.
   */
  name?: string
}

/** Everything an extractor needs to inspect a candidate file. */
export interface ExtractContext {
  /** The whole file. */
  data: Uint8Array
  /** Original filename, if known — used only where a format has no file magic. */
  filename?: string
  /** `filename` lowercased (empty string if none), for cheap extension checks. */
  lower: string
}

/**
 * A single-format preview extractor. Built-ins live in the registry; add your own
 * with {@link registerExtractor}. Extractors are tried in order and the first one
 * that yields at least one preview wins.
 */
export interface FormatExtractor {
  /** Stable identifier, surfaced as {@link Preview.source}. */
  name: string
  /**
   * Cheap gate — return true only if this extractor might handle the input
   * (typically a magic-byte or extension check). Keeps `extract` off the hot path
   * for files it can't handle.
   */
  canHandle(ctx: ExtractContext): boolean
  /**
   * Extract every preview the file contains, best-first (empty array if none).
   * `extractPreview` returns the first element; `extractPreviews` returns the
   * whole list. Most formats yield one; some (3MF/Bambu plates, DWF sheets, OLE
   * streams, SketchUp scenes) yield several.
   */
  extract(ctx: ExtractContext): Preview[]
}
