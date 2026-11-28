# Co naprawdę pojawia się na praktyce INF.02

Ta strona to statystyka z **52 oficjalnych arkuszy SG** (sesje 2022-01 … 2026-06). Nie służy do wkuwania, tylko do wyboru priorytetu: co trenować najpierw, aby szybciej przekroczyć próg 75%.

## Jak czytać procenty

`98%` nie znaczy „dostaniesz 98 punktów”. To znaczy: zadanie tego typu pojawia się w około 98% arkuszy.

- **100%** — trenuj do automatyzmu, pojawia się zawsze.
- **75–99%** — prawie obowiązkowa baza.
- **40–74%** — ważne, występuje bardzo często.
- **10–39%** — ucz się po opanowaniu bazy.
- **mniej niż 10%** — rzadkie; oglądaj dopiero, gdy podstawy są pewne.

Liczenie jest półautomatyczne na podstawie treści zadań i kryteriów `_zo`; możliwy błąd 2–3 arkuszy. Do ustalenia priorytetów to wystarczy.

## Ranking typów zadań

| # | Typ zadania | Arkuszy | % |
|---:|---|---:|---:|
| 1 | Test komunikacji `ping` między urządzeniami (+ „w razie potrzeby zmień ustawienia zapory”) | 52 | 100 % |
| 2 | Ruter: IP LAN (+ włączenie/wyłączenie DHCP) | 51 | 98 % |
| 3 | Zrzuty ekranu na nośnik `Egzamin-x` (do folderu o podanej nazwie) | 50 | 96 % |
| 4 | Przełącznik: IP + maska + brama | 49 | 94 % |
| 5 | Identyfikacja parametrów komputera (CPU, RAM, GPU, dysk, NIC, system) + zapis w tabeli + ocena zgodności z wymaganiami | 48 | 92 % |
| 6 | Kable: zarobienie patchcordu 8P8C (T568B/A, prosty/skrosowany) **albo** panel krosowy + Keystone | 40 | 77 % |
| 7 | Jakakolwiek praca w Linuksie (sieć, użytkownicy, identyfikacja) | 35 | 67 % |
| 8 | Linux: konfiguracja interfejsu sieciowego (statyczny / DHCP, nazwa połączenia) | 33 | 63 % |
| 9 | Montaż/wymiana podzespołu: RAM 40 %, dodatkowy dysk 15 %, karta graficzna/sieciowa 17 % | 31 | 60 % |
| 10 | Ruter: statyczny WAN (IP/maska/brama/DNS) | 30 | 58 % |
| 11 | Ruter: pula DHCP (zakres, czasem DNS, czas dzierżawy) | 30 | 58 % |
| 12 | Przełącznik: VLAN 802.1Q (porty access/untagged, „VLAN zarządzalny”) | 29 | 56 % |
| 13 | Linux: użytkownicy i grupy (`useradd`, `groupadd`, `usermod -aG`, UID/GID, shell, data ważności) | 27 | 52 % |
| 14 | Ruter: rezerwacja DHCP po MAC | 26 | 50 % |
| 15 | Zapora systemu Windows wymieniona (zezwolenie na ping) | 24 | 46 % |
| 16 | Windows Server: AD DS — podniesienie do kontrolera domeny (nowy las) | 19 | 37 % |
| 17 | Windows Server: OU + użytkownicy domenowi (opcje hasła) | 19 | 37 % |
| 18 | Uprawnienia NTFS (karta *Zabezpieczenia*, wyłączanie dziedziczenia) | 19 | 37 % |
| 19 | Arkusz kalkulacyjny: kosztorys/harmonogram (`SUMA`, `JEŻELI`, VAT 23%, format „zł”) | 19 | 37 % |
| 20 | IIS: witryna WWW (folder, powiązanie IP/port/nazwa hosta, dokument domyślny) albo FTP | 18 | 35 % |
| 21 | Udostępnienie folderu/dysku (nazwa udziału, także ukryty `$`, uprawnienia udziału) | 17 | 33 % |
| 22 | Zmiana nazwy komputera (Windows/Linux) | 17 | 33 % |
| 23 | Lokalne zasady/ustawienia Windows (złożoność hasła, blokada, Ctrl+Alt+Del, inspekcja, tapeta…) | 15 | 29 % |
| 24 | Drukarka sieciowa TCP/IP RAW 192.168.0.200 (+ udostępnienie, priorytet, godziny, uprawnienia) | 14 | 27 % |
| 25 | Lokalne konta Windows (`net user`, „nie może zmienić hasła”) | 14 | 27 % |
| 26 | Linux: uprawnienia `chmod`/`chown` (także liczbowo, „użytkownik, z którego prawami działa Apache”) | 12 | 23 % |
| 27 | Przyłączenie stacji do domeny + logowanie użytkownikiem domenowym | 11 | 21 % |
| 28 | Ruter: interfejsy VLAN/trunk, routing między VLAN, trasa statyczna | 11 | 21 % |
| 29 | Ruter: Wi-Fi (SSID, WPA2-PSK AES, 2,4 GHz, kanał = numer stanowiska) | 11 | 21 % |
| 30 | DNS: strefa wyszukiwania do przodu + rekord A, rzadziej strefa wsteczna + PTR, CNAME, parametry SOA | 10 | 19 % |
| 31 | Przełącznik: port trunk / tagged | 9 | 17 % |
| 32 | GPO (zakaz Panelu sterowania, zasady haseł, wdrażanie drukarki/MSI) | 8 | 15 % |
| 33 | Usługi Linux: Apache 4, SSH 3, isc-dhcp-server 1, Samba 1, bind 1 | 8 | 15 % |
| 34 | Linux: `tar` (utworzyć/rozpakować, z `-v`) | 7 | 13 % |
| 35 | Pliki wsadowe `.bat/.cmd` (pętla, parametr `%1`, `set /p`) | 6 | 12 % |
| 36 | Profil mobilny (`\\SERWER\profile$\%username%`) | 6 | 12 % |
| 37 | Wyraźna reguła ICMPv4 „Żądanie echa” w zaporze | 6 | 12 % |
| 38 | Partycje/formatowanie dysku w Windows (NTFS, litera, etykieta, GPT) | 5 | 10 % |
| 39 | „Wskazania” — pisemne zalecenia dotyczące bezpieczeństwa/eksploatacji | 5 | 10 % |
| 40 | Routing/NAT na Windows Server (rola *Dostęp zdalny*) | 4 | 8 % |
| 41 | Witryna FTP w IIS | 4 | 8 % |
| 42 | Przydziały: NTFS 2, FSRM (limit na udział) 1 | 3 | 6 % |
| 43 | BitLocker / szyfrowanie EFS | 3 | 6 % |
| 44 | Linux: skrypt bash z pętlą/parametrami | 2 | 4 % |
| 45 | NIC Teaming | 2 | 4 % |
| 46 | Rola DHCP na Windows Server | 1 | 2 % |
| 47 | Pulpit zdalny (RDP) | 1 | 2 % |

