# Linux: dyski, partycje, montowanie, fstab

## Jak czytać polecenie

```text
sudo mount -t ext4 /dev/sdb1 /dane
1    2     3  4    5         6
```

1. wymagane uprawnienia administratora
2. program: mount = montuj urządzenie do katalogu
3. opcja -t = type, typ systemu plików
4. WARTOŚĆ opcji -t: system plików ext4
5. ŹRÓDŁO: partycja /dev/sdb1
6. CEL: katalog montowania, punkt montowania

- `/dev/sdb` to cały dysk, `/dev/sdb1` to pierwsza partycja.
- Katalog `/dane` musi istnieć **przed** montowaniem.
- Po restarcie `mount` ręczny znika; trwały zapis jest w `/etc/fstab`.

## Jaki program wybrać

| Zadanie | Program | Co znaczy nazwa |
|---|---|---|
| zobaczyć dyski i partycje | `lsblk` | list block devices |
| zobaczyć tablicę partycji | `fdisk` | fixed disk / format disk — narzędzie partycji |
| utworzyć partycję interaktywnie | `fdisk` | jak wyżej |
| utworzyć system plików ext4 | `mkfs.ext4` | make filesystem ext4 |
| zamontować partycję | `mount` | montuj |
| odmontować partycję | `umount` | unmount; pisze się bez pierwszego **n** |
| sprawdzić UUID i system plików | `blkid` | block id |
| sprawdzić zajęte miejsce | `df` | disk free |
| montować wszystko z fstab | `mount -a` | all = wszystkie wpisy |

## Opcje programów

| Program | Opcja | Co znaczy litera | Co robi | Przykład |
|---|---|---|---|---|
| `lsblk` | `-f` | **f**ilesystem | pokazuje FSTYPE/UUID/mountpoint | `lsblk -f` |
| `fdisk` | `-l` | **l**ist | tylko wypisuje tablicę partycji | `fdisk -l /dev/sdb` |
| `mount` | `-t` | **t**ype | wymusza typ systemu plików | `mount -t ext4 /dev/sdb1 /dane` |
| `mount` | `-a` | **a**ll | montuje wpisy z `/etc/fstab` | `mount -a` |
| `df` | `-h` | **h**uman-readable | rozmiary w GiB/MiB | `df -h /dane` |
| `mkfs.ext4` | bez opcji | — | formatuje partycję jako ext4 | `mkfs.ext4 /dev/sdb1` |
| `printf` | `%02d` w formacie | print formatted | drukuje dane do pipe/skryptu | `printf 'n\n' \| fdisk` |

## 1. Znajdź właściwy dysk

```bash
lsblk                                            # pokaż drzewo dysków, partycji i punktów montowania
lsblk -f                                         # pokaż systemy plików i UUID partycji
sudo fdisk -l /dev/sdb                           # pokaż tablicę partycji dodatkowego dysku sdb
```

Nie formatuj `/dev/sda` — tam jest system. W arkuszu nowy dysk zwykle jest `/dev/sdb`.

## 2. Partycja na cały dysk

W fdisk literki nie są opcjami `-x`, tylko poleceniami menu:

| Litera w fdisk | Znaczenie | Co robi |
|---|---|---|
| `g` | GPT | nowa tablica partycji GPT |
| `n` | new | nowa partycja |
| `p` | print/primary | pokaż tablicę albo typ primary, zależnie od kontekstu |
| `w` | write | zapisz zmiany i wyjdź |
| `q` | quit | wyjdź bez zapisu |

```bash
printf 'g\nn\n1\n\n\nw\n' | sudo fdisk /dev/sdb  # utwórz GPT i partycję 1 na cały dysk bez ręcznego dialogu
sudo fdisk -l /dev/sdb                           # sprawdź, czy powstała partycja /dev/sdb1
```

Te same kroki ręcznie: `g` → `n` → `1` → Enter → Enter → `w`.

## 3. System plików i montowanie

```bash
sudo mkfs.ext4 /dev/sdb1                         # sformatuj pierwszą partycję jako ext4; kasuje dane na partycji
sudo mkdir /dane                                 # utwórz pusty katalog, który będzie punktem montowania
sudo mount -t ext4 /dev/sdb1 /dane               # zamontuj partycję sdb1 w katalogu /dane
df -h /dane                                      # sprawdź rozmiar i zajęte miejsce zamontowanej partycji
lsblk -f                                         # sprawdź, czy sdb1 ma ext4 i mountpoint /dane
```

## 4. Pełny `/etc/fstab` z komentarzem do każdej linii

