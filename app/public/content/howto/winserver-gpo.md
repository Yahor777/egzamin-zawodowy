# Windows Server: GPO — обои, диски, ограничения

GPO действует на объекты **внутри** контейнера, к которому связан: домен, OU. Пользовательские настройки берутся из OU, где лежит **учётка пользователя**, компьютерные — из OU компьютера (по умолчанию контейнер *Computers*, поэтому настройки *Konfiguracja komputera* нужно связывать с доменом).

## 1. Создание и связывание

`gpmc.msc` → *Las* → *Domeny* → домен → ПКМ на OU → **Utwórz obiekt zasad grupy w tej domenie i umieść tu link…** → имя. ПКМ на GPO → **Edytuj…**

## 2. Где настройки

| Что нужно | Путь в редакторе |
|---|---|
| Обои | *Konfiguracja użytkownika → Zasady → Szablony administracyjne → Pulpit → Pulpit → **Tapeta pulpitu*** (Włączone, путь UNC или локальный, стиль) |
| Запрет Панели управления | *Konfiguracja użytkownika → … → Panel sterowania → **Zabroń dostępu do Panelu sterowania i ustawień komputera*** |
| Запрет cmd | *Konfiguracja użytkownika → … → System → **Zapobiegaj dostępowi do wiersza polecenia*** |
| Сетевой диск | *Konfiguracja użytkownika → **Preferencje** → Ustawienia systemu Windows → **Mapowania dysków** → Nowy* (Akcja: Utwórz; lokalizacja `\\serwer\udział`; litera) |
| Скрипт входа | *Konfiguracja użytkownika → Zasady → Ustawienia systemu Windows → Skrypty (logowanie/wylogowywanie) → Logowanie* |
| Политика паролей | *Konfiguracja komputera → … → Ustawienia zabezpieczeń → Zasady konta → Zasady haseł* — **в GPO, связанном с доменом** (Default Domain Policy) |

## 3. Кто получает GPO

- **Link włączony / wymuszony** — ПКМ на ссылке: *Łącze włączone*, *Wymuszone* (enforced побеждает остальные).
- **Filtrowanie zabezpieczeń** (вкладка *Zakres*): по умолчанию *Użytkownicy uwierzytelnieni*. Если оставить только группу — GPO получат лишь её члены.
- Порядок: домен → OU → вложенные OU; ближе к объекту — приоритетнее.

## 4. Проверка на клиенте

```
gpupdate /force
gpresult /r
```

- вход пользователя тоже применяет политики; изменения на сервере клиент подхватит после `gpupdate /force` (или через ~90 минут);
- `gpresult /r` → *Zastosowane obiekty zasad grupy* (раздел комп. и пользователя), *odfiltrowane*, скрипты, диски;
- рабочий стол: обои меняются; Проводник → *Ten komputer* → **Lokalizacje sieciowe** — подключённый диск;
- Панель управления: «Ta operacja została anulowana z powodu ograniczeń obowiązujących na tym komputerze»;
- cmd: «Wiersz polecenia został wyłączony przez administratora».

<!-- pack-e2 -->
## Проверенные команды клиента

<!-- e2:cmd:domain -->
```cmd
gpupdate /force # принудительное обновление политик
gpresult /r # список применённых GPO
```

## Проверка перед сдачей

1. GPO ma link do właściwej domeny/OU — zakładka **Zakres**.
2. W zakładce **Ustawienia** widać skonfigurowane opcje.
3. Klient domenowy wykonał `gpupdate /force`.
4. `gpresult /r` pokazuje nazwę GPO.
5. Efekt końcowy działa: tapeta, dysk, blokada albo zasada haseł.

| Typowe sformułowanie | Ścieżka |
|---|---|
| `minimalna długość hasła` | komputer → zabezpieczenia → **Zasady haseł** |
| `próg blokady konta` | komputer → zabezpieczenia → **Zasady blokady konta** |
| `zablokuj dostęp do Panelu sterowania` | użytkownik → **Panel sterowania → Zabroń dostępu…** |
| `zamapuj dysk` | użytkownik → preferencje → **Mapowania dysków** |
