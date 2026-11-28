# Kabel RJ45, Keystone, panel krosowy i montaż podzespołów

To są dwie różne umiejętności, które CKE często łączy w jednym zadaniu:

- **patchcord** — giętki kabel `U/UTP typu linka` z wtykami `8P8C` na końcach;
- **instalacja stała** — sztywny kabel `U/UTP typu drut`, wbijany do `modułu Keystone` albo `panelu krosowego`.

Najpierw przeczytaj w arkuszu: jaki typ kabla, jaka sekwencja `T568A/T568B`, połączenie proste czy skrosowane oraz numer portu panelu.

## 1. Schematy kolorów RJ45 (8P8C)

Trzymaj wtyk `8P8C` zatrzaskiem w dół, stykami do siebie. **Pin 1 jest po lewej, pin 8 po prawej.**

| Pin | T568A | T568B |
|---:|---|---|
| 1 | biało-zielony | biało-pomarańczowy |
| 2 | zielony | pomarańczowy |
| 3 | biało-pomarańczowy | biało-zielony |
| 4 | niebieski | niebieski |
| 5 | biało-niebieski | biało-niebieski |
| 6 | pomarańczowy | zielony |
| 7 | biało-brązowy | biało-brązowy |
| 8 | brązowy | brązowy |

Różnica między A i B dotyczy tylko pary zielonej i pomarańczowej. Para niebieska jest zawsze na stykach 4–5, brązowa na 7–8.

Jeżeli w arkuszu jest napisane `T586B`, to typowa literówka; chodzi o `T568B`.

## 2. Zarobienie patchcordu (wtyk 8P8C)

### Kabel prosty albo skrosowany

| Typ | Końce | Kiedy używany |
|---|---|---|
| prosty / straight | oba końce tak samo: B–B albo A–A | komputer ↔ przełącznik, ruter ↔ przełącznik, panel krosowy ↔ przełącznik |
| skrosowany / crossover | jeden koniec A, drugi B | komputer ↔ komputer albo stare przełącznik ↔ przełącznik |

We współczesnych sieciach Auto-MDI/X często poprawia zły typ kabla, ale na egzaminie wykonaj dokładnie to, co jest zapisane w zadaniu.

### Zarobienie patchcordu krok po kroku

Narzędzia: `zaciskarka`, `ściągacz izolacji` albo ostrożnie nóż, nożyczki/przecinak, tester kabli.

1. **Sprawdź zadanie.** Ma być `linka`, połączenie proste czy skrosowane, sekwencja A albo B.
2. **Przytnij kabel** równo na potrzebną długość.
3. **Zdejmij izolację zewnętrzną** na około 2,5–3 cm. Nie nacinaj żył w środku: uszkodzona żyła może działać teraz i przerwać później.
4. **Rozdziel 4 pary.** Rozwiń każdą parę tylko tak bardzo, jak trzeba.
5. **Wyprostuj żyły** palcami albo tylną stroną nożyczek. Mają leżeć równo, bez krzyżowania.
6. **Ułóż kolejność kolorów** według wybranej sekwencji od lewej do prawej.
7. **Przytnij żyły** do jednakowej długości około 12–13 mm od izolacji zewnętrznej. Zbyt długie — izolacja nie wejdzie do wtyku; zbyt krótkie — żyły nie dosięgną styków.
8. **Trzymając kolejność, włóż żyły do wtyku 8P8C do oporu.** Na czole wtyku powinna być widoczna miedź każdej żyły.
9. **Sprawdź, czy izolacja zewnętrzna weszła do wtyku** i zostanie dociśnięta plastikowym zaczepem. Jeżeli zaciśnięte są tylko żyły bez izolacji, kabel szybko się urwie.
10. **Włóż wtyk do gniazda 8P zaciskarki** i ściśnij rączki do końca.
11. Powtórz na drugim końcu według wymaganej sekwencji.
12. **Sprawdź testerem** i dopiero potem zgłoś gotowość.