`/etc/fstab` ma 6 pól w jednej linii:

```text
<file system>  <mount point>  <type>  <options>  <dump>  <pass>
```

```bash
sudo nano /etc/fstab                             # otwórz tabelę montowania jako administrator
```

<!-- file: /etc/fstab -->
```fstab
# plik systemowy root montowany przy starcie; zostawiony jako informacja
/dev/mapper/ubuntu--vg-ubuntu--lv / ext4 defaults 0 1
# partycja /boot z programu rozruchowego; nie ruszaj jej w zadaniu
/dev/sda2 /boot ext4 defaults 0 1
# plik wymiany swap; nie jest katalogiem, dlatego punkt montowania to none
/swap.img none swap sw 0 0
# nasza nowa partycja /dev/sdb1 ma być montowana w katalogu /dane
/dev/sdb1 /dane ext4 defaults 0 2
```

Znaczenie pól ostatniej linii:

| Pole | Wartość | Znaczenie |
|---|---|---|
| file system | `/dev/sdb1` | co montujemy |
| mount point | `/dane` | gdzie montujemy |
| type | `ext4` | system plików |
| options | `defaults` | normalne opcje rw,suid,dev,exec,auto,nouser,async |
| dump | `0` | bez kopii narzędziem dump |
| pass | `2` | fsck sprawdza po root (`1`) |

```bash
sudo systemctl daemon-reload                     # powiadom systemd o zmianie fstab
sudo umount /dane                                # odmontuj partycję testowo przed sprawdzeniem fstab
sudo mount -a                                    # zamontuj wszystkie wpisy fstab, także /dane
df -h /dane                                      # potwierdź, że /dane znowu jest zamontowane
lsblk -f                                         # zobacz finalny mountpoint /dane przy sdb1
sudo blkid /dev/sdb1                             # pokaż UUID partycji, przydatny zamiast /dev/sdb1
```

W prawdziwym Ubuntu często zamiast `/dev/sdb1` wpisuje się `UUID=...` z `blkid`. W symulatorze oba zapisy działają, ale w arkuszu najbezpieczniej zrozumieć oba.

## Częste błędy

| Tekst z symulatora | Dlaczego | Jak naprawić |
|---|---|---|
| `mount: /dane: mount point does not exist.` | nie utworzono katalogu `/dane` | `sudo mkdir /dane` |
| `mount: /dane: wrong fs type, bad option, bad superblock on /dev/sdb1, missing codepage or helper program, or other error.` | partycja nie jest sformatowana albo zły typ | `sudo mkfs.ext4 /dev/sdb1` |
| `mount: /dane: must be superuser to use mount.` | brak `sudo` | dodaj `sudo` |
| `umount: /dane: target is busy.` | terminal lub proces jest w katalogu `/dane` | wróć np. `cd /home/administrator` i powtórz |
| `fdisk: cannot open /dev/sdb: Permission denied` | fdisk uruchomiony bez `sudo` | dodaj `sudo` |
| `mount: /etc/fstab: parse error at line 2 -- ignored` | za mało pól albo linia jest złamana | jeden wpis fstab = jedna linia, 6 pól |

## Jak sprawdzić

```bash
lsblk -f                                         # pokaż system plików i mountpoint
df -h /dane                                      # pokaż wolne miejsce na /dane
mount | grep /dane                               # pokaż aktywne montowanie /dane
```

Oczekiwany fragment:

```text
└─sdb1  ext4   1.0        <uuid>                 /dane
/dev/sdb1 ... /dane
/dev/sdb1 on /dane type ext4 (rw,relatime)
```

Egzaminator sprawdza stan końcowy: partycja zajmuje dysk, ma ext4, jest zamontowana we właściwym katalogu i wraca po restarcie/fstab.

## Typowe sformułowania CKE → jakie polecenia

| Fragment arkusza po polsku | Co zrobić |
|---|---|
| `utwórz na całej powierzchni dysku partycję podstawową` | `printf 'g\nn\n1\n\n\nw\n' \| sudo fdisk /dev/sdb` albo ręcznie fdisk |
| `sformatuj partycję w systemie plików ext4` | `sudo mkfs.ext4 /dev/sdb1` |
| `zamontuj partycję w katalogu /dane` | `sudo mkdir /dane`, `sudo mount /dev/sdb1 /dane` |
| `partycja ma być montowana automatycznie` | wpis w `/etc/fstab` + `sudo mount -a` |
| `przeprowadź test wydajności partycji` | w środowisku graficznym Dyski/gnome-disks; parametry testu zapisz do tabeli |
