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
 * with {@link registerExtractor}. Extractors are tried in order and the first
 * non-null result wins.
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
  /** Attempt extraction. Return the preview, or null if none is present. */
  extract(ctx: ExtractContext): Preview | null
}
