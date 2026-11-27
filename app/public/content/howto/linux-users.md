# Linux: пользователи и группы (konta i grupy)

## Как читать команду

```
sudo usermod -aG ksiegowiec anowak
│    │       │   │          └─ КОГО меняем (пользователь) — всегда в самом конце
│    │       │   └─ значение для опции -G (имя группы)
│    │       └─ опции: -a и -G, склеенные вместе (то же, что -a -G)
│    └─ программа: usermod = «изменить пользователя»
└─ выполнить от имени администратора (спросит пароль administrator)
```

- **Минус + буква** (`-m`, `-G`) — это **опция** (переключатель) программы. Каждая буква что-то значит, см. таблицы ниже.
- Несколько опций без значения можно склеить: `-a -G` = `-aG`.
- Если опции нужно значение (группа, каталог, дата), оно пишется **сразу после неё**: `-G ksiegowiec`, `-d /home/inny`.
- Имя пользователя (или группы, которую создаём/меняем) — **последнее слово**.
- Большая и маленькая буква — **разные** опции: `-g` ≠ `-G`.

Без `sudo` получишь `Only root may add a user or group` / `Permission denied` — значит, забыл `sudo`.
Пароль при вводе не отображается — это нормально.

## Какую программу брать

| Задача | Программа | Значение названия |
|---|---|---|
| создать группу | `groupadd` | group add — добавить группу |
| изменить группу | `groupmod` | group modify |
| удалить группу | `groupdel` | group delete |
| создать пользователя | `useradd` | user add — **только для НОВОГО** пользователя |
| изменить **существующего** (в т.ч. добавить в группу) | `usermod` | user modify |
| удалить пользователя | `userdel` | user delete |
| задать пароль | `passwd` | password |
| срок действия учётной записи и пароля | `chage` | change age |

Частая ошибка: `useradd -a ...` — у `useradd` нет опции `-a` (`invalid option -- 'a'`).
Добавить **уже существующего** пользователя в группу — это `usermod`, не `useradd`.

## Группы

```
sudo groupadd ksiegowiec            # создать группу ksiegowiec
sudo groupadd -g 1500 ksiegowiec    # -g 1500 = задать номер группы (GID) 1500
sudo groupmod -n nowa stara         # -n = new name: переименовать «stara» в «nowa»
sudo groupmod -g 1111 ksiegowiec    # -g = сменить GID
sudo groupdel ksiegowiec            # удалить группу
getent group ksiegowiec             # проверить: ksiegowiec:x:1001:anowak (в конце — члены)
```

`addgroup ksiegowiec` (Debian/Ubuntu) делает то же, что `groupadd`, только с сообщениями `info: Adding group…`.

## Создать пользователя — `useradd`

| Опция | Значит | Пример |
|---|---|---|
| `-m` | **m**ake home — создать каталог `/home/имя` | `-m` (без неё каталога не будет — частая потеря баллов) |
| `-d` | **d**irectory — свой путь к домашнему каталогу | `-d /home/inny` |
| `-g` | основная (podstawowa) группа — **одна** | `-g pracownicy` |
| `-G` | дополнительные (dodatkowe) группы — можно несколько через запятую, без пробелов | `-G ksiegowiec,sudo` |
| `-c` | **c**omment — opis konta, «Imię Nazwisko» | `-c "Anna Nowak"` |
| `-s` | **s**hell — powłoka | `-s /bin/bash` |
| `-u` | **U**ID — номер пользователя | `-u 1600` |
| `-e` | **e**xpire — konto wygasa (дата ГГГГ-ММ-ДД) | `-e 2027-06-30` |

```
sudo useradd -m -c "Anna Nowak" -G ksiegowiec -s /bin/bash anowak
sudo passwd anowak                  # задать пароль (два раза)
id anowak                           # проверить: uid=…(anowak) gid=…(anowak) groups=…,1001(ksiegowiec)
```

`adduser anowak` (Debian/Ubuntu) — интерактивный вариант: сам создаёт каталог и спрашивает пароль и opis.

## Изменить существующего — `usermod`

| Опция | Значит |
|---|---|
| `-aG группа` | **a**ppend + **G**roups — **добавить** в дополнительную группу, остальные группы сохранить |
| `-G группа` (без `-a`) | **заменить** все дополнительные группы этой — пользователь вылетит из остальных! |
| `-g группа` | сменить основную группу |
| `-c "текст"` | сменить opis |
| `-s /bin/bash` | сменить powłokę |
| `-d /nowy -m` | сменить домашний каталог и перенести файлы |
| `-l nowy` | сменить **l**ogin (имя) |
| `-L` / `-U` | заблокировать (**L**ock) / разблокировать (**U**nlock) |
| `-e 2027-06-30` | дата wygaśnięcia konta |

```
sudo usermod -aG ksiegowiec anowak  # добавить anowak в группу ksiegowiec
sudo adduser anowak ksiegowiec      # то же самое другим способом (Debian/Ubuntu)
sudo gpasswd -a anowak ksiegowiec   # и ещё один способ
sudo gpasswd -d anowak ksiegowiec   # убрать anowak из группы (-d = delete)
sudo userdel -r anowak              # удалить учётную запись; -r = remove: вместе с /home/anowak
```

Порядок: **сначала группа, потом пользователь** в `usermod -aG группа пользователь`,
но в `adduser пользователь группа` и `gpasswd -a пользователь группа` — наоборот. Проверяй `id имя`.

## «Uprawnienia administratora / root»

```
sudo usermod -aG sudo asystent      # Ubuntu: группа sudo = может выполнять всё через sudo
```

## Ważność konta i hasła — `chage`

| Опция | Значит | Пример |
|---|---|---|
| `-E` | дата, когда **учётная запись** истекает | `chage -E 2027-06-30 anowak` |
| `-M` | **M**ax — сколько дней максимум действует пароль | `chage -M 30 anowak` |
| `-m` | **m**in — сколько дней минимум между сменами | `chage -m 2 anowak` |
| `-W` | **W**arning — за сколько дней предупреждать | `chage -W 7 anowak` |
| `-d 0` | дата последней смены = 0 → смена пароля при следующем входе | `chage -d 0 anowak` |
| `-l` | **l**ist — показать настройки | `chage -l anowak` |

## Где это хранится (что проверяет экзаменатор)

- `/etc/passwd` — `login:x:UID:GID:opis:katalog:powłoka` → `grep anowak /etc/passwd`
- `/etc/shadow` — хеши паролей и сроки (только через `sudo`)
- `/etc/group` — `grupa:x:GID:członkowie` → `grep ksiegowiec /etc/group`
