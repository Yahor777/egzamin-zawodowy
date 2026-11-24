import type { Question } from './types'
import { shuffle } from './bank'

const rnd = (a: number, b: number) => a + Math.floor(Math.random() * (b - a + 1))
const pick = <T,>(arr: T[]) => arr[Math.floor(Math.random() * arr.length)]

const ipStr = (n: number) => [24, 16, 8, 0].map((s) => (n >>> s) & 255).join('.')
const maskOf = (p: number) => (p === 0 ? 0 : (0xffffffff << (32 - p)) >>> 0)

function make(stem: string, correct: string, wrong: string[], expl: { pl: string; ru: string }, topic: string, ru?: string): Question {
  const uniq = [...new Set(wrong.filter((w) => w !== correct))].slice(0, 3)
  while (uniq.length < 3) uniq.push(correct + '?'.repeat(uniq.length + 1))
  const answers = shuffle([correct, ...uniq])
  return {
    id: 'gen-' + Math.random().toString(36).slice(2),
    stem,
    answers,
    correct: answers.indexOf(correct),
    figures: [],
    imageAnswers: false,
    topics: [topic],
    seen: [],
    year: 2026,
    expl,
    ru: ru ? { stem: ru, answers } : undefined,
    generated: true,
  }
}

function randomHost() {
  const first = pick([10, 172, 192, rnd(11, 223)])
  return ((first << 24) | (rnd(0, 255) << 16) | (rnd(0, 255) << 8) | rnd(1, 254)) >>> 0
}

export function genSubnet(): Question {
  const prefix = rnd(18, 30)
  const ip = randomHost()
  const mask = maskOf(prefix)
  const net = (ip & mask) >>> 0
  const bc = (net | (~mask >>> 0)) >>> 0
  const hosts = 2 ** (32 - prefix) - 2
  const block = 2 ** (32 - prefix)
  const kind = rnd(0, 3)
  const octet = prefix >= 24 ? 4 : prefix >= 16 ? 3 : 2
  const blockInOctet = 2 ** ((32 - prefix) % 8 || 8)
  const explBase = {
    pl: `Prefiks /${prefix} → maska ${ipStr(mask)}. W ${octet}. oktecie krok (rozmiar bloku) = ${blockInOctet}. Sieć: ${ipStr(net)}, rozgłoszeniowy: ${ipStr(bc)}, hostów: 2^${32 - prefix} − 2 = ${hosts}.`,
    ru: `Префикс /${prefix} → маска ${ipStr(mask)}. В ${octet}-м октете шаг (размер блока) = ${blockInOctet}. Сеть: ${ipStr(net)}, broadcast: ${ipStr(bc)}, хостов: 2^${32 - prefix} − 2 = ${hosts}.`,
  }
  if (kind === 0)
    return make(
      `Jaki jest adres sieci, do której należy host ${ipStr(ip)}/${prefix}?`,
      ipStr(net),
      [ipStr((net + block) >>> 0), ipStr((net - block) >>> 0), ipStr(bc), ipStr((net + 1) >>> 0)],
      explBase,
      'addressing',
      `Какой адрес сети, к которой принадлежит хост ${ipStr(ip)}/${prefix}?`,
    )
  if (kind === 1)
    return make(
      `Wskaż adres rozgłoszeniowy sieci, do której należy host ${ipStr(ip)}/${prefix}.`,
      ipStr(bc),
      [ipStr((bc - 1) >>> 0), ipStr(net), ipStr((bc + block) >>> 0), ipStr((bc - block) >>> 0)],
      explBase,
      'addressing',
      `Укажи широковещательный адрес сети, к которой принадлежит хост ${ipStr(ip)}/${prefix}.`,
    )
  if (kind === 2)
    return make(
      `Ile maksymalnie adresów hostów można przydzielić w sieci ${ipStr(net)}/${prefix}?`,
      String(hosts),
      [String(hosts + 2), String(hosts + 1), String(Math.max(2, hosts / 2 - 1)), String(hosts * 2)],
      explBase,
      'addressing',
      `Сколько максимум адресов хостов можно назначить в сети ${ipStr(net)}/${prefix}?`,
    )
  return make(
    `Maska /${prefix} zapisana dziesiętnie to`,
    ipStr(mask),
    [ipStr(maskOf(prefix - 1)), ipStr(maskOf(Math.min(32, prefix + 1))), ipStr(maskOf(prefix - 8 > 0 ? prefix - 8 : prefix + 2))],
    {
      pl: `/${prefix} = ${prefix} jedynek od lewej: ${ipStr(mask)}. Zapamiętaj wartości oktetu: 128, 192, 224, 240, 248, 252, 254, 255.`,
      ru: `/${prefix} = ${prefix} единиц слева: ${ipStr(mask)}. Запомни значения октета: 128, 192, 224, 240, 248, 252, 254, 255.`,
    },
    'addressing',
    `Маска /${prefix} в десятичной записи —`,
  )
}

const toBase = (n: number, b: number) => n.toString(b).toUpperCase()

