// Hardware identification tools of the Windows workstation: Informacje o systemie (msinfo32),
// Narzędzie diagnostyczne DirectX (dxdiag), Menedżer urządzeń (devmgmt.msc), Menedżer zadań (taskmgr → Wydajność).
import { useState, type ReactNode } from 'react'
import { cSizeGiB, gib, plInt, plNum, ramTotalGB, type Hardware } from '../hw'
import { hwOf } from './hwcmd'
import { IcChevron, IcDrive, IcEthernet, IcPc, IcSystem } from './icons'
import { isWifi, nicDesc } from './model'
import { usePc, type WinProps } from './ui'
import './hw.css'

const cpuLine = (h: Hardware) => `${h.cpu.name}, ${h.cpu.baseMHz} MHz, Rdzenie: ${h.cpu.cores}, Procesory logiczne: ${h.cpu.threads}`
const gb = (x: number) => `${plNum(x)} GB`

function Kv({ rows }: { rows: [string, string][] }) {
  return (
    <table className="hw-kv">
      <thead>
        <tr>
          <th>Element</th>
          <th>Wartość</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(([k, v], i) => (
          <tr key={k + i}>
            <td>{k}</td>
            <td>{v}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

/** left tree on a wide window, chips on a phone */
function Tree({ nodes, cur, onCur, label }: { nodes: [string, string, number][]; cur: string; onCur: (k: string) => void; label: string }) {
  const api = usePc()
  if (api.compact)
    return (
      <div className="mmc-chips" role="tablist" aria-label={label}>
        {nodes
          .filter(([, , d]) => d > 0 || nodes.length < 4)
          .map(([k, l]) => (
            <button key={k} role="tab" aria-selected={cur === k} className={cur === k ? 'on' : ''} onClick={() => onCur(k)}>
              {l}
            </button>
          ))}
      </div>
    )
  return (
    <div className="hw-tree" role="tree" aria-label={label}>
      {nodes.map(([k, l, d]) => (
        <button key={k} role="treeitem" aria-selected={cur === k} className={`hw-node${cur === k ? ' on' : ''}`} style={{ ['--d' as string]: d }} onClick={() => onCur(k)}>
          {l}
        </button>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------- msinfo32
export function Msinfo32() {
  const api = usePc()
  const st = api.state
  const h = hwOf(st)
  const [cur, setCur] = useState('sum')
  const totalGB = ramTotalGB(h)
  const nodes: [string, string, number][] = [
    ['sum', 'Podsumowanie systemu', 0],
    ['res', 'Zasoby sprzętowe', 1],
    ['comp', 'Składniki', 1],
    ['disp', 'Ekran', 2],
    ['net', 'Sieć › Karta', 2],
    ['disk', 'Magazyn › Dyski', 2],
    ['sw', 'Środowisko oprogramowania', 1],
  ]
  const vramB = Math.min(h.gpu.vramMB * 1048576, 4293918720)
  const rows: Record<string, [string, string][]> = {
    sum: [
      ['Nazwa systemu operacyjnego', h.os.win],
      ['Wersja', `10.0.${h.os.winBuild} Kompilacja ${h.os.winBuild}`],
      ['Producent systemu operacyjnego', 'Microsoft Corporation'],
      ['Nazwa systemu', st.hostname],
      ['Producent systemu', h.board.vendor],
      ['Model systemu', h.board.sysModel],
      ['Typ systemu', 'Komputer z procesorem x64'],
      ['Procesor', cpuLine(h)],
      ['Wersja/data systemu BIOS', `${h.board.bios.vendor} ${h.board.bios.version}, ${h.board.bios.date}`],
      ['Tryb systemu BIOS', 'UEFI'],
      ['Producent płyty głównej', h.board.vendor],
      ['Produkt płyty głównej', h.board.model.replace(/ \(MS-.*\)$/, '')],
      ['Wersja płyty głównej', 'Rev 1.xx'],
      ['Katalog systemu Windows', 'C:\\Windows'],
      ['Ustawienia regionalne', 'Polska'],
      ['Zainstalowana pamięć fizyczna (RAM)', gb(totalGB)],
      ['Całkowita pamięć fizyczna', gb(totalGB * 0.985)],
      ['Dostępna pamięć fizyczna', gb(totalGB * 0.57)],
      ['Całkowita pamięć wirtualna', gb(totalGB * 0.985 + 2.38)],
      ['Plik stronicowania', 'C:\\pagefile.sys'],
      ['Zabezpieczenia oparte na wirtualizacji', 'Nie jest włączone'],
    ],
    res: [
      ['Konflikty/udostępnianie', 'Brak konfliktów'],
      ['DMA', 'Kanał 4: Kontroler bezpośredniego dostępu do pamięci'],
      ['Wymuszony sprzęt', 'Brak'],
    ],
    comp: [['Składniki', 'Rozwiń gałąź: Ekran, Sieć, Magazyn…']],
    disp: [
      ['Nazwa', h.gpu.name],
      ['Identyfikator PNP urządzenia', `PCI\\VEN_${h.gpu.vendor === 'NVIDIA' ? '10DE' : h.gpu.vendor === 'AMD' ? '1002' : '80EE'}&DEV_2504`],
      ['Typ karty', `${h.gpu.chip.replace(/ \[.*$/, '')}, ${h.gpu.vendor === 'AMD' ? 'Advanced Micro Devices, Inc.' : h.gpu.vendor} — zgodna`],
      ['Opis karty', h.gpu.name],
      ['Pamięć karty', `${plNum(vramB / 1073741824)} GB (${plInt(vramB)} bajtów)`],
      ['Zainstalowane sterowniki', 'nvldumdx.dll,nvwgf2umx.dll'],
      ['Wersja sterownika', h.gpu.driver],
      ['Rozdzielczość', `${h.display.w} x ${h.display.h} x ${h.display.hz} herców`],
      ['Bity/piksel', '32'],
    ],
    net: st.adapters.flatMap((a, i) => [
      ...(i ? ([['', '']] as [string, string][]) : []),
      ['Nazwa', `[0000000${i + 1}] ${nicDesc(a)}`] as [string, string],
      ['Typ karty', isWifi(a) ? 'Ethernet 802.3' : 'Ethernet 802.3'] as [string, string],
      ['Typ produktu', nicDesc(a)] as [string, string],
      ['Zainstalowana', 'Tak'] as [string, string],
      ['Adres MAC', a.mac.replace(/-/g, ':').toUpperCase()] as [string, string],
      ['Usługa DHCP włączona', a.dhcp ? 'Tak' : 'Nie'] as [string, string],
    ]),
    disk: [
      ['Opis', 'Stacja dysków'],
      ['Producent', '(Standardowe stacje dysków)'],
      ['Model', h.disk.model],
      ['Bajty/sektor', '512'],
      ['Typ nośnika', 'Stały nośnik dysku twardego'],
      ['Partycje', '3'],
      ['Interfejs', h.disk.bus === 'NVMe' ? 'SCSI' : 'IDE'],
      ['Numer seryjny', h.disk.serial],
      ['Rozmiar', `${plNum(gib(h.disk.bytes))} GB (${plInt(h.disk.bytes - 2097152)} bajtów)`],
      ['Łączna liczba cylindrów', plInt(Math.floor(h.disk.bytes / 8225280))],
    ],
    sw: [['Środowisko oprogramowania', 'Sterowniki systemowe, zmienne środowiskowe, zadania drukowania…']],
  }
  return (
    <div className={`hw-app msinfo ${api.compact ? 'compact' : ''}`}>
      <div className="mmc-menu">
        {['Plik', 'Edycja', 'Widok', 'Pomoc'].map((m) => (
          <span key={m}>{m}</span>
        ))}
      </div>
      <div className="hw-split">
        <Tree nodes={nodes} cur={cur} onCur={setCur} label="Informacje o systemie" />
        <div className="hw-main">
          <Kv rows={rows[cur]} />
        </div>
      </div>
      <div className="hw-find">
        <span>Znajdź:</span>
        <span className="hw-input" />
        <button className="w-btn" disabled>
          Znajdź
        </button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- dxdiag
export function Dxdiag({ close }: WinProps) {
  const api = usePc()
  const st = api.state
  const h = hwOf(st)
  const [tab, setTab] = useState(0)
  const totalMB = ramTotalGB(h) * 1024
  const tabs = ['System', 'Ekran 1', 'Dźwięk 1', 'Wejście']
  const sys: [string, string][] = [
    ['Bieżąca data/godzina', new Date().toLocaleString('pl-PL')],
    ['Nazwa komputera', st.hostname],
    ['System operacyjny', `Windows 11 Pro 64-bitowy (10.0, kompilacja ${h.os.winBuild})`],
    ['Język', 'polski (ustawienia regionalne: polski)'],
    ['Producent systemu', h.board.vendor],
    ['Model systemu', h.board.sysModel],
    ['BIOS', `${h.board.bios.version} (type: UEFI)`],
    ['Procesor', `${h.cpu.name} (${h.cpu.threads} CPUs), ~${(h.cpu.baseMHz / 1000).toFixed(1)}GHz`],
    ['Pamięć', `${totalMB}MB RAM`],
    ['Plik stronicowania', `${Math.round(totalMB * 0.3)}MB używane, ${Math.round(totalMB * 0.9)}MB dostępne`],
    ['Wersja DirectX', `DirectX ${h.gpu.directx}`],
  ]
  const disp: [string, string][] = [
    ['Nazwa', h.gpu.name],
    ['Producent', h.gpu.vendor === 'AMD' ? 'Advanced Micro Devices, Inc.' : h.gpu.vendor],
    ['Typ układu', h.gpu.chip.replace(/ \[.*$/, '')],
    ['Typ DAC', 'Integrated RAMDAC'],
    ['Typ urządzenia', 'Urządzenie wyświetlania pełne'],
    ['Przybliżona łączna pamięć', `${h.gpu.vramMB + Math.round(totalMB / 2)} MB`],
    ['Pamięć wyświetlania (VRAM)', `${h.gpu.vramMB} MB`],
    ['Pamięć współużytkowana', `${Math.round(totalMB / 2)} MB`],
    ['Bieżący tryb wyświetlania', `${h.display.w} x ${h.display.h} (32 bit) (${h.display.hz}Hz)`],
    ['Monitor', 'Ogólny monitor PnP'],
    ['Wersja sterownika', h.gpu.driver],
    ['Poziomy funkcji Direct3D', '12_1,12_0,11_1,11_0,10_1,10_0'],
    ['Model sterownika', 'WDDM 3.1'],
  ]
  return (
    <div className="dlg hw-app dxdiag">
      <div className="w-tabs" role="tablist">
        {tabs.map((t, i) => (
          <button key={t} role="tab" aria-selected={tab === i} className={tab === i ? 'on' : ''} onClick={() => setTab(i)}>
            {t}
          </button>
        ))}
      </div>
      <div className="dlg-page">
        {tab === 0 && (
          <>
            <p className="dlg-lead">To narzędzie raportuje szczegółowe informacje o składnikach i sterownikach DirectX zainstalowanych w systemie.</p>
            <fieldset className="w-group">
              <legend>Informacje o systemie</legend>
              <dl className="hw-dl">
                {sys.map(([k, v]) => (
                  <div key={k}>
                    <dt>{k}:</dt>
                    <dd>{v}</dd>
                  </div>
                ))}
              </dl>
            </fieldset>
          </>
        )}
        {tab === 1 && (
          <div className="hw-cols">
            <fieldset className="w-group">
              <legend>Urządzenie</legend>
              <dl className="hw-dl">
                {disp.slice(0, 10).map(([k, v]) => (
                  <div key={k}>
                    <dt>{k}:</dt>
                    <dd>{v}</dd>
                  </div>
                ))}
              </dl>
            </fieldset>
            <fieldset className="w-group">
              <legend>Sterowniki</legend>
              <dl className="hw-dl">
                {disp.slice(10).map(([k, v]) => (
                  <div key={k}>
                    <dt>{k}:</dt>
                    <dd>{v}</dd>
                  </div>
                ))}
              </dl>
            </fieldset>
          </div>
        )}
        {tab === 2 && (
          <dl className="hw-dl">
            <div>
              <dt>Nazwa:</dt>
              <dd>Realtek High Definition Audio</dd>
            </div>
            <div>
              <dt>Typ urządzenia:</dt>
              <dd>WDM</dd>
            </div>
          </dl>
        )}
        {tab === 3 && <p className="dlg-lead">Urządzenia DirectInput: Mysz, Klawiatura.</p>}
      </div>
      <div className="w-dlg-btns">
        <button className="w-btn" disabled>
          Pomoc
        </button>
        <button className="w-btn" onClick={() => setTab((tab + 1) % tabs.length)}>
          Następna strona
        </button>
        <button className="w-btn" disabled>
          Zapisz wszystkie informacje...
        </button>
        <button className="w-btn" onClick={close}>
          Zakończ
        </button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- Menedżer urządzeń
interface Dev {
  name: string
  type: string
  maker: string
  where: string
  extra?: [string, string][]
}
export function Devmgmt() {
  const api = usePc()
  const st = api.state
  const h = hwOf(st)
  const [open, setOpen] = useState<Record<string, boolean>>({})
  const [sel, setSel] = useState<Dev | null>(null)
  const cats: [string, Dev[]][] = [
    ['Baterie', []],
    ['Karty graficzne', [{ name: h.gpu.name, type: 'Karty graficzne', maker: h.gpu.vendor === 'AMD' ? 'Advanced Micro Devices, Inc.' : h.gpu.vendor, where: 'Magistrala PCI 1, urządzenie 0, funkcja 0', extra: [['Wersja sterownika', h.gpu.driver]] }]],
    ['Karty sieciowe', st.adapters.map((a) => ({ name: nicDesc(a), type: 'Karty sieciowe', maker: /realtek/i.test(nicDesc(a)) ? 'Realtek' : /tp-link/i.test(nicDesc(a)) ? 'TP-Link' : /qualcomm/i.test(nicDesc(a)) ? 'Qualcomm Communications Inc.' : 'Intel', where: isWifi(a) ? 'Magistrala PCI 4, urządzenie 0, funkcja 0' : 'Magistrala PCI 3, urządzenie 0, funkcja 0', extra: [['Zaawansowane › Network Address', 'Brak (używany adres sprzętowy)']] }))],
    ['Klawiatury', [{ name: 'Klawiatura HID', type: 'Klawiatury', maker: '(Standardowe klawiatury)', where: 'na urządzeniu USB Input Device' }]],
    ['Komputer', [{ name: 'Komputer z procesorem x64 z interfejsem ACPI', type: 'Komputer', maker: '(Standardowe komputery)', where: 'Nie jest dostępna' }]],
    ['Kontrolery magazynu', [{ name: h.disk.bus === 'NVMe' ? 'Standardowy kontroler magazynu NVM Express' : 'Standardowy kontroler SATA AHCI', type: 'Kontrolery magazynu', maker: '(Standardowe kontrolery magazynu)', where: 'Magistrala PCI 0, urządzenie 23, funkcja 0' }]],
    ['Monitory', [{ name: 'Ogólny monitor PnP', type: 'Monitory', maker: '(Standardowe typy monitorów)', where: 'Nie jest dostępna', extra: [['Rozdzielczość', `${h.display.w} x ${h.display.h}`]] }]],
    ['Mysz i inne urządzenia wskazujące', [{ name: 'Mysz zgodna z HID', type: 'Mysz', maker: 'Microsoft', where: 'na urządzeniu USB Input Device' }]],
    ['Procesory', Array.from({ length: h.cpu.threads }, () => ({ name: h.cpu.name, type: 'Procesory', maker: h.cpu.vendor === 'Intel' ? 'Intel' : 'Advanced Micro Devices', where: 'Nie jest dostępna' }))],
    ['Stacje dysków', [{ name: h.disk.model, type: 'Stacje dysków', maker: '(Standardowe stacje dysków)', where: h.disk.bus === 'NVMe' ? 'Magistrala 0, identyfikator docelowy 0, LUN 0' : 'Kanał 0, Obiekt docelowy 0, LUN 0' }]],
    ['Urządzenia systemowe', [{ name: 'Magistrala PCI', type: 'Urządzenia systemowe', maker: '(Standardowe urządzenia systemowe)', where: 'Nie jest dostępna' }]],
  ]
  return (
    <div className={`hw-app devmgmt ${api.compact ? 'compact' : ''}`}>
      <div className="mmc-menu">
        {['Plik', 'Akcja', 'Widok', 'Pomoc'].map((m) => (
          <span key={m}>{m}</span>
        ))}
      </div>
      <div className="hw-devs" role="tree" aria-label="Menedżer urządzeń">
        <div className="hw-dev-root">
          <IcPc size={16} /> {st.hostname}
        </div>
        {cats
          .filter(([, d]) => d.length)
          .map(([c, devs]) => (
            <div key={c} className="hw-cat">
              <button className="hw-cat-h" aria-expanded={!!open[c]} onClick={() => setOpen({ ...open, [c]: !open[c] })}>
                <IcChevron dir={open[c] ? 'down' : 'right'} size={10} /> {c === 'Karty sieciowe' ? <IcEthernet size={14} /> : c === 'Stacje dysków' ? <IcDrive size={14} /> : <IcSystem size={14} />} {c}
              </button>
              {open[c] &&
                devs.map((d, i) => (
                  <button key={i} className={`hw-dev${sel === d ? ' on' : ''}`} onClick={() => setSel(d)} onDoubleClick={() => setSel(d)}>
                    {d.name}
                  </button>
                ))}
            </div>
          ))}
      </div>
      {sel && (
        <div className="hw-props" role="dialog" aria-label={`Właściwości: ${sel.name}`}>
          <div className="hw-props-h">
            <strong>Właściwości: {sel.name}</strong>
            <button className="w-btn" onClick={() => setSel(null)}>
              OK
            </button>
          </div>
          <dl className="hw-dl">
            <div>
              <dt>Typ urządzenia:</dt>
              <dd>{sel.type}</dd>
            </div>
            <div>
              <dt>Producent:</dt>
              <dd>{sel.maker}</dd>
            </div>
            <div>
              <dt>Lokalizacja:</dt>
              <dd>{sel.where}</dd>
            </div>
            {sel.extra?.map(([k, v]) => (
              <div key={k}>
                <dt>{k}:</dt>
                <dd>{v}</dd>
              </div>
            ))}
            <div>
              <dt>Stan urządzenia:</dt>
              <dd>To urządzenie działa poprawnie.</dd>
            </div>
          </dl>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------- Menedżer zadań → Wydajność
export function Taskmgr() {
  const api = usePc()
  const st = api.state
  const h = hwOf(st)
  const [cur, setCur] = useState('cpu')
  const total = ramTotalGB(h)
  const items: [string, string, string][] = [
    ['cpu', 'Procesor CPU', `${7 + (h.cpu.cores % 5)}% ${(h.cpu.baseMHz / 1000 + 0.9).toFixed(2).replace('.', ',')} GHz`],
    ['mem', 'Pamięć', `${plNum(total * 0.3, 1)}/${plNum(total * 0.985, 1)} GB (${30}%)`],
    ['disk', 'Dysk 0 (C:)', `${h.disk.ssd ? 'SSD' : 'HDD'} ${h.disk.bus === 'NVMe' ? '(NVMe)' : ''}`],
    ...st.adapters.map((a, i) => [`net${i}`, isWifi(a) ? 'Wi-Fi' : 'Ethernet', a.name] as [string, string, string]),
    ['gpu', 'GPU 0', h.gpu.name],
  ]
  const big: Record<string, [string, ReactNode, [string, string][]]> = {
    cpu: [
      'Procesor CPU',
      h.cpu.name,
      [
        ['Szybkość podstawowa:', `${(h.cpu.baseMHz / 1000).toFixed(2).replace('.', ',')} GHz`],
        ['Gniazda:', '1'],
        ['Rdzenie:', String(h.cpu.cores)],
        ['Procesory logiczne:', String(h.cpu.threads)],
        ['Wirtualizacja:', 'Włączone'],
        ['Pamięć podręczna L1:', `${h.cpu.cores * 80} KB`],
        ['Pamięć podręczna L2:', `${plNum(h.cpu.l2KB / 1024, 1)} MB`],
        ['Pamięć podręczna L3:', `${plNum(h.cpu.l3MB, 1)} MB`],
      ],
    ],
    mem: [
      'Pamięć',
      `${total},0 GB`,
      [
        ['Szybkość:', `${h.ram[0].speed} MT/s`],
        ['Używane gniazda:', `${h.ram.length} z ${h.board.ramSlots}`],
        ['Format:', 'DIMM'],
        ['Zarezerwowane sprzętowo:', `${Math.round(total * 15)} MB`],
        ['W użyciu (skompresowana):', `${plNum(total * 0.3, 1)} GB`],
        ['Dostępne:', `${plNum(total * 0.68, 1)} GB`],
      ],
    ],
    disk: [
      'Dysk 0 (C:)',
      h.disk.model,
      [
        ['Pojemność:', `${plInt(Math.round(gib(h.disk.bytes)))} GB`],
        ['Sformatowano:', `${plInt(cSizeGiB(h))} GB`],
        ['Dysk systemowy:', 'Tak'],
        ['Plik stronicowania:', 'Tak'],
        ['Typ:', h.disk.ssd ? `SSD${h.disk.bus === 'NVMe' ? ' (NVMe)' : ''}` : 'HDD'],
      ],
    ],
    gpu: [
      'GPU',
      h.gpu.name,
      [
        ['Dedykowana pamięć GPU:', `${plNum(h.gpu.vramMB / 1024, 1)} GB`],
        ['Udostępniona pamięć GPU:', `${plNum(total / 2, 1)} GB`],
        ['Wersja sterownika:', h.gpu.driver],
        ['Wersja DirectX:', h.gpu.directx],
        ['Lokalizacja fizyczna:', 'Magistrala PCI 1, urządzenie 0, funkcja 0'],
      ],
    ],
  }
  st.adapters.forEach((a, i) => {
    big[`net${i}`] = [isWifi(a) ? 'Wi-Fi' : 'Ethernet', nicDesc(a), [['Nazwa karty:', a.name], ['Typ połączenia:', isWifi(a) ? '802.11' : 'Ethernet'], ['Adres IPv4:', a.dhcp ? (a.lease?.ip ?? '—') : a.ip || '—']]]
  })
  const [title, model, kv] = big[cur]
  return (
    <div className={`hw-app taskmgr ${api.compact ? 'compact' : ''}`}>
      <div className="tm-tabs">
        {['Procesy', 'Wydajność', 'Historia aplikacji', 'Aplikacje autostartu', 'Użytkownicy', 'Szczegóły', 'Usługi'].map((t) => (
          <span key={t} className={t === 'Wydajność' ? 'on' : ''}>
            {t}
          </span>
        ))}
      </div>
      <div className="tm-body">
        <div className="tm-list" role="tablist" aria-label="Wydajność">
          {items.map(([k, l, s]) => (
            <button key={k} role="tab" aria-selected={cur === k} className={cur === k ? 'on' : ''} onClick={() => setCur(k)}>
              <strong>{l}</strong>
              <small>{s}</small>
            </button>
          ))}
        </div>
        <div className="tm-main">
          <div className="tm-head">
            <h3>{title}</h3>
            <span>{model}</span>
          </div>
          <div className="tm-graph" aria-hidden="true" />
          <dl className="hw-dl tm-dl">
            {kv.map(([k, v]) => (
              <div key={k}>
                <dt>{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </div>
  )
}
