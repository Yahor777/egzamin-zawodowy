# Linux: SSH

## Служба

```
sudo apt install openssh-server       # если не установлен
sudo systemctl enable --now ssh       # запустить и автозапуск
systemctl status ssh
```

## Настройки — /etc/ssh/sshd_config

```
sudo nano /etc/ssh/sshd_config
```

Строки с `#` — закомментированы (не действуют). Убери `#` и измени значение:

```
Port 2222                  # порт
PermitRootLogin no         # запрет входа root
PasswordAuthentication yes
AllowUsers administrator jkowalski   # кому можно
```

Применить: `sudo systemctl restart ssh`. Проверить порт: `ss -tlnp | grep ssh`.

## Подключиться

```
ssh administrator@192.168.0.10
ssh -p 2222 administrator@192.168.0.10
```

С Windows — то же в cmd/PowerShell (`ssh` встроен) или PuTTY.