export function genNumber(): Question {
  const kind = rnd(0, 4)
  const n = rnd(17, 255)
  const near = [n + 1, n - 1, n + 16, n - 16, n + 2, n ^ 8].filter((x) => x > 0)
  if (kind === 0)
    return make(
      `Liczba (${toBase(n, 16)})₁₆ zapisana w systemie dziesiętnym ma wartość`,
      String(n),
      near.map(String),
      {
        pl: `${toBase(n, 16)}₁₆ = ${Math.floor(n / 16)}·16 + ${n % 16} = ${n}. Litery: A=10, B=11, C=12, D=13, E=14, F=15.`,
        ru: `${toBase(n, 16)}₁₆ = ${Math.floor(n / 16)}·16 + ${n % 16} = ${n}. Буквы: A=10, B=11, C=12, D=13, E=14, F=15.`,
      },
      'basics',
      `Число (${toBase(n, 16)})₁₆ в десятичной системе равно`,
    )
  if (kind === 1)
    return make(
      `Liczba dziesiętna ${n} zapisana w systemie binarnym to`,
      toBase(n, 2),
      near.map((x) => toBase(x, 2)),
      {
        pl: `Rozkład na potęgi 2: ${[128, 64, 32, 16, 8, 4, 2, 1].filter((p) => n & p).join(' + ')} = ${n} → ${toBase(n, 2).padStart(8, '0')}.`,
        ru: `Раскладываем по степеням 2: ${[128, 64, 32, 16, 8, 4, 2, 1].filter((p) => n & p).join(' + ')} = ${n} → ${toBase(n, 2).padStart(8, '0')}.`,
      },
      'basics',
      `Десятичное число ${n} в двоичной системе —`,
    )
  if (kind === 2)
    return make(
      `Liczba binarna ${toBase(n, 2)} zapisana w systemie szesnastkowym to`,
      toBase(n, 16),
      near.map((x) => toBase(x, 16)),
      {
        pl: `Dziel bity na czwórki od prawej: ${toBase(n, 2).padStart(8, '0').replace(/(.{4})/, '$1 ')} → ${toBase(n, 16)}.`,
        ru: `Делим биты на четвёрки справа: ${toBase(n, 2).padStart(8, '0').replace(/(.{4})/, '$1 ')} → ${toBase(n, 16)}.`,
      },
      'basics',
      `Двоичное число ${toBase(n, 2)} в шестнадцатеричной системе —`,
    )
  if (kind === 3)
    return make(
      `Liczba (${toBase(n, 8)})₈ zapisana w systemie dziesiętnym ma wartość`,
      String(n),
      near.map(String),
      {
        pl: `Każda cyfra ósemkowa to potęga 8: ${toBase(n, 8).split('').map((d, i, a) => `${d}·8^${a.length - 1 - i}`).join(' + ')} = ${n}.`,
        ru: `Каждая восьмеричная цифра — степень 8: ${toBase(n, 8).split('').map((d, i, a) => `${d}·8^${a.length - 1 - i}`).join(' + ')} = ${n}.`,
      },
      'basics',
      `Число (${toBase(n, 8)})₈ в десятичной системе равно`,
    )
  // two's complement (U2) of a negative 8-bit number
  const v = -rnd(1, 127)
  const u2 = ((v + 256) & 255).toString(2).padStart(8, '0')
  return make(
    `Liczba ${v} zapisana w kodzie U2 na 8 bitach to`,
    u2,
    [(-v).toString(2).padStart(8, '0'), ('1' + (-v).toString(2).padStart(7, '0')), (((v + 255) & 255).toString(2).padStart(8, '0'))],
    {
      pl: `U2: zapisz |${v}| = ${(-v).toString(2).padStart(8, '0')}, odwróć bity i dodaj 1 → ${u2}.`,
      ru: `U2: запиши |${v}| = ${(-v).toString(2).padStart(8, '0')}, инвертируй биты и прибавь 1 → ${u2}.`,
    },
    'basics',
    `Число ${v} в коде U2 (дополнительном) на 8 битах —`,
  )
}

const rwx = (d: number) => (d & 4 ? 'r' : '-') + (d & 2 ? 'w' : '-') + (d & 1 ? 'x' : '-')

export function genChmod(): Question {
  const digits = [rnd(4, 7), rnd(0, 7), rnd(0, 7)]
  const num = digits.join('')
  const sym = digits.map(rwx).join('')
  const alt = (k: number) => {
    const d = [...digits]
    d[k] = d[k] ^ pick([1, 2, 4])
    return d
  }
  const expl = {
    pl: `r=4, w=2, x=1. ${digits.map((d) => `${rwx(d)} = ${d}`).join(', ')} → ${num} (właściciel, grupa, pozostali).`,
    ru: `r=4, w=2, x=1. ${digits.map((d) => `${rwx(d)} = ${d}`).join(', ')} → ${num} (владелец, группа, остальные).`,
  }
  if (Math.random() < 0.5)
    return make(
      `Które uprawnienia nada plikowi polecenie chmod ${num} plik?`,
      sym,
      [0, 1, 2, 1].map((k) => alt(k).map(rwx).join('')),
      expl,
      'linux',
      `Какие права даст файлу команда chmod ${num} plik?`,
    )
  return make(
    `Uprawnienia ${sym} zapisane w notacji ósemkowej (liczbowej) to`,
    num,
    [0, 1, 2, 2].map((k) => alt(k).join('')),
    expl,
    'linux',
    `Права ${sym} в восьмеричной (числовой) записи —`,
  )
}

export const GENERATORS = {
  subnet: { fn: genSubnet, icon: '🔢', pl: 'Podsieci i maski', ru: 'Подсети и маски' },
  number: { fn: genNumber, icon: '➗', pl: 'Systemy liczbowe i U2', ru: 'Системы счисления и U2' },
  chmod: { fn: genChmod, icon: '🐧', pl: 'Uprawnienia chmod', ru: 'Права chmod' },
} as const
export type GenId = keyof typeof GENERATORS
