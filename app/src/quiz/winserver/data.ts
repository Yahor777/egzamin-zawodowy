// Windows Server roles as "put the steps in order" + "where is this setting / which option"
// questions. Polish UI names as on Windows Server 2019/2022 PL, Russian explanations.
// Sheets: CKE INF.02 sheets (YYYY-MM-NN) whose grading criteria (zo) contain the task.

export interface WsStep {
  pl: string
  /** why this step / what it does */
  ru: string
}
export interface WsQuestion {
  q_ru: string
  q_pl?: string
  options: string[]
  correct: number
  why_ru: string
}
export interface WsScenario {
  id: string
  title_pl: string
  title_ru: string
  /** console / tool */
  tool: string
  task_pl: string[]
  sheets: string[]
  steps: WsStep[]
  questions: WsQuestion[]
  /** section of the cheat sheet (practice/cheat-windows-server) */
  doc: string
}

export const WS_SCENARIOS: WsScenario[] = [
  {
    id: 'ws-adds',
    title_pl: 'Kontroler domeny (AD DS)',
    title_ru: 'Повышение сервера до контроллера домена',
    tool: 'Menedżer serwera',
    task_pl: ['Zainstaluj usługę Active Directory i promuj serwer do roli kontrolera domeny inf02.local.', 'Hasło trybu przywracania usług katalogowych: ZAQ!2wsx.'],
    sheets: ['2023-06-02', '2025-06-01', '2025-06-04', '2026-06-08'],
    doc: '3. AD DS — контроллер домена',
    steps: [
      { pl: 'Ustaw statyczny adres IP serwera i jako DNS wpisz 127.0.0.1', ru: 'DC должен иметь постоянный адрес и сам себе быть DNS-сервером.' },
      { pl: 'Zmień nazwę serwera (jeśli wymagana) i uruchom ponownie', ru: 'Переименовать после повышения до DC сложно — делаем до.' },
      { pl: 'Menedżer serwera → Zarządzaj → Dodaj role i funkcje → Usługi domenowe Active Directory → Zainstaluj', ru: 'Ставим роль AD DS (бинарники), DC ещё не создан.' },
      { pl: 'Kliknij flagę powiadomień → Podnieś poziom tego serwera do poziomu kontrolera domeny', ru: 'Запускается мастер конфигурации Active Directory.' },
      { pl: 'Dodaj nowy las → Nazwa domeny głównej: inf02.local', ru: 'Первый DC в сети = новый лес.' },
      { pl: 'Wpisz hasło trybu przywracania usług katalogowych (DSRM)', ru: 'Пароль DSRM из листа — его тоже проверяют.' },
      { pl: 'Dalej → Wymagania wstępne → Zainstaluj (serwer uruchomi się ponownie)', ru: 'После перезагрузки вход как INF02\\Administrator.' },
    ],
    questions: [
      { q_ru: 'Какой вариант выбрать в мастере, если в сети ещё нет ни одного домена?', options: ['Dodaj kontroler domeny do istniejącej domeny', 'Dodaj nową domenę do istniejącego lasu', 'Dodaj nowy las', 'Dołącz do grupy roboczej'], correct: 2, why_ru: 'Первый контроллер создаёт новый лес и корневой домен.' },
      { q_ru: 'Экзаминатор проверяет DC. Что он увидит, если всё верно?', options: ['W sysdm.cpl: Grupa robocza = INF02', 'Logowanie jako INF02\\Administrator i domena inf02.local w Właściwościach systemu', 'Rola DHCP zainstalowana', 'Folder SYSVOL udostępniony jako SYSVOL$'], correct: 1, why_ru: 'Вход доменной учёткой и имя домена в свойствах системы — критерий «serwer pełni rolę kontrolera domeny».' },
    ],
  },
  {
    id: 'ws-ou-users',
    title_pl: 'Jednostka organizacyjna, użytkownik, grupa',
    title_ru: 'OU, доменный пользователь и группа',
    tool: 'Użytkownicy i komputery usługi Active Directory (dsa.msc)',
    task_pl: ['W domenie utwórz jednostkę organizacyjną Uczniowie.', 'W jednostce Uczniowie utwórz konto Jan Kowalski, login jkowalski, hasło Egzamin12#; użytkownik nie może zmienić hasła, hasło nigdy nie wygasa.', 'Utwórz grupę globalną zabezpieczeń Egzamin i dodaj do niej jkowalski.'],
    sheets: ['2023-06-02', '2025-06-02', '2026-01-04', '2026-06-06', '2026-06-09'],
    doc: 'OU, пользователи, группы (`dsa.msc`)',
    steps: [
      { pl: 'Otwórz Użytkownicy i komputery usługi Active Directory (dsa.msc)', ru: 'Консоль объектов AD.' },
      { pl: 'PPM na domenie → Nowy → Jednostka organizacyjna → Uczniowie', ru: 'OU создаём на уровне домена (если не сказано иначе).' },
      { pl: 'PPM na OU Uczniowie → Nowy → Użytkownik → Imię, Nazwisko, Nazwa logowania: jkowalski', ru: 'Пользователь создаётся сразу в нужной OU.' },
      { pl: 'Wpisz hasło, odznacz „Użytkownik musi zmienić hasło…”, zaznacz „Użytkownik nie może zmienić hasła” i „Hasło nigdy nie wygasa”', ru: 'Флажки — отдельные критерии T/N.' },
      { pl: 'PPM na OU → Nowy → Grupa → Egzamin, Zakres: Globalny, Typ: Zabezpieczenia', ru: 'Тип и область группы указывают в листе.' },
      { pl: 'Właściwości grupy → Członkowie → Dodaj → jkowalski → OK', ru: 'Членство можно добавить и с вкладки «Członek grupy» пользователя.' },
    ],
    questions: [
      { q_ru: 'Лист: «konto ma mieć wyłączoną opcję wymuszającą zmianę hasła przy pierwszym logowaniu». Что делаешь?', options: ['Zaznaczam „Hasło nigdy nie wygasa”', 'Odznaczam „Użytkownik musi zmienić hasło przy następnym logowaniu”', 'Zaznaczam „Konto jest wyłączone”', 'Nic — to ustawienie domyślne'], correct: 1, why_ru: 'В мастере нового пользователя этот флажок включён по умолчанию — его надо снять.' },
      { q_ru: 'Где задаются часы входа (np. pon–pt 8–16)?', options: ['Właściwości użytkownika → Konto → Godziny logowania…', 'Właściwości użytkownika → Profil', 'Zasady grupy → Zasady konta', 'Właściwości grupy → Zarządzany przez'], correct: 0, why_ru: 'Вкладка Konto → Godziny logowania, отмечаешь клетки и «Logowanie dozwolone».' },
    ],
  },
  {
    id: 'ws-join',
    title_pl: 'Przyłączenie stacji do domeny',
    title_ru: 'Присоединение рабочей станции к домену и вход',
    tool: 'sysdm.cpl na stacji roboczej',
    task_pl: ['Przyłącz stację roboczą do domeny inf02.local.', 'Zaloguj się na stacji kontem domenowym jkowalski.'],
    sheets: ['2026-06-04', '2026-06-10'],
    doc: '3. AD DS — контроллер домена',
    steps: [
      { pl: 'Na stacji ustaw DNS = adres IP kontrolera domeny', ru: 'Без DNS контроллера станция не найдёт домен — самая частая ошибка.' },
      { pl: 'Sprawdź ping do serwera i nslookup inf02.local', ru: 'Проверяем связь и имя домена до присоединения.' },
      { pl: 'sysdm.cpl → Nazwa komputera → Zmień… → Członek: Domena: inf02.local', ru: 'Тот же диалог, где меняют имя ПК.' },
      { pl: 'Podaj konto z uprawnieniami: INF02\\Administrator i hasło', ru: 'Присоединять может администратор домена.' },
      { pl: '„Witamy w domenie inf02.local” → OK → uruchom ponownie komputer', ru: 'Без перезагрузки членство не вступит в силу.' },
      { pl: 'Inny użytkownik → zaloguj jako INF02\\jkowalski', ru: 'Вход доменной учёткой проверяет экзаменатор.' },
    ],
    questions: [
      { q_ru: 'Присоединение выдаёт «Nie można skontaktować się z kontrolerem domeny». Что первое проверить?', options: ['Czy na stacji jako DNS wpisano adres kontrolera domeny', 'Czy zapora stacji jest wyłączona', 'Czy konto Gość jest włączone', 'Czy stacja ma adres z APIPA'], correct: 0, why_ru: 'Домен находится через DNS (SRV-записи). DNS станции должен указывать на DC.' },
    ],
  },
  {
    id: 'ws-dns',
    title_pl: 'DNS: strefy i rekordy A, PTR, CNAME',
    title_ru: 'DNS: прямая и обратная зоны, записи A/PTR/CNAME',
    tool: 'Menedżer DNS (dnsmgmt.msc)',
    task_pl: ['Utwórz strefę wyszukiwania do przodu egzamin.local oraz strefę wyszukiwania wstecznego dla sieci 192.168.1.0/24.', 'Dodaj rekord A www → 192.168.1.10 z rekordem PTR oraz alias (CNAME) INF02 → www.egzamin.local.'],
    sheets: ['2024-06-05', '2025-06-03', '2025-06-07', '2025-06-09', '2026-01-02'],
    doc: '4. DNS (`dnsmgmt.msc`)',
    steps: [
      { pl: 'Zainstaluj rolę Serwer DNS (jeśli nie ma) i otwórz dnsmgmt.msc', ru: 'На DC роль DNS обычно уже стоит.' },
      { pl: 'Strefy wyszukiwania do przodu → Nowa strefa… → Strefa podstawowa → egzamin.local', ru: 'Прямая зона: имя → IP.' },
      { pl: 'Strefy wyszukiwania wstecznego → Nowa strefa… → Strefa podstawowa → IPv4 → Identyfikator sieci 192.168.1', ru: 'Обратная зона: IP → имя (1.168.192.in-addr.arpa).' },
      { pl: 'PPM na egzamin.local → Nowy host (A lub AAAA)… → www, 192.168.1.10, zaznacz „Utwórz skojarzony rekord wskaźnika (PTR)”', ru: 'PTR создастся автоматически только если обратная зона уже есть — поэтому она раньше.' },
      { pl: 'PPM na egzamin.local → Nowy alias (CNAME)… → INF02 → www.egzamin.local', ru: 'Алиас указывает на полное имя существующего хоста.' },
      { pl: 'Sprawdź: nslookup INF02.egzamin.local i nslookup 192.168.1.10', ru: 'Проверка прямого и обратного разрешения — делай скриншот.' },
    ],
    questions: [
      { q_ru: 'Почему обратную зону создают до записи A?', options: ['Bo rekord A wymaga strefy wstecznej', 'Bo tylko wtedy zadziała opcja „Utwórz skojarzony rekord wskaźnika (PTR)”', 'Bo strefa wsteczna musi mieć numer 1', 'Kolejność nie ma znaczenia w żadnym przypadku'], correct: 1, why_ru: 'Галка PTR при создании A-записи работает, только если подходящая обратная зона существует.' },
      { q_ru: 'Какое поле в диалоге CNAME?', options: ['Adres IP hosta docelowego', 'W pełni kwalifikowana nazwa domeny (FQDN) hosta docelowego', 'Serwer poczty', 'Interwał odświeżania'], correct: 1, why_ru: 'CNAME указывает на имя (FQDN), не на IP.' },
    ],
  },
  {
    id: 'ws-dhcp',
    title_pl: 'DHCP: zakres i rezerwacja',
    title_ru: 'DHCP на сервере: область и резервирование',
    tool: 'DHCP (dhcpmgmt.msc)',
    task_pl: ['Skonfiguruj serwer DHCP: zakres 192.168.0.10–192.168.0.50 /24, brama 192.168.0.1, DNS 192.168.0.2, czas dzierżawy 2 dni.', 'Zarezerwuj adres 192.168.0.50 dla stacji o adresie MAC 00-15-5D-01-02-03.'],
    sheets: ['2023-01-03', '2024-06-02', '2024-06-05', '2025-01-01'],
    doc: '5. DHCP (`dhcpmgmt.msc`)',
    steps: [
      { pl: 'Dodaj rolę Serwer DHCP → flaga → Ukończ konfigurację DHCP', ru: 'Создаёт группы безопасности и авторизует сервер в AD.' },
      { pl: 'IPv4 → PPM → Nowy zakres… → nazwa, adres początkowy i końcowy, maska', ru: 'Пул адресов области.' },
      { pl: 'Pomiń wykluczenia → Czas trwania dzierżawy: 2 dni', ru: 'Время аренды тоже критерий.' },
      { pl: '„Tak, chcę teraz skonfigurować te opcje” → Router (brama domyślna) → Serwery DNS', ru: 'Опции области: шлюз (003) и DNS (006).' },
      { pl: '„Tak, chcę teraz aktywować ten zakres” → Zakończ', ru: 'Неактивная область не раздаёт адреса.' },
      { pl: 'Zakres → Zastrzeżenia → Nowe zastrzeżenie… → nazwa, 192.168.0.50, adres MAC', ru: 'Резервирование по MAC клиента.' },
      { pl: 'Na stacji: ipconfig /renew i ipconfig /all', ru: 'Проверка, что адрес получен — скриншот.' },
    ],
    questions: [
      { q_ru: 'Сервер в домене, значок IPv4 красный, адреса не раздаются. Что сделать?', options: ['PPM na serwerze → Autoryzuj', 'Usuń zakres i utwórz ponownie', 'Wyłącz zaporę', 'Zmień czas dzierżawy'], correct: 0, why_ru: 'DHCP в домене должен быть авторизован в AD.' },
      { q_ru: 'Сервер с двумя картами должен раздавать адреса только в VLAN102. Где это?', options: ['Właściwości zakresu → Ogólne', 'PPM na serwerze → Dodaj/usuń powiązania…', 'Opcje serwera → 003 Router', 'Filtry → Zezwalaj'], correct: 1, why_ru: 'Привязки (powiązania) задают, на каких интерфейсах слушает DHCP.' },
    ],
  },
  {
    id: 'ws-gpo-pass',
    title_pl: 'GPO: zasady haseł i blokady konta',
    title_ru: 'GPO: политика паролей и блокировки учётки',
    tool: 'Zarządzanie zasadami grupy (gpmc.msc)',
    task_pl: ['Dla użytkowników domeny ustaw: minimalna długość hasła 8 znaków, hasło musi spełniać wymagania złożoności.', 'Konto blokowane po 3 nieudanych próbach na 15 minut.'],
    sheets: ['2024-01-02', '2025-06-04', '2025-06-08', '2026-01-04'],
    doc: '9. GPO (`gpmc.msc`)',
    steps: [
      { pl: 'Otwórz Zarządzanie zasadami grupy (gpmc.msc) → Las → Domeny → inf02.local', ru: 'Политика паролей домена действует только на уровне домена.' },
      { pl: 'PPM na Default Domain Policy (lub nowy GPO połączony z domeną) → Edytuj', ru: 'GPO, связанный с OU, на пароли доменных учёток не действует.' },
      { pl: 'Konfiguracja komputera → Zasady → Ustawienia systemu Windows → Ustawienia zabezpieczeń → Zasady konta → Zasady haseł', ru: 'Пароли — это Konfiguracja KOMPUTERA, не użytkownika.' },
      { pl: 'Minimalna długość hasła = 8; Hasło musi spełniać wymagania co do złożoności = Włączone', ru: 'Два отдельных критерия.' },
      { pl: 'Zasady konta → Zasady blokady konta → Próg blokady konta = 3, Czas trwania blokady konta = 15', ru: 'Система сама предложит «Wyzeruj licznik… po 15 min».' },
      { pl: 'Na stacji/serwerze: gpupdate /force, sprawdź gpresult /r', ru: 'Применить и показать экзаменатору.' },
    ],
    questions: [
      { q_ru: 'Где «Minimalna długość hasła»?', options: ['Konfiguracja użytkownika → Szablony administracyjne → System', 'Konfiguracja komputera → Zasady → Ustawienia systemu Windows → Ustawienia zabezpieczeń → Zasady konta → Zasady haseł', 'Konfiguracja komputera → Szablony administracyjne → Panel sterowania', 'Konfiguracja użytkownika → Ustawienia systemu Windows → Skrypty'], correct: 1, why_ru: 'Zasady konta → Zasady haseł; локально то же самое в secpol.msc.' },
    ],
  },
  {
    id: 'ws-gpo-wallpaper',
    title_pl: 'GPO: tapeta pulpitu i zakazy',
    title_ru: 'GPO: обои рабочего стола / запрет Panelu sterowania для OU',
    tool: 'gpmc.msc',
    task_pl: ['Dla użytkowników jednostki Uczniowie ustaw tapetę \\\\SERWER\\tapeta$\\logo.jpg i zablokuj możliwość jej zmiany.', 'Zabroń tym użytkownikom dostępu do Panelu sterowania.'],
    sheets: ['2025-06-01', '2025-06-02', '2026-01-01', '2026-01-04'],
    doc: '9. GPO (`gpmc.msc`)',
    steps: [
      { pl: 'Umieść plik logo.jpg w udostępnionym folderze (\\\\SERWER\\tapeta$), uprawnienie Odczyt dla użytkowników', ru: 'Путь к обоям должен быть UNC, доступный пользователям.' },
      { pl: 'gpmc.msc → PPM na OU Uczniowie → Utwórz obiekt GPO w tej domenie i połącz go tutaj… → nazwa', ru: 'GPO привязываем к OU, где лежат пользователи.' },
      { pl: 'PPM na GPO → Edytuj', ru: 'Открывается Edytor zarządzania zasadami grupy.' },
      { pl: 'Konfiguracja użytkownika → Zasady → Szablony administracyjne → Pulpit → Pulpit → Tapeta pulpitu = Włączone, nazwa \\\\SERWER\\tapeta$\\logo.jpg', ru: 'Обои — настройка ПОЛЬЗОВАТЕЛЯ.' },
      { pl: '… Panel sterowania → Personalizacja → Uniemożliwiaj zmianę tła pulpitu = Włączone', ru: 'Запрет смены обоев.' },
      { pl: '… Panel sterowania → Zabroń dostępu do Panelu sterowania i ustawień komputera = Włączone', ru: 'Запрет Panelu sterowania.' },
      { pl: 'Zaloguj się na stacji jako użytkownik z OU (gpupdate /force)', ru: 'Проверка: обои стоят, Panel sterowania не открывается.' },
    ],
    questions: [
      { q_ru: 'Обои задаются для пользователей. Какая часть GPO?', options: ['Konfiguracja komputera', 'Konfiguracja użytkownika', 'Zasady konta', 'Preferencje → Ustawienia systemu Windows → Rejestr komputera'], correct: 1, why_ru: 'Всё, что про рабочий стол и Panel sterowania пользователя, — Konfiguracja użytkownika.' },
    ],
  },
  {
    id: 'ws-gpo-drive',
    title_pl: 'GPO: mapowanie dysku sieciowego',
    title_ru: 'GPO: подключение сетевого диска (буква Z:)',
    tool: 'gpmc.msc → Preferencje',
    task_pl: ['Użytkownikom jednostki Pracownicy automatycznie mapuj udział \\\\SERWER\\DANE jako dysk Z: o etykiecie DANE.'],
    sheets: ['2026-06-01'],
    doc: '9. GPO (`gpmc.msc`)',
    steps: [
      { pl: 'Udostępnij folder DANE na serwerze i nadaj uprawnienia grupie użytkowników', ru: 'Сначала должен существовать общий ресурс.' },
      { pl: 'gpmc.msc → GPO połączony z OU Pracownicy → Edytuj', ru: 'Привязка к OU пользователей.' },
      { pl: 'Konfiguracja użytkownika → Preferencje → Ustawienia systemu Windows → Mapowania dysków', ru: 'Mapowanie — это Preferencje, не Zasady.' },
      { pl: 'PPM → Nowy → Zamapowany dysk → Akcja: Utwórz, Lokalizacja: \\\\SERWER\\DANE, Etykieta: DANE, Litera dysku: Z', ru: 'Akcja „Utwórz” или „Aktualizuj”.' },
      { pl: 'Na stacji: gpupdate /force, wyloguj i zaloguj, sprawdź Ten komputer → Z:', ru: 'Диски подключаются при входе.' },
    ],
    questions: [
      { q_ru: 'Альтернатива без GPO, если лист разрешает «za pomocą polecenia»?', options: ['net share Z: \\\\SERWER\\DANE', 'net use Z: \\\\SERWER\\DANE /persistent:yes', 'mklink Z: \\\\SERWER\\DANE', 'subst Z: \\\\SERWER\\DANE'], correct: 1, why_ru: '`net use` подключает сетевой ресурс как букву диска.' },
    ],
  },
  {
    id: 'ws-roaming',
    title_pl: 'Profil mobilny (wędrujący)',
    title_ru: 'Перемещаемый профиль пользователя',
    tool: 'dsa.msc + udział profile$',
    task_pl: ['Utwórz ukryty udział profile$ (folder C:\\Profile) i skonfiguruj dla użytkownika jkowalski profil mobilny w tym udziale.'],
    sheets: ['2024-06-03', '2025-06-01', '2025-06-02', '2025-06-04', '2026-06-10'],
    doc: 'OU, пользователи, группы (`dsa.msc`)',
    steps: [
      { pl: 'Utwórz folder C:\\Profile', ru: 'Папка для профилей.' },
      { pl: 'Właściwości → Udostępnianie → Udostępnianie zaawansowane → Nazwa udziału: profile$ → Uprawnienia: Wszyscy – Pełna kontrola', ru: '`$` в конце делает ресурс скрытым.' },
      { pl: 'Zabezpieczenia (NTFS): Użytkownicy uwierzytelnieni – Tworzenie folderów / dołączanie danych (tylko ten folder)', ru: 'Пользователь должен суметь создать свою папку профиля.' },
      { pl: 'dsa.msc → Właściwości jkowalski → Profil → Ścieżka profilu: \\\\SERWER\\profile$\\%username%', ru: '%username% заменится на логин после OK.' },
      { pl: 'Zaloguj się na stacji jako jkowalski, wyloguj', ru: 'При выходе профиль копируется на сервер.' },
      { pl: 'Sprawdź na serwerze folder C:\\Profile\\jkowalski.V6', ru: 'Папка с суффиксом .V6 (Windows 10/11) = профиль работает.' },
    ],
    questions: [
      { q_ru: 'Как сделать ресурс скрытым?', options: ['Zaznaczyć „Ukryty” we właściwościach folderu', 'Dodać $ na końcu nazwy udziału', 'Usunąć grupę Wszyscy', 'Nadać nazwę z kropką na początku'], correct: 1, why_ru: 'Скрытый общий ресурс = имя с `$` в конце (profile$). Атрибут «Ukryty» папки — это другое.' },
    ],
  },
  {
    id: 'ws-share',
    title_pl: 'Udział sieciowy + uprawnienia NTFS',
    title_ru: 'Общий ресурс + разрешения NTFS',
    tool: 'Właściwości folderu',
    task_pl: ['Udostępnij folder C:\\Projekty jako Projekty, maks. 10 użytkowników równocześnie.', 'Uprawnienia NTFS: wyłącz dziedziczenie; Administratorzy – Pełna kontrola, grupa Egzamin – Modyfikacja.'],
    sheets: ['2023-06-03', '2024-06-03', '2025-06-02', '2025-06-06'],
    doc: '7. Общие папки + NTFS',
    steps: [
      { pl: 'Utwórz folder C:\\Projekty', ru: 'Папка-источник.' },
      { pl: 'Właściwości → Udostępnianie → Udostępnianie zaawansowane… → Udostępnij ten folder, Nazwa udziału: Projekty', ru: 'Имя ресурса = то, что видно в сети.' },
      { pl: 'Ogranicz liczbę równoczesnych użytkowników do: 10 → Uprawnienia (udziału)', ru: 'Лимит пользователей — в том же окне.' },
      { pl: 'Zabezpieczenia → Zaawansowane → Wyłącz dziedziczenie → Usuń wszystkie odziedziczone uprawnienia', ru: 'Иначе останутся унаследованные права.' },
      { pl: 'Dodaj → Administratorzy: Pełna kontrola; Dodaj → Egzamin: Modyfikacja', ru: 'Права NTFS по листу.' },
      { pl: 'Sprawdź ze stacji: \\\\SERWER\\Projekty', ru: 'Итоговый доступ = минимум из прав share и NTFS.' },
    ],
    questions: [
      { q_ru: 'Где лимит одновременных пользователей?', options: ['Zabezpieczenia → Zaawansowane', 'Udostępnianie → Udostępnianie zaawansowane', 'Ogólne → Atrybuty', 'Przydział'], correct: 1, why_ru: '«Ogranicz liczbę równoczesnych użytkowników do» — в Udostępnianie zaawansowane.' },
      { q_ru: 'Share: Wszyscy – Odczyt; NTFS: Egzamin – Modyfikacja. Что может член группы Egzamin по сети?', options: ['Modyfikować', 'Tylko odczyt', 'Pełna kontrola', 'Nic'], correct: 1, why_ru: 'Действует более строгое из двух — Odczyt.' },
    ],
  },
  {
    id: 'ws-fsrm',
    title_pl: 'Przydział (quota) FSRM',
    title_ru: 'Квота на папку (FSRM) и квоты NTFS тома',
    tool: 'Menedżer zasobów serwera plików (fsrm.msc)',
    task_pl: ['Zainstaluj Menedżer zasobów serwera plików i ustaw dla folderu C:\\DOKUMENTY przydział twardy 100 MB.'],
    sheets: ['2023-06-03', '2024-01-04', '2025-06-05', '2026-01-01'],
    doc: '8. Квоты',
    steps: [
      { pl: 'Dodaj role i funkcje → Usługi plików i magazynowania → Menedżer zasobów serwera plików', ru: 'Роль FSRM ставится отдельно.' },
      { pl: 'Otwórz fsrm.msc → Zarządzanie przydziałami → Przydziały', ru: 'Здесь квоты на папки.' },
      { pl: 'Utwórz przydział… → Ścieżka przydziału: C:\\DOKUMENTY', ru: 'Квота на конкретную папку.' },
      { pl: 'Zdefiniuj właściwości przydziału niestandardowego → Limit 100 MB → Przydział twardy', ru: 'Twardy = нельзя превысить; miękki = только предупреждение.' },
      { pl: 'Utwórz → sprawdź na liście Przydziały', ru: 'Скриншот списка квот.' },
    ],
    questions: [
      { q_ru: 'Лист: «ogranicz miejsce na dysku C: dla każdego użytkownika do 1 GB». Где?', options: ['fsrm.msc → Przydziały', 'Właściwości dysku C: → Przydział → Włącz zarządzanie przydziałami', 'Zasady grupy → Zasady konta', 'Zarządzanie dyskami → Zmniejsz wolumin'], correct: 1, why_ru: 'Квота «на пользователя на том» — NTFS-квоты в свойствах диска; FSRM — квота на папку.' },
    ],
  },
  {
    id: 'ws-iis',
    title_pl: 'IIS: witryna WWW',
    title_ru: 'IIS: веб-сайт со своей страницей',
    tool: 'Menedżer internetowych usług informacyjnych (inetmgr)',
    task_pl: ['Zainstaluj serwer WWW (IIS). Utwórz witrynę egzamin z katalogiem C:\\www, adres IP serwera, port 80.', 'Domyślnym dokumentem ma być egzamin.html.'],
    sheets: ['2025-06-03', '2025-06-06', '2026-01-02', '2026-01-03', '2026-06-05'],
    doc: '6. IIS — сайт WWW / FTP (`inetmgr`)',
    steps: [
      { pl: 'Dodaj role i funkcje → Serwer sieci Web (IIS)', ru: 'Роль Web-Server.' },
      { pl: 'Utwórz C:\\www i plik egzamin.html (włącz rozszerzenia nazw plików!)', ru: 'Чтобы не получить egzamin.html.txt.' },
      { pl: 'inetmgr → Witryny → PPM → Dodaj witrynę sieci Web… → Nazwa: egzamin, Ścieżka fizyczna: C:\\www', ru: 'Новый сайт.' },
      { pl: 'Powiązanie: http, Adres IP serwera, Port 80 (Nazwa hosta — tylko jeśli wymagana)', ru: 'Привязка — частый критерий.' },
      { pl: 'Zatrzymaj Default Web Site, jeśli zajmuje port 80', ru: 'Иначе конфликт порта, сайт не стартует.' },
      { pl: 'Witryna → Dokument domyślny → Dodaj… → egzamin.html (Przenieś w górę)', ru: 'Документ по умолчанию.' },
      { pl: 'Sprawdź w przeglądarce stacji http://adres_serwera', ru: 'Скриншот открытой страницы.' },
    ],
    questions: [
      { q_ru: 'Сайт не стартует: «Inna witryna używa tego samego powiązania». Что делать?', options: ['Usunąć rolę IIS', 'Zatrzymać Default Web Site lub zmienić port/IP powiązania', 'Wyłączyć zaporę', 'Zmienić dokument domyślny'], correct: 1, why_ru: 'Default Web Site уже слушает *:80.' },
    ],
  },
  {
    id: 'ws-ftp',
    title_pl: 'IIS: witryna FTP',
    title_ru: 'IIS: FTP-сайт (анонимно на чтение)',
    tool: 'inetmgr',
    task_pl: ['Utwórz witrynę FTP z katalogiem C:\\ftp, port 21, bez SSL, dostęp anonimowy tylko do odczytu, użytkownik Administrator – odczyt i zapis.'],
    sheets: ['2022-06-04', '2026-01-05', '2026-06-02', '2026-06-03'],
    doc: '6. IIS — сайт WWW / FTP (`inetmgr`)',
    steps: [
      { pl: 'Dodaj role i funkcje → Serwer sieci Web (IIS) → Serwer FTP → Usługa FTP', ru: 'FTP — отдельный компонент IIS.' },
      { pl: 'inetmgr → Witryny → PPM → Dodaj witrynę FTP… → nazwa, ścieżka C:\\ftp', ru: 'Новый FTP-сайт.' },
      { pl: 'Powiązanie i protokół SSL: Adres IP, Port 21, Bez protokołu SSL', ru: 'Без сертификата — «Bez SSL».' },
      { pl: 'Uwierzytelnianie: Anonimowe + Podstawowe; Autoryzacja: Użytkownicy anonimowi – Odczyt', ru: 'Первое правило создаётся в мастере.' },
      { pl: 'Witryna → Reguły autoryzacji FTP → Dodaj regułę zezwalającą → Administrator – Odczyt, Zapis', ru: 'Второе правило — уже после мастера.' },
      { pl: 'Test ze stacji: ftp://adres_serwera w Eksploratorze', ru: 'Проверка входа.' },
    ],
    questions: [
      { q_ru: 'Какой порт и протокол у FTP-сайта в листе без сертификата?', options: ['TCP 20, SSL wymagany', 'TCP 21, Bez protokołu SSL', 'UDP 69', 'TCP 22'], correct: 1, why_ru: 'FTP управляющее соединение — TCP 21; SSL требует сертификата.' },
    ],
  },
  {
    id: 'ws-print',
    title_pl: 'Serwer wydruku: drukarka TCP/IP RAW',
    title_ru: 'Сетевой принтер по TCP/IP (RAW 9100) + общий доступ',
    tool: 'Zarządzanie drukowaniem (printmanagement.msc)',
    task_pl: ['Zainstaluj drukarkę sieciową o adresie 192.168.0.200 (protokół RAW, port 9100), sterownik z folderu DRUKARKA.', 'Udostępnij ją pod nazwą INF02, priorytet 99, wydrukuj stronę testową.'],
    sheets: ['2023-06-04', '2024-01-03', '2025-06-07', '2026-01-03', '2026-06-02'],
    doc: '10. Принтер (print server)',
    steps: [
      { pl: 'Dodaj rolę Usługi drukowania i zarządzania dokumentami (lub użyj Ustawienia → Drukarki)', ru: 'Print server.' },
      { pl: 'printmanagement.msc → Drukarki → Dodaj drukarkę… → Dodaj nową drukarkę przy użyciu adresu IP lub nazwy hosta', ru: 'Сетевой принтер по IP.' },
      { pl: 'Typ: Urządzenie TCP/IP, adres 192.168.0.200, odznacz automatyczne wykrywanie sterownika', ru: 'Создаётся стандартный TCP/IP-порт.' },
      { pl: 'Niestandardowe → Ustawienia… → Protokół: Raw, Numer portu: 9100', ru: 'RAW 9100 — критерий листа.' },
      { pl: 'Sterownik: Z dysku… → folder DRUKARKA → model', ru: 'Драйвер из папки с флешки.' },
      { pl: 'Udostępnij tę drukarkę → Nazwa udziału: INF02', ru: 'Общий доступ.' },
      { pl: 'Właściwości → Zaawansowane → Priorytet 99; Ogólne → Drukuj stronę testową', ru: '99 = najwyższy priorytet.' },
    ],
    questions: [
      { q_ru: 'Лист: «najwyższy priorytet drukarki». Какое значение?', options: ['1', '10', '99', '100'], correct: 2, why_ru: 'Диапазон 1–99, 99 — наивысший.' },
      { q_ru: 'Где «Dostępna od 6:00 do 22:00»?', options: ['Właściwości drukarki → Zaawansowane', 'Właściwości drukarki → Porty', 'Zabezpieczenia', 'Udostępnianie'], correct: 0, why_ru: 'Вкладка Zaawansowane: «Dostępna od … do …».' },
    ],
  },
  {
    id: 'ws-rras',
    title_pl: 'Routing sieci LAN / NAT (RRAS)',
    title_ru: 'Маршрутизация LAN / NAT на сервере (RRAS)',
    tool: 'Routing i dostęp zdalny (rrasmgmt.msc)',
    task_pl: ['Zainstaluj usługę Routing i skonfiguruj serwer jako router sieci LAN między interfejsami LAN1 i LAN2.'],
    sheets: ['2023-01-02', '2023-06-02', '2024-01-02'],
    doc: '11. RDP, брандмауэр, маршрутизация',
    steps: [
      { pl: 'Dodaj role i funkcje → Dostęp zdalny → Usługi ról: Routing', ru: 'Роль Remote Access, служба Routing.' },
      { pl: 'rrasmgmt.msc → PPM na serwerze → Konfiguruj i włącz routing i dostęp zdalny', ru: 'Мастер RRAS.' },
      { pl: 'Konfiguracja niestandardowa → zaznacz Routing sieci LAN (i NAT, jeśli wymagany)', ru: 'Только нужные функции.' },
      { pl: 'Zakończ → Uruchom usługę', ru: 'Служба RemoteAccess запущена.' },
      { pl: 'Sprawdź ping między stacjami w obu sieciach (brama = adres serwera)', ru: 'Шлюзом на клиентах должен быть сервер.' },
    ],
    questions: [
      { q_ru: 'Нужно, чтобы сеть LAN2 выходила в интернет через сервер. Что включить кроме routing?', options: ['DHCP Relay', 'NAT na interfejsie publicznym', 'Serwer VPN', 'Wyłączyć zaporę'], correct: 1, why_ru: 'NAT → интерфейс к интернету как «Interfejs publiczny» + «Włącz NAT na tym interfejsie».' },
    ],
  },
  {
    id: 'ws-backup',
    title_pl: 'Kopia zapasowa systemu Windows Server',
    title_ru: 'Резервное копирование (Kopia zapasowa systemu Windows Server)',
    tool: 'wbadmin.msc',
    task_pl: ['Zainstaluj funkcję Kopia zapasowa systemu Windows Server i wykonaj jednorazową kopię folderu C:\\DANE na dysk E:.'],
    sheets: ['(rzadko — przygotowanie na wszelki wypadek)'],
    doc: '2. Установка ролей',
    steps: [
      { pl: 'Dodaj role i funkcje → Funkcje → Kopia zapasowa systemu Windows Server', ru: 'Это функция (Funkcje), не роль.' },
      { pl: 'Otwórz wbadmin.msc → Kopia zapasowa lokalna', ru: 'Консоль резервного копирования.' },
      { pl: 'Akcje → Wykonaj kopię zapasową jednorazowo…', ru: 'Разовая копия (по расписанию — «Harmonogram kopii zapasowych»).' },
      { pl: 'Różne opcje → Niestandardowa → Dodaj elementy → C:\\DANE', ru: 'Только нужная папка.' },
      { pl: 'Typ miejsca docelowego: Dyski lokalne → E: → Utwórz kopię zapasową', ru: 'Целевой диск.' },
    ],
    questions: [
      { q_ru: 'Где ставится «Kopia zapasowa systemu Windows Server»?', options: ['Role serwera', 'Funkcje', 'Usługi ról IIS', 'Panel sterowania → Programy'], correct: 1, why_ru: 'Windows Server Backup — это Funkcja в мастере «Dodaj role i funkcje».' },
    ],
  },
]

/** ordering score: longest run of steps in correct relative order / number of steps */
export function orderScore(order: number[]): number {
  // longest increasing subsequence of the original indices
  const tails: number[] = []
  for (const x of order) {
    let lo = 0
    let hi = tails.length
    while (lo < hi) {
      const m = (lo + hi) >> 1
      if (tails[m] < x) lo = m + 1
      else hi = m
    }
    tails[lo] = x
  }
  return tails.length / order.length
}
