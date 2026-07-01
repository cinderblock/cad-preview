# cad-preview

Extract the **embedded preview/thumbnail image** from CAD and 3D files — in pure
JavaScript, on any machine. No SolidWorks, no eDrawings, no native libraries, no
cloud service. Works in the browser, Node, and Bun.

Many CAD/3D formats save a rendered preview inside the file. `cad-preview` finds
and returns it as ready-to-use image bytes (PNG/JPEG/BMP/GIF), so you can generate
thumbnails without opening the CAD program.

```ts
import { extractPreview } from 'cad-preview'

const bytes = new Uint8Array(await file.arrayBuffer())
const preview = extractPreview(bytes, { filename: file.name })

if (preview) {
  // preview.data  -> Uint8Array of image bytes
  // preview.format -> 'png' | 'jpeg' | 'bmp' | 'gif'
  // preview.source -> which extractor produced it
} else {
  // No embedded preview — fall back to an icon or a 3D render.
}
```

Pass `filename` whenever you have it: a couple of formats (notably modern
SolidWorks) have no reliable file magic and are recognized by extension.

## Supported formats

| Family | Extensions | How the preview is stored |
| --- | --- | --- |
| **SolidWorks (modern, ~2015+)** | `.sldprt` `.sldasm` `.slddrw` | Proprietary binary container; a 640×480 PNG stored as a raw-DEFLATE stream. Reverse-engineered — see below. |
| **SolidWorks (legacy, ≤2014)** | `.sldprt` `.sldasm` `.slddrw` | OLE compound document with a `PreviewPNG` stream or a headerless DIB `Preview` stream. |
| **Autodesk Inventor** | `.ipt` `.iam` | OLE compound document with a PNG embedded inside a stream. |
| **3MF / FreeCAD / Fusion 360 / OPC ZIPs** | `.3mf` `.fcstd` `.f3d` | ZIP package with a `thumbnail`/`preview` image part. |

Not every file contains a preview — e.g. a SolidWorks file saved with "save
preview graphics" off, or a raw geometry format (STL/STEP/OBJ/IGES) — in which
case `extractPreview` returns `null`.

### Roadmap

Formats that embed a preview and are candidates for future extractors (help
welcome): **AutoCAD DWG** (header preview pointer → BMP/PNG), **DXF**
(`THUMBNAILIMAGE` section → DIB), **Rhino 3DM** (openNURBS `TCODE_PREVIEWIMAGE`
chunk, often zlib-compressed), **SketchUp SKP**, **Blender `.blend`** (thumbnail
block), and **Solid Edge** (`.par`/`.psm`/`.asm`, OLE property-set DIB). Raw
geometry formats (STL, STEP, OBJ, IGES) embed no raster and need an actual 3D
render instead.

## Why this exists

The pre-2015 OLE SolidWorks preview has long been extractable (libgsf's
`gsf cat file.SLDPRT PreviewPNG`, the `cfb` package, or the Windows-only
Document Manager API). But SolidWorks switched to a **proprietary binary
container in 2015**, and there was no lightweight, cross-platform library to pull
the preview out of those files. The high entropy of the compressed internal
streams even leads people to assume the files are encrypted — they aren't. This
package documents and implements the extraction so any project can generate
SolidWorks thumbnails on Linux/macOS/Windows/in-browser.

## Extending

Add your own format without forking:

```ts
import { registerExtractor } from 'cad-preview'

registerExtractor({
  name: 'my-format',
  canHandle: ({ data, lower }) => lower.endsWith('.myext'),
  extract: ({ data }) => {
    const image = /* locate the embedded image */ null
    return image ? { data: image, format: 'png', source: 'my-format' } : null
  },
})
```

The roadmap is to cover **every 3D format that embeds a preview image**;
contributions of new extractors are welcome.

## Notes

- Dependencies: [`cfb`](https://www.npmjs.com/package/cfb) (OLE reader) and
  [`fflate`](https://www.npmjs.com/package/fflate) (DEFLATE) — both pure-JS and
  browser-safe.
- This is clean-room interoperability with a file's own embedded preview image.
  "SolidWorks", "Inventor", "Fusion", and "3MF" are trademarks of their
  respective owners; this project is not affiliated with or endorsed by them.

## License

MIT © Cameron Tacklind
