// Windows Server 2022 mode: role catalog, state helpers and validation (pure, no React).
import { ipToInt, maskToPrefix, networkOf, prefixToMask, type AdGroup, type AdUser, type DhcpScope, type PcState, type ServerState } from '../net'

export const isServer = (st: PcState) => st.os === 'server2022'
export const srv = (st: PcState): ServerState => st.server ?? { roles: [], features: [], pending: [] }
export const hasRole = (st: PcState, id: string) => srv(st).roles.includes(id)
export const withSrv = (st: PcState, f: (s: ServerState) => ServerState): PcState => ({ ...st, server: f(srv(st)) })

export const WIN_SERVER_NAME = 'WIN-7QK2L9M4P0D'
export const OS_NAME = 'Microsoft Windows Server 2022 Standard Evaluation'

export interface RoleDef {
  id: string
  name: string
  /** short label in the left pane of Server Manager */
  nav: string
  desc: string
  /** features pulled in by "Dodaj funkcje" */
  req?: { id: string; name: string }[]
  intro?: string[]
  notes?: string[]
  /** only a catalog entry — installing is allowed but the role has no console in the simulator */
  sub?: { id: string; name: string; desc: string; indent: number; def?: boolean }[]
}

const RSAT_AD = [
  { id: 'GPMC', name: 'Zarządzanie zasadami grupy' },
  { id: 'RSAT-AD-AdminCenter', name: 'Narzędzia administracji serwera zdalnego\\Narzędzia administracji rolami\\Narzędzia AD DS i AD LDS\\Centrum administracyjne usługi Active Directory' },
  { id: 'RSAT-ADDS-Tools', name: 'Narzędzia administracji serwera zdalnego\\Narzędzia administracji rolami\\Narzędzia AD DS i AD LDS\\Przystawki i narzędzia wiersza polecenia usług AD DS' },
  { id: 'RSAT-AD-PowerShell', name: 'Narzędzia administracji serwera zdalnego\\Narzędzia administracji rolami\\Narzędzia AD DS i AD LDS\\Moduł Active Directory dla programu Windows PowerShell' },
]

