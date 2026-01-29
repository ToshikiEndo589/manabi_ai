export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          user_id: string
          school_name: string | null
          current_deviation: number | null
          target_deviation: number | null
          exam_date: string | null
          weekday_target_minutes: number | null
          weekend_target_minutes: number | null
          today_target_minutes: number | null
          today_target_date: string | null
          week_target_minutes: number | null
          week_target_date: string | null
          month_target_minutes: number | null
          month_target_date: string | null
          avatar_url: string | null
          onboarding_completed: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          user_id: string
          school_name?: string | null
          current_deviation?: number | null
          target_deviation?: number | null
          exam_date?: string | null
          weekday_target_minutes?: number | null
          weekend_target_minutes?: number | null
          today_target_minutes?: number | null
          today_target_date?: string | null
          week_target_minutes?: number | null
          week_target_date?: string | null
          month_target_minutes?: number | null
          month_target_date?: string | null
          avatar_url?: string | null
          onboarding_completed?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          user_id?: string
          school_name?: string | null
          current_deviation?: number | null
          target_deviation?: number | null
          exam_date?: string | null
          weekday_target_minutes?: number | null
          weekend_target_minutes?: number | null
          today_target_minutes?: number | null
          today_target_date?: string | null
          week_target_minutes?: number | null
          week_target_date?: string | null
          month_target_minutes?: number | null
          month_target_date?: string | null
          avatar_url?: string | null
          onboarding_completed?: boolean
          created_at?: string
          updated_at?: string
        }
      }
      study_logs: {
        Row: {
          id: string
          user_id: string
          subject: string
          reference_book_id: string | null
          study_minutes: number
          started_at: string
          note: string | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          subject?: string
          reference_book_id?: string | null
          study_minutes: number
          started_at: string
          note?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          subject?: string
          reference_book_id?: string | null
          study_minutes?: number
          started_at?: string
          note?: string | null
          created_at?: string
        }
      }
      review_tasks: {
        Row: {
          id: string
          user_id: string
          study_log_id: string
          due_at: string
          status: string
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          study_log_id: string
          due_at: string
          status?: string
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          study_log_id?: string
          due_at?: string
          status?: string
          created_at?: string
        }
      }
      quiz_attempts: {
        Row: {
          id: string
          user_id: string
          review_task_id: string
          question: string
          choices: string[]
          correct_index: number
          selected_index: number
          is_correct: boolean
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          review_task_id: string
          question: string
          choices: string[]
          correct_index: number
          selected_index: number
          is_correct: boolean
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          review_task_id?: string
          question?: string
          choices?: string[]
          correct_index?: number
          selected_index?: number
          is_correct?: boolean
          created_at?: string
        }
      }
      reference_books: {
        Row: {
          id: string
          user_id: string
          name: string
          image_url: string | null
          type: string
          deleted_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          name: string
          image_url?: string | null
          type?: string
          deleted_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          name?: string
          image_url?: string | null
          type?: string
          deleted_at?: string | null
          created_at?: string
          updated_at?: string
        }
      }
    }
  }
}

export type Profile = Database['public']['Tables']['profiles']['Row']
export type StudyLog = Database['public']['Tables']['study_logs']['Row']
export type ReferenceBook = Database['public']['Tables']['reference_books']['Row']