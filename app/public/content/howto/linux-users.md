# Linux: пользователи и группы (konta i grupy)

Всё с `sudo` (пароль administrator). Проверка после каждого шага: `id имя`, `getent group группа`.

## Группы

```
sudo groupadd pracownicy             # utwórz grupę
sudo groupadd -g 1500 pracownicy     # с заданным GID
sudo groupmod -n nowa stara          # zmień nazwę grupy
sudo groupmod -g 1111 grupa          # zmień GID
sudo groupdel grupa                  # usuń grupę
```

## Пользователи

```
sudo useradd -m anowak                       # z katalogiem domowym (-m!)
sudo useradd -m -d /home/inny anowak         # свой каталог домашний
sudo useradd -m -g pracownicy anowak         # grupa PODSTAWOWA (główna)
sudo useradd -m -G pracownicy,sudo anowak    # grupy DODATKOWE
sudo useradd -m -c "Anna Nowak" anowak       # opis konta (GECOS)
sudo useradd -m -s /bin/sh anowak            # powłoka
sudo useradd -m -e 2027-06-30 anowak         # konto wygasa
sudo passwd anowak                           # hasło (dwa razy, ничего не видно — это нормально)
```

Без `-m` каталога в /home не будет — частая потеря баллов.

## Изменить существующего

```
sudo usermod -aG pracownicy anowak   # dołącz do grupy (-a обязательно, иначе выкинет из других)
sudo usermod -g pracownicy anowak    # zmień grupę podstawową
sudo usermod -s /bin/bash anowak     # powłoka (или chsh -s)
sudo usermod -c "Anna Nowak" anowak  # opis
sudo usermod -L anowak               # zablokuj konto (passwd -l)
sudo usermod -U anowak               # odblokuj
sudo gpasswd -d anowak grupa         # usuń z grupy
sudo userdel -r anowak               # usuń konto RAZEM z katalogiem domowym
```

## «Uprawnienia administratora / root»

```
sudo usermod -aG sudo asystent       # Ubuntu: grupa sudo = może wszystko przez sudo
```

## Ważność konta i hasła (chage)

```
sudo chage -E 2027-06-30 anowak   # konto wygasa (data)
sudo chage -M 30 anowak           # hasło ważne max 30 dni
sudo chage -m 2 anowak            # min 2 dni między zmianami
sudo chage -W 7 anowak            # ostrzeżenie 7 dni przed
sudo chage -d 0 anowak            # wymuś zmianę hasła przy logowaniu
sudo chage -l anowak              # pokaż
```

## Где это хранится

- `/etc/passwd` — `login:x:UID:GID:opis:katalog:powłoka`
- `/etc/shadow` — хеши паролей и сроки
- `/etc/group` — `grupa:x:GID:członkowie`
