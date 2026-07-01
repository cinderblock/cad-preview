import { describe, expect, test } from 'bun:test'
import * as CFB from 'cfb'
import { deflateSync, zipSync, zlibSync } from 'fflate'
import { dibToPng, extractPreview, registerExtractor } from '../src/index'

/** A byte blob that begins with the PNG signature (enough for content sniffing). */
function fakePng(size = 64): Uint8Array {
  const b = new Uint8Array(size)
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  for (let i = 8; i < size; i++) b[i] = (i * 37) & 0xff
  return b
}

/** A minimal headerless DIB (BITMAPINFOHEADER + pixels), optional length prefix. */
function fakeDib(withLenPrefix: boolean): Uint8Array {
  const w = 4
  const h = 4
  const bpp = 24
  const rowBytes = w * 3 // already a multiple of 4
  const pixels = rowBytes * h
  const dib = new Uint8Array(40 + pixels)
  const dv = new DataView(dib.buffer)
  dv.setUint32(0, 40, true) // biSize
  dv.setInt32(4, w, true)
  dv.setInt32(8, h, true)
  dv.setUint16(12, 1, true) // planes
  dv.setUint16(14, bpp, true)
  dv.setUint32(16, 0, true) // BI_RGB
  for (let i = 40; i < dib.length; i++) dib[i] = (i * 11) & 0xff
  if (!withLenPrefix) return dib
  const out = new Uint8Array(4 + dib.length)
  new DataView(out.buffer).setUint32(0, dib.length, true)
  out.set(dib, 4)
  return out
}

/** Build a Rhino-3DM-shaped buffer: banner + BITMAPINFOHEADER + zlib'd pixels. */
function fakeRhino(): Uint8Array {
  const w = 8
  const h = 8
  const bpp = 24
  const stride = (((w * bpp + 31) >> 5) << 2) >>> 0
  const need = stride * h
  const pixels = new Uint8Array(need)
  for (let i = 0; i < need; i++) pixels[i] = (i * 7) & 0xff
  const dibHeader = new Uint8Array(40)
  const dv = new DataView(dibHeader.buffer)
  dv.setUint32(0, 40, true)
  dv.setInt32(4, w, true)
  dv.setInt32(8, h, true)
  dv.setUint16(12, 1, true)
  dv.setUint16(14, bpp, true)
  dv.setUint32(16, 0, true) // BI_RGB header (pixels are stored zlib-compressed)
  const banner = new Uint8Array(32)
  banner.set(
    '3D Geometry File Format '.split('').map((c) => c.charCodeAt(0)),
  )
  const wrapper = Uint8Array.from([0, 0, 0, 0, 1, 0, 0, 0]) // openNURBS-ish gap
  const zlibbed = zlibSync(pixels)
  const out = new Uint8Array(
    banner.length + dibHeader.length + wrapper.length + zlibbed.length,
  )
  let p = 0
  for (const part of [banner, dibHeader, wrapper, zlibbed]) {
    out.set(part, p)
    p += part.length
  }
  return out
}

/** Build a modern-SolidWorks-shaped buffer: random header + magic + raw-DEFLATE. */
function fakeModernSw(image: Uint8Array): Uint8Array {
  const header = Uint8Array.from([
    0x26, 0xb1, 0x8b, 0xbf, 0x00, 0x00, 0x00, 0x04, 0x69, 0x14, 0x00, 0x06,
    0x00, 0x08, 0x00, 0xdf,
  ])
  const magic = Uint8Array.from([0x27, 0x56, 0x67, 0x96, 0x56, 0x77])
  const framing = Uint8Array.from([0x05, 0xe4, 0x74]) // seen before the stream
  const deflated = deflateSync(image) // raw DEFLATE, no zlib header
  const out = new Uint8Array(
    header.length + magic.length + framing.length + deflated.length,
  )
  let p = 0
  out.set(header, p)
  p += header.length
  out.set(magic, p)
  p += magic.length
  out.set(framing, p)
  p += framing.length
  out.set(deflated, p)
  return out
}

/** Build an OLE compound document containing the given streams. */
function fakeOle(streams: Record<string, Uint8Array>): Uint8Array {
  // cfb's util surface isn't fully typed; the calls themselves are simple.
  const utils = (CFB as unknown as { utils: any }).utils
  const cfb = utils.cfb_new()
  for (const [name, data] of Object.entries(streams)) {
    utils.cfb_add(cfb, '/' + name, Buffer.from(data))
  }
  return new Uint8Array(CFB.write(cfb, { type: 'buffer' }) as Uint8Array)
}

