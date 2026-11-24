// Simple Fluent-like SVG icons drawn for the simulator (no Microsoft artwork).
import type { ReactNode } from 'react'

type P = { size?: number }
const S = ({ size = 24, children, vb = '0 0 32 32' }: { size?: number; children: ReactNode; vb?: string }) => (
  <svg width={size} height={size} viewBox={vb} aria-hidden="true" focusable="false">
    {children}
  </svg>
)

export const IcStart = ({ size = 24 }: P) => (
  <S size={size} vb="0 0 24 24">
    <defs>
      <linearGradient id="ic-st" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#3ccbf4" />
        <stop offset="1" stopColor="#0f6cbd" />
      </linearGradient>
    </defs>
    <rect x="2" y="2" width="9.4" height="9.4" rx="1" fill="url(#ic-st)" />
    <rect x="12.6" y="2" width="9.4" height="9.4" rx="1" fill="url(#ic-st)" />
    <rect x="2" y="12.6" width="9.4" height="9.4" rx="1" fill="url(#ic-st)" />
    <rect x="12.6" y="12.6" width="9.4" height="9.4" rx="1" fill="url(#ic-st)" />
  </S>
)

export const IcSearch = ({ size = 18 }: P) => (
  <S size={size} vb="0 0 24 24">
    <circle cx="10" cy="10" r="6.5" fill="none" stroke="currentColor" strokeWidth="2" />
    <path d="M15 15l6 6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
  </S>
)

export const IcFolder = ({ size = 24 }: P) => (
  <S size={size}>
    <path d="M3 8a2 2 0 0 1 2-2h7l3 3h12a2 2 0 0 1 2 2v1H3z" fill="#e8a817" />
    <path d="M3 11h26v13a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" fill="#ffc83d" />
    <path d="M3 11h26v2H3z" fill="#f5b81f" opacity=".6" />
  </S>
)

export const IcEdge = ({ size = 24 }: P) => (
  <S size={size}>
    <defs>
      <linearGradient id="ic-ed1" x1="0" y1="1" x2="1" y2="0">
        <stop offset="0" stopColor="#0c59a4" />
        <stop offset="1" stopColor="#1fa5e8" />
      </linearGradient>
      <linearGradient id="ic-ed2" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#35c1f1" />
        <stop offset="1" stopColor="#54d88a" />
      </linearGradient>
    </defs>
    <circle cx="16" cy="16" r="13" fill="url(#ic-ed1)" />
    <path d="M5 13c2-6 8-9 13-8 6 1 10 6 10 11 0 3-2 5-5 5h-7c-1 0-1.5-1-1-2 1-2-1-5-4-5-3 0-5 2-6 4z" fill="url(#ic-ed2)" />
    <path d="M9 19c0 5 4 8 8 8 3 0 5-1 7-3-4 1-8-1-9-4-.5-1.4-.3-2.6.4-3.6C12 15 9 16.5 9 19z" fill="#0a3d7a" opacity=".55" />
  </S>
)

export const IcCmd = ({ size = 24 }: P) => (
  <S size={size}>
    <rect x="3" y="5" width="26" height="22" rx="3" fill="#2b2b2b" />
    <rect x="3" y="5" width="26" height="4" rx="2" fill="#4a4a4a" />
    <path d="M8 14l4 3-4 3" fill="none" stroke="#e8e8e8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M14 21h8" stroke="#e8e8e8" strokeWidth="2" strokeLinecap="round" />
  </S>
)

export const IcTerminal = ({ size = 24 }: P) => (
  <S size={size}>
    <rect x="3" y="5" width="26" height="22" rx="3" fill="#1e1e1e" />
    <path d="M3 9a4 4 0 0 1 4-4h18a4 4 0 0 1 4 4v1H3z" fill="#5b5b5b" />
    <path d="M8 15l4 3-4 3" fill="none" stroke="#7fd4ff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M14 22h7" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
  </S>
)

export const IcPs = ({ size = 24 }: P) => (
  <S size={size}>
    <path d="M7 5h22l-4 22H3z" fill="#2671be" />
    <path d="M9 11l7 5-9 6" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M15 22h7" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" />
  </S>
)

export const IcSettings = ({ size = 24 }: P) => (
  <S size={size}>
    <path
      d="M16 3l2.2 3.2 3.8-.9.9 3.8L26 11.3l-1.6 3.5 1.6 3.5-3.1 2.2-.9 3.8-3.8-.9L16 27l-2.2-3.2-3.8.9-.9-3.8L6 18.7l1.6-3.5L6 11.7l3.1-2.4.9-3.8 3.8.9z"
      fill="#6b6b6b"
    />
    <circle cx="16" cy="15" r="5" fill="#f3f3f3" />
    <circle cx="16" cy="15" r="2.6" fill="#0f6cbd" />
  </S>
)

