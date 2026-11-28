# Strategia na część praktyczną INF.02

Ta strona odpowiada na pytanie: **co zrobić najpierw, co później i jak nie stracić punktów**. Nie ucz się jej jak teorii — używaj jako planu podczas każdego treningu.

## 1. Najważniejsza zasada punktów

- Praktyka trwa **150 minut**, zwykle jest też czas na przeczytanie arkusza.
- Arkusz jest podzielony na rezultaty: kabel/montaż, identyfikacja, ruter, przełącznik, serwer, stacja, tabela, test komunikacji.
- Prawie każde małe kryterium to **1 punkt**: `spełnia` albo `nie spełnia`.
- Punktów częściowych zwykle nie ma: prawie dobrze = `nie spełnia`.
- Próg części praktycznej to **75%**. Jeżeli jest 44 kryteria, potrzebujesz minimum 33; możesz stracić 11.
- Dlatego nie musisz zrobić wszystkiego idealnie. Musisz szybko zebrać jak najwięcej prostych kryteriów i nie utknąć.

Niestandardowe, ale poprawne rozwiązanie jest zaliczane. Można konfigurować przez GUI albo PowerShell — liczy się stan końcowy.

## 2. Pierwsze 10 minut: co czytać w arkuszu

Nie zaczynaj od razu klikać. Wypisz albo zakreśl:

- numer stanowiska `X` / `EGZAMIN-x`;
- wszystkie adresy IP, maski, bramę, DNS;
- dokładne nazwy: użytkownik, grupa, OU, domena, folder, udział, SSID, VLAN;
- numery portów przełącznika/panelu krosowego;
- gdzie potrzebne są zrzuty ekranu i jakie nazwy plików;
- gdzie jest napisane `zgłoś gotowość przez podniesienie ręki`;
- które zadania zależą od innych.

`X` najczęściej oznacza numer stanowiska. Jeżeli wzór to `192.168.0.10+X`, a stanowisko jest numer 5, adres będzie `192.168.0.15`. Jeżeli w przykładzie jest `firma05.local`, zero wiodące jest ważne.

## 3. Plan na 150 minut

| Czas | Co robić | Dlaczego |
|---|---|---|
| 0–20 | kabel/Keystone albo montaż RAM/dysku, potem zgłosić gotowość | pracę fizyczną często sprawdzają na żywo; bez niej reszta nie ruszy |
| 20–25 | podłączyć urządzenia według schematu i uruchomić komputery | jeśli nie ma łącza, dalej nic nie sprawdzisz |
| 25–50 | ruter, potem przełącznik; zgłosić gotowość, jeśli wymagane | dużo prostych punktów, od tego zależą DHCP i ping |
| 50–100 | serwer: sieć → nazwa → rola → AD/DNS/IIS/udostępnienia | największy blok; instalacja AD może restartować serwer |
| 100–125 | stacja robocza: sieć, użytkownicy, zasady, domena | przyłączenie do domeny jest możliwe dopiero po gotowym kontrolerze domeny |
| 125–135 | identyfikacja parametrów, zrzuty, kosztorys/harmonogram | praca mechaniczna, szybkie punkty |
| 135–150 | testy ping, pokaz egzaminatorowi, kontrola końcowa | ping często sprawdzają na żywo na końcu |

To nie jest sztywny przepis. Jeżeli arkusz zaczyna się od identyfikacji „przed wymianą”, najpierw zapisz parametry **przed demontażem**.

## 4. Kiedy podnosić rękę

Podnoś rękę tylko tam, gdzie arkusz wyraźnie pisze `zgłoś gotowość` / `przez podniesienie ręki`. Zwykle są to:

1. test kabla testerem;
2. sprawdzenie montażu podzespołu przed zamknięciem obudowy;
3. konfiguracja rutera;
4. konfiguracja przełącznika;
5. wydruk strony testowej;
6. powtórny test ping przy egzaminatorze;
7. pokazanie strony, FTP albo adresu otrzymanego przez DHCP.

Gdy egzaminator jest zajęty, nie stój. Rób kolejny niezależny punkt.

## 5. Kolejność w bloku serwerowym

Często działająca kolejność:

```
adres IP serwera → nazwa komputera → instalacja roli → konfiguracja roli →
utworzenie obiektów (OU/użytkownicy/grupy) → foldery/udostępnienia/uprawnienia →
sprawdzenie z klienta
```

Dlaczego tak:

- bez poprawnego IP i DNS domena może nie działać;
- bez roli nie ma potrzebnej konsoli;
- bez OU nie utworzysz użytkownika tam, gdzie wymagają;
- bez udziału sieciowego klient nie otworzy folderu.

Jeżeli instalacja roli AD DS trwa długo i będzie restart, uruchom proces i wykorzystaj oczekiwanie na inne niezależne zadanie.

## 6. Najczęstsze utraty punktów

Sprawdź tę listę pod koniec arkusza.