describe('extractPreview', () => {
  test('ZIP/OPC package (3MF-style thumbnail part)', () => {
    const png = fakePng()
    const zip = zipSync({
      '3D/model.3dmodel': new Uint8Array([1, 2, 3, 4, 5]),
      'Metadata/thumbnail.png': png,
    })
    const preview = extractPreview(zip, { filename: 'model.3mf' })
    expect(preview).not.toBeNull()
    expect(preview!.format).toBe('png')
    expect(preview!.source).toBe('zip')
    expect(preview!.data.length).toBe(png.length)
  })

  test('ZIP with no thumbnail part returns null', () => {
    const zip = zipSync({ 'model.stl': new Uint8Array([9, 8, 7, 6]) })
    expect(extractPreview(zip, { filename: 'x.3mf' })).toBeNull()
  })

  test('modern SolidWorks part (raw-DEFLATE PNG after stream magic)', () => {
    const png = fakePng(128)
    const buf = fakeModernSw(png)
    const preview = extractPreview(buf, { filename: 'Part1.SLDPRT' })
    expect(preview).not.toBeNull()
    expect(preview!.format).toBe('png')
    expect(preview!.source).toBe('solidworks-modern')
    expect(Array.from(preview!.data)).toEqual(Array.from(png))
  })

  test('modern SolidWorks assembly extension is recognized', () => {
    const buf = fakeModernSw(fakePng())
    expect(extractPreview(buf, { filename: 'Asm.sldasm' })?.source).toBe(
      'solidworks-modern',
    )
  })

  test('modern SolidWorks needs the filename (no reliable magic)', () => {
    const buf = fakeModernSw(fakePng())
    // Same bytes, but without a .sld* filename nothing should claim it.
    expect(extractPreview(buf)).toBeNull()
  })

  test('OLE with a PreviewPNG stream', () => {
    const png = fakePng(96)
    const ole = fakeOle({ PreviewPNG: png })
    const preview = extractPreview(ole, { filename: 'legacy.sldprt' })
    expect(preview).not.toBeNull()
    expect(preview!.format).toBe('png')
    expect(preview!.source).toBe('ole')
  })

  test('OLE with only a headerless-DIB Preview stream (decoded to PNG)', () => {
    const ole = fakeOle({ Preview: fakeDib(true) })
    const preview = extractPreview(ole, { filename: 'legacy.sldprt' })
    expect(preview).not.toBeNull()
    expect(preview!.format).toBe('png')
    expect(preview!.source).toBe('ole')
    expect(preview!.data[0]).toBe(0x89) // PNG signature
  })

  test('OLE with a PNG embedded mid-stream (Inventor-style)', () => {
    // Inventor stores the thumbnail PNG partway into an obfuscated-name stream,
    // preceded by a small header — not at offset 0.
    const png = fakePng(200)
    const stream = new Uint8Array(64 + png.length)
    for (let i = 0; i < 64; i++) stream[i] = (i * 13) & 0xff
    stream.set(png, 64)
    const ole = fakeOle({ Aaobf0scated1Name2Xy: stream })
    const preview = extractPreview(ole, { filename: 'part.ipt' })
    expect(preview).not.toBeNull()
    expect(preview!.format).toBe('png')
    expect(preview!.source).toBe('ole')
    expect(preview!.data[0]).toBe(0x89)
  })

  test('Fusion .f3d (ZIP with a Previews/ image part)', () => {
    const png = fakePng()
    const zip = zipSync({
      'FusionAssetName[Active]/Previews/small.png': png,
      'data.bin': new Uint8Array([1, 2, 3]),
    })
    expect(extractPreview(zip, { filename: 'design.f3d' })?.source).toBe('zip')
  })

  test('Rhino .3dm (zlib-compressed DIB preview)', () => {
    const preview = extractPreview(fakeRhino(), { filename: 'model.3dm' })
    expect(preview).not.toBeNull()
    expect(preview!.format).toBe('png')
    expect(preview!.source).toBe('rhino')
    expect(preview!.data[0]).toBe(0x89) // decoded to PNG
  })

  test('a bare DIB header with no pixel data is not mistaken for an image', () => {
    // 40-byte BITMAPINFOHEADER claiming 1024×528×24bpp but with no pixels — the
    // kind of coincidental match found scanning inside a container. Must be null.
    const fake = new Uint8Array(64)
    const dv = new DataView(fake.buffer)
    dv.setUint32(0, 40, true)
    dv.setInt32(4, 1024, true)
    dv.setInt32(8, 528, true)
    dv.setUint16(12, 1, true)
    dv.setUint16(14, 24, true)
    const ole = fakeOle({ Junk: fake })
    expect(extractPreview(ole, { filename: 'x.sldprt' })).toBeNull()
  })

  test('unknown bytes return null', () => {
    const junk = new Uint8Array(256).map((_, i) => (i * 7) & 0xff)
    expect(extractPreview(junk)).toBeNull()
    expect(extractPreview(junk, { filename: 'mystery.sldprt' })).toBeNull()
  })

  test('registerExtractor adds and unregisters a custom format', () => {
    const png = fakePng()
    const wrapped = new Uint8Array([0xaa, 0xbb, ...png])
    const unregister = registerExtractor({
      name: 'demo',
      canHandle: ({ lower }) => lower.endsWith('.demo'),
      extract: ({ data }) => ({
        data: data.subarray(2),
        format: 'png',
        source: 'demo',
      }),
    })
    expect(extractPreview(wrapped, { filename: 'a.demo' })?.source).toBe('demo')
    unregister()
    expect(extractPreview(wrapped, { filename: 'a.demo' })).toBeNull()
  })
})

describe('dibToPng', () => {
  test('decodes a bare DIB into a PNG', () => {
    const png = dibToPng(fakeDib(false))
    expect(png).not.toBeNull()
    // PNG signature
    expect(Array.from(png!.subarray(0, 8))).toEqual([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ])
  })

  test('rejects non-DIB bytes', () => {
    expect(dibToPng(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]))).toBeNull()
  })
})
