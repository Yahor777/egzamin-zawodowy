# Windows: пакетные файлы .bat (pliki wsadowe)

12 % листов, растёт (2025–26 — 19 %). Обычно 3–5 баллов: файл в нужном месте, нужные команды в коде, скрипт **запущен** и сделал своё.

## 1. Создать и запустить

1. `Win+R` → `notepad` (Notatnik). Пишешь код.
2. *Plik → Zapisz jako…* → **Zapisz jako typ: Wszystkie pliki (\*.\*)** → *Nazwa pliku*: `C:\plik1.bat`. Иначе получится `plik1.bat.txt` (видно, если включить *Widok → Rozszerzenia nazw plików*). Можно ещё взять имя в кавычки: `"plik1.bat"`.
3. Запуск: в `cmd` → `C:\plik1.bat` (или двойной щелчок). С параметром: `C:\plik2.bat txt`.
4. Проверка результата: `dir C:\TEST`, `net user`, `type plik.txt` — скриншот.

«Folder główny dysku systemowego» = `C:\`. «Pulpit konta Administrator» = `C:\Users\Administrator\Desktop` (`%USERPROFILE%\Desktop`).

## 2. Команды

| Нужно | Код |
|---|---|
| не показывать команды | `@echo off` (первая строка) |
| текст на экран | `echo tworzenie folderów dla studentów` ; пустая строка: `echo.` |
| очистить экран | `cls` |
| остановить, окно не закрывается | `pause` |
| спросить и запомнить | `set /p imie=Podaj imię: ` → использовать `%imie%` |
| переменная / арифметика | `set nazwa=TEST` ; `set /a n=%n%+1` |
| параметры вызова | `%1`, `%2` … (`%0` — имя скрипта) |
| папки | `mkdir C:\TEST` (`md`), удалить `rmdir /s /q C:\TEST` |
| цикл 1…10 | `for /L %%i in (1,1,10) do mkdir C:\TEST\STUDENT%%i` |
| цикл по списку | `for %%f in (a b c) do echo %%f` |
| условие | `if exist C:\TEST echo jest` ; `if "%1"=="" echo Brak parametru` ; `if not exist … ( … ) else ( … )` |
| копирование | `copy C:\dane\*.%1 C:\archiwum2\` |
| в файл / дописать | `ipconfig > C:\siec.txt` ; `dir C:\ >> C:\dane\informacje.txt` |
| дата, имя ПК | `%date%`, `%time%`, `%computername%`, `%username%` |
| учётки | `net user tester ZAQ!2wsx /add` ; `net localgroup testerzy /add` ; `net localgroup testerzy tester /add` |
| комментарий | `rem …` или `:: …` |

В файле `.bat` переменная цикла пишется **`%%i`**, а в командной строке — `%i`.

## 3. Шаблоны из листов

**plik1.bat (2025-06-09, 2025-06-10, 2026-01-01):**
```bat
@echo off
echo tworzenie folderów dla studentów
mkdir C:\TEST
for /L %%i in (1,1,10) do mkdir C:\TEST\STUDENT%%i
```

**powitanie.bat (2026-01-04):**
```bat
@echo off
cls
set /p imie=Podaj imię: 
echo Witaj %imie%
pause
```

**konto.bat (2024-06-04):**
```bat
net user tester ZAQ!2wsx /add
net localgroup testerzy /add
net localgroup testerzy tester /add
```

**plik2.bat с параметром (2026-01-03):**
```bat
@echo off
copy C:\dane\*.%1 C:\archiwum2\
```
**plik3.bat:** `echo Nowy wpis w dniu: >> C:\dane\informacje.txt` → `echo %date% >> …` → `dir C:\ >> …`.

## 4. Ловушки

- `.bat.txt` вместо `.bat` — тип «Wszystkie pliki».
- В листе «za pomocą pętli» — без `for` критерий не засчитают, даже если папки созданы.
- «Uruchom plik» — тоже критерий: папки/учётки должны реально существовать.
- Польские буквы в `echo` в cmd могут отображаться криво (кодовая страница 852) — это не ошибка оценки.

<!-- pack-e2 -->
## Проверенные шаблоны симулятора

<!-- e2:bat:client:C:\plik1.bat -->
```bat
@echo off
rem отключает echo команд
echo tworzenie folderow dla studentow
rem выводит сообщение
mkdir C:\TEST
rem создаёт родительскую папку
for /L %%i in (1,1,10) do mkdir C:\TEST\STUDENT%%i
rem создаёт STUDENT1…STUDENT10
```

<!-- e2:bat:client:C:\konto.bat -->
```bat
@echo off
net user tester ZAQ!2wsx /add
rem создаёт учётную запись tester
net localgroup testerzy /add
rem создаёт группу testerzy
net localgroup testerzy tester /add
rem добавляет tester в testerzy
```

<!-- e2:cmd:client -->
```cmd
mkdir C:\TEST # создаст каталог
echo test > C:\TEST\plik.txt # запишет файл
dir C:\TEST # покажет содержимое
type C:\TEST\plik.txt # покажет файл
copy C:\TEST\plik.txt C:\TEST\kopia.txt # скопирует файл
del C:\TEST\kopia.txt # удалит копию
rmdir /s C:\TEST # удалит каталог с содержимым
set nazwa=TEST # установит переменную
echo %nazwa% # выведет переменную
set /a wynik=2+3*4 # вычисление
```

## Типичные формулировки CKE → что делать

| Treść zadania | Kroki |
|---|---|
| `utwórz plik wsadowy w folderze głównym dysku systemowego` | zapisz jako `C:\nazwa.bat` |
| `za pomocą pętli utwórz 10 folderów` | `for /L %%i in (1,1,10) do …` |
| `skrypt ma pytać o imię` | `set /p imie=…` |
| `parametr skryptu` | użyj `%1` |
| `uruchom plik` | wykonaj go w cmd; samo zapisanie nie wystarczy |

Проверка: `dir C:\` подтверждает расширение `.bat`, а итоговый результат проверяется по заданию (`dir`, `net user`, `type`).
