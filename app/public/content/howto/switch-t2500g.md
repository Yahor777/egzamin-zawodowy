# Свитч TP-Link JetStream T2500G-10TS: VLAN и Management VLAN

Это управляемый свитч из школьной лаборатории **ZSE Rzeszów**. В паре с ним обычно работает роутер **DrayTek Vigor2927** (`draytek`). Домашний вариант — SG108E — описан в `switch`.

Переключение оборудования: **Настройки → Оборудование в тренажёрах** → **«Как в моей школе: DrayTek + TP-Link T2500G»**. Для домашней пары выбирай **«TP-Link: WR840N + SG108E»**. Переключение действует на новые попытки; начатое задание надо сбросить.

## 1. Главная идея VLAN на T2500G

```
                  DrayTek Vigor2927
                    P2 (trunk)
                         │  VLAN 11,222,333 tagged
                         │
                ┌──────────────────┐
                │ T2500G-10TS      │
                │ management:      │
                │ 192.168.1.201    │
                └──────────────────┘
                  │       │       │
              ACCESS   ACCESS   TRUNK
              VLAN 11  VLAN 222  к другому
              PVID 11  PVID 222  свитчу
                  │       │
                 PC1     PC2
```

Термины:

- **VLAN** — отдельная логическая сеть внутри одного свитча.
- **ACCESS** — порт для обычного устройства (ПК, принтер, сервер). Он бывает untagged только в одной VLAN. Когда ты добавляешь ACCESS-порт в VLAN, T2500G сам меняет его **PVID** и убирает из остальных VLAN.
- **TRUNK** — порт к роутеру или другому свитчу. В добавленных VLAN он идёт с меткой (**TAG**).
- **GENERAL** — гибкий режим: порт может быть в нескольких VLAN, а для каждой VLAN выбирается **Egress Rule** — **UNTAG** или **TAG**. PVID при этом не меняется автоматически.
- **PVID** — VLAN для входящих кадров без метки. Для access-порта: PVID = его VLAN.
- **Management VLAN** — VLAN, в которой доступна веб-панель свитча. Если ПК не в этой VLAN, страница не откроется, даже при правильном IP.
- **Management IP** — адрес свитча для настройки, например `192.168.0.1` или `192.168.1.201`.
- **DHCP pool**, **WAN/NAT**, **статический маршрут**, **SSID/WPA2** — это темы роутера/сервера, не этого L2-свитча. T2500G в тренажёре не раздаёт DHCP и не делает NAT.

С завода: адрес `192.168.0.1/24`, логин/пароль `admin` / `admin`, все порты в VLAN 1. DHCP у свитча нет: ПК должен получить адрес от роутера через сеть или иметь статический адрес `192.168.0.10/24`.

Очень важно: после правильной настройки нажми **Save Config** в левом меню. Иначе при перезагрузке реальный свитч потеряет изменения. В тренажёре состояние сохраняется, но страница **Save Config** честно показывает, есть ли несохранённые изменения.

## 2. System → System Info

Путь: **System → System Info**. Внутри страницы есть вкладки:

- **System Summary** — картинка портов и сводка;
- **Device Description** — имя, расположение, контакт;
- **System Time** — время;
- **System IP** — адрес управления и Management VLAN;
- **System IPv6** — IPv6, в заданиях обычно не используется.

### 2.1. Вкладка System Summary

На картинке портов зелёный порт = есть линк. Это первое место для проверки кабеля.

Внизу видны основные сведения: `Device Name`, `Hardware Version`, `Firmware Version`, `IP Address`, `Subnet Mask`, `Default Gateway`, `MAC Address`, `Run Time`.

### 2.2. Вкладка Device Description

| Поле | Что значит | Нужно ли на экзамене |
|---|---|---|
| **Device Name** | имя свитча | только если прямо требуется |
| **Device Location** | место установки | обычно нет |
| **System Contact** | контакт администратора | обычно нет |

## 3. System → System Info → System IP — адрес управления

Путь именно такой: **System → System Info → вкладка System IP**.

