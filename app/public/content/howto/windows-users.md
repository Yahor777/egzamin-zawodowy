# Windows: локальные пользователи и группы (konta i grupy lokalne)

Есть в 54 % листов. Каждый флажок — отдельный критерий T/N, поэтому читай строку листа до конца.

## 1. Через GUI — `lusrmgr.msc`

`Win+R` → `lusrmgr.msc` (или *Zarządzanie komputerem → Użytkownicy i grupy lokalne*).

1. **Użytkownicy** → ПКМ → **Nowy użytkownik…**: *Nazwa użytkownika* (логин), *Pełna nazwa*, *Opis*, *Hasło* + *Potwierdź hasło*.
2. Флажки в том же окне (и потом во вкладке **Ogólne** свойств):

| Требование листа (PL) | Флажок |
|---|---|
| przy pierwszym logowaniu musi zmienić hasło | **Użytkownik musi zmienić hasło przy następnym logowaniu** (включён по умолчанию!) |
| użytkownik nie może zmienić hasła | **Użytkownik nie może zmienić hasła** |
| hasło nigdy nie wygasa | **Hasło nigdy nie wygasa** |
| konto wyłączone / zablokowane do odwołania | **Konto jest wyłączone** |

«Musi zmienić» несовместим с «nie może zmienić» и «nigdy nie wygasa» — Windows не даст отметить вместе.

3. Членство: свойства пользователя → вкладка **Członek grupy** → *Dodaj…* → впиши `Administratorzy` → *Sprawdź nazwy* → OK. Или наоборот: **Grupy** → двойной щелчок по группе → *Dodaj…*.
4. Новая группа: **Grupy** → ПКМ → **Nowa grupa…** → *Nazwa grupy*, *Opis*, *Dodaj…* членов → *Utwórz*.

## 2. Командой — `net user`, `net localgroup`

Если в листе «za pomocą polecenia systemowego» и «zapisz polecenie w tabeli» — делай только так и перепиши команду в таблицу.

```bat
net user jkowalski Egzamin12# /add /fullname:"Jan Kowalski" /comment:"Księgowość"
net user jkowalski /logonpasswordchg:yes          rem musi zmienić hasło przy logowaniu
net user jkowalski /passwordchg:no                rem nie może zmienić hasła
net user jkowalski /expires:31.12.2027            rem KONTO wygasa (дата в формате системы)
net user jkowalski /active:no                     rem konto wyłączone
net localgroup Projektanci /add /comment:"Pracownicy działu"
net localgroup Projektanci jkowalski anowak /add
net localgroup Administratorzy jkowalski /add
net localgroup "Użytkownicy pulpitu zdalnego" jkowalski /add
net user jkowalski                                rem проверка: все флаги и группы
```

«Hasło nigdy nie wygasa» командой `net user` не ставится — PowerShell:

```powershell
New-LocalUser -Name jkowalski -Password (ConvertTo-SecureString 'Egzamin12#' -AsPlainText -Force) -FullName 'Jan Kowalski' -PasswordNeverExpires -UserMayNotChangePassword
Set-LocalUser -Name jkowalski -PasswordNeverExpires $true -AccountExpires (Get-Date 2027-12-31)
Disable-LocalUser jkowalski
Add-LocalGroupMember -Group Administratorzy -Member jkowalski
```

## 3. Ловушки

- `/expires` — это срок действия **учётки**, а не пароля.
- Имя группы с пробелом — в кавычках: `"Użytkownicy pulpitu zdalnego"`.
- Новый пользователь сам попадает в **Użytkownicy**; в Administratorzy — только если добавишь.
- Проверь итог: `net user LOGIN` показывает «Konto jest aktywne», «Konto wygasa», «Użytkownik może zmieniać hasło», «Członkostwa grup lokalnych» — сделай скриншот.

<!-- pack-e2 -->
## Проверенные команды симулятора

В примерах комментарий после `#` — только объяснение. Не вводи его в терминал.

<!-- e2:cmd:client -->
```cmd
net user # список учётных записей
net user jkowalski Egzamin12# /add /fullname:"Jan Kowalski" /comment:"Księgowość" # создаст учётную запись
net user jkowalski /logonpasswordchg:yes # обязательная смена пароля при входе
net user jkowalski /passwordchg:no # запрет смены пароля
net user jkowalski /expires:31.12.2027 # срок действия учётной записи
net user jkowalski /active:no # учётная запись отключена
net user jkowalski # проверка свойств
net localgroup # список групп
net localgroup Projektanci /add /comment:"Pracownicy działu" # создаст группу
net localgroup Projektanci jkowalski /add # добавит члена
net localgroup Projektanci # покажет членов
net user jkowalski /delete # удалит учётную запись
net localgroup Projektanci /delete # удалит группу
```

<!-- e2:ps:client -->
```powershell
Get-LocalUser # список учётных записей
New-LocalUser -Name anowak -Password (ConvertTo-SecureString "Start#1234" -AsPlainText -Force) -FullName "Anna Nowak" -PasswordNeverExpires # учётная запись с неустаревающим паролем
Set-LocalUser -Name anowak -Description "Recepcja" -PasswordNeverExpires $true # изменение свойств
Disable-LocalUser -Name anowak # отключение
Enable-LocalUser -Name anowak # включение
Get-LocalGroup # список групп
New-LocalGroup -Name Testerzy -Description "Grupa testowa" # новая группа
Add-LocalGroupMember -Group Testerzy -Member anowak # добавление члена
Get-LocalGroupMember -Group Testerzy # проверка членов
Remove-LocalGroupMember -Group Testerzy -Member anowak # удаление члена
Remove-LocalUser -Name anowak # удаление учётной записи
```

## Типичные формулировки CKE → что делать

| Treść zadania | Kroki |
|---|---|
| `utwórz konto lokalne` | `lusrmgr.msc` → **Nowy użytkownik…** lub `net user … /add` |
| `użytkownik nie może zmienić hasła` | checkbox lub `/passwordchg:no` |
| `musi zmienić hasło przy następnym logowaniu` | checkbox lub `/logonpasswordchg:yes` |
| `konto wygasa` | `/expires:dd.mm.rrrr` |
| `dodaj konto do grupy` | **Członek grupy → Dodaj…** lub `net localgroup grupa login /add` |
| `za pomocą polecenia systemowego` | wpisz polecenie i przepisz je do tabeli dokumentacji |

Проверка: `net user login` показывает активность, срок действия, возможность смены пароля и группы; `net localgroup grupa` показывает членов.
