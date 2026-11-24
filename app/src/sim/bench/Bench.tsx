// "Стол" — the physical workbench: devices with power/reboot/reset, front panels with
// port LEDs, and patch cables (tap port A, then port B; tap a plugged port to pick its cable).
import { useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { useLang } from '../../lib/store'
import { ipConflicts, linkUp, pcAddress, type DeviceKey, type Link, type PcState } from '../net'
import { linksMatch } from '../labs/labs'
import type { LabSave } from '../labs/ctx'
import { DEV_PL, DEV_RU } from './diagnose'
import { benchDevices, portLabel, portsOf } from './ports'
import type { BenchLab, Station } from './station'
import { useCompact } from './useCompact'
import './bench.css'

const CABLE_COLORS = ['#2f6fd0', '#2e8b57', '#c7772a', '#8a56b8', '#1f8f99', '#b0505a', '#6d7a2e', '#5a6470']

export function Bench({
  lab,
  s,
  st,
  realistic,
  onLinks,
  onOpenPc,
}: {
  lab: BenchLab
  s: LabSave
  st: Station
  realistic: boolean
  onLinks: (l: Link[]) => void
  onOpenPc?: () => void
}) {
  const lang = useLang()
  const ru = lang === 'ru'
  const ref = useRef<HTMLDivElement>(null)
  const compact = useCompact(ref)
  const [pick, setPick] = useState<string | null>(null)
  const [sel, setSel] = useState<number | null>(null)
  const [msg, setMsg] = useState('')
  const links = s.links
  const name = (d: DeviceKey) => (ru ? DEV_RU : DEV_PL)[d]
  const full = (p: string) => `${name(p.split(':')[0] as DeviceKey)} ${portLabel(p)}`
  const cableIdx = (p: string) => links.findIndex(([a, b]) => a === p || b === p)

  const tapPort = (p: string) => {
    setMsg('')
    const ci = cableIdx(p)
    if (ci >= 0) {
      setPick(null)
      setSel(sel === ci ? null : ci)
      return
    }
    setSel(null)
    if (!pick) return setPick(p)
    if (pick === p) return setPick(null)
    const da = pick.split(':')[0]
    if (da === p.split(':')[0] && da !== 'switch') {
      setMsg(ru ? 'Кабель между портами одного устройства не нужен — выбери порт другого устройства.' : 'Wybierz port innego urządzenia.')
      return setPick(p)
    }
    onLinks([...links, [pick, p]])
    setPick(null)
  }
  const unplug = (i: number) => {
    onLinks(links.filter((_, k) => k !== i))
    setSel(null)
  }

  const devices = benchDevices(lab, s)
  const conflicts = ipConflicts(st.model)
  const anyPc = s.pc ? 'pc' : s.laptop ? 'laptop' : null

  return (
    <div ref={ref} className={`bench ${compact ? 'bd-compact' : ''}`}>
      {conflicts.map((c) => (
        <div key={c.ip} className="bd-note warn" role="status">
          <strong>{ru ? `Конфликт адресов ${c.ip}` : `Konflikt adresów ${c.ip}`}</strong>
          <span>
            {ru
              ? `${c.devices.map(name).join(' и ')} в одной сети и оба имеют адрес ${c.ip} (так у TP-Link с завода). Браузер будет открывать то одно, то другое. Настраивай по одному: сначала подключи к ПК только свитч и смени ему адрес, потом роутер.`
              : `${c.devices.map(name).join(' i ')} mają ten sam adres ${c.ip}. Konfiguruj urządzenia po kolei.`}
          </span>
        </div>
      ))}
      {realistic && anyPc && (
        <details className="bd-note" open={!links.length}>
          <summary>{ru ? 'Как настроить устройство, как на экзамене' : 'Jak skonfigurować urządzenie'}</summary>
          <ol>
            {ru ? (
              <>
                <li>Соедини кабелем ПК с тем устройством, которое настраиваешь. Свитч — первым, пока роутер не подключён: с завода у обоих адрес 192.168.0.1.</li>
                <li>Дождись адреса. От роутера ПК получит его сам по DHCP (192.168.0.100). Свитч адреса не раздаёт — задай ПК вручную 192.168.0.10 / 255.255.255.0.</li>
                <li>
                  Открой{' '}
                  {onOpenPc ? (
                    <button className="text-btn inline" onClick={onOpenPc}>
                      Windows → Przeglądarka
                    </button>
                  ) : (
                    'Windows → Przeglądarka'
                  )}{' '}
                  и впиши адрес устройства (например http://192.168.0.1), логин admin / admin.
                </li>
                <li>Когда все устройства настроены — соедини всё по схеме из листа.</li>
              </>
            ) : (
              <>
                <li>Połącz komputer kablem z konfigurowanym urządzeniem (najpierw przełącznik).</li>
                <li>Poczekaj na adres (DHCP z rutera) albo ustaw statyczny 192.168.0.10/24.</li>
                <li>Windows → Przeglądarka → http://192.168.0.1, admin / admin.</li>
                <li>Na końcu połącz wszystko zgodnie ze schematem.</li>
              </>
            )}
          </ol>
        </details>
      )}

      <div className="bd-grid">
        {devices.map((d) => (
          <DeviceCard key={d} d={d} lab={lab} s={s} st={st} pick={pick} sel={sel} onPort={tapPort} />
        ))}
      </div>

      {(pick || sel !== null || msg) && (
        <div className="bd-bar" role="status">
          {sel !== null && links[sel] ? (
            <>
              <span className="bd-swatch" style={{ background: CABLE_COLORS[sel % CABLE_COLORS.length] }}>
                {sel + 1}
              </span>
              <span className="bd-bar-text">
                {full(links[sel][0])} ↔ {full(links[sel][1])}
              </span>
              <button className="btn small danger" onClick={() => unplug(sel)}>
                {ru ? 'Отключить' : 'Odłącz'}
              </button>
              <button className="btn small" onClick={() => setSel(null)}>
                {ru ? 'Закрыть' : 'Zamknij'}
              </button>
            </>
          ) : pick ? (
            <>
              <span className="bd-bar-text">
                {ru ? `Кабель в ${full(pick)}. Теперь нажми порт другого устройства.` : `Kabel w ${full(pick)}. Kliknij port drugiego urządzenia.`}
                {msg && <span className="bd-bar-msg">{msg}</span>}
              </span>
              <button className="btn small" onClick={() => setPick(null)}>
                {ru ? 'Отмена' : 'Anuluj'}
              </button>
            </>
          ) : (
            <span className="bd-bar-text">{msg}</span>
          )}
        </div>
      )}

      <section className="bd-panel">
        <h2>{ru ? 'Кабели' : 'Kable'}</h2>
        {!links.length && <p className="hint">{ru ? 'Ничего не подключено. Нажми порт одного устройства, затем порт другого.' : 'Brak połączeń. Kliknij port jednego urządzenia, potem drugiego.'}</p>}
        {links.map(([a, b], i) => {
          const up = linkUp(st.model, a)
          return (
            <div key={`${a}-${b}`} className={`bd-cable ${sel === i ? 'sel' : ''}`}>
              <span className="bd-swatch" style={{ background: CABLE_COLORS[i % CABLE_COLORS.length] }}>
                {i + 1}
              </span>
              <button className="bd-cable-name" onClick={() => setSel(sel === i ? null : i)}>
                {full(a)} ↔ {full(b)}
                <small className={up ? 'ok' : ''}>{up ? (ru ? 'линк есть' : 'link aktywny') : ru ? 'нет линка (устройство выключено или грузится)' : 'brak linku'}</small>
              </button>
              <button className="btn small" onClick={() => unplug(i)}>
                {ru ? 'Отключить' : 'Odłącz'}
              </button>
            </div>
          )
        })}
        {lab.schema_ru && lab.schema_ru.length > 0 && (
          <div className="bd-schema">
            <h3>{ru ? 'Схема из листа' : 'Schemat z arkusza'}</h3>
            <ul>
              {lab.schema_ru.map((x, i) => {
                const req = lab.requiredLinks?.[i]
                const done = req ? linksMatch([req], links) : false
                return (
                  <li key={x} className={done ? 'ok' : ''}>
                    {done ? '✓ ' : ''}
                    {x}
                  </li>
                )
              })}
            </ul>
            {realistic && <p className="hint">{ru ? 'Схему собирают в конце, когда устройства уже настроены — проверка смотрит итоговые кабели.' : 'Schemat łączy się na końcu.'}</p>}
          </div>
        )}
      </section>

      <details className="bd-panel bd-why-all">
        <summary>{ru ? 'Зачем всё это: перезагрузка, сброс, адреса' : 'Po co: restart, reset, adresy'}</summary>
        {ru ? (
          <ul>
            <li>
              <b>Какой адрес вписать.</b> В браузер вписывают адрес управления устройства: у роутера — адрес LAN (с завода 192.168.0.1), у свитча — его IP (с завода тоже 192.168.0.1). Логин с завода — admin / admin (написан на наклейке снизу).
            </li>
            <li>
              <b>ПК в той же подсети.</b> Компьютер может открыть страницу только устройства из своей подсети (или через шлюз). Если у ПК 192.168.1.100/24, а у свитча 192.168.0.1/24 — это разные сети, страница не откроется. Поэтому для настройки свитча ПК временно ставят адрес 192.168.0.10/24.
            </li>
            <li>
              <b>Только одно 192.168.0.1 в сети.</b> Роутер и свитч с завода имеют одинаковый адрес. Если оба подключены — конфликт IP: откроется то одно, то другое. Сначала настрой свитч (смени ему адрес), потом подключай роутер.
            </li>
            <li>
              <b>Перезагрузка после смены IP.</b> Роутер после смены адреса LAN сам перезагружается: старый адрес больше не работает, линк на портах на время пропадает, а ПК по DHCP получает адрес уже из новой сети. Если у ПК статический адрес — поменяй его на адрес из новой подсети и впиши в браузер новый адрес.
            </li>
            <li>
              <b>Перезагрузка вообще</b> — когда устройство «зависло» или нужно применить настройки. Пока оно грузится, на портах нет линка, оно не отвечает на ping и не раздаёт адреса.
            </li>
            <li>
              <b>RESET</b> (удерживать кнопку на включённом устройстве) — возврат к заводским настройкам: когда забыл пароль или адрес, или устройство досталось с чужой конфигурацией. Все твои настройки при этом пропадают.
            </li>
            <li>
              <b>Выключение.</b> Выключенное устройство ничего не пересылает: если через свитч идёт путь к серверу, без свитча связи нет.
            </li>
          </ul>
        ) : (
          <ul>
            <li>Adres zarządzania: ruter — adres LAN (fabrycznie 192.168.0.1), przełącznik — jego IP (fabrycznie też 192.168.0.1). Login admin / admin.</li>
            <li>Komputer musi być w tej samej podsieci co urządzenie.</li>
            <li>Ruter i przełącznik mają fabrycznie ten sam adres — konfiguruj je po kolei.</li>
            <li>Po zmianie adresu LAN ruter uruchamia się ponownie; komputer dostaje nowy adres z DHCP.</li>
            <li>RESET przywraca ustawienia fabryczne.</li>
          </ul>
        )}
      </details>
    </div>
  )
}

function DeviceCard({ d, lab, s, st, pick, sel, onPort }: { d: DeviceKey; lab: BenchLab; s: LabSave; st: Station; pick: string | null; sel: number | null; onPort: (p: string) => void }) {
  const lang = useLang()
  const ru = lang === 'ru'
  const on = st.isPowered(d)
  const boot = st.boot[d]
  const state = !on ? 'off' : boot ? 'boot' : 'on'
  const links = s.links
  const name = (ru ? DEV_RU : DEV_PL)[d]
  const model = d === 'router' ? s.router?.model : d === 'switch' ? s.switch?.model : d === 'linux' ? 'Ubuntu Server 24.04' : d === 'printer' ? 'LaserJet M404 (symulator)' : d === 'laptop' ? 'Windows 11 — nie jest częścią zadania' : 'Windows 11'
  const ports = portsOf(lab, d)

  return (
    <section className={`bd-card st-${state}`} aria-label={name}>
      <header className="bd-head">
        <span className={`bd-pled ${state}`} aria-hidden="true" />
        <div className="bd-title">
          <strong>{name}</strong>
          <small>{model}</small>
        </div>
        <span className={`bd-state ${state}`}>{state === 'off' ? (ru ? 'выключен' : 'wyłączony') : state === 'boot' ? (ru ? 'загружается…' : 'uruchamianie…') : ru ? 'работает' : 'włączony'}</span>
      </header>
      {boot && <div className="bd-progress" key={boot.until} style={{ animationDuration: `${boot.total}ms` }} />}

      <div className={`bd-face face-${d}`}>
        {ports.map((pt) => {
          const id = `${d}:${pt}`
          const ci = links.findIndex(([a, b]) => a === id || b === id)
          const lit = ci >= 0 && linkUp(st.model, id)
          return (
            <button
              key={id}
              className={`bd-port ${ci >= 0 ? 'plugged' : ''} ${lit ? 'lit' : ''} ${pick === id ? 'pick' : ''} ${ci >= 0 && sel === ci ? 'sel' : ''} ${pt === 'wan' ? 'wan' : ''}`}
              style={ci >= 0 ? ({ '--cc': CABLE_COLORS[ci % CABLE_COLORS.length] } as CSSProperties) : undefined}
              onClick={() => onPort(id)}
              aria-label={`${name} ${portLabel(id)}${ci >= 0 ? (ru ? ', кабель ' : ', kabel ') + (ci + 1) : ''}${lit ? ' link' : ''}`}
            >
              <span className="jack">
                <span className="led" />
                {ci >= 0 && <span className="plug">{ci + 1}</span>}
              </span>
              <span className="pl">{d === 'switch' ? pt : portLabel(id)}</span>
            </button>
          )
        })}
      </div>

      <DeviceInfo d={d} s={s} st={st} lab={lab} />

      <div className="bd-actions">
        <button className={`btn small ${on ? '' : 'primary'}`} onClick={() => st.setPower(d, !on)} aria-pressed={on}>
          <PowerIcon /> {on ? (ru ? 'Выключить' : 'Wyłącz') : ru ? 'Включить' : 'Włącz'}
        </button>
        <button className="btn small" disabled={!on} onClick={() => st.reboot(d)}>
          {ru ? 'Перезагрузить' : 'Uruchom ponownie'}
        </button>
        {(d === 'router' || d === 'switch') && <ResetButton disabled={!on || !!boot} onReset={() => st.factoryReset(d)} />}
      </div>
      <Why d={d} />
    </section>
  )
}

function DeviceInfo({ d, s, st, lab }: { d: DeviceKey; s: LabSave; st: Station; lab: BenchLab }) {
  const lang = useLang()
  const ru = lang === 'ru'
  const rows: ReactNode[] = []
  if (d === 'router' && s.router) {
    rows.push(
      <span key="lan">
        {ru ? 'Адрес для браузера (LAN): ' : 'Adres panelu (LAN): '}
        <code>{s.router.lan.ip}</code>
      </span>,
      <span key="wan">
        WAN: <code>{s.router.wan.type === 'static' ? s.router.wan.ip || '—' : s.router.wan.type === 'dynamic' ? (ru ? 'DHCP-клиент' : 'dynamiczny') : 'PPPoE'}</code> · DHCP: {s.router.dhcp.enabled ? (ru ? 'вкл.' : 'wł.') : ru ? 'выкл.' : 'wył.'}
      </span>,
    )
  }
  if (d === 'switch' && s.switch) {
    rows.push(
      <span key="ip">
        {ru ? 'Адрес для браузера: ' : 'Adres panelu: '}
        <code>{s.switch.ip.dhcp ? 'DHCP' : s.switch.ip.ip}</code>
        {s.switch.dot1q ? ' · 802.1Q VLAN' : ''}
      </span>,
    )
  }
  if (d === 'linux') {
    const ifs = st.model.linuxIfaces ?? []
    rows.push(
      ...ifs.map((i) => (
        <span key={i.name}>
          {i.name}: <code>{i.addresses.join(', ') || (ru ? 'нет адреса' : 'brak adresu')}</code>
        </span>
      )),
    )
  }
  if ((d === 'pc' || d === 'laptop') && s[d]) {
    const pc = s[d] as PcState
    rows.push(
      ...pc.adapters.map((a) => {
        const up = a.enabled && linkUp(st.model, `${d}:${a.id}`)
        const cfg = pcAddress(a)
        let txt: string
        if (!a.enabled) txt = ru ? 'карта отключена' : 'wyłączona'
        else if (!up) txt = ru ? 'кабель не подключён / нет линка' : 'kabel odłączony'
        else if (cfg?.addr.ip.startsWith('169.254.')) txt = `${cfg.addr.ip} — ${ru ? 'APIPA, DHCP не ответил' : 'APIPA'}`
        else if (cfg) txt = `${cfg.addr.ip}/${cfg.addr.prefix}${a.dhcp ? ' (DHCP)' : ''}`
        else txt = ru ? 'нет адреса' : 'brak adresu'
        return (
          <span key={a.id}>
            {a.name}: <code>{txt}</code>
          </span>
        )
      }),
    )
  }
  if (d === 'printer' && lab.devices.printer)
    rows.push(
      <span key="ip">
        {ru ? 'Адрес: ' : 'Adres: '}
        <code>
          {lab.devices.printer.ip}/{lab.devices.printer.prefix}
        </code>
      </span>,
    )
  return <div className="bd-info">{rows}</div>
}

function Why({ d }: { d: DeviceKey }) {
  const lang = useLang()
  if (lang !== 'ru') return null
  const text: Record<DeviceKey, string> = {
    router:
      'Перезагрузка: после смены адреса LAN роутер перезапускается сам; ПК, воткнутый в него, потом заново берёт адрес по DHCP. RESET (держать на включённом роутере): заводские настройки — 192.168.0.1, admin/admin, DHCP включён. WAN — порт «в Интернет», через него роутер не раздаёт адреса и не настраивается.',
    switch:
      'Свитч не раздаёт адреса: чтобы зайти на 192.168.0.1, дай ПК статический адрес 192.168.0.10/24. После смены IP свитча старая страница перестанет отвечать — впиши новый адрес. Управление свитчем живёт в VLAN 1: ПК в порту другого VLAN до него не достучится. RESET — заводской адрес 192.168.0.1 и admin/admin.',
    linux: 'Выключение сервера = сеть и DHCP-сервер на нём пропадают. В тренажёре файлы и настройки Linux при перезагрузке сохраняются.',
    pc: 'Windows сама просит адрес по DHCP, когда появляется линк (вставили кабель, включили устройство на другом конце). Нет ответа — адрес 169.254.x.x (APIPA). Статические настройки не меняются.',
    laptop:
      'Служебный ноутбук: на этом листе нет Windows-станции, а роутер настраивают из браузера. Подключи его к LAN роутера или к свитчу, настрой устройство, затем отключи. В проверку не входит.',
    printer: 'У принтера фиксированный адрес; его страницу состояния можно открыть в браузере ПК из той же подсети.',
  }
  return (
    <details className="bd-why">
      <summary>Зачем?</summary>
      <p>{text[d]}</p>
    </details>
  )
}

function PowerIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
      <path d="M12 3v8" />
      <path d="M6.3 7.2a8 8 0 1 0 11.4 0" />
    </svg>
  )
}

