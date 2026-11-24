# Linux: веб-сервер Apache

## Установка и запуск

```
sudo apt install apache2
sudo systemctl enable --now apache2
systemctl status apache2
```

## Своя страница

Корень сайта по умолчанию — `/var/www/html`. Заменить стартовую страницу:

```
sudo nano /var/www/html/index.html
```

```html
<html>
<body>
<h1>Egzamin INF.02 – stanowisko 5</h1>
</body>
</html>
```

Проверка: `curl http://localhost` (или с Windows — браузер, адрес сервера).

## Другой каталог и порт

- Порт: `/etc/apache2/ports.conf` → `Listen 8080`, и в `/etc/apache2/sites-available/000-default.conf` → `<VirtualHost *:8080>`.
- Корень: там же `DocumentRoot /www`. Для нового каталога разрешение в `/etc/apache2/apache2.conf`:

```
<Directory /www/>
    Require all granted
</Directory>
```

- Проверить синтаксис: `sudo apache2ctl configtest` → `Syntax OK`.
- Применить: `sudo systemctl restart apache2`.

## Права для сервера

Apache работает от пользователя **www-data**: `sudo chown -R www-data:www-data /www`.