- [ ] Źle policzone `X` albo `XX` w IP, nazwie komputera, domenie.
- [ ] Nazwa nie zgadza się dokładnie: `LAN Z` ≠ `LAN_Z` ≠ `LANZ`; wielkość liter ma znaczenie.
- [ ] `brama: brak` oznacza puste pole, a nie `0.0.0.0`.
- [ ] DNS `localhost` to `127.0.0.1`.
- [ ] Właściwy interfejs jest podłączony do właściwego portu przełącznika.
- [ ] DHCP jest włączone/wyłączone dokładnie tam, gdzie wymagają.
- [ ] Hasło użytkownika: odznaczono albo zostawiono `musi zmienić hasło przy następnym logowaniu` zgodnie z zadaniem.
- [ ] Są i `uprawnienia udziału`, i `uprawnienia NTFS` — to dwie różne rzeczy.
- [ ] `tylko dla ...` oznacza usunięcie zbędnych i wyłączenie dziedziczenia, jeśli trzeba.
- [ ] Zrzut ekranu jest zapisany we właściwym folderze, z właściwą nazwą i rozszerzeniem.
- [ ] Na zrzucie naprawdę widać potrzebną wartość/polecenie, a nie puste okno.
- [ ] Tabela w papierowym arkuszu zgadza się ze zrzutami; nie ma pustych pól.
- [ ] Ping działa **w obie strony**, zapora nie blokuje ICMPv4.
- [ ] Ustawienia rutera/przełącznika są zapisane.
- [ ] W Linuksie wykonano `netplan apply`, `systemctl restart`, `systemctl enable`, jeśli potrzeba.
- [ ] Po restarcie kontrolera domeny logowanie jest jako `DOMENA\Administrator`.
- [ ] Użyte hasła są zapisane w arkuszu, jeżeli jest to wymagane.
- [ ] Na końcu komputery i urządzenia sieciowe **nie są wyłączone**.

## 7. Jeżeli utkniesz

- Więcej niż 5 minut nad jednym punktem → zaznacz go i przejdź dalej.
- Każde kryterium jest warte mniej więcej tyle samo. Nie poświęcaj dziesięciu prostych punktów dla jednego trudnego.
- Brak łączności? Sprawdzaj po kolei: kabel → port → VLAN → IP/maska → brama → DNS → zapora.
- Ruter/przełącznik „zgubił się” po zmianie IP? Ustaw na komputerze statyczny adres z nowej sieci i wejdź ponownie. W ostateczności reset i szybka konfiguracja od nowa.
- Domena nie jest gotowa? Zrób lokalne ustawienia stacji i wróć później do przyłączenia.
- Usługa w Linuksie nie startuje? `systemctl status nazwa` i `journalctl -u nazwa -n 20` najczęściej pokazują literówkę.

## 8. Arkusz kalkulacyjny / kosztorys

W polskim Excelu/LibreOffice Calc funkcje są polskie, separator argumentów to `;`, separator dziesiętny to przecinek.

| Potrzeba | Przykładowa formuła |
|---|---|
| VAT 23% | `=C2*23%` |
| cena brutto | `=C2+D2` |
| wartość brutto | `=E2*F2` |
| suma | `=SUMA(G2:G10)` |
| rabat warunkowy | `=JEŻELI(G11>=2000;G11*10%;0)` |
| do zapłaty | `=G11-G12` |
| napis TAK/NIE | `=JEŻELI(B11>=B12;"NIE";"TAK")` |
| zapas 20% | `=B9*1,2` |

Prosty test: zmień jedną cenę wejściową. Jeżeli suma sama się nie przeliczyła — gdzieś jest liczba zamiast formuły.

## 9. Wskazania — pisemne zalecenia

Jeżeli proszą o kilka zaleceń, pisz krótko i z różnych obszarów:

- aktualizacje systemu i programów;
- program antywirusowy i zapora;
- silne, unikalne hasła i 2FA;
- ostrożność przy załącznikach i linkach;
- kopie zapasowe;
- HTTPS i VPN w publicznych sieciach Wi-Fi;
- konto standardowe zamiast administratora;
- blokada ekranu przy odejściu;
- ergonomia i przerwy.

Nie pisz pięć razy tego samego innymi słowami.

## 10. Jak używać tej strategii w domu

1. Weź dowolny arkusz SG 2024–2026.
2. Ustaw timer na 150 minut.
3. Zachowuj się jak na egzaminie: czytaj, zaznaczaj, rób zrzuty.
4. Po zakończeniu porównaj z kryteriami `_zo`.
5. Policz: ile kryteriów `spełnia`, ile stracone i dlaczego.
6. W następnym treningu usuwaj tylko 2–3 powtarzające się błędy, nie wszystko naraz.

Cel treningu to nie „skończyć arkusz za wszelką cenę”, tylko nauczyć się w 150 minut stabilnie przekraczać 75%.
