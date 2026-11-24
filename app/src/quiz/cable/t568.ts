// T568A/B wire orders and CKE cabling criteria questions (pure data).
import type { McqCard } from '../Mcq'

export type Std = 'A' | 'B'
export const WIRE: Record<string, { pl: string; ru: string }> = {
  wo: { pl: 'biało-pomarańczowy', ru: 'бело-оранжевый' },
  o: { pl: 'pomarańczowy', ru: 'оранжевый' },
  wg: { pl: 'biało-zielony', ru: 'бело-зелёный' },
  g: { pl: 'zielony', ru: 'зелёный' },
  wb: { pl: 'biało-niebieski', ru: 'бело-синий' },
  b: { pl: 'niebieski', ru: 'синий' },
  wbr: { pl: 'biało-brązowy', ru: 'бело-коричневый' },
  br: { pl: 'brązowy', ru: 'коричневый' },
}
export const T568: Record<Std, string[]> = {
  A: ['wg', 'g', 'wo', 'b', 'wb', 'o', 'wbr', 'br'],
  B: ['wo', 'o', 'wg', 'b', 'wb', 'g', 'wbr', 'br'],
}

export const cableQuestions: McqCard[] = [
  { id: 'jacket', q: 'Насколько жилы могут выступать из оболочки (płaszcza) в Keystone / патч-панели по критериям CKE?', q_pl: 'Żyły wystają poza płaszcz kabla na długości …', options: ['nie więcej niż 25 mm', 'nie więcej niż 50 mm', 'dokładnie 13 mm', 'dowolnie, byle test był OK'], correct: 0, why_ru: 'Критерий zo: «izolacja zewnętrzna zdjęta na odcinku nie dłuższym niż 25 mm».' },
  { id: 'untwist', q: 'Насколько можно раскрутить пары у контакта?', q_pl: 'Rozkręcenie par przy złączu …', options: ['nie więcej niż 13 mm', 'nie więcej niż 25 mm', 'całkowicie — łatwiej ułożyć', 'nie więcej niż 50 mm'], correct: 0, why_ru: 'Не более 13 мм раскрутки (≈ ½ дюйма) — иначе растут наводки (NEXT).' },
  { id: 'drut', q: 'Какой кабель для монтажа патч-панели и гнезда Keystone?', q_pl: 'Do montażu panelu krosowego i modułu Keystone używa się kabla U/UTP typu …', options: ['drut (żyła jednodrutowa)', 'linka (żyła wielodrutowa)', 'koncentryczny', 'światłowód jednomodowy'], correct: 0, why_ru: 'Инсталляционный кабель — drut; linka — для патчкордов (гибкость).' },
  { id: 'linka', q: 'Из какого кабеля обжимают патчкорд с вилками 8P8C?', options: ['U/UTP linka', 'U/UTP drut', 'S/FTP drut', 'kabel koncentryczny RG-58'], correct: 0, why_ru: 'Patchcord гнётся — нужна многожильная linka (и вилки под linkę).' },
  { id: 'latch', q: 'Что должно оказаться под фиксатором (zatrzaskiem) вилки 8P8C после обжима?', options: ['płaszcz (zewnętrzna izolacja) kabla', 'same żyły bez izolacji', 'nic — fiksator jest tylko do gniazda', 'ekran folii'], correct: 0, why_ru: 'Оболочка зажимается планкой вилки — иначе кабель вырвется (критерий «wtyk zaciśnięty na izolacji»).' },
  { id: 'cross', q: 'Кабель скрещённый (crossover) — это…', options: ['jeden koniec T568A, drugi T568B', 'oba końce T568B', 'oba końce T568A', 'piny 1–8 odwrócone (rollover)'], correct: 0, why_ru: 'A–B меняет местами пары 1-2 и 3-6 (TX↔RX).' },
  { id: 'straight', q: 'Какой кабель между ПК и коммутатором?', options: ['prosty (B–B lub A–A)', 'skrosowany (A–B)', 'konsolowy rollover', 'tylko światłowód'], correct: 0, why_ru: 'ПК↔switch — прямой; кроссовер был нужен ПК↔ПК / switch↔switch без Auto-MDI/X.' },
  { id: 'keystone', q: 'На модуле Keystone цветные метки в два ряда: A и B. Схема в листе — T568B. Что делаешь?', options: ['układam żyły według kolorów z rzędu B', 'układam według rzędu A', 'kolory na module nie mają znaczenia', 'zaciskam bez sprawdzania'], correct: 0, why_ru: 'Метки на модуле — подсказка: смотри ряд с буквой нужной схемы.' },
  { id: 'tool', q: 'Каким инструментом забивают жилы в патч-панель / Keystone?', options: ['narzędzie uderowe LSA (punch-down)', 'zaciskarka 8P8C', 'lutownica', 'ściągacz izolacji'], correct: 0, why_ru: 'Punch-down (LSA) вдавливает жилу в нож IDC и обрезает излишек.' },
  { id: 'tester', q: 'Тестер показывает 1-3, 2-6, 3-1, 6-2, остальные по порядку. Что это?', options: ['kabel skrosowany — poprawny crossover', 'przerwa żyły', 'zwarcie', 'kabel prosty'], correct: 0, why_ru: 'Именно такая картина у A–B (кроссовер).' },
]