export const IcControl = ({ size = 24 }: P) => (
  <S size={size}>
    <rect x="3" y="5" width="26" height="20" rx="2.5" fill="#2f8bd8" />
    <rect x="5" y="7" width="22" height="16" rx="1.5" fill="#dff0ff" />
    <path d="M9 11h14M9 15h14M9 19h14" stroke="#7aa9d6" strokeWidth="1.6" />
    <circle cx="13" cy="11" r="2" fill="#f2a33a" />
    <circle cx="19" cy="15" r="2" fill="#4cb050" />
    <circle cx="11" cy="19" r="2" fill="#e05050" />
  </S>
)

export const IcFirewall = ({ size = 24 }: P) => (
  <S size={size}>
    <rect x="3" y="6" width="26" height="20" rx="1.5" fill="#c3532b" />
    <path d="M3 12.6h26M3 19.3h26M10 6v6.6M20 6v6.6M15 12.6v6.7M25 12.6v6.7M8 19.3V26M19 19.3V26" stroke="#f2c7a8" strokeWidth="1.3" />
    <circle cx="23" cy="22" r="6.5" fill="#2b7dd1" stroke="#fff" strokeWidth="1.3" />
    <path d="M16.6 22h12.8M23 15.5c-3 3.5-3 9.5 0 13M23 15.5c3 3.5 3 9.5 0 13" stroke="#fff" strokeWidth="1" fill="none" />
  </S>
)

export const IcTools = ({ size = 24 }: P) => (
  <S size={size}>
    <path d="M3 8a2 2 0 0 1 2-2h7l3 3h12a2 2 0 0 1 2 2v1H3z" fill="#3b78c3" />
    <path d="M3 11h26v13a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" fill="#5c9de0" />
    <path d="M19 14.5a3.4 3.4 0 0 0-4.2 4.2l-4.3 4.3 1.5 1.5 4.3-4.3a3.4 3.4 0 0 0 4.2-4.2l-2 2-1.5-1.5z" fill="#fff" />
  </S>
)

export const IcRun = ({ size = 24 }: P) => (
  <S size={size}>
    <rect x="3" y="6" width="26" height="20" rx="2" fill="#fff" stroke="#6b7c93" strokeWidth="1.4" />
    <rect x="3" y="6" width="26" height="4.5" rx="2" fill="#2f74c0" />
    <path d="M10 20l6-5 6 5" fill="none" stroke="#2f74c0" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
  </S>
)

export const IcPc = ({ size = 24 }: P) => (
  <S size={size}>
    <rect x="3" y="5" width="26" height="17" rx="2" fill="#2d7fd3" />
    <rect x="5" y="7" width="22" height="13" rx="1" fill="#7fc4ff" />
    <path d="M5 16l7-6 6 5 4-3 5 4v4H5z" fill="#4aa0ec" />
    <path d="M12 22h8l1 4h-10z" fill="#9aa6b5" />
    <rect x="9" y="26" width="14" height="2" rx="1" fill="#6f7c8c" />
  </S>
)

export const IcBin = ({ size = 24 }: P) => (
  <S size={size}>
    <path d="M7 9h18l-2 18a2 2 0 0 1-2 1.8H11A2 2 0 0 1 9 27z" fill="#d7e8f7" stroke="#7f9fbf" strokeWidth="1.2" />
    <path d="M6 7h20v2.5H6z" fill="#b5cde3" stroke="#7f9fbf" strokeWidth="1.2" />
    <path d="M12.5 13v11M16 13v11M19.5 13v11" stroke="#90aac4" strokeWidth="1.3" />
  </S>
)

export const IcUsers = ({ size = 24 }: P) => (
  <S size={size}>
    <circle cx="12" cy="11" r="5" fill="#4a8fd8" />
    <path d="M3 26c0-5 4-8 9-8s9 3 9 8z" fill="#4a8fd8" />
    <circle cx="22" cy="12" r="4" fill="#8bbdf0" />
    <path d="M17 26c.5-4 3-7 6-7 4 0 6 3 6 7z" fill="#8bbdf0" />
  </S>
)

export const IcUser = ({ size = 24 }: P) => (
  <S size={size}>
    <circle cx="16" cy="11" r="6" fill="#4a8fd8" />
    <path d="M5 28c0-6 5-10 11-10s11 4 11 10z" fill="#4a8fd8" />
  </S>
)

