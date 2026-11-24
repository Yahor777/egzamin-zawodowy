export interface Figure {
  src: string
  w: number
  h: number
  where: 'stem' | 'answers'
}

export interface Question {
  id: string
  stem: string
  answers: string[]
  correct: number
  figures: Figure[]
  imageAnswers: boolean
  topics: string[]
  seen: string[]
  year: number
  /** optional explanation (pl/ru), filled later */
  expl?: { pl?: string; ru?: string }
  /** optional Russian translation of the stem/answers */
  ru?: { stem: string; answers: string[] }
  /** generated (not from CKE) */
  generated?: boolean
  /** recognised from a scanned sheet */
  ocr?: boolean
  /** about obsolete technology */
  outdated?: boolean
  /** reviewer thinks the official key may be wrong */
  doubt?: string
}

export interface CardState {
  /** Leitner box 0..5 */
  box: number
  /** next due time (ms) */
  due: number
  right: number
  wrong: number
  /** last answer was wrong */
  lastWrong: boolean
  last: number
}

export interface ExamRecord {
  at: number
  score: number
  total: number
  seconds: number
}

export interface Progress {
  v: 1
  cards: Record<string, CardState>
  exams: ExamRecord[]
  starred: string[]
}
