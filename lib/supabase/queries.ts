import { createClient } from './server'
import type { Profile, StudyLog, ReferenceBook } from '@/types/database'

export async function getProfile(userId: string): Promise<Profile | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('user_id', userId)
    .single()

  if (error) {
    if (error.code === 'PGRST116') {
      return null
    }
    throw error
  }

  return data
}

export async function createProfile(
  userId: string,
  data: {
    school_name: string
    current_deviation: number
    target_deviation: number
    exam_date?: string
  }
): Promise<Profile> {
  const supabase = await createClient()
  const { data: profile, error } = await supabase
    .from('profiles')
    .insert({
      user_id: userId,
      school_name: data.school_name,
      current_deviation: data.current_deviation,
      target_deviation: data.target_deviation,
      exam_date: data.exam_date || null,
      onboarding_completed: true,
    })
    .select()
    .single()

  if (error) throw error
  return profile
}

export async function updateProfile(
  userId: string,
  data: {
    school_name?: string
    current_deviation?: number
    target_deviation?: number
    exam_date?: string
  }
): Promise<Profile> {
  const supabase = await createClient()
  const { data: profile, error } = await supabase
    .from('profiles')
    .update({
      ...data,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId)
    .select()
    .single()

  if (error) throw error
  return profile
}

export async function getStudyLogs(userId: string): Promise<StudyLog[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('study_logs')
    .select('*')
    .eq('user_id', userId)
    .order('started_at', { ascending: false })

  if (error) throw error
  return data || []
}

export async function getLatestStudyLog(userId: string): Promise<StudyLog | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('study_logs')
    .select('*')
    .eq('user_id', userId)
    .order('started_at', { ascending: false })
    .limit(1)
    .single()

  if (error) {
    if (error.code === 'PGRST116') {
      return null
    }
    throw error
  }

  return data
}

export async function createStudyLog(
  userId: string,
  data: {
    subject: string
    study_minutes: number
    started_at: string
    reference_book_id?: string | null
  }
): Promise<StudyLog> {
  const supabase = await createClient()
  const { data: studyLog, error } = await supabase
    .from('study_logs')
    .insert({
      user_id: userId,
      subject: data.subject,
      study_minutes: data.study_minutes,
      started_at: data.started_at,
      reference_book_id: data.reference_book_id || null,
    })
    .select()
    .single()

  if (error) throw error
  return studyLog
}

export async function getReferenceBooks(userId: string): Promise<ReferenceBook[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('reference_books')
    .select('*')
    .eq('user_id', userId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })

  if (error) throw error
  return data || []
}