| Поле | Что значит | Что вводить | Типичная ошибка |
|---|---|---|---|
| **MAC Address** | физический адрес свитча | только просмотр | пытаться изменить |
| **IP Address Mode** | способ получения адреса | **Static IP** для задания | выбрать DHCP, когда DHCP недоступен |
| **Management VLAN** | VLAN управления | обычно `1`; если задан VLAN управления — его ID | вписать VLAN, которую ещё не создали |
| **IP Address** | адрес свитча | например `192.168.1.201` | вписать адрес роутера |
| **Subnet Mask** | маска | например `255.255.255.0` | оставить неправильную заводскую сеть |
| **Default Gateway** | шлюз | обычно LAN-адрес роутера | вписать адрес самого свитча |

Пример: «przełącznik ma adres `192.168.1.201/24`, brama `192.168.1.10`, VLAN zarządzania 1»:

```
IP Address Mode:   Static IP
Management VLAN:   1
IP Address:        192.168.1.201
Subnet Mask:       255.255.255.0
Default Gateway:   192.168.1.10
```

После **Apply**:

1. Старый адрес перестаёт открываться.
2. ПК должен иметь адрес из новой подсети.
3. ПК должен быть подключен в порт, входящий в **Management VLAN**.
4. Если Management VLAN не существует, свитч не примет настройку.

Если задание просит «VLAN 2 jako VLAN zarządzalny», сначала создай VLAN 2, потом вернись сюда и поставь **Management VLAN: 2**. Затем переткни ПК в порт VLAN 2 — иначе потеряешь доступ к свитчу.

## 4. System → User Management — пароль

Путь: **System → User Management**.

В таблице **User Table** есть единственная запись:

| Колонка | Значение |
|---|---|
| **Select** | выбор пользователя |
| **User ID** | `1` |
| **User Name** | `admin` |
| **Access Level** | `Admin` |
| **Status** | `Enable` |
| **Operation** | ссылка **Edit** |

Нажми **Edit**. В блоке **User Config**:

| Поле | Что вводить |
|---|---|
| **User Name** | только просмотр, `admin` |
| **Access Level** | `Admin` |
| **Status** | `Enable` |
| **Password** | новый пароль |
| **Confirm Password** | тот же пароль |

После **Apply** нужно войти заново. В тренажёре нельзя создать второго пользователя — поэтому не ищи кнопку Add.

## 5. System → System Tools

Путь: **System → System Tools**.

- **System Reboot** — перезагрузка с текущей сохранённой конфигурацией.
- **System Reset** — сброс к заводским настройкам: `192.168.0.1`, `admin/admin`, все порты VLAN 1.
- **Config Backup** — сохранить файл конфигурации.
- **Config Restore** — загрузить файл конфигурации.
- **Firmware Upgrade** — прошивка; на экзамене не использовать.

Если перед перезагрузкой не нажать **Save Config**, реальный свитч загрузит старую конфигурацию. В тренажёре это тоже моделируется: несохранённые изменения видны на странице **Save Config**.

## 6. Switching → Port → Port Config — включение портов

Путь: **Switching → Port → вкладка Port Config**.

В верхней строке таблицы выбираешь действие для всех отмеченных портов:

| Поле | Что значит | Что делать |
|---|---|---|
| **Select** | отметить порты | выбрать только нужные |
| **Status of the selected ports** | включить/выключить | обычно **Enable** |
| **Speed and duplex of the selected ports** | скорость и дуплекс | обычно `Auto` |
| **Flow control of the selected ports** | управление потоком | обычно `Off` |

В строках таблицы видно текущее `Status`, `Speed and Duplex`, `Flow Control`, `LAG`.

Порядок: отметь checkbox у портов → выбери значение в верхней строке → **Apply**. Если выключить порт, он перестаёт передавать кадры, и на нём пропадает линк.

## 7. VLAN → 802.1Q VLAN — Port Config и VLAN Config

Это самая важная страница. В ней две вкладки:

