import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import type { Profile } from '../types'

type ProfileContextValue = {
  userId: string
  profile: Profile | null
  loading: boolean
  refreshProfile: () => Promise<void>
  createProfile: (data: Omit<Profile, 'id' | 'user_id' | 'onboarding_completed'>) => Promise<void>
  updateProfile: (data: Partial<Profile>) => Promise<void>
}

const ProfileContext = createContext<ProfileContextValue | null>(null)

export function ProfileProvider({ session, children }: { session: Session; children: React.ReactNode }) {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchProfile = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('user_id', session.user.id)
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        setProfile(null)
      } else {
        console.error('Failed to fetch profile:', error.message)
      }
    } else {
      setProfile(data as Profile)
    }
    setLoading(false)
  }, [session.user.id])

  useEffect(() => {
    fetchProfile()
  }, [fetchProfile])

  const refreshProfile = useCallback(async () => {
    await fetchProfile()
  }, [fetchProfile])

  const createProfile = useCallback(
    async (data: Omit<Profile, 'id' | 'user_id' | 'onboarding_completed'>) => {
      const { error, data: created } = await supabase
        .from('profiles')
        .insert({
          user_id: session.user.id,
          username: data.username,
          birth_date: data.birth_date,
          gender: data.gender,
          study_purpose: data.study_purpose,
          weekday_target_minutes: data.weekday_target_minutes,
          weekend_target_minutes: data.weekend_target_minutes,
          onboarding_completed: true,
        })
        .select()
        .single()

      if (error) {
        throw error
      }

      setProfile(created as Profile)
    },
    [session.user.id]
  )

  const updateProfile = useCallback(
    async (data: Partial<Profile>) => {
      const { error, data: updated } = await supabase
        .from('profiles')
        .update({
          ...data,
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', session.user.id)
        .select()
        .single()

      if (error) {
        throw error
      }

      setProfile(updated as Profile)
    },
    [session.user.id]
  )

  const value = useMemo(
    () => ({
      userId: session.user.id,
      profile,
      loading,
      refreshProfile,
      createProfile,
      updateProfile,
    }),
    [session.user.id, profile, loading, refreshProfile, createProfile, updateProfile]
  )

  return <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>
}

export function useProfile() {
  const context = useContext(ProfileContext)
  if (!context) {
    throw new Error('useProfile must be used within ProfileProvider')
  }
  return context
}