Przed sprawdzeniem u egzaminatora nie ciągnij kabla za żyły i nie zginaj go pod ostrym kątem.

## 3. Panel krosowy + Keystone (gniazdo naścienne)

Na module Keystone i na panelu jest kolorowa naklejka z dwoma rzędami: `A` i `B`. Najczęstszy błąd to patrzenie na zły rząd.

### Kolejność pracy

1. Użyj kabla `U/UTP typu drut` — jednodrutowego.
2. Zdejmij zewnętrzną izolację ostrożnie, zwykle 3–4 cm.
3. Rozłóż żyły według kolorów wymaganej sekwencji, nie rozwiązując par zbyt mocno.
4. Umieść każdą żyłę w jej szczelinie stykowej.
5. Wbij żyłę narzędziem `narzędzie uderzeniowe LSA / punch-down`.
6. Strona tnąca noża powinna być skierowana na zewnątrz, aby nadmiar żyły został odcięty.
7. Zamknij pokrywę Keystone albo zamocuj kabel na panelu.
8. Zmontuj gniazdo naścienne: moduł, ramka, pokrywa.
9. Panel krosowy zamocuj w szafie RACK równo, zwykle czterema śrubami.
10. Sprawdź testerem.

### Co sprawdza egzaminator

- poprawna sekwencja A/B;
- wszystkie 8 żył jest podłączonych;
- żyły nie wystają poza izolację więcej niż około 25 mm;
- pary nie są rozkręcone więcej niż około 13 mm;
- użyto właściwego kabla `drut`, a nie `linka`;
- moduł/panel są mocno zamocowane;
- wybrano właściwy port, jeżeli numer był podany;
- tester pokazuje 1–8 bez błędów.

## 4. Tester

Tester zwykle ma dwie części: master i remote. Lampki powinny zapalać się parami w poprawnej kolejności.

| Wskazania | Co oznacza | Co zrobić |
|---|---|---|
| 1–1, 2–2, 3–3, 4–4, 5–5, 6–6, 7–7, 8–8 | poprawny kabel prosty | zaakceptuj |
| 1–3, 2–6, 3–1, 6–2, 4–4, 5–5, 7–7, 8–8 | poprawny crossover | zaakceptuj, jeśli wymagano crossover |
| jedna lampka nie świeci | przerwa żyły albo żyła nie doszła do styku | zacisnij końcówkę ponownie |
| dwie lampki świecą razem | zwarcie żył | sprawdź kolejność i zacisk |
| lampki świecą w losowej kolejności | pomylone kolory | odetnij wtyk i zaciśnij ponownie |
| 3 i 6 świecą poprawnie, ale pary są rozdzielone | możliwy split pair | zaciśnij ponownie; dla szybkości jest to błąd nawet jeśli tester „piszczy” |

Do sprawdzenia panelu i Keystone używa się dwóch sprawnych fabrycznych patchcordów: jeden do portu panelu krosowego, drugi do gniazda.

## 5. Montaż podzespołów + BHP/ESD

`BHP` to bezpieczeństwo pracy, `ESD` to ochrona przed wyładowaniem elektrostatycznym. Jest to oceniane w `przebiegu pracy`, nawet jeśli nie ma osobnego pytania.

### Przed otwarciem komputera

1. Zamknij system (`Zamknij`), nie wyłączaj tylko monitora.
2. Odłącz kabel zasilający od gniazdka albo wyłącz zasilacz przyciskiem `0`.
3. Naciśnij przycisk POWER na 5 sekund — rozładuj resztkowe zasilanie.
4. Załóż `opaskę antystatyczną` na nadgarstek.
5. Drugi koniec opaski zamocuj do niemalowanego metalowego elementu obudowy.
6. Połóż obudowę stabilnie, usuń zbędne przedmioty i napoje.

### Podczas montażu

