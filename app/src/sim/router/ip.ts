// Small IPv4 / MAC helpers shared by the router and switch simulators.

/** Parses dotted-quad IPv4 into an unsigned 32-bit number, or null when invalid. */
export function parseIp(s: string): number | null {
  const t = s.trim()
  const parts = t.split('.')
  if (parts.length !== 4) return null
  let n = 0
  for (const p of parts) {
    if (!/^\d{1,3}$/.test(p)) return null
    const v = Number(p)
    if (v > 255) return null
    n = n * 256 + v
  }
  return n >>> 0
}

export function ipToStr(n: number): string {
  const u = n >>> 0
  return [u >>> 24, (u >>> 16) & 255, (u >>> 8) & 255, u & 255].join('.')
}

export function isIp(s: string): boolean {
  return parseIp(s) !== null
}

/** Number of prefix bits of a contiguous mask, or null when the mask is invalid. */
export function maskBits(mask: string): number | null {
  const m = parseIp(mask)
  if (m === null) return null
  // contiguous: inverted mask + 1 must be a power of two
  const inv = ~m >>> 0
  if (((inv + 1) & inv) >>> 0 !== 0) return null
  let bits = 0
  for (let i = 31; i >= 0; i--) if ((m >>> i) & 1) bits++
  return bits
}

/** Valid subnet mask for a host interface (/1 .. /30 — 255.255.255.255 and 0.0.0.0 rejected). */
export function isValidMask(mask: string): boolean {
  const b = maskBits(mask)
  return b !== null && b >= 1 && b <= 30
}

export function maskFromBits(bits: number): number {
  return bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0
}

export function networkOf(ip: number, mask: number): number {
  return (ip & mask) >>> 0
}

export function broadcastOf(ip: number, mask: number): number {
  return ((ip & mask) | (~mask >>> 0)) >>> 0
}

/** True when ip is usable as a unicast host address in its subnet (not network/broadcast, not 0/127/multicast). */
export function isHostIn(ipS: string, maskS: string): boolean {
  const ip = parseIp(ipS)
  const m = parseIp(maskS)
  if (ip === null || m === null) return false
  const first = ip >>> 24
  if (first === 0 || first === 127 || first >= 224) return false
  if (ip === networkOf(ip, m) || ip === broadcastOf(ip, m)) return false
  return true
}

export function sameSubnet(a: string, b: string, mask: string): boolean {
  const x = parseIp(a)
  const y = parseIp(b)
  const m = parseIp(mask)
  if (x === null || y === null || m === null) return false
  return networkOf(x, m) === networkOf(y, m)
}

/** Do two networks overlap? (compared with the shorter of the two masks) */
export function subnetsOverlap(ipA: string, maskA: string, ipB: string, maskB: string): boolean {
  const ba = maskBits(maskA)
  const bb = maskBits(maskB)
  const a = parseIp(ipA)
  const b = parseIp(ipB)
  if (ba === null || bb === null || a === null || b === null) return false
  const m = maskFromBits(Math.min(ba, bb))
  return networkOf(a, m) === networkOf(b, m)
}

/** Moves `ip` into the subnet of newIp/newMask keeping its host part (as TP-Link does with the DHCP pool). */
export function shiftIntoSubnet(ipS: string, newIpS: string, newMaskS: string): string {
  const ip = parseIp(ipS)
  const n = parseIp(newIpS)
  const m = parseIp(newMaskS)
  if (ip === null || n === null || m === null) return ipS
  return ipToStr((networkOf(n, m) | (ip & ~m)) >>> 0)
}

export function cmpIp(a: string, b: string): number {
  return (parseIp(a) ?? 0) - (parseIp(b) ?? 0)
}

/** Empty or 0.0.0.0 counts as "not set". */
export function isUnset(s: string): boolean {
  const t = s.trim()
  return t === '' || t === '0.0.0.0'
}

/** Accepts XX-XX-XX-XX-XX-XX or XX:XX:XX:XX:XX:XX; returns upper-case dashed form or null. */
export function normalizeMac(s: string): string | null {
  const t = s.trim()
  if (!/^[0-9a-fA-F]{2}([-:])[0-9a-fA-F]{2}(\1[0-9a-fA-F]{2}){4}$/.test(t)) return null
  const mac = t.toUpperCase().replace(/:/g, '-')
  const firstByte = parseInt(mac.slice(0, 2), 16)
  if (firstByte & 1) return null // multicast / broadcast
  if (mac === '00-00-00-00-00-00') return null
  return mac
}

export function addIp(ipS: string, delta: number): string {
  const ip = parseIp(ipS)
  return ip === null ? ipS : ipToStr((ip + delta) >>> 0)
}
