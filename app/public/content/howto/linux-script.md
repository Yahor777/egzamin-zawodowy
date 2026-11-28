# Linux: скрипты bash (skrypty powłoki)

## Создать и запустить

```
mkdir ~/skrypty && cd ~/skrypty
nano konta.sh
chmod u+x konta.sh          # или chmod 755 / 700 — как в задании
sudo ./konta.sh uczen 3TI   # useradd требует sudo
```

## Параметры

`$1`, `$2` — первый и второй параметр; `$#` — сколько параметров; `$0` — имя скрипта.

## Цикл for — N пользователей

```bash
#!/bin/bash
# konta.sh <nazwa_bazowa_uzytkownika> <nazwa_bazowa_katalogu>
for i in $(seq 1 5); do
  useradd -m -d /home/$2$i $1$i
done
```

То же через `{1..5}` или «как в C»:

```bash
for ((i=1; i<=5; i++)); do
  useradd -m -d /home/$2$i $1$i
done
```

## while и условие

```bash
#!/bin/bash
i=1
while [ $i -le 3 ]; do
  echo "Numer $i"
  i=$((i+1))
done

if [ -d /dane ]; then
  echo "katalog istnieje"
else
  mkdir /dane
fi
```

Сравнения чисел: `-eq -ne -lt -le -gt -ge`. Файл существует: `-f`, каталог: `-d`.

## Чтение с клавиатуры

```bash
read -p "Podaj nazwę: " nazwa
echo "Witaj $nazwa"
```

## Ловушки

- Первая строка `#!/bin/bash`.
- Вокруг `[` и `]` — пробелы.
- Нет права x — `Permission denied`. Запуск из текущего каталога — с `./`.
