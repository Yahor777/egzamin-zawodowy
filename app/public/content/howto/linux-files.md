# Linux: файлы, архивы, ссылки, перенаправление

## Файлы и каталоги

```
mkdir -p ~/a/b          # каталог (с родителями)
touch plik.txt          # пустой файл
cp plik1 plik2 ~/Kopie/ # копировать файлы в каталог
cp -r /etc/netplan ~/kopia_netplan   # каталог целиком
mv stary nowy           # переместить / переименовать
rm plik; rm -r katalog  # удалить
echo "tekst" > plik     # записать текст (перезаписывает)
cat plik                # показать
find / -name "*.conf"   # найти
```

## Ссылки (dowiązania)

```
ln -s /var/log ~/logi   # symboliczne (ярлык): ls -l покажет logi -> /var/log
ln plik twarde          # twarde (тот же файл под другим именем)
```

## Перенаправление вывода

```
free -h > ~/ram.txt     # > записать (файл перезаписывается)
df -h >> ~/ram.txt      # >> дописать в конец
lsblk > dyski.txt
ip a > siec.txt
ls /etc | grep net      # | передать вывод другой команде
```

## Архивы tar

```
tar -cvf archiwum.tar plik1 plik2       # создать (c), подробно (v), в файл (f)
tar -czvf archiwum.tar.gz katalog       # + сжатие gzip (z)
tar -tvf archiwum.tar                   # посмотреть содержимое (t)
tar -xvf archiwum.tar -C /tmp           # распаковать (x) в /tmp
zip -r archiwum.zip katalog; unzip archiwum.zip
```

Архивируй из каталога, где лежат файлы (`cd ~/Kopie`), иначе внутри будут длинные пути.

## Сведения о системе

```
free -h      RAM
df -h        zajętość dysków
lsblk        urządzenia blokowe
lscpu        procesor
ip a         interfejsy
uname -a     jądro
```
