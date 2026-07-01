import { dwgExtractor } from './formats/dwg'
import { dxfExtractor } from './formats/dxf'
import { oleExtractor } from './formats/ole'
import { rhinoExtractor } from './formats/rhino'
import { solidworksModernExtractor } from './formats/solidworks-modern'
import { zipExtractor } from './formats/zip'
import type { FormatExtractor } from './types'

/**
 * Built-in extractors, tried in order. Magic-based ones (OLE, ZIP, Rhino, DWG)
 * come first; extension-gated ones (modern SolidWorks, DXF) last, since they
 * can't cheaply rule themselves out by content alone.
 */
export const builtinExtractors: readonly FormatExtractor[] = [
  oleExtractor,
  zipExtractor,
  rhinoExtractor,
  dwgExtractor,
  solidworksModernExtractor,
  dxfExtractor,
]

const custom: FormatExtractor[] = []

/**
 * Register an additional extractor. Custom extractors are tried after the
 * built-ins, in registration order. Returns a function that unregisters it.
 */
export function registerExtractor(extractor: FormatExtractor): () => void {
  custom.push(extractor)
  return () => {
    const i = custom.indexOf(extractor)
    if (i >= 0) custom.splice(i, 1)
  }
}

/** The full extractor chain: built-ins followed by any registered custom ones. */
export function allExtractors(): FormatExtractor[] {
  return [...builtinExtractors, ...custom]
}