- **Port Config** — какой тип имеет порт: ACCESS / GENERAL / TRUNK и какой у него PVID;
- **VLAN Config** — создание VLAN и назначение портов.

### 7.1. Port Config — сначала тип порта

Путь: **VLAN → 802.1Q VLAN → Port Config**.

В верхней строке:

| Поле | Что значит | Что выбрать |
|---|---|---|
| **Select** | порты, к которым применяем настройки | отметь нужные |
| **Link Type for the selected ports** | тип порта | ACCESS для ПК, TRUNK к роутеру/свитчу, GENERAL для особых случаев |
| **PVID for the selected ports** | VLAN нетегированных кадров | для TRUNK/GENERAL можно задать вручную; для ACCESS меняется автоматически |

Нижняя таблица показывает по каждому порту `Link Type`, `PVID`, `VLAN` (через Detail/информацию о членстве).

Как выбрать тип:

| Тип | Когда использовать | Что происходит |
|---|---|---|
| **ACCESS** | порт к ПК, серверу, принтеру | один VLAN untagged; PVID автоматически становится ID этой VLAN |
| **TRUNK** | порт к роутеру или другому свитчу | VLAN проходят tagged; используется для нескольких VLAN по одному кабелю |
| **GENERAL** | нестандартные схемы, например один нетегированный VLAN плюс tagged VLAN | в каждой VLAN отдельно выбираешь UNTAG/TAG; PVID контролируй сам |

### 7.2. VLAN Config — создание VLAN и членство портов

Путь: **VLAN → 802.1Q VLAN → VLAN Config**.

В таблице **VLAN Table** есть колонки `Select`, `VLAN ID`, `Description`, `Members`, `Operation`. Через **Create** открывается форма **VLAN Create**.

| Поле/колонка | Что значит | Что делать |
|---|---|---|
| **VLAN ID:** | номер VLAN | число из листа, 2–4094 для новой VLAN |
| **Description:** | имя/описание | до 16 символов, например `VLAN11` |
| **Select** в VLAN Members | какие порты входят | отметь порты по схеме |
| **Link Type** | текущий тип порта | берётся из Port Config |
| **Egress Rule** | как кадры выходят из порта | для GENERAL выбирай **UNTAG** или **TAG**; для ACCESS/TRUNK правило выставляется автоматически |
| **LAG** | агрегированный канал | обычно `---` |

Важно помнить:

- ACCESS-порт при добавлении в VLAN становится **UNTAG** только в этой VLAN; PVID меняется автоматически.
- TRUNK-порт при добавлении в VLAN становится **TAG**.
- GENERAL-порт использует то, что выбрано в **Egress Rule**.

### 7.3. Пример настройки trunk к DrayTek

Задача: порт 1 свитча подключен к P2 роутера; VLAN 11, 222, 333 должны идти по этому кабелю. ПК VLAN 11 стоит в порту 3.

1. **VLAN → 802.1Q VLAN → Port Config**:
   - порт 1 → **TRUNK** → Apply;
   - порт 3 → **ACCESS** → Apply.
2. **VLAN Config → Create**:
   - VLAN ID `11`, Description `VLAN11`;
   - отметь порты 1 и 3;
   - Apply.
3. Создай VLAN `222` и `333`; в них отметь только порт 1.
4. Проверь Detail/таблицу:
   - порт 1: TAG в VLAN 11, 222, 333;
   - порт 3: UNTAG в VLAN 11, PVID 11.
5. На DrayTek в **LAN → VLAN** VID должен совпадать: `11`, `222`, `333`.
6. В конце: **Save Config**.

## 8. Save Config — обязательное завершение

Путь: левое меню → **Save Config**.

Возможные сообщения:

- `There are unsaved changes. They will be lost after a reboot.` — есть изменения, которые ещё не сохранены в startup-конфигурацию.
- `The running configuration matches the startup configuration.` — всё уже сохранено.
- `Operation successful. The configuration was saved.` — сохранение выполнено.

Перед экзаменационной проверкой всегда открывай **Save Config** и сохраняй.

## 9. Частые ошибки и точные сообщения симулятора

