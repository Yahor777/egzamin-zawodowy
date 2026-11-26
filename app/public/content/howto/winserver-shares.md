# Windows Server: общие папки — udział, права NTFS, net use, FSRM

## 1. Две независимые «двери»

Чтобы клиент по сети открыл папку, должны пустить **обе**:

1. **Uprawnienia udziału** (права на сетевой доступ) — Pełna kontrola / Zmiana / Odczyt, Zezwalaj или Odmów.
2. **Uprawnienia NTFS** (вкладка *Zabezpieczenia*) — Pełna kontrola, Modyfikacja, Odczyt i wykonanie, Wyświetlanie zawartości folderu, Odczyt, Zapis.

Итоговый доступ = **пересечение** (самое строгое из двух). **Odmów (Deny) всегда сильнее Zezwalaj.** Локально (за самим сервером) работают только права NTFS.

| Udział | NTFS | Что может клиент |
|---|---|---|
| Wszyscy — Pełna kontrola | Administratorzy — Pełna kontrola, grupa — Modyfikacja | группа читает и пишет, остальные — «Odmowa dostępu» |
| grupa — Odczyt | grupa — Modyfikacja | только читает (самое строгое) |
| Wszyscy — Pełna kontrola | Użytkownicy — **Zapis** (без Odczyt) | можно создать файл, но нельзя ни открыть список, ни прочитать |

В листах CKE почти всегда так: *«uprawnienia sieciowe: Wszyscy – Pełna kontrola; zabezpieczenia: Administratorzy – Pełna kontrola, Użytkownicy – Zapis; wyłączone dziedziczenie»*. Имя со знаком `$` (например `wspolny$`) — скрытый udział: в списке `\\SERWER` не виден, но по имени открывается.

## 2. Создать папку и udział в графике

1. *Eksplorator plików* → `C:\` → ПКМ → **Nowy → Folder** (или `mkdir C:\Dane`).
2. ПКМ на папке → **Właściwości** → вкладка **Udostępnianie**.
   * *Udostępnij…* — простой мастер: выбираешь пользователя/группу и «Odczyt» или «Odczyt/zapis» (создаёт udział с Wszyscy — Pełna kontrola и дописывает NTFS).
   * **Udostępnianie zaawansowane…** — как на экзамене: ☑ **Udostępnij ten folder**, *Nazwa udziału*, *Limit użytkowników*, кнопка **Uprawnienia** (по умолчанию Wszyscy — Odczyt!) → *Dodaj…* → окно **Wybieranie: Użytkownicy lub Grupy**.
3. Окно выбора: впиши имя (например `FIRMA\Ksiegowi`, `Wszyscy`, `Administratorzy`) → **Sprawdź nazwy** (имя подчеркнётся) → OK. Доменные пользователи и группы берутся из Active Directory (`dsa.msc`).
4. Первый udział сам включает правило брандмауэра **«Udostępnianie plików i drukarek (SMB — ruch przychodzący)»** (`wf.msc` → Reguły przychodzące). Без него клиент получает «Nie znaleziono ścieżki sieciowej».

## 3. Права NTFS и «Wyłącz dziedziczenie»

Новая папка в `C:\` **наследует** от диска: `SYSTEM`, `Administratorzy` (Pełna kontrola), `Użytkownicy` (Odczyt i wykonanie), `Użytkownicy uwierzytelnieni` (Modyfikacja). Поэтому, если в задании «uprawnienia **tylko dla** …», нужно отключить наследование:

1. *Właściwości* → **Zabezpieczenia** → **Zaawansowane**.
2. **Wyłącz dziedziczenie** → окно *Blokowanie dziedziczenia*:
   * **Konwertuj odziedziczone uprawnienia na jawne** — записи остаются, их можно править/удалять по одной;
   * **Usuń wszystkie odziedziczone uprawnienia** — список пустеет, добавляешь только нужное.
3. *Dodaj* (**Wybierz podmiot**, Typ *Zezwalaj/Odmów*, галочки) или в простом окне **Edytuj…** → *Dodaj…*.
4. Вкладка **Dostęp efektywny** в *Zaawansowane* показывает, что реально получит выбранный пользователь.
5. Владелец (*Właściciel*) меняется кнопкой *Zmień*.

Галочки «Zezwalaj»: *Modyfikacja* включает Odczyt i wykonanie + Zapis; *Zapis* сам по себе не даёт читать.

## 4. Командная строка и PowerShell

```
mkdir C:\Dane
net share Dane=C:\Dane /grant:Wszyscy,FULL /remark:"Dokumenty"
net share                      :: список (C$, ADMIN$, IPC$ — административные)
net share Dane /delete