export const ROLES: RoleDef[] = [
  { id: 'ADCS', name: 'Usługi certyfikatów Active Directory', nav: 'AD CS', desc: 'Usługi certyfikatów Active Directory (AD CS) służą do tworzenia urzędów certyfikacji i powiązanych usług ról, które umożliwiają wystawianie certyfikatów i zarządzanie nimi w różnych aplikacjach.' },
  {
    id: 'ADDS',
    name: 'Usługi domenowe w usłudze Active Directory',
    nav: 'AD DS',
    desc: 'Usługi domenowe w usłudze Active Directory (AD DS) przechowują informacje o użytkownikach, komputerach i innych urządzeniach w sieci. Usługi AD DS pomagają administratorom bezpiecznie zarządzać tymi informacjami i ułatwiają udostępnianie zasobów oraz współpracę między użytkownikami.',
    req: RSAT_AD,
    intro: [
      'Usługi domenowe w usłudze Active Directory (AD DS) przechowują informacje o użytkownikach, komputerach i innych urządzeniach w sieci. Usługi AD DS pomagają administratorom bezpiecznie zarządzać tymi informacjami i ułatwiają udostępnianie zasobów oraz współpracę między użytkownikami.',
      'Zwróć uwagę:',
      '• Aby zapewnić, że użytkownicy mogą nadal logować się w sieci w przypadku awarii serwera, zainstaluj co najmniej dwa kontrolery domeny dla domeny.',
      '• Usługi AD DS wymagają zainstalowania w sieci serwera DNS. Jeśli serwer DNS nie jest zainstalowany, zostanie wyświetlony monit o zainstalowanie roli serwera DNS na tym komputerze.',
    ],
  },
  { id: 'ADFS', name: 'Usługi Active Directory Federation Services', nav: 'AD FS', desc: 'Usługi Active Directory Federation Services (AD FS) zapewniają uproszczone, bezpieczne możliwości federacji tożsamości i logowania jednokrotnego do sieci Web.' },
  { id: 'ADLDS', name: 'Usługi Active Directory Lightweight Directory Services', nav: 'AD LDS', desc: 'Usługi Active Directory Lightweight Directory Services (AD LDS) udostępniają magazyn danych i usługę katalogową dla aplikacji obsługujących katalogi, bez wymagania usług domenowych.' },
  { id: 'ADRMS', name: 'Usługi Active Directory Rights Management Services', nav: 'AD RMS', desc: 'Usługi Active Directory Rights Management Services (AD RMS) pomagają chronić informacje przed nieautoryzowanym użyciem.' },
  { id: 'DEVHEALTH', name: 'Attestation kondycji urządzeń', nav: 'Attestation kondycji', desc: 'Usługa Attestation kondycji urządzeń sprawdza kondycję urządzeń przed udzieleniem dostępu do zasobów.' },
  {
    id: 'DHCP',
    name: 'Serwer DHCP',
    nav: 'DHCP',
    desc: 'Serwer protokołu DHCP (Dynamic Host Configuration Protocol) umożliwia centralne konfigurowanie adresów IP i powiązanych informacji dla klientów oraz zarządzanie nimi.',
    req: [{ id: 'RSAT-DHCP', name: 'Narzędzia administracji serwera zdalnego\\Narzędzia administracji rolami\\Narzędzia serwera DHCP' }],
    intro: [
      'Protokół DHCP (Dynamic Host Configuration Protocol) umożliwia serwerom przypisywanie, dzierżawę i odnawianie adresów IP urządzeniom w sieci oraz zarządzanie nimi, co upraszcza administrowanie siecią.',
      'Zwróć uwagę:',
      '• Należy skonfigurować co najmniej jeden statyczny adres IP na tym komputerze.',
      '• Przed zainstalowaniem serwera DHCP należy zaplanować podsieci, zakresy i wykluczenia. Zapisz plan, aby przygotować się do konfiguracji.',
    ],
  },
  {
    id: 'DNS',
    name: 'Serwer DNS',
    nav: 'DNS',
    desc: 'System nazw domen (DNS) zapewnia standardową metodę kojarzenia nazw z numerycznymi adresami internetowymi. Dzięki temu użytkownicy mogą odwoływać się do zasobów sieciowych za pomocą łatwych do zapamiętania nazw zamiast długich ciągów liczb.',
    req: [{ id: 'RSAT-DNS-Server', name: 'Narzędzia administracji serwera zdalnego\\Narzędzia administracji rolami\\Narzędzia serwera DNS' }],
    intro: [
      'System nazw domen (DNS) udostępnia standardową metodę kojarzenia nazw z numerycznymi adresami internetowymi. Dzięki temu użytkownicy mogą odwoływać się do zasobów sieciowych za pomocą łatwych do zapamiętania nazw zamiast długich ciągów liczb. Ponadto usługa DNS udostępnia nazwy lokalizacji usług, takich jak serwery kontrolerów domeny w usłudze Active Directory.',
      'Zwróć uwagę:',
      '• Usługa DNS w Windows Server jest zintegrowana z usługą Active Directory i może być używana razem z serwerem DHCP.',
      '• Należy skonfigurować co najmniej jeden statyczny adres IP na tym komputerze.',
    ],
  },
  { id: 'FAX', name: 'Serwer faksów', nav: 'Faks', desc: 'Serwer faksów wysyła i odbiera faksy oraz umożliwia zarządzanie zasobami faksu, takimi jak zadania, ustawienia, raporty i urządzenia faksu na tym serwerze.' },
  { id: 'HYPERV', name: 'Hyper-V', nav: 'Hyper-V', desc: 'Rola Hyper-V umożliwia tworzenie maszyn wirtualnych i zarządzanie nimi oraz ich zasobami. Każda maszyna wirtualna to system komputerowy działający w odizolowanym środowisku wykonawczym.', req: [{ id: 'RSAT-Hyper-V-Tools', name: 'Narzędzia administracji serwera zdalnego\\Narzędzia administracji rolami\\Narzędzia Hyper-V' }], intro: ['Funkcja Hyper-V umożliwia tworzenie maszyn wirtualnych i zarządzanie nimi oraz ich zasobami.', 'Zwróć uwagę:', '• Zainstaluj co najmniej jedną kartę sieciową do ruchu maszyn wirtualnych.'] },
  { id: 'HGS', name: 'Usługa Host Guardian Service', nav: 'HGS', desc: 'Usługa Host Guardian Service udostępnia usługi attestation i ochrony kluczy, które umożliwiają uruchamianie osłoniętych maszyn wirtualnych.' },
  {
    id: 'FS',
    name: 'Usługi plików i magazynowania',
    nav: 'Usługi plików i magazynowania',
    desc: 'Usługi plików i magazynowania obejmują usługi, które zawsze są instalowane, a także usługi, które można zainstalować, aby ułatwić zarządzanie wieloma serwerami plików i magazynowaniem.',
    sub: [
      { id: 'FS-FileServer-grp', name: 'Usługi plików i iSCSI', desc: 'Usługi plików i iSCSI zapewniają technologie ułatwiające zarządzanie serwerami plików i magazynowaniem, zmniejszające zużycie miejsca na dysku, replikujące i buforujące pliki w lokalizacjach oddziałów oraz udostępniające pliki za pomocą protokołu NFS.', indent: 1 },
      { id: 'FS-FileServer', name: 'Serwer plików', desc: 'Serwer plików zarządza udziałami plików, do których użytkownicy mają dostęp przez sieć.', indent: 2, def: true },
      { id: 'FS-BranchCache', name: 'Usługa BranchCache dla plików sieciowych', desc: 'Usługa BranchCache dla plików sieciowych zapewnia obsługę buforowania plików w oddziałach.', indent: 2 },
      { id: 'FS-Data-Deduplication', name: 'Deduplikacja danych', desc: 'Deduplikacja danych oszczędza miejsce na dysku, przechowując tylko jedną kopię identycznych danych na woluminie.', indent: 2 },
      { id: 'FS-DFS-Namespace', name: 'Przestrzenie nazw DFS', desc: 'Przestrzenie nazw DFS umożliwiają grupowanie udziałów znajdujących się na różnych serwerach w jedną lub kilka logicznie ustrukturyzowanych przestrzeni nazw.', indent: 2 },
      { id: 'FS-DFS-Replication', name: 'Replikacja systemu plików DFS', desc: 'Replikacja systemu plików DFS to wielomasterowy mechanizm replikacji, który umożliwia synchronizowanie folderów na wielu serwerach.', indent: 2 },
      { id: 'FS-Resource-Manager', name: 'Menedżer zasobów serwera plików', desc: 'Menedżer zasobów serwera plików (FSRM) pomaga zarządzać danymi przechowywanymi na serwerach plików: ustawiać przydziały, filtrować pliki i generować raporty magazynowania.', indent: 2 },
      { id: 'FS-VSS-Agent', name: 'Usługa agenta VSS serwera plików', desc: 'Usługa agenta VSS serwera plików umożliwia wykonywanie kopii w tle aplikacji serwera plików.', indent: 2 },
      { id: 'FS-iSCSITarget-Server', name: 'Serwer docelowy iSCSI', desc: 'Serwer docelowy iSCSI udostępnia usługi i narzędzia zarządzania dla obiektów docelowych iSCSI.', indent: 2 },
      { id: 'FS-NFS-Service', name: 'Serwer NFS', desc: 'Serwer NFS umożliwia udostępnianie plików systemom UNIX przez protokół NFS.', indent: 2 },
      { id: 'Storage-Services', name: 'Usługi magazynowania (zainstalowane)', desc: 'Usługi magazynowania zapewniają funkcje zarządzania magazynem, które zawsze są zainstalowane i nie można ich usunąć.', indent: 1, def: true },
    ],
  },
  { id: 'NPAS', name: 'Usługi zasad i dostępu sieciowego', nav: 'NPAS', desc: 'Usługi zasad i dostępu sieciowego udostępniają serwer zasad sieciowych (NPS), który umożliwia tworzenie i wymuszanie zasad dostępu do sieci.' },
  {
    id: 'PRINT',
    name: 'Usługi drukowania i zarządzania dokumentami',
    nav: 'Usługi drukowania',
    desc: 'Usługi drukowania i zarządzania dokumentami umożliwiają centralizację zadań serwera wydruku i drukarek sieciowych. Za pomocą tej roli można również odbierać zeskanowane dokumenty z drukarek sieciowych i kierować je do udziałów sieciowych.',
    req: [{ id: 'RSAT-Print', name: 'Narzędzia administracji serwera zdalnego\\Narzędzia administracji rolami\\Narzędzia usług drukowania i dokumentów' }],
    intro: ['Usługi drukowania i zarządzania dokumentami umożliwiają zarządzanie serwerami wydruku i drukarkami sieciowymi z jednej konsoli.', 'Zwróć uwagę:', '• Przed instalacją upewnij się, że sterowniki drukarek są dostępne dla klientów.'],
  },
  { id: 'RAS', name: 'Zdalny dostęp', nav: 'Zdalny dostęp', desc: 'Zdalny dostęp zapewnia łączność ze zdalnymi użytkownikami przez DirectAccess, VPN i serwer proxy aplikacji sieci Web.' },
  { id: 'RDS', name: 'Usługi pulpitu zdalnego', nav: 'Usługi pulpitu zdalnego', desc: 'Usługi pulpitu zdalnego umożliwiają użytkownikom dostęp do pulpitów wirtualnych, programów sesyjnych i aplikacji w farmie serwerów.' },
  {
    id: 'IIS',
    name: 'Serwer sieci Web (IIS)',
    nav: 'IIS',
    desc: 'Serwer sieci Web (IIS) udostępnia niezawodną, możliwą do zarządzania i skalowalną infrastrukturę aplikacji sieci Web.',
    req: [{ id: 'Web-Mgmt-Console', name: 'Narzędzia zarządzania\\Konsola zarządzania usługami IIS' }],
    sub: [
      { id: 'Web-Ftp-Server', name: 'Serwer FTP', desc: 'Serwer FTP umożliwia publikowanie plików za pomocą protokołu FTP w witrynach FTP zarządzanych przez usługi IIS.', indent: 1 },
      { id: 'Web-Ftp-Service', name: 'Usługa FTP', desc: 'Usługa FTP umożliwia tworzenie witryn FTP i przesyłanie plików przez protokół FTP.', indent: 2 },
    ],
    intro: [
      'Aby zapewnić bezpieczną i niezawodną infrastrukturę sieci Web, rola serwera sieci Web (IIS) udostępnia serwer WWW, który hostuje witryny i aplikacje sieci Web.',
      'Zwróć uwagę:',
      '• Domyślna instalacja serwera sieci Web (IIS) obejmuje instalację ról usług, które umożliwiają obsługę zawartości statycznej i wykonywanie ogólnych zadań administracyjnych.',
    ],
  },
  { id: 'WDS', name: 'Usługi wdrażania systemu Windows', nav: 'WDS', desc: 'Usługi wdrażania systemu Windows umożliwiają zdalne wdrażanie systemów operacyjnych Windows za pomocą instalacji sieciowej.', req: [{ id: 'WDS-Tools', name: 'Narzędzia administracji serwera zdalnego\\Narzędzia administracji rolami\\Narzędzia usług wdrażania systemu Windows' }], intro: ['Usługi wdrażania systemu Windows umożliwiają zdalne wdrażanie systemów operacyjnych Windows. Można ich używać do konfigurowania nowych komputerów przez instalację sieciową.', 'Zwróć uwagę:', '• Serwer WDS wymaga serwera DHCP i DNS w sieci oraz woluminu NTFS na obrazy.'] },
  { id: 'WSUS', name: 'Windows Server Update Services', nav: 'WSUS', desc: 'Windows Server Update Services umożliwia administratorom sieci określanie aktualizacji firmy Microsoft, które mają zostać zainstalowane, oraz tworzenie grup komputerów i zarządzanie nimi.' },
  { id: 'VAS', name: 'Aktywacja zbiorcza', nav: 'Aktywacja zbiorcza', desc: 'Aktywacja zbiorcza automatyzuje i upraszcza wydawanie licencji zbiorczych dla produktów Microsoft.' },
]

