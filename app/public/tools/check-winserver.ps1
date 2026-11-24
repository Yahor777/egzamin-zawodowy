<#
.SYNOPSIS
  Самопроверка конфигурации Windows Server 2019/2022 (и Windows 10/11) для практики INF.02.

.DESCRIPTION
  Скрипт ТОЛЬКО ЧИТАЕТ настройки и печатает отчёт на русском:
    ✔ — настроено / ожидание выполнено, ✘ — нет / ожидание не выполнено, • — информация.
  Разделы: сетевые адаптеры, роли, домен AD (OU, пользователи, группы), DNS, DHCP, IIS,
  общие папки + NTFS, GPO, квоты (FSRM и NTFS), принтеры, брандмауэр (ICMPv4), RDP,
  маршрутизация, локальные пользователи, политика паролей, ping.
  Если роль/модуль не установлены — раздел пропускается.

  КАК ЗАПУСТИТЬ (PowerShell «Uruchom jako administrator»):
      cd C:\sciezka\do\skryptu
      Set-ExecutionPolicy -Scope Process Bypass
      .\check-winserver.ps1
      .\check-winserver.ps1 -Expect .\expect.json
      .\check-winserver.ps1 -Expect .\expect.json -Ascii -OutFile C:\raport.txt

  -Ascii   — маркеры [+] [-] [*] вместо ✔ ✘ • (если консоль показывает «квадратики»).
  -OutFile — дополнительно сохранить отчёт в файл (UTF-8).
  Файл скрипта сохранён в UTF-8 с BOM — не пересохраняй его в «ANSI», иначе русский текст сломается.

  ПРИМЕР expect.json (все ключи необязательные, пиши только нужные):
  {
    "hostname": "SERWER05",
    "domain": "egzamin.local",
    "adapters": [
      {"name":"LAN_Z","ip":"172.16.11.5","prefix":25,"gateway":"","dns":["127.0.0.1"]},
      {"name":"LAN_W","ip":"192.168.0.15","prefix":24,"gateway":"192.168.0.3","dns":["localhost"]},
      {"name":"LANZ","dhcp":true},
      {"name":"Ethernet 3","enabled":false}
    ],
    "roles": ["AD-Domain-Services","DNS","Web-Server"],
    "ous": ["Uczniowie","Egzaminatorzy"],
    "users": ["zbabacki", {"name":"jabacki","ou":"Egzaminatorzy","fullName":"Jan Abacki",
              "cannotChangePassword":true,"passwordNeverExpires":true,"changeAtLogon":false,
              "profilePath":"\\\\SERWER05\\profile$\\jabacki","groups":["Egzamin"]}],
    "groups": [{"name":"Egzamin","scope":"Global","members":["jabacki","zbabacki"]}],
    "computers": [{"name":"STACJA05","ou":"Pracownicy"}],
    "dnsZones": ["egzamin.local","1.168.192.in-addr.arpa"],
    "dnsRecords": [{"zone":"egzamin.local","name":"www","type":"A","data":"192.168.1.101"},
                   {"zone":"egzamin.local","name":"INF02","type":"CNAME","data":"pracownia.egzamin.local"}],
    "dhcpScopes": [{"start":"192.168.0.10","end":"192.168.0.99","router":"192.168.0.1","dns":"192.168.0.1","domain":"egzamin.local"}],
    "dhcpReservations": ["192.168.0.50"],
    "sites": [{"name":"egzamin","path":"C:\\www","ip":"192.168.0.205","port":80,"host":"www.egzamin.local","defaultDoc":"egzamin.html"}],
    "shares": ["dane$", {"name":"profile$","path":"C:\\Profile","maxUsers":10,
               "shareAccess":[{"account":"Wszyscy","right":"Full"}],
               "ntfs":[{"account":"Administratorzy","rights":"FullControl"}],"inheritanceDisabled":true}],
    "folders": [{"path":"C:\\app","ntfs":[{"account":"IUSR","rights":"ReadAndExecute"}]}],
    "gpos": [{"name":"Panel","link":"Uczniowie","settings":["Panelu sterowania"]}],
    "quotas": [{"path":"C:\\DOKUMENTY","sizeMB":100}],
    "ntfsQuota": {"volume":"C:","enforced":true,"users":[{"name":"jnowak","limitMB":-1}]},
    "printers": [{"name":"Egzamin_druk","share":"Egzamin_druk","ip":"192.168.0.200","priority":99,
                  "from":"8:00","to":"22:00","perms":[{"account":"Egzamin","right":"Drukuj"}]}],
    "icmp": true,
    "firewallEnabled": true,
    "rdp": true,
    "routing": true,
    "localUsers": [{"name":"tester","fullName":"Jan Kowalski","enabled":true}],
    "localGroups": [{"name":"testerzy","members":["tester"]}],
    "passwordPolicy": {"minLength":8,"complexity":true,"lockoutThreshold":3},
    "ping": ["192.168.0.1","192.168.0.200"]
  }
#>
[CmdletBinding()]
param(
    [string]$Expect,
    [switch]$Ascii,
    [string]$OutFile
)

$ErrorActionPreference = 'Continue'
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch { }

if ($Ascii) {
    $script:M_OK = '[+]'; $script:M_BAD = '[-]'; $script:M_INFO = '[*]'
} else {
    $script:M_OK = [string][char]0x2714; $script:M_BAD = [string][char]0x2718; $script:M_INFO = [string][char]0x2022
}
$script:Report = New-Object System.Collections.Generic.List[string]
$script:PassCount = 0
$script:FailCount = 0
$script:E = $null

# ---------------------------------------------------------------- вывод
function Out-Line([string]$Text, [string]$Color = 'Gray') {
    Write-Host $Text -ForegroundColor $Color
    $script:Report.Add($Text)
}
function Write-Section([string]$Title) {
    Out-Line ''
    Out-Line ('=== ' + $Title + ' ===') 'Cyan'
}
function Write-Info([string]$Text) { Out-Line ('  ' + $script:M_INFO + ' ' + $Text) 'Gray' }
function Write-Sub([string]$Text) { Out-Line ('      ' + $Text) 'DarkGray' }
function Write-Ok([string]$Text) { Out-Line ('  ' + $script:M_OK + ' ' + $Text) 'Green' }
function Write-Bad([string]$Text) { Out-Line ('  ' + $script:M_BAD + ' ' + $Text) 'Red' }
function Write-Skip([string]$Text) { Out-Line ('  ' + $script:M_INFO + ' ' + $Text) 'DarkYellow' }
function Write-State([bool]$Cond, [string]$Text) { if ($Cond) { Write-Ok $Text } else { Write-Bad $Text } }

function Assert-Exp([bool]$Cond, [string]$Text, [string]$Actual = '') {
    if ($Cond) {
        $script:PassCount++
        Out-Line ('  ' + $script:M_OK + ' [ожидание] ' + $Text) 'Green'
    } else {
        $script:FailCount++
        $t = '  ' + $script:M_BAD + ' [ожидание] ' + $Text
        if ($Actual -ne '') { $t += '  — сейчас: ' + $Actual }
        Out-Line $t 'Red'
    }
}

function Invoke-Section([string]$Title, [scriptblock]$Body) {
    Write-Section $Title
    try { & $Body }
    catch { Write-Skip ('Раздел пропущен из-за ошибки: ' + $_.Exception.Message) }
}

# ---------------------------------------------------------------- ожидания (JSON)
function Get-P($Obj, [string]$Name) {
    if ($null -eq $Obj) { return $null }
    if ($Obj -is [string]) { if ($Name -eq 'name') { return $Obj } else { return $null } }
    $p = $Obj.PSObject.Properties[$Name]
    if ($null -ne $p) { return $p.Value }
    return $null
}
function Test-Prop($Obj, [string]$Name) {
    if ($null -eq $Obj -or $Obj -is [string]) { return $false }
    return ($null -ne $Obj.PSObject.Properties[$Name])
}
function Test-ExpKey([string]$Key) {
    if ($null -eq $script:E) { return $false }
    return ($null -ne $script:E.PSObject.Properties[$Key])
}
function Get-ExpValue([string]$Key) {
    if (-not (Test-ExpKey $Key)) { return $null }
    return $script:E.PSObject.Properties[$Key].Value
}
function Get-ExpList([string]$Key) {
    $v = Get-ExpValue $Key
    if ($null -eq $v) { return ,@() }
    return ,@($v)
}
function Set-MissingExp([string[]]$Keys, [string]$Reason) {
    foreach ($k in $Keys) {
        foreach ($item in (Get-ExpList $k)) {
            $n = Get-P $item 'name'
            if (-not $n) { $n = Get-P $item 'path' }
            if (-not $n) { $n = Get-P $item 'ip' }
            if (-not $n) { $n = ($item | Out-String).Trim() }
            Assert-Exp $false ('{0}: {1}' -f $k, $n) $Reason
        }
    }
}
function ConvertTo-DnsIp([string]$s) {
    if ($s -ieq 'localhost') { return '127.0.0.1' }
    return $s
}
function Format-HHmm([string]$s) {
    if (-not $s) { return '' }
    $parts = $s.Split(':')
    if ($parts.Count -lt 2) { return $s }
    return ('{0:D2}:{1:D2}' -f [int]$parts[0], [int]$parts[1])
}
function Format-Size($Bytes) {
    if ($null -eq $Bytes) { return 'brak' }
    $b = [double]$Bytes
    if ($b -lt 0 -or $b -ge 1.8e19) { return 'bez limitu' }
    return ('{0:N0} MB' -f ($b / 1MB))
}
function Test-EndsWithI([string]$Text, [string]$Tail) {
    if ($null -eq $Text -or $null -eq $Tail) { return $false }
    return $Text.EndsWith($Tail, [System.StringComparison]::OrdinalIgnoreCase)
}

