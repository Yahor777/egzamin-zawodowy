# Linux: службы (systemd) и cron

## systemctl

```
systemctl status smbd               # состояние: active (running) / inactive / failed
sudo systemctl start smbd           # запустить сейчас
sudo systemctl stop smbd            # остановить
sudo systemctl restart smbd         # перезапустить (после правки конфига)
sudo systemctl enable smbd          # автозапуск после старта системы
sudo systemctl disable smbd         # убрать из автозапуска
sudo systemctl enable --now smbd    # автозапуск + запустить сразу
sudo systemctl disable --now smbd   # остановить + убрать из автозапуска
systemctl is-enabled smbd
```

«uruchom usługę i ustaw automatyczne uruchamianie» = `enable --now`.

| служба | unit |
|---|---|
| SSH | `ssh` |
| Samba | `smbd` |
| Apache | `apache2` |
| DNS (bind9) | `named` |
| DHCP | `isc-dhcp-server` |

Ошибка запуска — `journalctl -u имя` (последние строки).

## cron — задания по расписанию

```
crontab -e      # редактировать (своё; для root — sudo crontab -e)
crontab -l      # показать
```

Формат строки: `минута час день_месяца месяц день_недели команда`

```
30 22 * * 1-5  tar -czf /tmp/kopia.tar.gz /home/administrator/dokumenty
0 8 * * *      echo start >> /tmp/log.txt
*/15 * * * *   каждые 15 минут
```

День недели: 0 или 7 — воскресенье, 1 — понедельник … 5 — пятница; `1-5` — пн–пт.
