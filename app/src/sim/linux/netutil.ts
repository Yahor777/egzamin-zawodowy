// IPv4 helpers
export function ipToInt(ip: string): number | null {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(ip.trim())
  if (!m) return null
  const p = m.slice(1).map(Number)
  if (p.some((x) => x > 255)) return null
  return ((p[0] << 24) | (p[1] << 16) | (p[2] << 8) | p[3]) >>> 0
}
export function intToIp(n: number): string {
  return [n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join('.')
}
export function isIp(s: string): boolean {
  return ipToInt(s) !== null
}
export function prefixToMask(p: number): number {
  return p === 0 ? 0 : (0xffffffff << (32 - p)) >>> 0
}
export function maskToPrefix(mask: string): number | null {
  const n = ipToInt(mask)
  if (n === null) return null
  let p = 0
  while (p < 32 && n & (0x80000000 >>> p)) p++
  return prefixToMask(p) === n ? p : null
}
export function parseCidr(c: string): { ip: string; prefix: number; net: number; bcast: number } | null {
  const m = /^([\d.]+)\/(\d{1,2})$/.exec(c.trim())
  if (!m) return null
  const ipn = ipToInt(m[1])
  const prefix = +m[2]
  if (ipn === null || prefix > 32) return null
  const mask = prefixToMask(prefix)
  const net = (ipn & mask) >>> 0
  return { ip: m[1], prefix, net, bcast: (net | (~mask >>> 0)) >>> 0 }
}
export function inSubnet(ip: string, net: string, prefixOrMask: number | string): boolean {
  const a = ipToInt(ip)
  const n = ipToInt(net)
  const p = typeof prefixOrMask === 'number' ? prefixOrMask : maskToPrefix(prefixOrMask)
  if (a === null || n === null || p === null) return false
  const mask = prefixToMask(p)
  return ((a & mask) >>> 0) === ((n & mask) >>> 0)
}
export function macToLinkLocal(mac: string): string {
  const b = mac.split(':').map((x) => parseInt(x, 16))
  b[0] ^= 2
  const h = (x: number, y: number) => ((x << 8) | y).toString(16)
  return `fe80::${h(b[0], b[1])}:${h(b[2], 0xff)}:${h(0xfe, b[3])}:${h(b[4], b[5])}`
}