# ---------------------------------------------------------------- NTFS
$script:NtfsMap = @{
    'f' = 'FullControl'; 'pełna kontrola' = 'FullControl'; 'full' = 'FullControl'
    'm' = 'Modify'; 'modyfikacja' = 'Modify'
    'rx' = 'ReadAndExecute'; 'odczyt i wykonywanie' = 'ReadAndExecute'; 'wyświetlanie zawartości folderu' = 'ReadAndExecute'
    'r' = 'Read'; 'odczyt' = 'Read'
    'w' = 'Write'; 'zapis' = 'Write'
    'ad' = 'AppendData'; 'tworzenie folderów' = 'AppendData'; 'createdirectories' = 'AppendData'
}
function Show-Ntfs([string]$Path) {
    if (-not (Test-Path -LiteralPath $Path)) { Write-Bad ('Путь не существует: ' + $Path); return $null }
    $acl = Get-Acl -LiteralPath $Path
    $inh = 'включено'
    if ($acl.AreAccessRulesProtected) { $inh = 'ОТКЛЮЧЕНО' }
    Write-Sub ('NTFS {0}: владелец {1}; наследование {2}' -f $Path, $acl.Owner, $inh)
    foreach ($r in $acl.Access) {
        $flag = ''
        if ($r.IsInherited) { $flag = ' (унаследовано)' }
        Write-Sub ('  {0}: {1} [{2}]{3}' -f $r.IdentityReference, $r.FileSystemRights, $r.AccessControlType, $flag)
    }
    return $acl
}
function Test-NtfsExp($Acl, $ExpObj, [string]$Label) {
    if ($null -eq $Acl) { return }
    if (Test-Prop $ExpObj 'inheritanceDisabled') {
        $want = [bool](Get-P $ExpObj 'inheritanceDisabled')
        Assert-Exp ($Acl.AreAccessRulesProtected -eq $want) ('{0}: наследование отключено = {1}' -f $Label, $want) ([string]$Acl.AreAccessRulesProtected)
    }
    if (Test-Prop $ExpObj 'owner') {
        $o = [string](Get-P $ExpObj 'owner')
        Assert-Exp (Test-EndsWithI $Acl.Owner $o) ('{0}: владелец {1}' -f $Label, $o) $Acl.Owner
    }
    foreach ($n in @(Get-P $ExpObj 'ntfs')) {
        if ($null -eq $n) { continue }
        $acc = [string](Get-P $n 'account')
        $rightsWanted = [string](Get-P $n 'rights')
        $key = $rightsWanted.ToLower()
        if ($script:NtfsMap.ContainsKey($key)) { $rightsWanted = $script:NtfsMap[$key] }
        $hit = $false
        $actual = @()
        foreach ($r in $Acl.Access) {
            if (Test-EndsWithI ([string]$r.IdentityReference) $acc) {
                $actual += [string]$r.FileSystemRights
                if ($r.AccessControlType -eq 'Allow' -and ([string]$r.FileSystemRights) -match [regex]::Escape($rightsWanted)) { $hit = $true }
            }
        }
        $act = 'нет записи'
        if ($actual.Count -gt 0) { $act = $actual -join '; ' }
        Assert-Exp $hit ('{0}: NTFS {1} = {2}' -f $Label, $acc, $rightsWanted) $act
    }
}

# ---------------------------------------------------------------- старт
$isAdmin = $false
try {
    $isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
} catch { }

Out-Line ('Самопроверка INF.02 — {0} — {1}' -f $env:COMPUTERNAME, (Get-Date -Format 'yyyy-MM-dd HH:mm')) 'White'
if (-not $isAdmin) { Write-Skip 'Скрипт запущен БЕЗ прав администратора — часть данных (квоты, политика, ACL) может быть недоступна.' }

if ($Expect) {
    if (Test-Path -LiteralPath $Expect) {
        try {
            $raw = Get-Content -LiteralPath $Expect -Raw -Encoding UTF8
            $script:E = $raw | ConvertFrom-Json
            Write-Info ('Файл ожиданий загружен: ' + $Expect)
        } catch {
            Write-Bad ('Не удалось прочитать JSON ' + $Expect + ': ' + $_.Exception.Message)
        }
    } else {
        Write-Bad ('Файл ожиданий не найден: ' + $Expect)
    }
}

$cs = $null
$script:IsDC = $false

# ================================================================= 1. Система
Invoke-Section 'Система' {
    $script:cs = Get-CimInstance Win32_ComputerSystem
    $os = Get-CimInstance Win32_OperatingSystem
    $script:IsDC = ($script:cs.DomainRole -ge 4)
    Write-Info ('Имя компьютера: {0}' -f $env:COMPUTERNAME)
    Write-Info ('ОС: {0} (сборка {1})' -f $os.Caption, $os.BuildNumber)
    if ($script:cs.PartOfDomain) { Write-Info ('Член домена: {0}' -f $script:cs.Domain) }
    else { Write-Info ('Рабочая группа: {0}' -f $script:cs.Workgroup) }
    if ($script:IsDC) { Write-Ok 'Этот сервер — контроллер домена' }
    if (Test-ExpKey 'hostname') {
        $h = [string](Get-ExpValue 'hostname')
        Assert-Exp ($env:COMPUTERNAME -ieq $h) ('имя компьютера = ' + $h) $env:COMPUTERNAME
    }
    if (Test-ExpKey 'domain') {
        $d = [string](Get-ExpValue 'domain')
        Assert-Exp ($script:cs.PartOfDomain -and ($script:cs.Domain -ieq $d)) ('домен = ' + $d) ([string]$script:cs.Domain)
    }
    if (Test-ExpKey 'workgroup') {
        $w = [string](Get-ExpValue 'workgroup')
        Assert-Exp ((-not $script:cs.PartOfDomain) -and ($script:cs.Workgroup -ieq $w)) ('рабочая группа = ' + $w) ([string]$script:cs.Workgroup)
    }
}

# ================================================================= 2. Сеть
Invoke-Section 'Сетевые адаптеры (IPv4)' {
    $adapters = @(Get-NetAdapter -ErrorAction Stop | Sort-Object Name)
    $cimCfg = @(Get-CimInstance Win32_NetworkAdapterConfiguration -ErrorAction SilentlyContinue)
    $info = @{}
    foreach ($a in $adapters) {
        $idx = $a.ifIndex
        $ips = @(Get-NetIPAddress -InterfaceIndex $idx -AddressFamily IPv4 -ErrorAction SilentlyContinue)
        $ipif = Get-NetIPInterface -InterfaceIndex $idx -AddressFamily IPv4 -ErrorAction SilentlyContinue
        $gw = @(Get-NetRoute -InterfaceIndex $idx -DestinationPrefix '0.0.0.0/0' -ErrorAction SilentlyContinue |
                ForEach-Object { $_.NextHop } | Where-Object { $_ -and $_ -ne '0.0.0.0' })
        $cfg = $cimCfg | Where-Object { $_.InterfaceIndex -eq $idx } | Select-Object -First 1
        if ($gw.Count -eq 0 -and $cfg -and $cfg.DefaultIPGateway) {
            $gw = @($cfg.DefaultIPGateway | Where-Object { $_ -match '^\d+\.\d+\.\d+\.\d+$' })
        }
        $dns = @()
        $dnsObj = Get-DnsClientServerAddress -InterfaceIndex $idx -AddressFamily IPv4 -ErrorAction SilentlyContinue
        if ($dnsObj) { $dns = @($dnsObj.ServerAddresses) }
        $dhcp = ''
        if ($ipif) { $dhcp = [string]$ipif.Dhcp }
        $reg = $null
        try { $reg = (Get-DnsClient -InterfaceIndex $idx -ErrorAction Stop).RegisterThisConnectionsAddress } catch { }
        $info[$a.Name] = [pscustomobject]@{ Adapter = $a; IPs = $ips; GW = $gw; DNS = $dns; Dhcp = $dhcp; Reg = $reg }

        $head = '{0}  [{1}]  MAC {2}  {3}  ({4})' -f $a.Name, $a.Status, $a.MacAddress, $a.LinkSpeed, $a.InterfaceDescription
        if ($a.Status -eq 'Up') { Write-Ok $head } else { Write-Info $head }
        $ipText = ($ips | ForEach-Object { '{0}/{1} ({2})' -f $_.IPAddress, $_.PrefixLength, $_.PrefixOrigin }) -join ', '
        if (-not $ipText) { $ipText = '—' }
        $gwText = $gw -join ', '
        if (-not $gwText) { $gwText = 'brak' }
        $dnsText = $dns -join ', '
        if (-not $dnsText) { $dnsText = 'brak' }
        Write-Sub ('IPv4: {0}' -f $ipText)
        Write-Sub ('Brama: {0} | DNS: {1} | DHCP: {2} | Rejestracja w DNS: {3}' -f $gwText, $dnsText, $dhcp, $reg)
    }

    try {
        $teams = @(Get-NetLbfoTeam -ErrorAction Stop)
        foreach ($t in $teams) {
            Write-Ok ('NIC Teaming: {0} — członkowie: {1}; tryb {2}; równoważenie {3}' -f $t.Name, (($t.Members) -join ', '), $t.TeamingMode, $t.LoadBalancingAlgorithm)
        }
    } catch { }

    foreach ($ea in (Get-ExpList 'adapters')) {
        $n = [string](Get-P $ea 'name')
        $hit = $null
        foreach ($k in $info.Keys) { if ($k -ieq $n) { $hit = $info[$k] } }
        if ($null -eq $hit) {
            Assert-Exp $false ("адаптер '{0}' существует" -f $n) ((@($info.Keys) | Sort-Object) -join ', ')
            continue
        }
        Assert-Exp $true ("адаптер '{0}' существует" -f $n)
        if (Test-Prop $ea 'enabled') {
            $want = [bool](Get-P $ea 'enabled')
            $is = ($hit.Adapter.Status -ne 'Disabled')
            Assert-Exp ($want -eq $is) ('{0}: включён = {1}' -f $n, $want) ([string]$hit.Adapter.Status)
        }
        $haveIps = @($hit.IPs | ForEach-Object { $_.IPAddress })
        if (Test-Prop $ea 'ip') {
            $want = [string](Get-P $ea 'ip')
            Assert-Exp ($haveIps -contains $want) ('{0}: IP {1}' -f $n, $want) ($haveIps -join ', ')
        }
        if (Test-Prop $ea 'prefix') {
            $want = [int](Get-P $ea 'prefix')
            $entry = $null
            if (Test-Prop $ea 'ip') { $entry = $hit.IPs | Where-Object { $_.IPAddress -eq [string](Get-P $ea 'ip') } | Select-Object -First 1 }
            if ($null -eq $entry) { $entry = $hit.IPs | Select-Object -First 1 }
            $have = ''
            if ($entry) { $have = [string]$entry.PrefixLength }
            Assert-Exp ($have -eq [string]$want) ('{0}: префикс /{1}' -f $n, $want) ('/' + $have)
        }
        if (Test-Prop $ea 'gateway') {
            $want = [string](Get-P $ea 'gateway')
            if ($want -eq '' -or $want -ieq 'none' -or $want -ieq 'brak') {
                Assert-Exp ($hit.GW.Count -eq 0) ('{0}: без шлюза' -f $n) ($hit.GW -join ', ')
            } else {
                Assert-Exp ($hit.GW -contains $want) ('{0}: шлюз {1}' -f $n, $want) ($hit.GW -join ', ')
            }
        }
        if (Test-Prop $ea 'dns') {
            $want = @(@(Get-P $ea 'dns') | Where-Object { $_ -ne $null -and $_ -ne '' -and $_ -ine 'brak' } | ForEach-Object { ConvertTo-DnsIp ([string]$_) })
            $have = @($hit.DNS)
            Assert-Exp (($want -join ',') -eq ($have -join ',')) ('{0}: DNS {1}' -f $n, ($(if ($want.Count) { $want -join ', ' } else { 'brak' }))) ($have -join ', ')
        }
        if (Test-Prop $ea 'dhcp') {
            $want = [bool](Get-P $ea 'dhcp')
            Assert-Exp (($hit.Dhcp -eq 'Enabled') -eq $want) ('{0}: DHCP = {1}' -f $n, $want) $hit.Dhcp
        }
        if (Test-Prop $ea 'registerDns') {
            $want = [bool](Get-P $ea 'registerDns')
            Assert-Exp ($hit.Reg -eq $want) ('{0}: rejestracja w DNS = {1}' -f $n, $want) ([string]$hit.Reg)
        }
    }
    if (Test-ExpKey 'team') {
        $et = Get-ExpValue 'team'
        $tn = [string](Get-P $et 'name')
        $t = $null
        try { $t = Get-NetLbfoTeam -Name $tn -ErrorAction Stop } catch { }
        Assert-Exp ($null -ne $t) ('NIC Teaming ' + $tn)
        if ($t) {
            foreach ($m in @(Get-P $et 'members')) { if ($m) { Assert-Exp (@($t.Members) -contains $m) ('{0}: член {1}' -f $tn, $m) (($t.Members) -join ', ') } }
            if (Test-Prop $et 'mode') { Assert-Exp ([string]$t.TeamingMode -ieq [string](Get-P $et 'mode')) ('{0}: tryb {1}' -f $tn, (Get-P $et 'mode')) ([string]$t.TeamingMode) }
            if (Test-Prop $et 'lb') { Assert-Exp ([string]$t.LoadBalancingAlgorithm -ieq [string](Get-P $et 'lb')) ('{0}: równoważenie {1}' -f $tn, (Get-P $et 'lb')) ([string]$t.LoadBalancingAlgorithm) }
        }
    }
}

