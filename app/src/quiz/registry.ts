// Interactive quizzes that learning-path steps can open by id (curriculum ref
// `{ "type": "new", "id": "quiz-..." }`, or any ref whose id is a key here).
// Add entries; the path player (src/path/resolve.ts) looks them up at runtime:
// the id as written in curriculum.json, or without the "quiz-" prefix.
import type React from 'react'
import { IdentDrill } from './ident/IdentDrill'
import { KosztorysDrill } from './sheet/KosztorysDrill'
import { T568Drill } from './cable/T568Drill'
import { PortsQuiz } from './ports/PortsQuiz'
import { SettingsPathQuiz, WinServerStepsQuiz } from './winserver/quizzes'

export interface QuizEntry {
  title_ru: string
  title_pl: string
  /** call onDone with the score in percent (0–100) when the quiz is finished */
  Component: React.FC<{ onDone: (pct: number) => void }>
}

export const QUIZZES: Record<string, QuizEntry> = {
  // m05-ident — identification of hardware parameters (Windows/Linux sim, CKE table, screenshots)
  'drill-ident': { title_ru: 'Идентификация параметров ПК (Windows/Linux) + оценка «spełnia wymagania»', title_pl: 'Identyfikacja parametrów stanowiska + ocena „spełnia wymagania”', Component: IdentDrill },
  // m08-steps-quiz — Windows Server roles: order the steps + "which option / where"
  'quiz-winserver-steps': { title_ru: 'Windows Server: порядок шагов для 16 ролей + «где эта настройка»', title_pl: 'Windows Server: kolejność kroków i ścieżki ustawień', Component: WinServerStepsQuiz },
  // m07-policy-quiz — requirement from a sheet → path in secpol/gpedit/GPO/console
  // m10-calc-drill — kosztorys in a mini spreadsheet (formulas are re-computed with random prices)
  'drill-kosztorys': { title_ru: 'Смета (kosztorys) в мини-таблице: формулы, VAT, SUMA, rabat, формат zł', title_pl: 'Kosztorys: formuły, VAT, SUMA, rabat, format zł', Component: KosztorysDrill },
  // m05-t568-drill — T568A/B wire order (plug, crossover), Keystone criteria
  'drill-t568': { title_ru: 'T568A/B: разложи 8 жил (вилка, кросс-кабель) + критерии Keystone/патч-панели', title_pl: 'T568A/B: ułóż 8 żył i kryteria Keystone', Component: T568Drill },
  // m04-port-cards — port ↔ protocol ↔ TCP/UDP ↔ OSI
  'drill-ports-flashcards': { title_ru: 'Карточки: порт ↔ протокол ↔ TCP/UDP ↔ уровень OSI', title_pl: 'Fiszki: port ↔ protokół ↔ TCP/UDP ↔ warstwa OSI', Component: PortsQuiz },
  'quiz-settings-path': { title_ru: 'Где эта настройка? (secpol, gpedit, GPO, консоли .msc)', title_pl: 'Gdzie jest to ustawienie? (secpol, gpedit, GPO, konsole .msc)', Component: SettingsPathQuiz },
}