export const FEATURES: { id: string; name: string; desc: string; indent?: number }[] = [
  { id: 'NET-Framework-35', name: '.NET Framework 3.5 (zawiera .NET 2.0 i 3.0)', desc: '.NET Framework 3.5 łączy możliwości interfejsu API .NET Framework 2.0 z nowymi technologiami do tworzenia aplikacji.' },
  { id: 'NET-Framework-45', name: '.NET Framework 4.8 (zainstalowano 2 z 7)', desc: '.NET Framework 4.8 zapewnia kompleksowy model programowania do tworzenia aplikacji.' },
  { id: 'BitLocker', name: 'Szyfrowanie dysków funkcją BitLocker', desc: 'Funkcja BitLocker pomaga chronić dane przez szyfrowanie woluminów dysku.' },
  { id: 'GPMC', name: 'Zarządzanie zasadami grupy', desc: 'Zarządzanie zasadami grupy to narzędzie do zarządzania obiektami zasad grupy (GPO) w całym przedsiębiorstwie.' },
  { id: 'Telnet-Client', name: 'Klient Telnet', desc: 'Klient Telnet umożliwia łączenie się ze zdalnymi serwerami Telnet.' },
  { id: 'Windows-Server-Backup', name: 'Kopia zapasowa systemu Windows Server', desc: 'Kopia zapasowa systemu Windows Server umożliwia tworzenie kopii zapasowych i odzyskiwanie systemu operacyjnego, aplikacji i danych.' },
  { id: 'RSAT', name: 'Narzędzia administracji serwera zdalnego', desc: 'Narzędzia administracji serwera zdalnego obejmują narzędzia do zdalnego zarządzania rolami i funkcjami systemu Windows Server.' },
  { id: 'RSAT-AD-AdminCenter', name: 'Centrum administracyjne usługi Active Directory', desc: 'Centrum administracyjne usługi Active Directory umożliwia zarządzanie obiektami AD przez interfejs oparty na zadaniach.', indent: 1 },
  { id: 'RSAT-ADDS-Tools', name: 'Przystawki i narzędzia wiersza polecenia usług AD DS', desc: 'Przystawki i narzędzia wiersza polecenia usług AD DS, w tym Użytkownicy i komputery usługi Active Directory.', indent: 1 },
  { id: 'SNMP-Service', name: 'Usługa SNMP', desc: 'Usługa SNMP zawiera agentów, którzy monitorują aktywność urządzeń sieciowych.' },
  { id: 'Multipath-IO', name: 'Wielościeżkowe we/wy', desc: 'Wielościeżkowe we/wy zapewnia obsługę wielu ścieżek danych do urządzenia magazynującego.' },
  { id: 'NLB', name: 'Równoważenie obciążenia sieciowego', desc: 'Równoważenie obciążenia sieciowego (NLB) rozdziela ruch IP między wiele serwerów.' },
  { id: 'PowerShell-ISE', name: 'Windows PowerShell ISE', desc: 'Windows PowerShell umożliwia automatyzowanie zadań administracyjnych za pomocą skryptów i poleceń cmdlet.' },
  { id: 'Failover-Clustering', name: 'Klaster trybu failover', desc: 'Klaster trybu failover umożliwia grupie niezależnych serwerów współpracę w celu zwiększenia dostępności aplikacji i usług.' },
]