- Trzymaj płyty i RAM za krawędzie, nie za układy i styki.
- Nie kładź podzespołów na tkaninie ani odzieży; używaj maty antystatycznej/opakowania.
- Nie naciskaj siłą: jeżeli nie wchodzi, sprawdź klucz, kierunek i zatrzaski.
- Nie pracuj pod napięciem.
- Nie ciągnij kabli za żyły — tylko za wtyk/złącze.
- Po montażu, jeżeli arkusz tego wymaga, zgłoś gotowość **przed zamknięciem obudowy**.

### Po montażu

- Zamknij obudowę, podłącz kable, uruchom system.
- Sprawdź podzespół w systemie.
- Posprzątaj narzędzia, obcięte kawałki kabla i opakowania: kryterium często brzmi `pozostawił uporządkowane stanowisko`.

### Montaż typowych podzespołów

| Podzespół | Jak montować | Jak sprawdzić |
|---|---|---|
| RAM | otwórz zatrzaski DIMM, dopasuj wcięcie `klucz`, dociśnij równomiernie do dwóch kliknięć | `Menedżer zadań → Pamięć` albo `free -h` |
| dysk SATA | zamocuj śrubami/szyną, podłącz SATA data do płyty i SATA power z zasilacza | `diskmgmt.msc` albo `lsblk` |
| dysk M.2 | włóż pod kątem, dociśnij, zamocuj małą śrubką | `diskmgmt.msc`, `lsblk` |
| karta graficzna | zdejmij zaślepkę, włóż do PCIe x16 do kliknięcia, przykręć, podłącz 6/8-pin | `dxdiag`, Menedżer zadań → GPU |
| karta sieciowa | PCIe x1 albo inne wolne PCIe, zamocuj śrubą | `devmgmt.msc` bez żółtego wykrzyknika |

Po instalacji karty czasem trzeba zainstalować sterownik albo wyłączyć urządzenie zintegrowane. Rób to tylko wtedy, gdy wymaga tego zadanie.

## 6. Identyfikacja parametrów — które narzędzie co pokazuje

Pełny opis oznaczeń jest w dokumencie „Jak rozpoznać sprzęt, porty i oznaczenia”. Tutaj — szybki wybór narzędzia podczas montażu.

| Co jest wymagane | Windows | Linux |
|---|---|---|
| procesor CPU: model, rdzenie, procesory logiczne | `Menedżer zadań → Wydajność → Procesor CPU`, `msinfo32` | `lscpu` |
| częstotliwość podstawowa CPU | `Szybkość podstawowa` w Menedżerze zadań | `sudo dmidecode -t processor` |
| RAM: rozmiar, szybkość, gniazda | `Menedżer zadań → Pamięć` | `free -h`, `sudo dmidecode -t memory` |
| płyta główna, BIOS | `msinfo32` | `sudo dmidecode -t baseboard` |
| karta graficzna, VRAM | `dxdiag → Ekran` | `lspci \| grep -i vga` |
| dysk: model, pojemność, typ | `Menedżer zadań → Dysk`, `diskmgmt.msc` | `lsblk -d -o NAME,MODEL,SIZE,ROTA` |
| karta sieciowa, MAC | `ipconfig /all` | `ip link` |

Zasada odpowiedzi: najpierw pokaż wartość w systemie albo na zrzucie ekranu, potem porównaj ją z wymaganiem. Jeżeli wszystkie wymagania są spełnione — `spełnia wymagania`; jeżeli choć jedno nie — `nie spełnia wymagań`.

## 7. Krótka kolejność na egzaminie

1. Przeczytaj zadanie → wybierz właściwy kabel i narzędzie.
2. Wykonaj montaż starannie.
3. Sam sprawdź testerem/systemem.
4. Zgłoś gotowość tam, gdzie jest napisane `zgłoś gotowość`.
5. Pokaż działanie egzaminatorowi.
6. Posprzątaj stanowisko.
