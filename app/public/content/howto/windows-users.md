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