export const roleOf = (id: string) => ROLES.find((r) => r.id === id)
export const featureName = (id: string) => {
  const r = ROLES.flatMap((x) => x.req ?? []).find((q) => q.id === id)
  return r?.name ?? FEATURES.find((f) => f.id === id)?.name ?? id
}

/** Is the static-IP warning relevant (any enabled adapter on DHCP)? */
export const hasDynamicIp = (st: PcState) => st.adapters.some((a) => a.dhcp)

export const STATIC_IP_WARN = 'Nie skonfigurowano statycznych adresów IP. Ten komputer ma co najmniej jedną kartę sieciową z dynamicznie przypisanym adresem IP (DHCP). Aby zapewnić niezawodne działanie, wszystkie karty sieciowe powinny mieć statyczne adresy IP dla protokołów IPv4 i IPv6.'

// ---------------- Active Directory helpers ----------------
export const DOMAIN_LEVELS = ['Windows Server 2008', 'Windows Server 2008 R2', 'Windows Server 2012', 'Windows Server 2012 R2', 'Windows Server 2016']

export function dnsNameError(n: string): string | null {
  if (!n.trim()) return 'Wprowadź nazwę domeny głównej.'
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i.test(n.trim())) return `Nazwa domeny DNS „${n.trim()}” jest nieprawidłowa. Użyj nazwy zawierającej co najmniej jedną kropkę, np. firma.local (litery, cyfry i myślniki).`
  return null
}
export const netbiosOf = (domain: string) => domain.split('.')[0].toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 15)

