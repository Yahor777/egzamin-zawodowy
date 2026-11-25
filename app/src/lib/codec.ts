// Compact transfer code: JSON → deflate (CompressionStream, when the browser has it) → base64url,
// with a header and a checksum so a truncated or mistyped code gives a clear error.
//   INF2z-<crc8>-<payload>   compressed
//   INF2r-<crc8>-<payload>   not compressed (browser without CompressionStream)
// The old code of this app (plain base64 of the question progress) is still read by importCode.

export type CodecErrorKind = 'empty' | 'format' | 'checksum' | 'unzip' | 'json'
export class CodecError extends Error {
  kind: CodecErrorKind
  constructor(kind: CodecErrorKind, msg: string) {
    super(msg)
    this.kind = kind
  }
}

const HEAD = 'INF2'

export const canCompress = () => typeof CompressionStream !== 'undefined' && typeof DecompressionStream !== 'undefined'

const toB64url = (b: Uint8Array) => {
  let s = ''
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000))
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
const fromB64url = (t: string) => {
  const s = atob(t.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((t.length + 3) % 4))
  const b = new Uint8Array(s.length)
  for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i)
  return b
}

/** FNV-1a, 32 bit, as 8 hex digits */
export function checksum(s: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h.toString(16).padStart(8, '0')
}

async function pipe(bytes: Uint8Array, t: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const out = new Blob([bytes as BlobPart]).stream().pipeThrough(t as unknown as ReadableWritablePair<Uint8Array, Uint8Array>)
  return new Uint8Array(await new Response(out).arrayBuffer())
}

export async function encodeCode(data: unknown): Promise<string> {
  const raw = new TextEncoder().encode(JSON.stringify(data))
  if (canCompress()) {
    const z = await pipe(raw, new CompressionStream('deflate-raw'))
    const payload = toB64url(z)
    return `${HEAD}z-${checksum(payload)}-${payload}`
  }
  const payload = toB64url(raw)
  return `${HEAD}r-${checksum(payload)}-${payload}`
}

export type Decoded = { legacy: true; data: unknown } | { legacy: false; data: unknown }

export async function decodeCode(input: string): Promise<Decoded> {
  // copied from a chat or a note: spaces, line breaks, quotes, zero-width characters
  const code = input.replace(/[\s"'`“”«»​-‍﻿]/g, '')
  if (!code) throw new CodecError('empty', 'empty')
  const m = code.match(/^INF2([zr])-([0-9a-f]{8})-([A-Za-z0-9_-]+)$/)
  if (!m) {
    if (code.startsWith(HEAD)) throw new CodecError('format', 'header')
    // old format: base64 of the question progress JSON
    try {
      const json = decodeURIComponent(escape(atob(code)))
      return { legacy: true, data: JSON.parse(json) }
    } catch {
      throw new CodecError('format', 'not a code')
    }
  }
  const [, mode, crc, payload] = m
  if (checksum(payload) !== crc) throw new CodecError('checksum', 'checksum')
  let bytes: Uint8Array
  try {
    bytes = fromB64url(payload)
  } catch {
    throw new CodecError('format', 'base64')
  }
  if (mode === 'z') {
    if (!canCompress()) throw new CodecError('unzip', 'no DecompressionStream')
    try {
      bytes = await pipe(bytes, new DecompressionStream('deflate-raw'))
    } catch {
      throw new CodecError('unzip', 'inflate')
    }
  }
  try {
    return { legacy: false, data: JSON.parse(new TextDecoder().decode(bytes)) }
  } catch {
    throw new CodecError('json', 'json')
  }
}