icacls C:\Dane /inheritance:r /grant Administratorzy:(OI)(CI)F /grant FIRMA\Ksiegowi:(OI)(CI)M
icacls C:\Dane                 :: показать список
icacls C:\Dane /deny FIRMA\Stazysci:(OI)(CI)W
icacls C:\Dane /remove Wszyscy
```

Права в `icacls`: **F** Pełna kontrola, **M** Modyfikacja, **RX** Odczyt i wykonanie, **R** Odczyt, **W** Zapis; `(OI)(CI)` — наследуют вложенные файлы и папки; `/inheritance:r` — убрать унаследованное, `:d` — отключить с копированием, `:e` — включить.

```powershell
New-SmbShare -Name Dane -Path C:\Dane -FullAccess "Wszyscy" -Description "Dokumenty"
New-SmbShare -Name Raporty -Path C:\Raporty -ChangeAccess "FIRMA\Ksiegowi" -ReadAccess "FIRMA\Kadra"
Grant-SmbShareAccess -Name Dane -AccountName "FIRMA\Ksiegowi" -AccessRight Change -Force
Revoke-SmbShareAccess -Name Dane -AccountName "Wszyscy" -Force
Get-SmbShare
Get-SmbShareAccess -Name Dane
Remove-SmbShare -Name Dane -Force
```

## 5. Клиент: как открыть и записать

* Eksplorator → в строке адреса `\\192.168.0.1\Dane` или `\\SERWER\Dane`; **Win+R** → `\\192.168.0.1\Dane`.
* cmd: `dir \\192.168.0.1\Dane`, `net use Z: \\192.168.0.1\Dane`, `net use Z: \\SERWER\Dane /user:FIRMA\jkowalski Haslo!123`, `net use` (список), `net use Z: /delete`, `net view \\192.168.0.1`.
* Eksplorator → *Ten komputer* → **Mapuj dysk sieciowy…**.
* Запись: Notatnik → *Zapisz jako* → `Z:\plik.txt`, `echo test > Z:\plik.txt`, `copy plik.txt Z:\`.

**Чьи учётные данные используются.** Клиент в домене, вошедший доменным пользователем — его собственные (SSO). Клиент **не в домене** (или вошёл локальным Administrator) → Windows показывает окно **«Wprowadź poświadczenia sieciowe»**: впиши `DOMENA\użytkownik` и пароль (в cmd — ключ `/user:`).

| Что вижу | Причина |
|---|---|
| **Nie znaleziono ścieżki sieciowej** (ошибка 53, `0x80070035`) | нет кабеля/адреса, неверное имя (DNS), сервер выключен, **закрыт порт 445** (нет правила брандмауэра / нет ни одного udziału) |
| **Nie można odnaleźć nazwy sieciowej** (67) | такого udziału нет на сервере (опечатка в имени, udział не создан) |
| **Nazwa użytkownika lub hasło jest niepoprawne** (1326) | неверные данные / забыл `DOMENA\` |
| **Odmowa dostępu** (5) | udział или NTFS не дают доступа этому пользователю (проверь пересечение прав и Deny) |
| каталог открылся, но создать файл нельзя | Udział = Odczyt, либо NTFS без Zapis/Modyfikacja |

Диск, назначенный **GPO** (*Preferencje → Mapowania dysków*), на клиенте подключается сам при входе: если udziału нет или нет доступа — в Eksploratorze он с **красным крестиком** (*rozłączony*).

## 6. FSRM — квоты и экраны файлов

Роль: *Dodaj role i funkcje* → **Usługi plików i magazynowania → Usługi plików i iSCSI → Menedżer zasobów serwera plików**. Консоль: *Narzędzia* → **Menedżer zasobów serwera plików** (`fsrm.msc`).

**Квота** (*Zarządzanie przydziałami → Przydziały → Utwórz przydział…*):

* *Ścieżka przydziału*: папка (например `C:\Dane`).
* «**Utwórz przydział na ścieżce**» — одна квота на папку; «**Automatycznie zastosuj szablon i utwórz przydziały dla istniejących i nowych podfolderów**» — отдельная квота каждому подкаталогу (папки пользователей).
* «Pochodzi od tego szablonu» (например **Limit 100 MB**; *Szablony przydziałów* — готовые: Limit 100 MB, Limit 200 MB z raportami dla użytkownika, Rozszerzony limit 250 MB, Monitorowanie udziału 500 MB …) или «**Zdefiniuj niestandardowe właściwości**»: *Limit* + **Limit twardy** (блокирует) / **Limit miękki** (только отчёт).
* Клиент превышает жёсткий лимит → **«Brak wystarczającej ilości miejsca na dysku»**. Мягкий лимит запись пропускает.

**Экран файлов** (*Zarządzanie osłanianiem plików → Osłony plików → Utwórz osłonę pliku…*): папка, шаблон (*Zablokuj pliki audio i wideo*, *Zablokuj pliki wykonywalne*…) или своё: **Osłanianie aktywne** (блокирует — клиент видит «Odmowa dostępu») / **pasywne** (только журнал), галочки групп (*Pliki audio i wideo*, *Pliki wykonywalne*, *Pliki obrazów*…).

```
dirquota quota add /Path:C:\Dane /Limit:100mb /Type:Hard
dirquota quota list
```
```powershell
New-FsrmQuota -Path C:\Dane -Size 100MB
New-FsrmQuota -Path C:\Dane -Template "Limit 100 MB"
New-FsrmFileScreen -Path C:\Dane -IncludeGroup "Pliki audio i wideo" -Active
Get-FsrmQuota ; Get-FsrmFileScreen
```

Тестовый большой файл без реального содержимого: `fsutil file createnew Z:\duzy.dat 5242880` (5 MB).

> Не путай с **przydziałami dyskowymi NTFS** (*Właściwości dysku → Przydział* — на пользователя, на весь том): это другой механизм (в симуляторе пока не реализован). FSRM — по **папке**.

## 7. Типичные ошибки на экзамене

* Создал udział, но забыл NTFS (по умолчанию наследуются «Użytkownicy uwierzytelnieni — Modyfikacja»: доступ шире, чем просили!) или наоборот: оставил udział = Odczyt (по умолчанию) и клиент «не может записать».
* «Tylko dla…» без *Wyłącz dziedziczenie* — лишние записи SYSTEM / Użytkownicy остаются.
* Ввёл логин без домена (`jkowalski` вместо `FIRMA\jkowalski`) на клиенте не из домена.
* Проверяешь с самого сервера (`C:\Dane`) — это NTFS без udziału; проверка должна идти **с клиента** по `\\IP\udział`.

## Menedżer serwera → Nowy udział… («Kreator nowego udziału»)

*Menedżer serwera* → **Usługi plików i magazynowania** → **Udziały** → *Zadania* → **Nowy udział…**. Страницы мастера: **Wybieranie profilu** (*Udział SMB — szybki* — нужный; NFS без роли *Serwer NFS* недоступен) → **Lokalizacja udziału** (*Wybierz według woluminu* — папка `C:\Shares\имя` создаётся сама, либо **Wpisz ścieżkę niestandardową**) → **Nazwa udziału** (nazwa, opis; «ścieżka zdalna» `\\SERWER\nazwa`; `$` в конце = скрытый) → **Inne ustawienia** (*wyliczanie oparte na dostępie*, *buforowanie*, *BranchCache*, *szyfrowanie danych*) → **Uprawnienia** (кнопка **Dostosowywanie uprawnień…** = «Zaawansowane ustawienia zabezpieczeń»: *Wyłącz dziedziczenie* → *Dodaj* → *Wybierz podmiot zabezpieczeń*) → **Potwierdzenie** → **Utwórz** → **Wyniki**.

## Zarządzanie komputerem → Foldery udostępnione

`compmgmt.msc` (*Narzędzia → Zarządzanie komputerem*) → *Narzędzia systemowe* → **Foldery udostępnione**:

* **Udziały** — список: администрати­вные **ADMIN$**, **C$**, **IPC$** (и ваши), колонка *Liczba połączeń klienta*. ПКМ → **Nowy udział…** (мастер *Kreator tworzenia folderu udostępnionego*: **Ścieżka folderu** → если папки нет, «Czy chcesz ją utworzyć?» → **Nazwa, opis i ustawienia** → **Uprawnienia do folderu udostępnionego**: 4 готовых варианта + *Dostosowywanie uprawnień*). ПКМ на udziale → **Właściwości**: *Ogólne* (**Limit użytkowników**: *Zezwalaj tylu użytkownikom*), *Publikowanie* (*Publikuj ten udział w usłudze Active Directory*), *Uprawnienia udziału*, *Zabezpieczenia* (NTFS). **Zatrzymaj udostępnianie** — снять общий доступ.
* **Sesje** — кто сейчас подключён (*Użytkownik, Komputer, Typ, Liczba otwartych plików, Czas połączenia*). Сессия появляется, когда клиент открыл `\\сервер\udział` в Проводнике (или диск подключён по `net use`). **Otwarte pliki** — какие файлы открыты (например, файл открыт в Notatniku через udział).

