export type Profile = {
  id?: string
  user_id: string
  school_name: string
  current_deviation: number
  target_deviation: number
  exam_date: string | null
  onboarding_completed: boolean
  created_at?: string | null
  updated_at?: string | null
}

export type StudyLog = {
  id: string
  user_id: string
  subject: string
  reference_book_id: string | null
  study_minutes: number
  started_at: string
  note: string | null
  created_at?: string | null
}

export type ReferenceBook = {
  id: string
  user_id: string
  name: string
  image_url: string | null
  type: string | null
  deleted_at: string | null
  created_at?: string | null
  updated_at?: string | null
}

export type ReviewTask = {
  id: string
  user_id: string
  study_log_id: string
  due_at: string
  status: string
  study_logs?: {
    subject: string | null
    note: string | null
    started_at: string | null
  } | null
}
