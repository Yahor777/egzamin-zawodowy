# Linux: службы (systemd) и cron

## Как читать команду

```text
sudo systemctl enable --now cron
│    │         │      │     └─ CEL: jednostka/usługa cron
│    │         │      └─ opcja --now = także uruchom teraz, nie tylko po restarcie
│    │         └─ akcja: enable = włącz autostart
│    └─ program: systemctl = systemd control, sterowanie usługami
└─ wymagane uprawnienia administratora
```

- `systemctl` najpierw przyjmuje **akcję**, potem **nazwę usługi**: `systemctl restart apache2`.
- Nazwa `ssh` i `ssh.service` zwykle znaczy to samo.
- `enable` nie uruchamia usługi bez `--now`; `start` nie dodaje autostartu.

## Какую программу брать

| Zadanie | Program | Co znaczy nazwa |
|---|---|---|
| uruchomić/zatrzymać usługę | `systemctl` | systemd control |
| zobaczyć stan usługi | `systemctl status` | status = stan |
| włączyć autostart | `systemctl enable` | enable = włącz |
| zobaczyć logi usługi | `journalctl` | journal control |
| zaplanować zadanie użytkownika | `crontab` | cron table |
| zobaczyć procesy | `ps` | processes |
| starszy interfejs usług | `service` | service = usługa |

## Opcje programów

| Program | Opcja/akcja | Co znaczy | Co robi | Przykład |
|---|---|---|---|---|
| `systemctl` | `start` | start | uruchamia teraz | `systemctl start ssh` |
| `systemctl` | `stop` | stop | zatrzymuje | `systemctl stop cron` |
| `systemctl` | `restart` | restart | restartuje | `systemctl restart apache2` |
| `systemctl` | `reload` | reload | wczytuje konfigurację bez pełnego restartu | `systemctl reload apache2` |
| `systemctl` | `enable` | enable | autostart | `systemctl enable ssh` |
| `systemctl` | `disable` | disable | wyłącza autostart | `systemctl disable cron` |
| `systemctl` | `is-active` | czy active | wypisuje active/inactive | `systemctl is-active ssh` |
| `systemctl` | `is-enabled` | czy enabled | wypisuje enabled/disabled | `systemctl is-enabled ssh` |
| `systemctl` | `--now` | now = teraz | enable + start w jednym | `systemctl enable --now ssh` |
| `journalctl` | `-u` | **u**nit | logi jednej usługi | `journalctl -u ssh` |
| `journalctl` | `-n` | **n** lines | liczba ostatnich linii | `journalctl -u ssh -n 20` |
| `crontab` | `-e` | **e**dit | edytuj zadania | `crontab -e` |
| `crontab` | `-l` | **l**ist | pokaż zadania | `crontab -l` |
| `crontab` | `-r` | **r**emove | usuń wszystkie zadania użytkownika | `crontab -r` |
| `crontab` | `-u` | **u**ser | cudzy crontab jako root | `sudo crontab -u uczen -l` |

## 1. Stan usługi

```bash
systemctl status ssh                             # pokaż stan usługi SSH, jej PID i ostatnie logi
systemctl is-active ssh                          # wypisz tylko active albo inactive
systemctl is-enabled ssh                         # wypisz tylko enabled albo disabled
systemctl list-unit-files                        # pokaż listę jednostek i ich stan autostartu
```

## 2. Start, restart, autostart

```bash
sudo systemctl restart ssh                       # zrestartuj usługę SSH po zmianie konfiguracji
sudo systemctl enable --now cron                 # włącz autostart cron i uruchom go od razu
systemctl is-active cron                         # sprawdź, czy cron działa
sudo systemctl stop cron                         # zatrzymaj cron testowo
systemctl is-active cron                         # zobacz inactive po zatrzymaniu
sudo systemctl start cron                        # uruchom cron z powrotem
systemctl is-active cron                         # potwierdź active po starcie
sudo journalctl -u ssh -n 20                     # pokaż 20 ostatnich logów usługi SSH
```

## 3. Format crontab

Crontab użytkownika ma 5 pól czasu, potem polecenie:

```text
┌ minuta (0–59)
│ ┌ godzina (0–23)
│ │ ┌ dzień miesiąca (1–31)
│ │ │ ┌ miesiąc (1–12)
│ │ │ │ ┌ dzień tygodnia (0–7, niedziela = 0 albo 7)
│ │ │ │ │
* * * * * polecenie
```