## Jak używać tabeli w przygotowaniu

### Krok 1. Najpierw gwarantowana baza

Trenuj do poziomu „potrafię zrobić bez podpowiedzi w 5–10 minut”:

1. LAN/DHCP na ruterze.
2. IP/maska/brama na przełączniku.
3. ping i zapora ICMP.
4. zrzuty ekranu z poprawnymi nazwami.
5. identyfikacja sprzętu.
6. patchcord/Keystone/panel krosowy.

Dlaczego: prawie zawsze jest to w arkuszu i zwykle daje dużo prostych kryteriów.

### Krok 2. Potem powiązane łańcuchy zadań

Nie ucz się tematów osobno. CKE często buduje łańcuchy:

```
VLAN na przełączniku → porty → adres IP → ping
ruter LAN/DHCP → rezerwacja DHCP → klient otrzymuje adres → pokazanie ipconfig
AD DS → OU → użytkownik → folder → udział + NTFS → logowanie klientem
IIS → plik index.html → DNS A → otwarcie strony z klienta
```

Jeżeli umiesz tylko „utworzyć użytkownika”, ale nie potrafisz sprawdzić wyniku z klienta, tracisz część punktów.

### Krok 3. Rzadkie tematy — dopiero po podstawach

`NIC Teaming`, `BitLocker`, `RDP`, `DHCP na Windows Server` występują rzadko. Nie zaczynaj od nich przygotowań. Wystarczy wiedzieć, gdzie jest ustawienie i jaki minimalny wynik jest wymagany.

## Prosty tygodniowy plan według statystyki

| Priorytet | Tematy | Cel |
|---|---|---|
| 1 | ruter, przełącznik, ping, zrzuty | zrobić bez błędów na czas |
| 2 | kabel, montaż, identyfikacja | nie tracić punktów proceduralnych |
| 3 | Linux: sieć, użytkownicy | pewnie wpisywać polecenia |
| 4 | Windows Server: AD/OU/pliki/IIS/DNS | rozumieć kolejność łańcucha |
| 5 | kosztorys i wskazania | szybko przygotować dokument |
| 6 | rzadkie tematy | wiedzieć, gdzie szukać ustawienia |

## Najważniejszy wniosek

Na praktyce wygrywa nie ten, kto zna najrzadsze funkcje, tylko ten, kto **stabilnie i szybko** wykonuje częste zadania oraz poprawnie dokumentuje wynik. Dlatego oceniaj się nie przez „przeczytałem temat”, tylko przez „zrobiłem go na czas i przeszedłem kryteria”.