export const IcGroup = ({ size = 24 }: P) => (
  <S size={size}>
    <circle cx="10" cy="12" r="4" fill="#d8a64a" />
    <path d="M3 26c0-4 3-7 7-7s7 3 7 7z" fill="#d8a64a" />
    <circle cx="22" cy="12" r="4" fill="#4a8fd8" />
    <path d="M15 26c0-4 3-7 7-7s7 3 7 7z" fill="#4a8fd8" />
  </S>
)

export const IcSystem = ({ size = 24 }: P) => (
  <S size={size}>
    <rect x="4" y="5" width="24" height="16" rx="2" fill="#3b78c3" />
    <rect x="6" y="7" width="20" height="12" fill="#9fd0ff" />
    <path d="M11 21h10l1 4H10z" fill="#9aa6b5" />
    <rect x="8" y="25" width="16" height="2" rx="1" fill="#6f7c8c" />
  </S>
)

export const IcMgmt = ({ size = 24 }: P) => (
  <S size={size}>
    <rect x="3" y="6" width="20" height="14" rx="2" fill="#3b78c3" />
    <rect x="5" y="8" width="16" height="10" fill="#9fd0ff" />
    <path d="M10 20h6v3h-6z" fill="#9aa6b5" />
    <circle cx="24" cy="22" r="6" fill="#6b6b6b" />
    <circle cx="24" cy="22" r="2.3" fill="#e6e6e6" />
  </S>
)

/** Network connection tile icon (two monitors + cable) */
export function IcNic({ size = 48, state }: P & { state: 'ok' | 'off' | 'unplugged' | 'warn' }) {
  const dim = state === 'off'
  return (
    <S size={size} vb="0 0 48 48">
      <g opacity={dim ? 0.45 : 1} filter={dim ? 'grayscale(1)' : undefined}>
        <rect x="6" y="8" width="26" height="19" rx="2" fill={dim ? '#9aa1a9' : '#2d7fd3'} />
        <rect x="8" y="10" width="22" height="15" fill={dim ? '#d9dde2' : '#9fd0ff'} />
        <path d="M15 27h8l1 4h-10z" fill="#9aa6b5" />
        <rect x="12" y="31" width="14" height="2" rx="1" fill="#6f7c8c" />
        <path d="M30 34h6v6" fill="none" stroke={dim ? '#a0a0a0' : '#3a7d3a'} strokeWidth="2.5" />
        <rect x="31" y="38" width="10" height="6" rx="1" fill={dim ? '#b0b0b0' : '#4a9a4a'} />
      </g>
      {state === 'unplugged' && (
        <g>
          <circle cx="38" cy="14" r="8" fill="#d13438" />
          <path d="M34.5 10.5l7 7M41.5 10.5l-7 7" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" />
        </g>
      )}
      {state === 'warn' && (
        <g>
          <path d="M38 6l8 14H30z" fill="#f2b705" stroke="#8a6a00" strokeWidth=".8" />
          <path d="M38 11v5" stroke="#1b1b1b" strokeWidth="2" strokeLinecap="round" />
          <circle cx="38" cy="18" r="1.1" fill="#1b1b1b" />
        </g>
      )}
    </S>
  )
}

/** Tray network icon (Windows 10 style monitor, Windows 11 style globe for "no internet") */
export function IcTrayNet({ state, size = 18 }: { state: 'connected' | 'nointernet' | 'unplugged' | 'disabled'; size?: number }) {
  if (state === 'connected')
    return (
      <S size={size} vb="0 0 24 24">
        <rect x="3" y="4" width="18" height="12" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
        <path d="M9 20h6M12 16v4" stroke="currentColor" strokeWidth="1.6" />
      </S>
    )
  if (state === 'nointernet')
    return (
      <S size={size} vb="0 0 24 24">
        <circle cx="11" cy="11" r="8" fill="none" stroke="currentColor" strokeWidth="1.5" />
        <path d="M3 11h16M11 3c-3 3-3 13 0 16M11 3c3 3 3 13 0 16" fill="none" stroke="currentColor" strokeWidth="1.3" />
        <circle cx="18" cy="18" r="5.2" fill="#f7f7f7" />
        <path d="M18 14.6l3.4 6H14.6z" fill="#f2b705" />
        <path d="M18 16.4v2" stroke="#1b1b1b" strokeWidth="1.2" />
      </S>
    )
  return (
    <S size={size} vb="0 0 24 24">
      <rect x="3" y="4" width="18" height="12" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path d="M9 20h6M12 16v4" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="18" cy="17" r="5" fill="#d13438" />
      <path d="M16 15l4 4M20 15l-4 4" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" />
    </S>
  )
}