Pełny przykładowy plik crontab z komentarzem do każdej linii:

```cron
# powłoka używana do poleceń cron
SHELL=/bin/sh
# ścieżka programów dla zadań cron
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
# w każdy poniedziałek o 02:30 uruchom skrypt kopii
30 2 * * 1 /home/administrator/kopia.sh
# codziennie o 06:15 zapisz listę użytkowników do pliku
15 6 * * * /usr/bin/getent passwd > /home/administrator/uzytkownicy.txt
# przy każdym starcie systemu uruchom skrypt startowy
@reboot /home/administrator/start.sh
```

W `/etc/crontab` jest jeszcze dodatkowe pole **user** między czasem a poleceniem. W `crontab -e` użytkownika tego pola **nie ma**, bo zadanie należy do bieżącego użytkownika.

## 4. Dodaj crontab bez edytora

```bash
mkdir -p ~/skrypty                               # utwórz katalog na skrypty użytkownika
printf '#!/bin/bash\n/bin/date >> /home/administrator/cron-test.log\n' > ~/skrypty/cron-test.sh  # utwórz prosty skrypt testowy
chmod 700 ~/skrypty/cron-test.sh                 # nadaj skryptowi prawo wykonania tylko dla właściciela
crontab -l > ~/cron-backup 2>/dev/null || true   # zachowaj istniejące zadania; pusty plik też jest poprawny
cp ~/cron-backup ~/cron-nowe                     # skopiuj stare zadania do nowej wersji crontab
printf '30 2 * * 1 /home/administrator/skrypty/cron-test.sh\n' >> ~/cron-nowe  # dopisz ćwiczeniowe zadanie bez kasowania starych
crontab ~/cron-nowe                              # zainstaluj połączoną wersję crontab
crontab -l                                       # pokaż zainstalowane zadania crontab
crontab ~/cron-backup                            # przywróć poprzednie zadania po ćwiczeniu
rm ~/cron-backup ~/cron-nowe                     # usuń pliki tymczasowe ćwiczenia
```

## Частые ошибки

| Tekst z symulatora | Dlaczego | Jak naprawić |
|---|---|---|
| `Unit ssh.service could not be found.` | pakiet/usługa nie jest zainstalowany albo literówka | sprawdź `apt list --installed` i nazwę usługi |
| `Failed to restart ssh.service: Access denied` | brak uprawnień administratora | użyj `sudo` |
| `ssh.service is not active, cannot reload.` | reload działa tylko na aktywnej usłudze | użyj `start` albo `restart` |
| `no crontab for administrator` | użytkownik nie ma jeszcze zadań | dodaj przez `crontab -e` albo zainstaluj plik przez `crontab plik` |
| `bad minute` | pierwsze pole crona ma złą wartość | minuta musi być 0–59 albo `*` |
| `bad command` | za mało pól; cron nie widzi polecenia | po 5 polach czasu dopisz polecenie |
| `errors in crontab file, can't install.` | plik ma błąd składni | popraw wskazaną linię i zainstaluj ponownie |

## Как проверить

```bash
systemctl is-active ssh                          # sprawdź, czy SSH jest active
systemctl is-enabled ssh                         # sprawdź, czy SSH jest enabled
systemctl is-active cron                         # sprawdź, czy cron jest active
crontab -l                                       # pokaż zadania cron, jeśli są zainstalowane
```

Oczekiwany fragment:

```text
active
enabled
active
30 2 * * 1 /home/administrator/skrypty/cron-test.sh
```

## Typowe sformułowania CKE → jakie polecenia

| Fragment arkusza po polsku | Co zrobić |
|---|---|
| `uruchom usługę ...` | `sudo systemctl start nazwa` |
| `włącz automatyczne uruchamianie usługi` | `sudo systemctl enable nazwa` albo `enable --now` |
| `zrestartuj usługę po zmianie konfiguracji` | `sudo systemctl restart nazwa` |
| `sprawdź status usługi` | `systemctl status nazwa` |
| `zadanie ma być wykonywane cyklicznie` | wpis w `crontab` z 5 polami czasu |
| `zapisz polecenie z wszystkimi opcjami` | przepisz dokładnie np. `sudo systemctl enable --now cron` |
