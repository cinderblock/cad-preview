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
  // preview.name   -> identifier when the file has several (see below)
} else {
  // No embedded preview — fall back to an icon or a 3D render.
}
```

Pass `filename` whenever you have it: a couple of formats (notably modern
SolidWorks) have no reliable file magic and are recognized by extension.

### Multiple previews

Some files hold several previews — a Bambu Studio 3MF has one render per build
plate, a DWF has one per sheet, an OLE compound doc can carry several image
streams, a SketchUp file can embed scene previews. `extractPreviews` returns them
all, best-first; `extractPreview` returns just the first (the default pick).

```ts
import { extractPreviews } from 'cad-preview'

const all = extractPreviews(bytes, { filename: 'print.3mf' })
// -> [ { name: 'Metadata/plate_1.png', data, format, source },
//      { name: 'Metadata/plate_2.png', … }, … ]
// all[0] === extractPreview(...) ; use `name` to label a chooser.
```

## Supported formats

| Family | Extensions | How the preview is stored |
| --- | --- | --- |
| **SolidWorks (modern, ~2015+)** | `.sldprt` `.sldasm` `.slddrw` | Proprietary binary container; a 640×480 PNG stored as a raw-DEFLATE stream. Reverse-engineered — see below. |
| **SolidWorks (legacy, ≤2014)** | `.sldprt` `.sldasm` `.slddrw` | OLE compound document with a `PreviewPNG` stream or a headerless DIB `Preview` stream. |
| **Autodesk Inventor** | `.ipt` `.iam` | OLE compound document with a PNG embedded inside a stream. |
| **Solid Edge** | `.par` `.psm` `.asm` `.dft` | OLE compound document with a DIB thumbnail embedded in a stream / property set. |
| **Autodesk 3ds Max** | `.max` | OLE compound document with a DIB thumbnail. |
| **Autodesk Revit** | `.rvt` `.rfa` | OLE compound document with a `RevitPreview` PNG stream. |
| **Rhino 3DM** | `.3dm` | openNURBS preview chunk — a Windows DIB whose pixels are zlib-compressed (or, rarely, uncompressed). |
| **AutoCAD DWG** | `.dwg` | Preview-image section (header pointer → sentinel → entry table); a headerless DIB (R13–R2010) or PNG (R2013+). |
| **AutoCAD DXF** | `.dxf` | Optional `THUMBNAILIMAGE` section; a Windows DIB hex-encoded across group-code 310 lines. |
| **Blender** | `.blend` | `TEST` file-block holding a bottom-up RGBA thumbnail. Uncompressed, gzip-, and zstd-compressed (Blender 3.0+) files. |
| **SketchUp** | `.skp` | Version header immediately followed by the thumbnail as an embedded PNG. |
| **Autodesk DWF** | `.dwf` | ZIP behind a `(DWF V...` prefix; each ePlot sheet stores a rasterized PNG. |
| **3MF / FreeCAD / Fusion 360 / OPC ZIPs** | `.3mf` `.fcstd` `.f3d` | ZIP package with a `thumbnail`/`preview` image part. Includes slicer 3MF projects (e.g. Bambu Studio), whose render is `Metadata/plate_N.png`. |

The OLE compound-document family (legacy SolidWorks, Inventor, Solid Edge, 3ds
Max, Revit, …) is handled generically: any embedded PNG or Windows DIB
(BITMAPINFOHEADER / V4 / V5) in any stream is found and, if a DIB, transcoded to
PNG. So many OLE-based CAD formats work without a dedicated extractor.

Previews stored as a Windows DIB are transcoded to **PNG** on the way out, so
every result is a browser- and libvips/sharp-decodable image (never a raw BMP).
`Preview.format` tells you which.

Not every file contains a preview — e.g. a SolidWorks file saved with "save
preview graphics" off, or a raw geometry format (STL/STEP/OBJ/IGES) — in which
case `extractPreview` returns `null`.

### Roadmap

Raw geometry formats (STL, STEP, OBJ, IGES, Parasolid) embed no raster preview —
generating a thumbnail for those needs an actual 3D render, which is out of scope
for this (pure-parsing, no-GPU) library. New embedded-preview formats are welcome.

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
