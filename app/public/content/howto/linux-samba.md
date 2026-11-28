# Linux: общая папка Samba (udział sieciowy)

## 1. Каталог

```
sudo mkdir -p /srv/samba/dane
sudo chmod 770 /srv/samba/dane          # как требует задание
sudo chown administrator:users /srv/samba/dane
```

## 2. Ресурс в /etc/samba/smb.conf

```
sudo nano /etc/samba/smb.conf
```

В самый конец:

```
[dane]
   path = /srv/samba/dane
   browseable = yes
   read only = no
   guest ok = no
   valid users = administrator
```

| в листе | параметр |
|---|---|
| udział widoczny | `browseable = yes` |
| tylko do odczytu | `read only = yes` |
| z prawem zapisu | `read only = no` (или `writable = yes`) |
| bez dostępu dla gościa | `guest ok = no` |
| dostęp tylko dla X | `valid users = X` |

## 3. Пароль Samba для пользователя

```
sudo smbpasswd -a administrator
```

На экзамене это обязательно, иначе с Windows не войти. В нашем тренажёре этой команды нет — шаг можно пропустить.

## 4. Применить и автозапуск

```
sudo systemctl restart smbd
sudo systemctl enable smbd
testparm          # проверка синтаксиса (на настоящем сервере)
```

## 5. Подключиться с Windows

Проводник → `\\адрес_сервера\dane`, логин пользователя Samba.