/** Physical RESET: press and hold ~3 s (keyboard: confirm). */
function ResetButton({ onReset, disabled }: { onReset: () => void; disabled: boolean }) {
  const lang = useLang()
  const ru = lang === 'ru'
  const [holding, setHolding] = useState(false)
  const [hint, setHint] = useState('')
  const t = useRef<number | undefined>(undefined)
  const done = useRef(false)
  const start = () => {
    if (disabled) return
    done.current = false
    setHolding(true)
    setHint('')
    t.current = window.setTimeout(() => {
      done.current = true
      setHolding(false)
      setHint(ru ? 'Сброшено к заводским настройкам' : 'Przywrócono ustawienia fabryczne')
      onReset()
    }, 3000)
  }
  const stop = () => {
    if (!holding) return
    window.clearTimeout(t.current)
    setHolding(false)
    if (!done.current) setHint(ru ? 'Держи кнопку 3 секунды' : 'Przytrzymaj 3 sekundy')
  }
  return (
    <span className="bd-reset-wrap">
      <button
        className={`btn small bd-reset ${holding ? 'holding' : ''}`}
        disabled={disabled}
        onPointerDown={start}
        onPointerUp={stop}
        onPointerLeave={stop}
        onPointerCancel={stop}
        onContextMenu={(e) => e.preventDefault()}
        onClick={(e) => {
          if (e.detail === 0 && window.confirm(ru ? 'Сбросить устройство к заводским настройкам?' : 'Przywrócić ustawienia fabryczne?')) onReset()
        }}
        title={ru ? 'Удерживай 3 секунды — заводские настройки' : 'Przytrzymaj 3 s — ustawienia fabryczne'}
      >
        <span className="bd-hold" aria-hidden="true" />
        RESET
      </button>
      {hint && <small className="bd-reset-hint">{hint}</small>}
    </span>
  )
}
