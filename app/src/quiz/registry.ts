// Interactive quizzes that learning-path steps can open by id (curriculum ref
// `{ "type": "new", "id": "quiz-..." }`, or any ref whose id is a key here).
// Add entries; the path player (src/path/resolve.ts) looks them up at runtime:
// the id as written in curriculum.json, or without the "quiz-" prefix.
import type React from 'react'

export interface QuizEntry {
  title_ru: string
  /** call onDone with the score in percent (0–100) when the quiz is finished */
  Component: React.FC<{ onDone: (pct: number) => void }>
}

export const QUIZZES: Record<string, QuizEntry> = {}
