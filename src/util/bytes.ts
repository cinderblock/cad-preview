/** First index of the byte sequence `seq` in `buf` at or after `from`, or -1. */
export function indexOfSeq(
  buf: Uint8Array,
  seq: Uint8Array,
  from = 0,
): number {
  const last = buf.length - seq.length
  outer: for (let i = Math.max(0, from); i <= last; i++) {
    for (let j = 0; j < seq.length; j++) {
      if (buf[i + j] !== seq[j]) continue outer
    }
    return i
  }
  return -1
}

/** Coerce whatever a container library hands back into a Uint8Array, or null. */
export function toU8(content: unknown): Uint8Array | null {
  if (content instanceof Uint8Array) return content
  if (Array.isArray(content)) return Uint8Array.from(content as number[])
  return null
}