/** AD / DSRM password complexity (default domain policy: 7+ chars, 3 of 4 classes, not the account name) */
export function passwordError(pw: string, user = ''): string | null {
  const classes = [/[a-ząćęłńóśźż]/, /[A-ZĄĆĘŁŃÓŚŹŻ]/, /\d/, /[^A-Za-z0-9ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]/].filter((r) => r.test(pw)).length
  if (pw.length < 7 || classes < 3 || (user && pw.toLowerCase().includes(user.toLowerCase()) && user.length > 2)) return 'Hasło nie spełnia wymagań dotyczących długości, złożoności lub historii domeny.'
  return null
}

export const BUILTIN_CONTAINERS = ['Builtin', 'Computers', 'Domain Controllers', 'ForeignSecurityPrincipals', 'Managed Service Accounts', 'Users']

export function initialAd(_host: string): NonNullable<ServerState['ad']> {
  const g = (name: string, scope: AdGroup['scope'], ou: string, members: string[] = []): AdGroup => ({ name, scope, type: 'security', ou, members })
  return {
    ous: [],
    users: [
      { logon: 'Administrator', first: '', last: '', full: 'Administrator', ou: 'Users', neverExpires: true },
      { logon: 'Gość', first: '', last: '', full: 'Gość', ou: 'Users', disabled: true, neverExpires: true },
      { logon: 'krbtgt', first: '', last: '', full: 'krbtgt', ou: 'Users', disabled: true },
    ],
    groups: [
      g('Administratorzy domeny', 'global', 'Users', ['Administrator']),
      g('Administratorzy schematu', 'universal', 'Users', ['Administrator']),
      g('Administratorzy przedsiębiorstwa', 'universal', 'Users', ['Administrator']),
      g('Użytkownicy domeny', 'global', 'Users', ['Administrator']),
      g('Komputery domeny', 'global', 'Users'),
      g('Kontrolery domeny', 'global', 'Users'),
      g('Administratorzy', 'local', 'Builtin', ['Administrator', 'Administratorzy domeny']),
      g('Użytkownicy', 'local', 'Builtin', ['Użytkownicy domeny']),
      g('Operatorzy kont', 'local', 'Builtin'),
      g('Operatorzy kopii zapasowych', 'local', 'Builtin'),
    ],
  }
}
export const adOf = (st: PcState) => srv(st).ad ?? initialAd(st.hostname)

