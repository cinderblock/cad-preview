import type { FormatExtractor, Preview } from '../types'
import { scanZipImages } from '../util/zipscan'

// DWF files begin with an ASCII banner "(DWF V06.00)" etc.
const DWF_MAGIC = Uint8Array.from('(DWF V'.split('').map((c) => c.charCodeAt(0)))

/**
 * Autodesk DWF (Design Web Format). It's a ZIP behind a "(DWF V..." ASCII prefix,
 * but its streaming entries trip strict ZIP readers, so we walk local file
 * headers manually. Each ePlot sheet stores a rasterized PNG; we return the first
 * one as the preview. Verified on a real DWF 6 (2D architectural sheet).
 */
export const dwfExtractor: FormatExtractor = {
  name: 'dwf',
  canHandle: ({ data }) => {
    if (data.length < DWF_MAGIC.length) return false
    for (let i = 0; i < DWF_MAGIC.length; i++) {
      if (data[i] !== DWF_MAGIC[i]) return false
    }
    return true
  },
  extract: ({ data }): Preview | null => {
    const images = scanZipImages(data)
    if (!images.length) return null
    const pick = images.find((e) => e.format === 'png') ?? images[0]
    return { data: pick.data, format: pick.format, source: 'dwf' }
  },
}