| Сообщение | Где | Почему | Как исправить |
|---|---|---|---|
| `The user name or password is incorrect.` | вход | неверный логин/пароль | заводские `admin`/`admin` или твой новый пароль |
| `The IP address is invalid.` | System IP | адрес не IPv4 или недопустимый host | проверь адрес |
| `The subnet mask is invalid.` | System IP | неверная маска | переведи префикс в маску |
| `The default gateway is invalid.` | System IP | шлюз неподходящий | шлюз из той же подсети, не адрес самого свитча |
| `Management VLAN must be a number between 1 and 4094.` | System IP | неверный номер | 1–4094 |
| `VLAN N does not exist. Create the VLAN first (VLAN → 802.1Q VLAN → VLAN Config).` | System IP | VLAN управления ещё не создана | сначала создай VLAN |
| `This simulator keeps the single administrator account. Use Edit to change its password.` | User Management | попытка работать не через Edit | выбери admin → Edit |
| `Please enter the password.` | User Config | пустой пароль | введи пароль |
| `The password must have 1 ~ 16 characters and no spaces.` | User Config | слишком длинный или с пробелом | 1–16 символов без пробелов |
| `The two passwords are different.` | User Config | повтор не совпал | введи одинаково |
| `Please select at least one port.` | Port/VLAN Port Config | не выбраны порты | отметь checkbox у портов |
| `PVID must be a number between 1 and 4094.` | VLAN Port Config | неверный PVID | 1–4094 |
| `VLAN N does not exist. Create it first (VLAN Config).` | VLAN Port Config | PVID указывает на несуществующую VLAN | сначала создай VLAN |
| `VLAN ID must be a number between 2 and 4094.` | VLAN Create | недопустимый ID новой VLAN | для новой VLAN используй 2–4094 |
| `The description may have 16 characters at most.` | VLAN Create | слишком длинное имя | сократи до 16 символов |
| `VLAN N already exists. Use Edit in the VLAN table.` | VLAN Create | VLAN уже создана | используй Edit |
| `VLAN N does not exist.` | VLAN Edit | редактируешь несуществующую VLAN | проверь таблицу |
| `Please select at least one VLAN.` | удаление VLAN | не отмечена VLAN | выбери checkbox |
| `VLAN 1 (Default VLAN) cannot be deleted.` | удаление VLAN | попытка удалить VLAN 1 | VLAN 1 оставь |
| `VLAN N is the Management VLAN and cannot be deleted.` | удаление VLAN | VLAN используется для управления | сначала смени Management VLAN |
| `Please select a configuration file first.` | Config Restore | не выбран файл | на экзамене обычно не нужно |
| `There are unsaved changes. They will be lost after a reboot.` | Save Config | изменения не сохранены | нажми Save Config |

## 10. Как проверить и что смотрит экзаменатор

На ПК:

```powershell
ipconfig /all
ping 192.168.1.201
```

Если ping не идёт, проверь в порядке:

1. ПК физически подключен в нужный порт.
2. Порт включён в **Switching → Port → Port Config**.
3. ПК и свитч в одной подсети.
4. ПК находится в **Management VLAN**.
5. На пути нет trunk-порта, в котором нужная VLAN не добавлена.
6. На DrayTek VID совпадает с VLAN ID на свитче.

Экзаменатор обычно смотрит:

- **System → System Info → System IP** — адрес, маска, шлюз, Management VLAN;
- **VLAN → 802.1Q VLAN → Port Config** — ACCESS/GENERAL/TRUNK и PVID;
- **VLAN Config → VLAN Table / Detail** — какие порты в каких VLAN;
- **Save Config** — сохранена ли конфигурация;
- связь ПК с роутером/сервером через правильный VLAN.

Самая частая ошибка на T2500G: сделать порт ACCESS в другой VLAN и потерять доступ к управлению, потому что Management VLAN осталась `1`. Поэтому перед изменением VLAN всегда ответь себе: «в каком порту стоит мой ПК и в какой VLAN будет управление?»