export const IcVolume = ({ size = 18 }: P) => (
  <S size={size} vb="0 0 24 24">
    <path d="M4 9h4l5-4v14l-5-4H4z" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    <path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </S>
)

export const IcPower = ({ size = 18 }: P) => (
  <S size={size} vb="0 0 24 24">
    <path d="M12 3v8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    <path d="M7 6.5a7.5 7.5 0 1 0 10 0" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
  </S>
)

export const IcShield = ({ size = 24, ok = true }: P & { ok?: boolean }) => (
  <S size={size}>
    <path d="M16 3l11 4v8c0 7-5 12-11 14C10 27 5 22 5 15V7z" fill={ok ? '#2e8b3a' : '#c42b1c'} />
    {ok ? <path d="M11 16l4 4 7-8" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" /> : <path d="M12 11l8 8M20 11l-8 8" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" />}
  </S>
)

export const IcCheck = ({ size = 14, on = true }: P & { on?: boolean }) =>
  on ? (
    <S size={size} vb="0 0 16 16">
      <circle cx="8" cy="8" r="7" fill="#2e8b3a" />
      <path d="M4.6 8.2l2.2 2.2 4.4-4.6" fill="none" stroke="#fff" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </S>
  ) : (
    <S size={size} vb="0 0 16 16">
      <circle cx="8" cy="8" r="6.5" fill="none" stroke="#9a9a9a" strokeWidth="1.2" />
    </S>
  )

export const IcBlock = ({ size = 14 }: P) => (
  <S size={size} vb="0 0 16 16">
    <circle cx="8" cy="8" r="7" fill="#c42b1c" />
    <path d="M4.5 8h7" stroke="#fff" strokeWidth="2" />
  </S>
)

export const IcInfo = ({ size = 32 }: P) => (
  <S size={size}>
    <circle cx="16" cy="16" r="13" fill="#0f6cbd" />
    <path d="M16 14v9" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" />
    <circle cx="16" cy="9.5" r="1.8" fill="#fff" />
  </S>
)
export const IcWarn = ({ size = 32 }: P) => (
  <S size={size}>
    <path d="M16 3l14 25H2z" fill="#f2b705" stroke="#9a7600" strokeWidth="1" strokeLinejoin="round" />
    <path d="M16 11v9" stroke="#1b1b1b" strokeWidth="2.6" strokeLinecap="round" />
    <circle cx="16" cy="24" r="1.7" fill="#1b1b1b" />
  </S>
)
export const IcError = ({ size = 32 }: P) => (
  <S size={size}>
    <circle cx="16" cy="16" r="13" fill="#c42b1c" />
    <path d="M11 11l10 10M21 11L11 21" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" />
  </S>
)
export const IcQuestion = ({ size = 32 }: P) => (
  <S size={size}>
    <circle cx="16" cy="16" r="13" fill="#0f6cbd" />
    <path d="M12.5 12.5a3.6 3.6 0 1 1 5.2 3.2c-1.1.6-1.7 1.4-1.7 2.6v.7" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" />
    <circle cx="16" cy="23.3" r="1.6" fill="#fff" />
  </S>
)

export const IcChevron = ({ size = 12, dir = 'right' }: P & { dir?: 'right' | 'left' | 'up' | 'down' }) => (
  <S size={size} vb="0 0 16 16">
    <path
      d={{ right: 'M6 3l5 5-5 5', left: 'M10 3L5 8l5 5', up: 'M3 10l5-5 5 5', down: 'M3 6l5 5 5-5' }[dir]}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </S>
)

export const IcEthernet = ({ size = 20 }: P) => (
  <S size={size} vb="0 0 24 24">
    <rect x="3" y="4" width="18" height="12" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
    <path d="M9 20h6M12 16v4" stroke="currentColor" strokeWidth="1.6" />
  </S>
)

export const IcGlobe = ({ size = 20 }: P) => (
  <S size={size} vb="0 0 24 24">
    <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="1.5" />
    <path d="M3 12h18M12 3c-3.5 3.5-3.5 14.5 0 18M12 3c3.5 3.5 3.5 14.5 0 18" fill="none" stroke="currentColor" strokeWidth="1.3" />
  </S>
)

export const IcDrive = ({ size = 32 }: P) => (
  <S size={size}>
    <rect x="3" y="11" width="26" height="12" rx="2" fill="#c9ced6" stroke="#7d8794" />
    <rect x="5" y="17" width="16" height="3" rx="1" fill="#0f6cbd" />
    <circle cx="25" cy="18.5" r="1.4" fill="#3fbf3f" />
    <path d="M9 9l3-3 3 3" fill="none" stroke="#2f74c0" strokeWidth="0" />
  </S>
)
