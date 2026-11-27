// Shape of public/content/path/curriculum.json (copied from work/curriculum by scripts/sync-curriculum.mjs).

export type StepKind = 'theory' | 'demo' | 'drill' | 'quiz' | 'checkpoint' | 'full-sheet'
export type RefType = 'note' | 'howto' | 'practice' | 'drill' | 'lab' | 'topic' | 'gen' | 'cmd' | 'tool' | 'new'

export interface Ref {
  type: RefType
  id: string
  section?: string
  route?: string
  count?: number
  code?: string
}

export interface ExamValue {
  practical?: Record<string, { sheets_pct: number; avg_points_when_present: number; share_of_all_points_pct: number; sheets_pct_2025_26?: number }>
  written?: Record<string, { written_primary_share_all_pct?: number; written_primary_share_ee08_2021_24_pct?: number }>
}

export interface Step {
  id: string
  title_ru: string
  title_pl: string
  kind: StepKind
  est_minutes: number
  prerequisites: string[]
  refs: Ref[]
  objective_ru: string
  objective_pl?: string
  scheduled_date?: string
  exam_value?: ExamValue
  review?: { drills_new_seed: string[] | null; quiz_topics: string[] | null; pass_threshold_pct: number; rule_ru?: string; rule_pl?: string } | null
  timer_minutes?: number
  pass_threshold_pct?: number
  after_ru?: string
  after_pl?: string
  missing?: boolean
  missing_spec?: { type: string; priority: number; create: string; spec_ru: string; spec_pl?: string; acceptance?: string; acceptance_pl?: string }
  offline_task_ru?: string
  offline_task_pl?: string
  optional?: boolean
  adaptive_ru?: string
  adaptive_pl?: string
  repeatable?: boolean
}

export interface Module {
  id: string
  title_ru: string
  title_pl: string
  why_ru: string
  why_pl?: string
  scheduled?: { from: string; to: string }
  est_minutes_total?: number
  steps: Step[]
}

export interface CalendarDay {
  date: string
  weekday: string
  budget_minutes: number
  written_sr_minutes: number
  steps: string[]
  planned_minutes: number
  note_ru?: string
  note_pl?: string
  buffer_ru?: string
  buffer_pl?: string
}

export interface Curriculum {
  version: number
  exam: { written: { from: string; to: string; pass_pct: number }; practical: { from: string; to: string; pass_pct: number } }
  modules: Module[]
  calendar: { start: string; end: string; assumptions_ru: string; assumptions_pl?: string; optional_if_time: string[]; days: CalendarDay[] }
}
