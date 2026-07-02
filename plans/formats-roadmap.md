# cad-preview — formats roadmap / progress

Plan path: `plans/formats-roadmap.md`

## Goal

Extract embedded previews for as many CAD/3D formats as have a real, verifiable
embedded raster. Verify-first: get a real sample, confirm the extracted image
renders (sharp), THEN ship the extractor + a synthetic test.

## Done (verified on real files)

SolidWorks modern + legacy · Inventor · Rhino 3DM · AutoCAD DWG · AutoCAD DXF ·
Blender (uncompressed) · SketchUp · 3MF · Fusion 360.

## This round ("try harder") — results

- [x] **FreeCAD `.FCStd`** — verified on a real file (PartDesignExample.FCStd →
      256×256 PNG via the zip extractor). Was correct all along.
- [x] **Solid Edge** `.par/.psm/.asm` — already works via the OLE extractor
      (findEmbeddedImage finds the DIB thumbnail in an obfuscated stream). Verified
      on real par/psm/asm → 243×178 machined-part thumbnails. No new code needed.
- [x] **3ds Max `.max`** — already works via OLE (DIB thumbnail). Verified.
- [x] **Autodesk Revit `.rvt`** — already works via OLE (`RevitPreview4.0` PNG
      stream). Verified → 128×128 building preview.
- [x] **gzip `.blend`** — added `gunzipSync` path to the Blender extractor.
      Verified by gzipping a real .blend.
- [x] **zstd `.blend`** (Blender 3.0+) — my "seekable multi-frame, too hard" guess
      was WRONG (verify, don't assert). `fzstd.decompress` handles a real Blender
      4.03 zstd file in one call. Added fzstd + the zstd branch. Verified on
      download.blender.org/demo/geometry-nodes/gizmo_array.blend → 128×70 thumb.
- [x] Hardened `findEmbeddedImage` to match BITMAPV4/V5 DIB headers (108/124),
      not just biSize 40.
- [ ] **DWF** — DEFERRED. `(DWF V06.00)` prefix + a ZIP payload, but the ZIP uses
      a non-standard compression method fflate rejects ("unknown compression type
      25956"). Legacy/niche; skipped. No clean `.dwfx` sample found.

## Findings

- The generic OLE + ZIP extractors already covered Solid Edge, 3ds Max, Revit,
  and FreeCAD — the registry/"scan any embedded PNG or validated DIB" design meant
  four more formats worked with zero new extractor code (just needed verifying +
  documenting + the V4/V5 header hardening).
- DWG/Solid Edge/3ds Max carry BITMAPV4 (biSize 108) and V5 (124) DIB headers, not
  only the classic 40-byte one — hence the findEmbeddedImage broadening.
- Real sample files live in `~/Downloads/_samples/` (scratch, deletable).

## Things not to do

- Don't ship an extractor without verifying on a real file (two false starts
  already: the "encrypted" SolidWorks misread, and the Rhino DIB false-positive).
- Don't commit proprietary sample files. Tests use synthetic fixtures.
