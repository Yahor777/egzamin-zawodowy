# Linux: диски, разделы, монтирование, fstab

## 1. Найти диск

```
lsblk            # sda — системный, sdb — новый (без разделов)
sudo fdisk -l
```

## 2. Создать раздел (partycja)

```
sudo fdisk /dev/sdb
  n        новый раздел
  p        podstawowa (primary)
  1        номер
  Enter    первый сектор по умолчанию
  Enter    последний — весь диск (или +5G)
  w        записать и выйти
```

Проверка: `lsblk` → появился `sdb1`.

## 3. Файловая система

```
sudo mkfs.ext4 /dev/sdb1
sudo mkfs.xfs /dev/sdb1      # если в задании xfs
```

## 4. Монтирование

```
sudo mkdir -p /mnt/dane
sudo mount /dev/sdb1 /mnt/dane
df -h            # видно /dev/sdb1 и точку монтирования
```

## 5. Автомонтирование после перезагрузки — /etc/fstab

```
sudo nano /etc/fstab
/dev/sdb1   /mnt/dane   ext4   defaults   0   2
```

Надёжнее по UUID (`sudo blkid /dev/sdb1`): `UUID=... /mnt/dane ext4 defaults 0 2`.

Проверить без перезагрузки: `sudo umount /mnt/dane && sudo mount -a && df -h`.

## Полезное

- `sudo umount /mnt/dane` — отмонтировать (выйди из каталога, иначе *target is busy*).
- `du -sh каталог` — сколько занимает; `df -h` — сколько свободно.