// ---------------- DHCP helpers ----------------
export const dhcpOf = (st: PcState) => srv(st).dhcp ?? { authorized: false, scopes: [] as DhcpScope[] }
export const scopeId = (s: DhcpScope) => networkOf(s.start, s.prefix)
export const fmtLease = (min: number) => {
  const d = Math.floor(min / 1440)
  const h = Math.floor((min % 1440) / 60)
  const m = min % 60
  return `${d} dni, ${h} godz., ${m} min.`
}

export function scopeError(s: DhcpScope, others: DhcpScope[]): string | null {
  const a = ipToInt(s.start)
  const b = ipToInt(s.end)
  if (!s.name.trim()) return 'Wprowadź nazwę zakresu.'
  if (a === null || b === null) return 'Wprowadź prawidłowe adresy IP: początkowy i końcowy.'
  if (b < a) return 'Końcowy adres IP musi być większy od początkowego adresu IP.'
  if (networkOf(s.start, s.prefix) !== networkOf(s.end, s.prefix)) return 'Adresy początkowy i końcowy muszą należeć do tej samej podsieci (sprawdź maskę podsieci).'
  const id = networkOf(s.start, s.prefix)
  if (others.some((o) => networkOf(o.start, o.prefix) === id)) return `Zakres ${id} już istnieje na tym serwerze DHCP.`
  return null
}
export function maskPrefix(mask: string) {
  return maskToPrefix(mask)
}
export { prefixToMask }