# ================================================================= 3. Роли
Invoke-Section 'Роли и компоненты' {
    if (-not (Get-Command Get-WindowsFeature -ErrorAction SilentlyContinue)) {
        Write-Skip 'Get-WindowsFeature недоступен (это не Windows Server) — пропуск.'
        Set-MissingExp @('roles') 'нет Get-WindowsFeature'
        return
    }
    $names = 'AD-Domain-Services', 'DNS', 'DHCP', 'Web-Server', 'Web-Ftp-Server', 'Print-Services', 'Print-Server', 'FS-Resource-Manager', 'RemoteAccess', 'Routing'
    foreach ($f in (Get-WindowsFeature -Name $names -ErrorAction Stop)) {
        $t = '{0} — {1}' -f $f.Name, $f.DisplayName
        if ($f.Installed) { Write-Ok ($t + ': установлена') } else { Write-Info ($t + ': не установлена') }
    }
    foreach ($r in (Get-ExpList 'roles')) {
        $f = Get-WindowsFeature -Name ([string]$r) -ErrorAction SilentlyContinue
        $st = 'нет такой роли'
        if ($f) { $st = [string]$f.InstallState }
        Assert-Exp ($f -and $f.Installed) ('роль {0} установлена' -f $r) $st
    }
}

# ================================================================= 4. Active Directory
Invoke-Section 'Active Directory: домен, OU, пользователи, группы' {
    if (-not (Get-Module -ListAvailable -Name ActiveDirectory)) {
        Write-Skip 'Модуль ActiveDirectory не найден (AD DS не установлена) — пропуск.'
        Set-MissingExp @('ous', 'users', 'groups', 'computers') 'нет AD'
        return
    }
    Import-Module ActiveDirectory -ErrorAction Stop -WarningAction SilentlyContinue
    $dom = $null
    try { $dom = Get-ADDomain -ErrorAction Stop } catch {
        Write-Bad 'Домен недоступен (сервер не контроллер домена или служба AD не запущена).'
        Set-MissingExp @('ous', 'users', 'groups', 'computers') 'домен недоступен'
        return
    }
    Write-Ok ('Домен: {0} (NetBIOS {1}), las: {2}, poziom: {3}' -f $dom.DNSRoot, $dom.NetBIOSName, $dom.Forest, $dom.DomainMode)

    $ous = @(Get-ADOrganizationalUnit -Filter * -ErrorAction Stop | Sort-Object DistinguishedName)
    Write-Info ('Jednostki organizacyjne ({0}):' -f $ous.Count)
    foreach ($o in $ous) { Write-Sub ('{0}   [{1}]' -f $o.Name, $o.DistinguishedName) }
    foreach ($eo in (Get-ExpList 'ous')) {
        $n = [string](Get-P $eo 'name')
        Assert-Exp (@($ous | Where-Object { $_.Name -ieq $n }).Count -gt 0) ('OU ' + $n)
    }

    $props = 'DisplayName', 'PasswordNeverExpires', 'CannotChangePassword', 'ProfilePath', 'HomeDirectory', 'pwdLastSet', 'MemberOf', 'LogonHours', 'AccountExpirationDate'
    $users = @(Get-ADUser -Filter * -Properties $props -ErrorAction Stop |
               Where-Object { $_.SID.Value -notmatch '-(501|502|503)$' } | Sort-Object SamAccountName)
    Write-Info ('Użytkownicy ({0}):' -f $users.Count)
    foreach ($u in $users) {
        $parent = ($u.DistinguishedName -split ',', 2)[1]
        $grp = @($u.MemberOf | ForEach-Object { ($_ -split ',')[0] -replace '^CN=', '' }) -join ', '
        $lh = ''
        if ($null -ne $u.LogonHours -and @($u.LogonHours | Where-Object { $_ -ne 255 }).Count -gt 0) { $lh = '; godziny logowania OGRANICZONE' }
        Write-Sub ('{0} ({1}) — {2}' -f $u.SamAccountName, $u.Name, $parent)
        Write-Sub ('    włączone={0}; nie może zmienić hasła={1}; hasło nigdy nie wygasa={2}; musi zmienić przy logowaniu={3}{4}' -f $u.Enabled, $u.CannotChangePassword, $u.PasswordNeverExpires, ($u.pwdLastSet -eq 0), $lh)
        if ($u.ProfilePath -or $grp) { Write-Sub ('    profil: {0}; grupy: {1}' -f $u.ProfilePath, $grp) }
    }
    foreach ($eu in (Get-ExpList 'users')) {
        $sam = [string](Get-P $eu 'name')
        $u = $users | Where-Object { $_.SamAccountName -ieq $sam } | Select-Object -First 1
        Assert-Exp ($null -ne $u) ('пользователь домена ' + $sam) 'не найден'
        if ($null -eq $u) { continue }
        if (Test-Prop $eu 'ou') {
            $ou = [string](Get-P $eu 'ou')
            Assert-Exp ($u.DistinguishedName -match ('(?i),OU=' + [regex]::Escape($ou) + ',')) ('{0} в OU {1}' -f $sam, $ou) $u.DistinguishedName
        }
        if (Test-Prop $eu 'fullName') { $v = [string](Get-P $eu 'fullName'); Assert-Exp ($u.Name -ieq $v) ('{0}: pełna nazwa {1}' -f $sam, $v) $u.Name }
        if (Test-Prop $eu 'enabled') { $v = [bool](Get-P $eu 'enabled'); Assert-Exp ($u.Enabled -eq $v) ('{0}: włączone = {1}' -f $sam, $v) ([string]$u.Enabled) }
        if (Test-Prop $eu 'cannotChangePassword') { $v = [bool](Get-P $eu 'cannotChangePassword'); Assert-Exp ($u.CannotChangePassword -eq $v) ('{0}: nie może zmienić hasła = {1}' -f $sam, $v) ([string]$u.CannotChangePassword) }
        if (Test-Prop $eu 'passwordNeverExpires') { $v = [bool](Get-P $eu 'passwordNeverExpires'); Assert-Exp ($u.PasswordNeverExpires -eq $v) ('{0}: hasło nigdy nie wygasa = {1}' -f $sam, $v) ([string]$u.PasswordNeverExpires) }
        if (Test-Prop $eu 'changeAtLogon') { $v = [bool](Get-P $eu 'changeAtLogon'); Assert-Exp (($u.pwdLastSet -eq 0) -eq $v) ('{0}: musi zmienić hasło przy logowaniu = {1}' -f $sam, $v) ([string]($u.pwdLastSet -eq 0)) }
        if (Test-Prop $eu 'profilePath') {
            $v = ([string](Get-P $eu 'profilePath')).TrimEnd('\')
            $have = ([string]$u.ProfilePath).TrimEnd('\')
            Assert-Exp ($have -ieq $v) ('{0}: ścieżka profilu {1}' -f $sam, $v) $have
        }
        foreach ($g in @(Get-P $eu 'groups')) {
            if (-not $g) { continue }
            $in = @($u.MemberOf | Where-Object { $_ -match ('(?i)^CN=' + [regex]::Escape([string]$g) + ',') }).Count -gt 0
            Assert-Exp $in ('{0} członkiem grupy {1}' -f $sam, $g)
        }
    }

    $groups = @(Get-ADGroup -Filter * -Properties isCriticalSystemObject, whenCreated -ErrorAction Stop |
                Where-Object { -not $_.isCriticalSystemObject -and $_.Name -notmatch '(?i)DnsAdmins|DnsUpdateProxy|DHCP|WinRMRemoteWMIUsers' } |
                Sort-Object Name)
    Write-Info ('Grupy utworzone (bez wbudowanych) ({0}):' -f $groups.Count)
    foreach ($g in $groups) {
        $mem = ''
        try { $mem = @(Get-ADGroupMember -Identity $g -ErrorAction Stop | ForEach-Object { $_.SamAccountName }) -join ', ' } catch { $mem = '?' }
        Write-Sub ('{0} [{1}/{2}] — {3}; członkowie: {4}' -f $g.Name, $g.GroupScope, $g.GroupCategory, (($g.DistinguishedName -split ',', 2)[1]), $mem)
    }
    foreach ($eg in (Get-ExpList 'groups')) {
        $gn = [string](Get-P $eg 'name')
        $g = $null
        try { $g = Get-ADGroup -Identity $gn -ErrorAction Stop } catch { }
        Assert-Exp ($null -ne $g) ('grupa domenowa ' + $gn) 'nie znaleziono'
        if ($null -eq $g) { continue }
        if (Test-Prop $eg 'scope') { $v = [string](Get-P $eg 'scope'); Assert-Exp ([string]$g.GroupScope -ieq $v) ('{0}: zakres {1}' -f $gn, $v) ([string]$g.GroupScope) }
        if (Test-Prop $eg 'ou') { $v = [string](Get-P $eg 'ou'); Assert-Exp ($g.DistinguishedName -match ('(?i),OU=' + [regex]::Escape($v) + ',')) ('{0} w OU {1}' -f $gn, $v) $g.DistinguishedName }
        $members = @()
        try { $members = @(Get-ADGroupMember -Identity $g -ErrorAction Stop | ForEach-Object { $_.SamAccountName }) } catch { }
        foreach ($m in @(Get-P $eg 'members')) {
            if ($m) { Assert-Exp ($members -contains $m) ('{0}: członek {1}' -f $gn, $m) ($members -join ', ') }
        }
    }

    $comps = @(Get-ADComputer -Filter * -ErrorAction Stop | Sort-Object Name)
    Write-Info ('Komputery ({0}):' -f $comps.Count)
    foreach ($c in $comps) { Write-Sub ('{0} — {1}' -f $c.Name, (($c.DistinguishedName -split ',', 2)[1])) }
    foreach ($ec in (Get-ExpList 'computers')) {
        $cn = [string](Get-P $ec 'name')
        $c = $comps | Where-Object { $_.Name -ieq $cn } | Select-Object -First 1
        Assert-Exp ($null -ne $c) ('komputer w domenie ' + $cn) 'nie znaleziono'
        if ($c -and (Test-Prop $ec 'ou')) {
            $v = [string](Get-P $ec 'ou')
            Assert-Exp ($c.DistinguishedName -match ('(?i),OU=' + [regex]::Escape($v) + ',')) ('{0} w OU {1}' -f $cn, $v) $c.DistinguishedName
        }
    }
    try {
        $pp = Get-ADDefaultDomainPasswordPolicy -ErrorAction Stop
        Write-Info ('Domyślne zasady haseł domeny: złożoność={0}, min. długość={1}, próg blokady={2}, czas blokady={3}' -f $pp.ComplexityEnabled, $pp.MinPasswordLength, $pp.LockoutThreshold, $pp.LockoutDuration)
    } catch { }
}

# ================================================================= 5. DNS
Invoke-Section 'DNS: strefy i rekordy' {
    if (-not (Get-Command Get-DnsServerZone -ErrorAction SilentlyContinue)) {
        Write-Skip 'Модуль DnsServer не найден (роль DNS не установлена) — пропуск.'
        Set-MissingExp @('dnsZones', 'dnsRecords') 'нет роли DNS'
        return
    }
    $zones = @(Get-DnsServerZone -ErrorAction Stop | Where-Object { -not $_.IsAutoCreated -and $_.ZoneName -ne 'TrustAnchors' } | Sort-Object ZoneName)
    $allRec = @{}
    foreach ($z in $zones) {
        $kind = 'do przodu'
        if ($z.IsReverseLookupZone) { $kind = 'wsteczna' }
        Write-Ok ('Strefa {0} ({1}, {2}, AD={3})' -f $z.ZoneName, $kind, $z.ZoneType, $z.IsDsIntegrated)
        try {
            $soa = Get-DnsServerResourceRecord -ZoneName $z.ZoneName -RRType Soa -ErrorAction Stop | Select-Object -First 1
            if ($soa) { Write-Sub ('SOA: odświeżanie {0}, ponawianie {1}, wygasa po {2}' -f $soa.RecordData.RefreshInterval, $soa.RecordData.RetryDelay, $soa.RecordData.ExpireLimit) }
        } catch { }
        $recs = @(Get-DnsServerResourceRecord -ZoneName $z.ZoneName -ErrorAction SilentlyContinue |
                  Where-Object { $_.RecordType -in @('A', 'AAAA', 'CNAME', 'PTR', 'MX') -and $_.HostName -notin @('@', 'DomainDnsZones', 'ForestDnsZones') })
        $list = @()
        foreach ($r in $recs) {
            $data = ''
            switch ($r.RecordType) {
                'A' { $data = $r.RecordData.IPv4Address.IPAddressToString }
                'AAAA' { $data = $r.RecordData.IPv6Address.IPAddressToString }
                'CNAME' { $data = $r.RecordData.HostNameAlias }
                'PTR' { $data = $r.RecordData.PtrDomainName }
                'MX' { $data = $r.RecordData.MailExchange }
            }
            $list += [pscustomobject]@{ Name = $r.HostName; Type = [string]$r.RecordType; Data = [string]$data }
            Write-Sub ('{0,-20} {1,-6} {2}' -f $r.HostName, $r.RecordType, $data)
        }
        $allRec[$z.ZoneName.ToLower()] = $list
    }
    foreach ($ez in (Get-ExpList 'dnsZones')) {
        $n = [string](Get-P $ez 'name')
        Assert-Exp (@($zones | Where-Object { $_.ZoneName -ieq $n }).Count -gt 0) ('strefa DNS ' + $n)
    }
    foreach ($er in (Get-ExpList 'dnsRecords')) {
        $zn = ([string](Get-P $er 'zone')).ToLower()
        $rn = [string](Get-P $er 'name')
        $rt = [string](Get-P $er 'type')
        $rd = ([string](Get-P $er 'data')).TrimEnd('.')
        $cand = @()
        if ($allRec.ContainsKey($zn)) { $cand = @($allRec[$zn] | Where-Object { $_.Name -ieq $rn }) }
        if ($rt) { $cand = @($cand | Where-Object { $_.Type -ieq $rt }) }
        if ($rd) { $cand = @($cand | Where-Object { $_.Data.TrimEnd('.') -ieq $rd }) }
        Assert-Exp ($cand.Count -gt 0) ('rekord {0} {1} w {2} {3}' -f $rn, $rt, $zn, $rd)
    }
}

# ================================================================= 6. DHCP
Invoke-Section 'DHCP: zakresy, opcje, rezerwacje' {
    if (-not (Get-Command Get-DhcpServerv4Scope -ErrorAction SilentlyContinue)) {
        Write-Skip 'Модуль DhcpServer не найден (роль DHCP не установлена) — пропуск.'
        Set-MissingExp @('dhcpScopes', 'dhcpReservations') 'нет роли DHCP'
        return
    }
    try {
        $auth = @(Get-DhcpServerInDC -ErrorAction Stop)
        if ($auth.Count -gt 0) { Write-Ok ('Autoryzowane serwery DHCP w AD: ' + (($auth | ForEach-Object { '{0} ({1})' -f $_.DnsName, $_.IPAddress }) -join ', ')) }
        else { Write-Bad 'Brak autoryzowanych serwerów DHCP w AD (ПКМ на сервере → Autoryzuj)' }
    } catch { Write-Info 'Autoryzacja: brak danych (serwer poza domeną?)' }
    try {
        foreach ($b in (Get-DhcpServerv4Binding -ErrorAction Stop)) { Write-Info ('Powiązanie: {0} ({1}) = {2}' -f $b.InterfaceAlias, $b.IPAddress, $b.BindingState) }
    } catch { }
    $scopes = @(Get-DhcpServerv4Scope -ErrorAction Stop)
    if ($scopes.Count -eq 0) { Write-Bad 'Brak zakresów DHCP' }
    $scopeInfo = @()
    foreach ($s in $scopes) {
        $opts = @{}
        try { foreach ($o in (Get-DhcpServerv4OptionValue -ScopeId $s.ScopeId -ErrorAction Stop)) { $opts[[int]$o.OptionId] = ($o.Value -join ',') } } catch { }
        try { foreach ($o in (Get-DhcpServerv4OptionValue -ErrorAction Stop)) { if (-not $opts.ContainsKey([int]$o.OptionId)) { $opts[[int]$o.OptionId] = ($o.Value -join ',') } } } catch { }
        $state = [string]$s.State
        $line = 'Zakres {0} "{1}": {2} – {3} maska {4}, dzierżawa {5}, stan {6}' -f $s.ScopeId, $s.Name, $s.StartRange, $s.EndRange, $s.SubnetMask, $s.LeaseDuration, $state
        if ($state -eq 'Active') { Write-Ok $line } else { Write-Bad $line }
        Write-Sub ('opcja 003 Router: {0} | 006 DNS: {1} | 015 Domena: {2}' -f $opts[3], $opts[6], $opts[15])
        $res = @()
        try { $res = @(Get-DhcpServerv4Reservation -ScopeId $s.ScopeId -ErrorAction Stop) } catch { }
        foreach ($r in $res) { Write-Sub ('rezerwacja {0} → {1} ({2})' -f $r.IPAddress, $r.ClientId, $r.Name) }
        try { $leases = @(Get-DhcpServerv4Lease -ScopeId $s.ScopeId -ErrorAction Stop); Write-Sub ('dzierżawy aktywne: {0}' -f $leases.Count) } catch { }
        $scopeInfo += [pscustomobject]@{ Scope = $s; Opts = $opts; Res = $res }
    }
    foreach ($es in (Get-ExpList 'dhcpScopes')) {
        $st = [string](Get-P $es 'start'); $en = [string](Get-P $es 'end')
        $hit = $scopeInfo | Where-Object { ([string]$_.Scope.StartRange -eq $st) -and ([string]$_.Scope.EndRange -eq $en) } | Select-Object -First 1
        Assert-Exp ($null -ne $hit) ('zakres DHCP {0} – {1}' -f $st, $en) (($scopes | ForEach-Object { '{0}-{1}' -f $_.StartRange, $_.EndRange }) -join ', ')
        if ($null -eq $hit) { continue }
        if (Test-Prop $es 'mask') { $v = [string](Get-P $es 'mask'); Assert-Exp ([string]$hit.Scope.SubnetMask -eq $v) ('zakres: maska ' + $v) ([string]$hit.Scope.SubnetMask) }
        if (Test-Prop $es 'router') { $v = [string](Get-P $es 'router'); Assert-Exp ([string]$hit.Opts[3] -match [regex]::Escape($v)) ('zakres: router ' + $v) ([string]$hit.Opts[3]) }
        if (Test-Prop $es 'dns') { $v = [string](Get-P $es 'dns'); Assert-Exp ([string]$hit.Opts[6] -match [regex]::Escape($v)) ('zakres: DNS ' + $v) ([string]$hit.Opts[6]) }
        if (Test-Prop $es 'domain') { $v = [string](Get-P $es 'domain'); Assert-Exp ([string]$hit.Opts[15] -ieq $v) ('zakres: domena ' + $v) ([string]$hit.Opts[15]) }
    }
    $allRes = @($scopeInfo | ForEach-Object { $_.Res })
    foreach ($er in (Get-ExpList 'dhcpReservations')) {
        $ip = [string](Get-P $er 'ip')
        if (-not $ip) { $ip = [string]$er }
        $r = $allRes | Where-Object { [string]$_.IPAddress -eq $ip } | Select-Object -First 1
        Assert-Exp ($null -ne $r) ('rezerwacja DHCP ' + $ip)
        if ($r -and (Test-Prop $er 'mac')) {
            $m = ([string](Get-P $er 'mac')).ToLower() -replace '[^0-9a-f]', ''
            $hm = ([string]$r.ClientId).ToLower() -replace '[^0-9a-f]', ''
            Assert-Exp ($m -eq $hm) ('rezerwacja {0}: MAC {1}' -f $ip, (Get-P $er 'mac')) ([string]$r.ClientId)
        }
    }
}

# ================================================================= 7. IIS
Invoke-Section 'IIS: witryny, powiązania, dokument domyślny' {
    if (-not (Get-Module -ListAvailable -Name WebAdministration)) {
        Write-Skip 'Модуль WebAdministration не найден (IIS не установлен) — пропуск.'
        Set-MissingExp @('sites') 'нет IIS'
        return
    }
    Import-Module WebAdministration -ErrorAction Stop
    $sites = @(Get-ChildItem 'IIS:\Sites' -ErrorAction Stop)
    $siteInfo = @()
    foreach ($s in $sites) {
        $path = [Environment]::ExpandEnvironmentVariables([string]$s.physicalPath)
        $binds = @($s.bindings.Collection | ForEach-Object { '{0} {1}' -f $_.protocol, $_.bindingInformation })
        $line = 'Witryna "{0}" [{1}] → {2}' -f $s.Name, $s.State, $path
        if ($s.State -eq 'Started') { Write-Ok $line } else { Write-Info $line }
        if (-not (Test-Path -LiteralPath $path)) { Write-Bad ('    folder nie istnieje: ' + $path) }
        Write-Sub ('powiązania: ' + ($binds -join ' | ') + '   (format IP:port:nazwa_hosta)')
        $docs = @()
        try {
            $docs = @(Get-WebConfiguration -PSPath ('IIS:\Sites\' + $s.Name) -Filter 'system.webServer/defaultDocument/files/add' -ErrorAction Stop | ForEach-Object { $_.value })
            Write-Sub ('dokument domyślny (kolejność): ' + (($docs | Select-Object -First 6) -join ', '))
        } catch { }
        $isFtp = @($s.bindings.Collection | Where-Object { $_.protocol -eq 'ftp' }).Count -gt 0
        if ($isFtp) {
            try {
                $anon = (Get-WebConfigurationProperty -PSPath 'IIS:\' -Location $s.Name -Filter 'system.ftpServer/security/authentication/anonymousAuthentication' -Name enabled -ErrorAction Stop).Value
                $basic = (Get-WebConfigurationProperty -PSPath 'IIS:\' -Location $s.Name -Filter 'system.ftpServer/security/authentication/basicAuthentication' -Name enabled -ErrorAction Stop).Value
                Write-Sub ('FTP uwierzytelnianie: anonimowe={0}, podstawowe={1}; SSL: {2}' -f $anon, $basic, $s.ftpServer.security.ssl.controlChannelPolicy)
                foreach ($rule in (Get-WebConfiguration -PSPath 'IIS:\' -Location $s.Name -Filter 'system.ftpServer/security/authorization/add' -ErrorAction Stop)) {
                    Write-Sub ('FTP autoryzacja: {0} users="{1}" roles="{2}" uprawnienia={3}' -f $rule.accessType, $rule.users, $rule.roles, $rule.permissions)
                }
            } catch { }
        }
        $siteInfo += [pscustomobject]@{ Name = $s.Name; Path = $path; Bind = @($s.bindings.Collection); Docs = $docs; State = [string]$s.State }
    }
    foreach ($es in (Get-ExpList 'sites')) {
        $n = [string](Get-P $es 'name')
        $s = $siteInfo | Where-Object { $_.Name -ieq $n } | Select-Object -First 1
        Assert-Exp ($null -ne $s) ('witryna IIS ' + $n) (($siteInfo | ForEach-Object { $_.Name }) -join ', ')
        if ($null -eq $s) { continue }
        Assert-Exp ($s.State -eq 'Started') ('{0}: uruchomiona' -f $n) $s.State
        if (Test-Prop $es 'path') { $v = ([string](Get-P $es 'path')).TrimEnd('\'); Assert-Exp ($s.Path.TrimEnd('\') -ieq $v) ('{0}: ścieżka {1}' -f $n, $v) $s.Path }
        if ((Test-Prop $es 'ip') -or (Test-Prop $es 'port') -or (Test-Prop $es 'host') -or (Test-Prop $es 'protocol')) {
            $wIp = [string](Get-P $es 'ip'); $wPort = [string](Get-P $es 'port'); $wHost = [string](Get-P $es 'host'); $wProt = [string](Get-P $es 'protocol')
            $ok = $false
            foreach ($b in $s.Bind) {
                $p = ([string]$b.bindingInformation).Split(':')
                if ($p.Count -lt 3) { continue }
                if ($wIp -and $p[0] -ne $wIp) { continue }
                if ($wPort -and $p[1] -ne $wPort) { continue }
                if ($wHost -and $p[2] -ine $wHost) { continue }
                if ($wProt -and $b.protocol -ine $wProt) { continue }
                $ok = $true
            }
            Assert-Exp $ok ('{0}: powiązanie {1} {2}:{3}:{4}' -f $n, $wProt, $wIp, $wPort, $wHost) (($s.Bind | ForEach-Object { '{0} {1}' -f $_.protocol, $_.bindingInformation }) -join ' | ')
        }
        if (Test-Prop $es 'defaultDoc') {
            $v = [string](Get-P $es 'defaultDoc')
            $first = ''
            if ($s.Docs.Count -gt 0) { $first = [string]$s.Docs[0] }
            Assert-Exp ($s.Docs -contains $v) ('{0}: dokument domyślny {1} (pierwszy na liście: {2})' -f $n, $v, $first) (($s.Docs | Select-Object -First 5) -join ', ')
        }
    }
}

# ================================================================= 8. SMB + NTFS
Invoke-Section 'Udostępnione foldery (SMB) i uprawnienia NTFS' {
    $shares = @(Get-SmbShare -ErrorAction Stop | Where-Object { $_.Name -notmatch '^(ADMIN\$|IPC\$|[A-Za-z]\$|print\$)$' } | Sort-Object Name)
    $shareInfo = @{}
    foreach ($sh in $shares) {
        if ($sh.Name -in @('NETLOGON', 'SYSVOL')) { Write-Info ('{0} → {1} (systemowy udział DC)' -f $sh.Name, $sh.Path); continue }
        $lim = 'bez limitu'
        if ($sh.ConcurrentUserLimit -gt 0) { $lim = [string]$sh.ConcurrentUserLimit }
        Write-Ok ('Udział "{0}" → {1}; opis: {2}; maks. użytkowników: {3}' -f $sh.Name, $sh.Path, $sh.Description, $lim)
        $acc = @()
        try { $acc = @(Get-SmbShareAccess -Name $sh.Name -ErrorAction Stop) } catch { }
        foreach ($a in $acc) { Write-Sub ('udostępnianie: {0} = {1} ({2})' -f $a.AccountName, $a.AccessRight, $a.AccessControlType) }
        $acl = $null
        if ($sh.Path -and ([string]$sh.ShareType -match 'FileSystem')) { $acl = Show-Ntfs $sh.Path }
        $shareInfo[$sh.Name.ToLower()] = [pscustomobject]@{ Share = $sh; Access = $acc; Acl = $acl }
    }
    foreach ($es in (Get-ExpList 'shares')) {
        $n = [string](Get-P $es 'name')
        $key = $n.ToLower()
        $hit = $null
        if ($shareInfo.ContainsKey($key)) { $hit = $shareInfo[$key] }
        Assert-Exp ($null -ne $hit) ('udział ' + $n) ((@($shareInfo.Keys)) -join ', ')
        if ($null -eq $hit) { continue }
        if (Test-Prop $es 'path') { $v = ([string](Get-P $es 'path')).TrimEnd('\'); Assert-Exp (([string]$hit.Share.Path).TrimEnd('\') -ieq $v) ('{0}: ścieżka {1}' -f $n, $v) $hit.Share.Path }
        if (Test-Prop $es 'maxUsers') { $v = [int](Get-P $es 'maxUsers'); Assert-Exp ([int]$hit.Share.ConcurrentUserLimit -eq $v) ('{0}: maks. użytkowników {1}' -f $n, $v) ([string]$hit.Share.ConcurrentUserLimit) }
        if (Test-Prop $es 'description') { $v = [string](Get-P $es 'description'); Assert-Exp ([string]$hit.Share.Description -eq $v) ('{0}: opis "{1}"' -f $n, $v) $hit.Share.Description }
        foreach ($sa in @(Get-P $es 'shareAccess')) {
            if ($null -eq $sa) { continue }
            $acc = [string](Get-P $sa 'account'); $right = [string](Get-P $sa 'right')
            switch -Regex ($right) { '(?i)pełna|full' { $right = 'Full' } '(?i)zmian|change' { $right = 'Change' } '(?i)odczyt|read' { $right = 'Read' } }
            $m = @($hit.Access | Where-Object { (Test-EndsWithI $_.AccountName $acc) -and ([string]$_.AccessRight -eq $right) -and ([string]$_.AccessControlType -eq 'Allow') })
            Assert-Exp ($m.Count -gt 0) ('{0}: udostępnianie {1} = {2}' -f $n, $acc, $right) (($hit.Access | ForEach-Object { '{0}={1}' -f $_.AccountName, $_.AccessRight }) -join '; ')
        }
        if (Test-Prop $es 'onlyAccounts') {
            $want = @(Get-P $es 'onlyAccounts')
            $extra = @($hit.Access | Where-Object { $a = $_.AccountName; -not (@($want | Where-Object { Test-EndsWithI $a ([string]$_) }).Count) })
            Assert-Exp ($extra.Count -eq 0) ('{0}: w udostępnianiu tylko {1}' -f $n, ($want -join ', ')) (($extra | ForEach-Object { $_.AccountName }) -join ', ')
        }
        Test-NtfsExp $hit.Acl $es ('udział ' + $n)
    }
    foreach ($ef in (Get-ExpList 'folders')) {
        $p = [string](Get-P $ef 'path')
        Write-Info ('Folder z oczekiwań: ' + $p)
        $acl = Show-Ntfs $p
        Assert-Exp ($null -ne $acl) ('folder istnieje ' + $p)
        Test-NtfsExp $acl $ef $p
    }
}

# ================================================================= 9. GPO
Invoke-Section 'Zasady grupy (GPO) i ich połączenia' {
    if (-not (Get-Module -ListAvailable -Name GroupPolicy)) {
        Write-Skip 'Модуль GroupPolicy не найден (нет GPMC) — пропуск.'
        Set-MissingExp @('gpos') 'нет GPMC'
        return
    }
    Import-Module GroupPolicy -ErrorAction Stop
    $gpos = @(Get-GPO -All -ErrorAction Stop | Sort-Object DisplayName)
    $gpoInfo = @()
    foreach ($g in $gpos) {
        $links = @(); $settings = New-Object System.Collections.Generic.List[string]
        try {
            [xml]$x = Get-GPOReport -Guid $g.Id -ReportType Xml -ErrorAction Stop
            $links = @($x.GPO.LinksTo | Where-Object { $_ } | ForEach-Object { '{0}{1}' -f $_.SOMPath, $(if ($_.Enabled -eq 'false') { ' (wyłączone)' } else { '' }) })
            foreach ($nd in $x.SelectNodes("//*[local-name()='Policy']")) {
                $nm = $nd.SelectSingleNode("*[local-name()='Name']"); $st = $nd.SelectSingleNode("*[local-name()='State']")
                if ($nm) { $settings.Add(('{0} = {1}' -f $nm.InnerText, $(if ($st) { $st.InnerText } else { '' }))) }
            }
            foreach ($nd in $x.SelectNodes("//*[local-name()='Account']")) {
                $nm = $nd.SelectSingleNode("*[local-name()='Name']")
                $v = $nd.SelectSingleNode("*[local-name()='SettingNumber' or local-name()='SettingBoolean' or local-name()='SettingString']")
                if ($nm) { $settings.Add(('{0} = {1}' -f $nm.InnerText, $(if ($v) { $v.InnerText } else { '' }))) }
            }
            foreach ($nd in $x.SelectNodes("//*[local-name()='SecurityOptions']")) {
                $nm = $nd.SelectSingleNode("*[local-name()='Display']/*[local-name()='Name']")
                if (-not $nm) { $nm = $nd.SelectSingleNode("*[local-name()='KeyName' or local-name()='SystemAccessPolicyName']") }
                $v = $nd.SelectSingleNode("*[local-name()='Display']/*[local-name()='DisplayBoolean' or local-name()='DisplayString' or local-name()='DisplayNumber']")
                if (-not $v) { $v = $nd.SelectSingleNode("*[local-name()='SettingNumber' or local-name()='SettingString']") }
                if ($nm) { $settings.Add(('{0} = {1}' -f $nm.InnerText, $(if ($v) { $v.InnerText } else { '' }))) }
            }
            foreach ($nd in $x.SelectNodes("//*[local-name()='Audit']")) {
                $nm = $nd.SelectSingleNode("*[local-name()='Name']")
                $s1 = $nd.SelectSingleNode("*[local-name()='SuccessAttempts']"); $f1 = $nd.SelectSingleNode("*[local-name()='FailureAttempts']")
                if ($nm) { $settings.Add(('Inspekcja: {0} sukces={1} niepowodzenie={2}' -f $nm.InnerText, $(if ($s1) { $s1.InnerText }), $(if ($f1) { $f1.InnerText }))) }
            }
            foreach ($nd in $x.SelectNodes("//*[local-name()='UserRightsAssignment']")) {
                $nm = $nd.SelectSingleNode("*[local-name()='Name']")
                $mem = @($nd.SelectNodes("*[local-name()='Member']/*[local-name()='Name']") | ForEach-Object { $_.InnerText }) -join ', '
                if ($nm) { $settings.Add(('Prawo: {0} = {1}' -f $nm.InnerText, $mem)) }
            }
            foreach ($nd in $x.SelectNodes("//*[local-name()='MsiApplication']")) {
                $nm = $nd.SelectSingleNode("*[local-name()='Name']"); $pth = $nd.SelectSingleNode("*[local-name()='Path']"); $dt = $nd.SelectSingleNode("*[local-name()='DeploymentType']")
                $settings.Add(('Instalacja oprogramowania: {0} {1} ({2})' -f $(if ($nm) { $nm.InnerText }), $(if ($pth) { $pth.InnerText }), $(if ($dt) { $dt.InnerText })))
            }
            foreach ($nd in $x.SelectNodes("//*[local-name()='PrinterConnection' or local-name()='SharedPrinter']")) {
                $pth = $nd.SelectSingleNode("*[local-name()='Path']")
                $settings.Add(('Drukarka: {0}' -f $(if ($pth) { $pth.InnerText } else { $nd.InnerText })))
            }
            foreach ($nd in $x.SelectNodes("//*[local-name()='RuleCollection']")) {
                $settings.Add(('AppLocker: {0} tryb={1}' -f $nd.GetAttribute('Type'), $nd.GetAttribute('EnforcementMode')))
            }
        } catch { $settings.Add('(nie udało się odczytać raportu: ' + $_.Exception.Message + ')') }
        $lt = 'NIE POŁĄCZONY'
        if ($links.Count -gt 0) { $lt = $links -join ', ' }
        $line = 'GPO "{0}" [{1}] → połączony z: {2}' -f $g.DisplayName, $g.GpoStatus, $lt
        if ($links.Count -gt 0) { Write-Ok $line } else { Write-Info $line }
        foreach ($st in $settings) { Write-Sub $st }
        $gpoInfo += [pscustomobject]@{ Name = $g.DisplayName; Links = $links; Settings = $settings }
    }
    foreach ($eg in (Get-ExpList 'gpos')) {
        $n = [string](Get-P $eg 'name')
        $g = $gpoInfo | Where-Object { $_.Name -ieq $n } | Select-Object -First 1
        Assert-Exp ($null -ne $g) ('GPO ' + $n) (($gpoInfo | ForEach-Object { $_.Name }) -join ', ')
        if ($null -eq $g) { continue }
        if (Test-Prop $eg 'link') {
            $v = [string](Get-P $eg 'link')
            $ok = @($g.Links | Where-Object { $_ -like ('*' + $v + '*') }).Count -gt 0
            Assert-Exp $ok ('{0}: połączony z {1}' -f $n, $v) ($g.Links -join ', ')
        }
        foreach ($sv in @(Get-P $eg 'settings')) {
            if (-not $sv) { continue }
            $ok = @($g.Settings | Where-Object { $_ -like ('*' + $sv + '*') }).Count -gt 0
            Assert-Exp $ok ('{0}: ustawienie zawiera "{1}"' -f $n, $sv)
        }
    }
}

# ================================================================= 10. Квоты
Invoke-Section 'Przydziały: FSRM i NTFS' {
    if (Get-Command Get-FsrmQuota -ErrorAction SilentlyContinue) {
        $q = @()
        try { $q = @(Get-FsrmQuota -ErrorAction Stop) } catch { Write-Skip ('FSRM: ' + $_.Exception.Message) }
        if ($q.Count -eq 0) { Write-Info 'FSRM: brak przydziałów' }
        foreach ($x in $q) {
            $type = 'twardy'
            if ($x.SoftLimit) { $type = 'miękki' }
            Write-Ok ('FSRM: {0} — limit {1:N0} MB ({2}), szablon: {3}' -f $x.Path, ($x.Size / 1MB), $type, $x.Template)
        }
        foreach ($eq in (Get-ExpList 'quotas')) {
            $p = ([string](Get-P $eq 'path')).TrimEnd('\')
            $hit = $q | Where-Object { ([string]$_.Path).TrimEnd('\') -ieq $p } | Select-Object -First 1
            Assert-Exp ($null -ne $hit) ('przydział FSRM ' + $p)
            if ($hit -and (Test-Prop $eq 'sizeMB')) {
                $v = [double](Get-P $eq 'sizeMB')
                Assert-Exp ([math]::Abs(($hit.Size / 1MB) - $v) -lt 1) ('{0}: limit {1} MB' -f $p, $v) ('{0:N0} MB' -f ($hit.Size / 1MB))
            }
        }
    } else {
        Write-Skip 'FSRM nie jest zainstalowany — pomijam przydziały folderów.'
        Set-MissingExp @('quotas') 'нет FSRM'
    }

    $qs = @()
    try { $qs = @(Get-CimInstance Win32_QuotaSetting -ErrorAction Stop) } catch { Write-Skip ('NTFS: ' + $_.Exception.Message) }
    $stateNames = @{ 0 = 'wyłączone'; 1 = 'śledzenie'; 2 = 'wymuszane (odmowa miejsca)' }
    $anyOn = $false
    foreach ($s in $qs) {
        $st = [int]$s.State
        $txt = 'NTFS przydział {0}: {1}; domyślny limit {2}; ostrzeżenie {3}' -f $s.VolumePath, $stateNames[$st], (Format-Size $s.DefaultLimit), (Format-Size $s.DefaultWarningLimit)
        if ($st -gt 0) { $anyOn = $true; Write-Ok $txt } else { Write-Info $txt }
    }
    $entries = @()
    if ($anyOn) {
        try {
            $entries = @(Get-CimInstance Win32_DiskQuota -ErrorAction Stop)
            foreach ($d in $entries) {
                $lim = [double]$d.Limit; $war = [double]$d.WarningLimit
                $limT = if ($lim -ge 1.8e19 -or $lim -lt 0) { 'bez limitu' } else { '{0:N0} MB' -f ($lim / 1MB) }
                $warT = if ($war -ge 1.8e19 -or $war -lt 0) { 'bez limitu' } else { '{0:N0} MB' -f ($war / 1MB) }
                Write-Sub ('wpis: {0}\{1} na {2}: limit {3}, ostrzeżenie {4}' -f $d.User.Domain, $d.User.Name, $d.QuotaVolume.DeviceID, $limT, $warT)
            }
        } catch { }
    }
    if (Test-ExpKey 'ntfsQuota') {
        $eq = Get-ExpValue 'ntfsQuota'
        $vol = ([string](Get-P $eq 'volume')).TrimEnd('\')
        $s = $qs | Where-Object { ([string]$_.VolumePath).TrimEnd('\') -ieq $vol -or ([string]$_.Caption).TrimEnd('\') -ieq $vol } | Select-Object -First 1
        if (Test-Prop $eq 'enforced') {
            $want = [bool](Get-P $eq 'enforced')
            $is = ($s -and [int]$s.State -eq 2)
            Assert-Exp ($is -eq $want) ('{0}: odmów miejsca przekraczającym limit = {1}' -f $vol, $want) $(if ($s) { $stateNames[[int]$s.State] } else { 'brak' })
        }
        foreach ($eu in @(Get-P $eq 'users')) {
            if ($null -eq $eu) { continue }
            $un = [string](Get-P $eu 'name')
            $d = $entries | Where-Object { $_.User.Name -ieq $un } | Select-Object -First 1
            Assert-Exp ($null -ne $d) ('wpis przydziału dla ' + $un)
            if ($d -and (Test-Prop $eu 'limitMB')) {
                $v = [double](Get-P $eu 'limitMB'); $lim = [double]$d.Limit
                $ok = if ($v -lt 0) { ($lim -ge 1.8e19 -or $lim -lt 0) } else { [math]::Abs($lim / 1MB - $v) -lt 1 }
                Assert-Exp $ok ('{0}: limit {1} MB (-1 = bez limitu)' -f $un, $v) ('{0:N0} MB' -f ($lim / 1MB))
            }
            if ($d -and (Test-Prop $eu 'warningMB')) {
                $v = [double](Get-P $eu 'warningMB'); $war = [double]$d.WarningLimit
                Assert-Exp ([math]::Abs($war / 1MB - $v) -lt 1) ('{0}: ostrzeżenie {1} MB' -f $un, $v) ('{0:N0} MB' -f ($war / 1MB))
            }
        }
    }
}

# ================================================================= 11. Принтеры
Invoke-Section 'Drukarki' {
    if (-not (Get-Command Get-Printer -ErrorAction SilentlyContinue)) { Write-Skip 'Brak modułu PrintManagement — pomijam.'; return }
    $printers = @(Get-Printer -ErrorAction Stop | Where-Object { $_.Name -notmatch '(?i)^(Microsoft (Print to PDF|XPS)|Fax|OneNote|Wyślij do)' })
    $pInfo = @()
    foreach ($p in $printers) {
        $port = $null
        try { $port = Get-PrinterPort -Name $p.PortName -ErrorAction Stop } catch { }
        $addr = ''
        if ($port -and $port.PrinterHostAddress) {
            $proto = 'LPR'
            if ([int]$port.Protocol -eq 1) { $proto = 'RAW' }
            $addr = '{0}:{1} {2}' -f $port.PrinterHostAddress, $port.PortNumber, $proto
        }
        $w = $null
        try { $w = Get-CimInstance Win32_Printer -Filter ("Name='{0}'" -f (($p.Name -replace '\\', '\\') -replace "'", "\'")) -ErrorAction Stop } catch { }
        $from = ''; $to = ''; $prio = ''
        if ($w) {
            $prio = [string]$w.Priority
            if ($w.StartTime -and ([string]$w.StartTime).Length -ge 12) { $from = ([string]$w.StartTime).Substring(8, 2) + ':' + ([string]$w.StartTime).Substring(10, 2) }
            if ($w.UntilTime -and ([string]$w.UntilTime).Length -ge 12) { $to = ([string]$w.UntilTime).Substring(8, 2) + ':' + ([string]$w.UntilTime).Substring(10, 2) }
        }
        $avail = 'zawsze'
        if ($from) { $avail = $from + '–' + $to }
        $sharedTxt = 'nieudostępniona'
        if ($p.Shared) { $sharedTxt = 'udział "' + $p.ShareName + '"' }
        Write-Ok ('Drukarka "{0}" — sterownik {1}; port {2} {3}; {4}' -f $p.Name, $p.DriverName, $p.PortName, $addr, $sharedTxt)
        Write-Sub ('priorytet {0}; dostępność {1}' -f $prio, $avail)
        $perm = @{}
        try {
            $full = Get-Printer -Name $p.Name -Full -ErrorAction Stop
            $sd = New-Object System.Security.AccessControl.RawSecurityDescriptor($full.PermissionSDDL)
            foreach ($ace in $sd.DiscretionaryAcl) {
                if (-not ($ace -is [System.Security.AccessControl.CommonAce])) { continue }
                $nm = $ace.SecurityIdentifier.Value
                try { $nm = $ace.SecurityIdentifier.Translate([System.Security.Principal.NTAccount]).Value } catch { }
                if (-not $perm.ContainsKey($nm)) { $perm[$nm] = New-Object System.Collections.Generic.List[string] }
                $deny = ($ace.AceQualifier -eq [System.Security.AccessControl.AceQualifier]::AccessDenied)
                $io = (($ace.AceFlags -band [System.Security.AccessControl.AceFlags]::InheritOnly) -ne 0)
                $parts = @()
                if ($io) { $parts += 'Zarządzaj dokumentami' }
                else {
                    if ($ace.AccessMask -band 0x4) { $parts += 'Zarządzaj tą drukarką' }
                    if ($ace.AccessMask -band 0x8) { $parts += 'Drukuj' }
                    if ($parts.Count -eq 0) { $parts += ('maska 0x{0:X}' -f $ace.AccessMask) }
                }
                foreach ($pt in $parts) {
                    $t = $pt
                    if ($deny) { $t = 'ODMÓW ' + $pt }
                    if (-not $perm[$nm].Contains($t)) { $perm[$nm].Add($t) }
                }
            }
            foreach ($k in ($perm.Keys | Sort-Object)) { Write-Sub ('zabezpieczenia: {0} = {1}' -f $k, ($perm[$k] -join ', ')) }
        } catch { }
        $pInfo += [pscustomobject]@{ P = $p; Port = $port; Prio = $prio; From = $from; To = $to; Perm = $perm }
    }
    foreach ($ep in (Get-ExpList 'printers')) {
        $n = [string](Get-P $ep 'name')
        $h = $pInfo | Where-Object { $_.P.Name -ieq $n -or $_.P.ShareName -ieq $n } | Select-Object -First 1
        Assert-Exp ($null -ne $h) ('drukarka ' + $n) (($pInfo | ForEach-Object { $_.P.Name }) -join ', ')
        if ($null -eq $h) { continue }
        if (Test-Prop $ep 'share') { $v = [string](Get-P $ep 'share'); Assert-Exp ($h.P.Shared -and $h.P.ShareName -ieq $v) ('{0}: udział {1}' -f $n, $v) ([string]$h.P.ShareName) }
        if (Test-Prop $ep 'ip') { $v = [string](Get-P $ep 'ip'); Assert-Exp ($h.Port -and [string]$h.Port.PrinterHostAddress -eq $v) ('{0}: adres {1}' -f $n, $v) $(if ($h.Port) { [string]$h.Port.PrinterHostAddress } else { '' }) }
        if (Test-Prop $ep 'priority') { $v = [string](Get-P $ep 'priority'); Assert-Exp ($h.Prio -eq $v) ('{0}: priorytet {1}' -f $n, $v) $h.Prio }
        if (Test-Prop $ep 'from') { $v = Format-HHmm ([string](Get-P $ep 'from')); Assert-Exp ($h.From -eq $v) ('{0}: dostępna od {1}' -f $n, $v) $h.From }
        if (Test-Prop $ep 'to') { $v = Format-HHmm ([string](Get-P $ep 'to')); Assert-Exp ($h.To -eq $v) ('{0}: dostępna do {1}' -f $n, $v) $h.To }
        foreach ($pp in @(Get-P $ep 'perms')) {
            if ($null -eq $pp) { continue }
            $acc = [string](Get-P $pp 'account'); $right = [string](Get-P $pp 'right')
            $ok = $false
            foreach ($k in $h.Perm.Keys) { if ((Test-EndsWithI $k $acc) -and ($h.Perm[$k] -contains $right)) { $ok = $true } }
            Assert-Exp $ok ('{0}: {1} = {2}' -f $n, $acc, $right)
        }
    }
}

# ================================================================= 12. Брандмауэр
Invoke-Section 'Zapora: profile i ICMPv4 (ping)' {
    $profiles = @(Get-NetFirewallProfile -ErrorAction Stop)
    foreach ($p in $profiles) { Write-State ([string]$p.Enabled -eq 'True') ('Profil {0}: włączony={1}, domyślnie przychodzące={2}' -f $p.Name, $p.Enabled, $p.DefaultInboundAction) }
    $inEnabled = @(Get-NetFirewallRule -Direction Inbound -Enabled True -ErrorAction SilentlyContinue).Count
    Write-Info ('Włączonych reguł przychodzących: {0}' -f $inEnabled)
    $echoOk = $false
    $pf = @(Get-NetFirewallPortFilter -All -ErrorAction Stop | Where-Object { $_.Protocol -eq 'ICMPv4' -or $_.Protocol -eq '1' })
    foreach ($f in $pf) {
        $r = $f | Get-NetFirewallRule -ErrorAction SilentlyContinue
        if ($null -eq $r -or $r.Direction -ne 'Inbound') { continue }
        $types = @($f.IcmpType) -join ','
        $isEcho = ($types -match '(^|,)(8|Any)(:|,|$)') -or ($types -eq '')
        $line = 'Reguła "{0}": włączona={1}, akcja={2}, profil={3}, ICMP typ={4}' -f $r.DisplayName, $r.Enabled, $r.Action, $r.Profile, $types
        if ($isEcho -and [string]$r.Enabled -eq 'True' -and [string]$r.Action -eq 'Allow') { $echoOk = $true; Write-Ok $line }
        elseif ($isEcho) { Write-Info $line }
    }
    Write-State $echoOk 'Serwer odpowiada na ping (włączona reguła przychodząca ICMPv4 Żądanie echa)'
    if (Test-ExpKey 'icmp') { $v = [bool](Get-ExpValue 'icmp'); Assert-Exp ($echoOk -eq $v) ('ICMPv4 echo dozwolone = ' + $v) ([string]$echoOk) }
    if (Test-ExpKey 'firewallEnabled') {
        $v = [bool](Get-ExpValue 'firewallEnabled')
        $all = (@($profiles | Where-Object { [string]$_.Enabled -ne 'True' }).Count -eq 0)
        Assert-Exp ($all -eq $v) ('zapora włączona we wszystkich profilach = ' + $v) (($profiles | ForEach-Object { '{0}={1}' -f $_.Name, $_.Enabled }) -join ', ')
    }
}

# ================================================================= 13. RDP / маршрутизация
Invoke-Section 'Pulpit zdalny (RDP) i routing' {
    $ts = Get-ItemProperty 'HKLM:\System\CurrentControlSet\Control\Terminal Server' -ErrorAction Stop
    $rdpOn = ([int]$ts.fDenyTSConnections -eq 0)
    $nla = $null
    try { $nla = (Get-ItemProperty 'HKLM:\System\CurrentControlSet\Control\Terminal Server\WinStations\RDP-Tcp' -ErrorAction Stop).UserAuthentication } catch { }
    Write-State $rdpOn ('Pulpit zdalny: {0}; NLA (uwierzytelnianie na poziomie sieci): {1}' -f $(if ($rdpOn) { 'włączony' } else { 'wyłączony' }), $(if ([int]$nla -eq 1) { 'tak' } else { 'nie' }))
    try {
        $rr = @(Get-NetFirewallRule -Group '@FirewallAPI.dll,-28752' -ErrorAction Stop | Where-Object { $_.Direction -eq 'Inbound' })
        $en = @($rr | Where-Object { [string]$_.Enabled -eq 'True' }).Count
        Write-Info ('Reguły zapory "Pulpit zdalny" włączone: {0}/{1}' -f $en, $rr.Count)
    } catch { }
    if (Test-ExpKey 'rdp') { $v = [bool](Get-ExpValue 'rdp'); Assert-Exp ($rdpOn -eq $v) ('Pulpit zdalny włączony = ' + $v) ([string]$rdpOn) }
    if (Test-ExpKey 'rdpNla') { $v = [bool](Get-ExpValue 'rdpNla'); Assert-Exp (([int]$nla -eq 1) -eq $v) ('RDP z NLA = ' + $v) ([string]$nla) }

    $ipr = 0
    try { $ipr = [int](Get-ItemProperty 'HKLM:\SYSTEM\CurrentControlSet\Services\Tcpip\Parameters' -ErrorAction Stop).IPEnableRouter } catch { }
    $svc = Get-Service -Name RemoteAccess -ErrorAction SilentlyContinue
    $svcTxt = 'brak usługi'
    if ($svc) { $svcTxt = '{0} ({1})' -f $svc.Status, $svc.StartType }
    $routing = ($ipr -eq 1) -or ($svc -and $svc.Status -eq 'Running')
    Write-State $routing ('Routing IPv4: IPEnableRouter={0}; usługa Routing i dostęp zdalny: {1}' -f $ipr, $svcTxt)
    if (Test-ExpKey 'routing') { $v = [bool](Get-ExpValue 'routing'); Assert-Exp ($routing -eq $v) ('routing LAN włączony = ' + $v) $svcTxt }
}

# ================================================================= 14. Локальные пользователи
Invoke-Section 'Lokalni użytkownicy i grupy' {
    if ($script:IsDC) {
        Write-Skip 'Kontroler domeny nie ma lokalnych kont — patrz sekcja Active Directory.'
        Set-MissingExp @('localUsers', 'localGroups') 'DC — нет локальных учёток'
        return
    }
    if (-not (Get-Command Get-LocalUser -ErrorAction SilentlyContinue)) { Write-Skip 'Brak Get-LocalUser — pomijam.'; return }
    $lu = @(Get-LocalUser -ErrorAction Stop | Where-Object { $_.SID.Value -notmatch '-(501|503|504)$' })
    foreach ($u in $lu) {
        $exp = 'nigdy'
        if ($u.PasswordExpires) { $exp = [string]$u.PasswordExpires }
        $acc = 'nigdy'
        if ($u.AccountExpires) { $acc = $u.AccountExpires.ToString('yyyy-MM-dd') }
        Write-Info ('{0} ({1}) — włączone={2}; może zmienić hasło={3}; hasło wygasa={4}; konto wygasa={5}' -f $u.Name, $u.FullName, $u.Enabled, $u.UserMayChangePassword, $exp, $acc)
    }
    $groups = @(Get-LocalGroup -ErrorAction Stop)
    $members = @{}
    foreach ($g in $groups) {
        $isCustom = ($g.SID.Value -notmatch '^S-1-5-32-')
        $isKey = ($g.SID.Value -in @('S-1-5-32-544', 'S-1-5-32-545', 'S-1-5-32-573', 'S-1-5-32-547'))
        if (-not ($isCustom -or $isKey)) { continue }
        $m = @()
        try { $m = @(Get-LocalGroupMember -Group $g -ErrorAction Stop | ForEach-Object { $_.Name }) }
        catch { $m = @(net localgroup "$($g.Name)" 2>$null | Select-Object -Skip 6 | Where-Object { $_ -and $_ -notmatch '^(-|Polecenie|The command)' }) }
        $members[$g.Name.ToLower()] = $m
        Write-Info ('Grupa "{0}": {1}' -f $g.Name, ($m -join ', '))
    }
    foreach ($eu in (Get-ExpList 'localUsers')) {
        $n = [string](Get-P $eu 'name')
        $u = $lu | Where-Object { $_.Name -ieq $n } | Select-Object -First 1
        Assert-Exp ($null -ne $u) ('konto lokalne ' + $n)
        if ($null -eq $u) { continue }
        if (Test-Prop $eu 'fullName') { $v = [string](Get-P $eu 'fullName'); Assert-Exp ($u.FullName -eq $v) ('{0}: pełna nazwa {1}' -f $n, $v) $u.FullName }
        if (Test-Prop $eu 'enabled') { $v = [bool](Get-P $eu 'enabled'); Assert-Exp ($u.Enabled -eq $v) ('{0}: włączone = {1}' -f $n, $v) ([string]$u.Enabled) }
        if (Test-Prop $eu 'cannotChangePassword') { $v = [bool](Get-P $eu 'cannotChangePassword'); Assert-Exp ((-not $u.UserMayChangePassword) -eq $v) ('{0}: nie może zmienić hasła = {1}' -f $n, $v) ([string](-not $u.UserMayChangePassword)) }
        if (Test-Prop $eu 'passwordNeverExpires') { $v = [bool](Get-P $eu 'passwordNeverExpires'); Assert-Exp (($null -eq $u.PasswordExpires) -eq $v) ('{0}: hasło nigdy nie wygasa = {1}' -f $n, $v) ([string]$u.PasswordExpires) }
    }
    foreach ($eg in (Get-ExpList 'localGroups')) {
        $n = [string](Get-P $eg 'name')
        $exists = @($groups | Where-Object { $_.Name -ieq $n }).Count -gt 0
        Assert-Exp $exists ('grupa lokalna ' + $n)
        if (-not $exists) { continue }
        $m = @()
        if ($members.ContainsKey($n.ToLower())) { $m = $members[$n.ToLower()] }
        else { try { $m = @(Get-LocalGroupMember -Group $n -ErrorAction Stop | ForEach-Object { $_.Name }) } catch { } }
        foreach ($mm in @(Get-P $eg 'members')) {
            if (-not $mm) { continue }
            $ok = @($m | Where-Object { Test-EndsWithI ([string]$_) ([string]$mm) }).Count -gt 0
            Assert-Exp $ok ('{0}: członek {1}' -f $n, $mm) ($m -join ', ')
        }
    }
}

# ================================================================= 15. Политика паролей
Invoke-Section 'Zasady haseł, blokady i inspekcji (efektywne lokalnie)' {
    if (-not $isAdmin) { Write-Skip 'Wymaga uprawnień administratora — pomijam.'; return }
    $tmp = Join-Path $env:TEMP ('inf02_secpol_{0}.inf' -f (Get-Random))
    $null = secedit /export /cfg $tmp /areas SECURITYPOLICY 2>&1
    if (-not (Test-Path $tmp)) { Write-Skip 'secedit nie wyeksportował zasad.'; return }
    $cfg = @{}
    foreach ($l in (Get-Content $tmp)) {
        if ($l -match '^\s*([^=;\[]+?)\s*=\s*(.*)$') { $cfg[$Matches[1].Trim()] = $Matches[2].Trim() }
    }
    Remove-Item $tmp -Force -ErrorAction SilentlyContinue
    $audit = @{ '0' = 'brak'; '1' = 'sukces'; '2' = 'niepowodzenie'; '3' = 'sukces+niepowodzenie' }
    Write-Info ('Minimalna długość hasła: {0}; złożoność: {1}; maks. wiek: {2} dni' -f $cfg['MinimumPasswordLength'], $cfg['PasswordComplexity'], $cfg['MaximumPasswordAge'])
    Write-Info ('Próg blokady konta: {0}; czas blokady: {1} min; zerowanie licznika: {2} min' -f $cfg['LockoutBadCount'], $cfg['LockoutDuration'], $cfg['ResetLockoutCount'])
    Write-Info ('Inspekcja zdarzeń logowania: {0}; logowania na kontach: {1}' -f $audit[[string]$cfg['AuditLogonEvents']], $audit[[string]$cfg['AuditAccountLogon']])
    foreach ($k in @($cfg.Keys)) {
        if ($k -match 'DisableCAD$') { Write-Info ('Nie wymagaj Ctrl+Alt+Del (DisableCAD): ' + $cfg[$k] + '  (4,0 = Ctrl+Alt+Del WYMAGANE)') }
        if ($k -match 'LegalNoticeText$') { Write-Info ('Tekst komunikatu przy logowaniu: ' + $cfg[$k]) }
    }
    if (Test-ExpKey 'passwordPolicy') {
        $pp = Get-ExpValue 'passwordPolicy'
        if (Test-Prop $pp 'minLength') { $v = [string](Get-P $pp 'minLength'); Assert-Exp ([string]$cfg['MinimumPasswordLength'] -eq $v) ('minimalna długość hasła ' + $v) ([string]$cfg['MinimumPasswordLength']) }
        if (Test-Prop $pp 'complexity') { $v = [bool](Get-P $pp 'complexity'); Assert-Exp (([string]$cfg['PasswordComplexity'] -eq '1') -eq $v) ('złożoność haseł = ' + $v) ([string]$cfg['PasswordComplexity']) }
        if (Test-Prop $pp 'lockoutThreshold') { $v = [string](Get-P $pp 'lockoutThreshold'); Assert-Exp ([string]$cfg['LockoutBadCount'] -eq $v) ('próg blokady ' + $v) ([string]$cfg['LockoutBadCount']) }
        if (Test-Prop $pp 'lockoutDuration') { $v = [string](Get-P $pp 'lockoutDuration'); Assert-Exp ([string]$cfg['LockoutDuration'] -eq $v) ('czas blokady ' + $v + ' min') ([string]$cfg['LockoutDuration']) }
    }
}

# ================================================================= 16. Ping
Invoke-Section 'Test komunikacji (ping)' {
    $targets = Get-ExpList 'ping'
    if ($targets.Count -eq 0) {
        Write-Info 'Brak listy "ping" w pliku oczekiwań — pomijam. Sprawdź ręcznie: ping <adres>.'
        return
    }
    foreach ($t in $targets) {
        $ok = $false
        try { $ok = Test-Connection -ComputerName ([string]$t) -Count 2 -Quiet -ErrorAction Stop } catch { }
        Assert-Exp $ok ('ping ' + $t + ' odpowiada')
    }
}

# ================================================================= итог
Write-Section 'ИТОГ'
if ($null -ne $script:E) {
    $total = $script:PassCount + $script:FailCount
    $pct = 0
    if ($total -gt 0) { $pct = [math]::Round(100 * $script:PassCount / $total) }
    $col = 'Red'
    if ($pct -ge 75) { $col = 'Green' }
    Out-Line ('  Ожиданий выполнено: {0} из {1} ({2} %). Порог экзамена — 75 %.' -f $script:PassCount, $total, $pct) $col
    if ($script:FailCount -gt 0) { Out-Line ('  Ищи строки с ' + $script:M_BAD + ' [ожидание] выше.') 'Yellow' }
} else {
    Out-Line '  Отчёт готов. Для автоматической проверки запусти с параметром -Expect plik.json' 'White'
}
if ($OutFile) {
    try {
        $script:Report | Set-Content -LiteralPath $OutFile -Encoding UTF8
        Write-Host ('Отчёт сохранён: ' + $OutFile) -ForegroundColor White
    } catch { Write-Host ('Не удалось сохранить отчёт: ' + $_.Exception.Message) -ForegroundColor Red }
}
