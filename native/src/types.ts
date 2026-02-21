export type Profile = {
  id?: string
  user_id: string
  username: string
  birth_date: string
  gender: string
  study_purpose: string[]
  weekday_target_minutes?: number | null
  weekend_target_minutes?: number | null
  today_target_minutes?: number | null
  today_target_date?: string | null
  week_target_minutes?: number | null
  week_target_date?: string | null
  month_target_minutes?: number | null
  month_target_date?: string | null
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
  study_log_id?: string | null
  review_material_id?: string | null
  due_at: string
  status: string
  study_logs?: {
    subject: string | null
    note: string | null
    started_at: string | null
    reference_book_id?: string | null
  } | null
  review_materials?: {
    subject: string
    content: string
    reference_book_id: string | null
    created_at?: string | null
  } | null
}

export type ReviewMaterial = {
  id: string
  user_id: string
  reference_book_id: string | null
  subject: string
  content: string
  created_at?: string | null
  updated_at?: string | null
}