export function userDn(u: AdUser, domain: string) {
  return `CN=${u.full},${u.ou === 'Users' || u.ou === 'Builtin' || u.ou === 'Computers' ? 'CN' : 'OU'}=${u.ou},${domain.split('.').map((x) => `DC=${x}`).join(',')}`
}

// ---------------- Narzędzia menu ----------------
export interface ToolDef {
  label: string
  /** needs this role / feature installed (missing = always there) */
  req?: string
  /** real console in the simulator (PcSim app key + arg); missing = empty MMC shell */
  app?: string
  arg?: string
}
const TOOLS: ToolDef[] = [
  { label: 'Centrum administracyjne usługi Active Directory', req: 'RSAT-AD-AdminCenter' },
  { label: 'Defragmentacja i optymalizacja dysków' },
  { label: 'DHCP', req: 'DHCP', app: 'dhcpmgmt' },
  { label: 'DNS', req: 'DNS', app: 'dnsmgmt' },
  { label: 'Domeny i relacje zaufania usługi Active Directory', req: 'ADDS' },
  { label: 'Edycja ADSI', req: 'ADDS' },
  { label: 'Harmonogram zadań' },
  { label: 'Informacje o systemie', app: 'msinfo32' },
  { label: 'Inicjator iSCSI' },
  { label: 'Konfiguracja systemu' },
  { label: 'Menedżer internetowych usług informacyjnych (IIS)', req: 'IIS', app: 'inetmgr' },
  { label: 'Menedżer zasobów serwera plików', req: 'FS-Resource-Manager' },
  { label: 'Monitor wydajności' },
  { label: 'Podgląd zdarzeń' },
  { label: 'Usługi' },
  { label: 'Usługi składowe' },
  { label: 'Użytkownicy i komputery usługi Active Directory', req: 'ADDS', app: 'aduc' },
  { label: 'Windows PowerShell', app: 'cmd', arg: 'ps' },
  { label: 'Witryny i usługi usługi Active Directory', req: 'ADDS' },
  { label: 'Zapora Windows Defender z zabezpieczeniami zaawansowanymi', app: 'wf' },
  { label: 'Zarządzanie drukowaniem', req: 'PRINT' },
  { label: 'Zarządzanie komputerem', app: 'compmgmt' },
  { label: 'Zarządzanie zasadami grupy', req: 'GPMC', app: 'gpmc' },
  { label: 'Zasady zabezpieczeń lokalnych' },
  { label: 'Źródła danych ODBC (64-bitowe)' },
]
export function serverTools(st: PcState): ToolDef[] {
  const v = srv(st)
  const have = (id: string) => v.roles.includes(id) || v.features.includes(id)
  return TOOLS.filter((t) => !t.req || have(t.req)).sort((a, b) => a.label.localeCompare(b.label, 'pl'))
}
