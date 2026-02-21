import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { useFocusEffect } from '@react-navigation/native'
import { useProfile } from '../contexts/ProfileContext'
import { supabase } from '../lib/supabase'
import type { Profile, StudyLog } from '../types'
import { formatMinutes } from '../lib/format'
import { calculateStreak } from '../lib/gamification'
import { getThisMonthStart, getThisWeekStart, getTodayStart, getStudyDay } from '../lib/date'

const mascotUrl = (baseUrl?: string) =>
  `${(baseUrl || 'https://ai-yobikou.vercel.app').replace(/\/$/, '')}/images/mascot.png`

export function HomeScreen() {
  const { userId, profile: cachedProfile } = useProfile()
  const [profile, setProfile] = useState<Profile | null>(cachedProfile)
  const [studyLogs, setStudyLogs] = useState<StudyLog[]>([])
  const [isSavingToday, setIsSavingToday] = useState(false)
  const [isSavingWeek, setIsSavingWeek] = useState(false)
  const [isSavingMonth, setIsSavingMonth] = useState(false)
  const [todayOverride, setTodayOverride] = useState('')
  const [weekOverride, setWeekOverride] = useState('')
  const [monthOverride, setMonthOverride] = useState('')

  const loadData = useCallback(async () => {
    const [profileResult, logsResult] = await Promise.all([
      supabase.from('profiles').select('*').eq('user_id', userId).single(),
      supabase.from('study_logs').select('*').eq('user_id', userId).order('started_at', { ascending: false }),
    ])

    if (profileResult.data) {
      setProfile(profileResult.data as Profile)

      // getTodayStart()などが返すDateオブジェクトのUTC日付部分を使用
      const today = getTodayStart()
      const week = getThisWeekStart()
      const month = getThisMonthStart()

      const todayStr = `${today.getUTCFullYear()}-${String(today.getUTCMonth() + 1).padStart(2, '0')}-${String(today.getUTCDate()).padStart(2, '0')}`
      const weekStr = `${week.getUTCFullYear()}-${String(week.getUTCMonth() + 1).padStart(2, '0')}-${String(week.getUTCDate()).padStart(2, '0')}`
      const monthStr = `${month.getUTCFullYear()}-${String(month.getUTCMonth() + 1).padStart(2, '0')}-${String(month.getUTCDate()).padStart(2, '0')}`

      if (profileResult.data.today_target_date === todayStr && profileResult.data.today_target_minutes) {
        setTodayOverride(String(profileResult.data.today_target_minutes))
      }
      if (profileResult.data.week_target_date === weekStr && profileResult.data.week_target_minutes) {
        setWeekOverride(String(profileResult.data.week_target_minutes))
      }
      if (profileResult.data.month_target_date === monthStr && profileResult.data.month_target_minutes) {
        setMonthOverride(String(profileResult.data.month_target_minutes))
      }
    }
    setStudyLogs((logsResult.data || []) as StudyLog[])
  }, [userId])

  useEffect(() => {
    loadData()
  }, [loadData])

  useFocusEffect(
    useCallback(() => {
      loadData()
    }, [loadData])
  )

  const { todayMinutes, weekMinutes, monthMinutes, totalMinutes } = useMemo(() => {
    const todayStart = getTodayStart()
    const weekStart = getThisWeekStart()
    const monthStart = getThisMonthStart()

    // UTC日付部分を使用
    const todayStr = `${todayStart.getUTCFullYear()}-${String(todayStart.getUTCMonth() + 1).padStart(2, '0')}-${String(todayStart.getUTCDate()).padStart(2, '0')}`
    const weekStr = `${weekStart.getUTCFullYear()}-${String(weekStart.getUTCMonth() + 1).padStart(2, '0')}-${String(weekStart.getUTCDate()).padStart(2, '0')}`
    const monthStr = `${monthStart.getUTCFullYear()}-${String(monthStart.getUTCMonth() + 1).padStart(2, '0')}-${String(monthStart.getUTCDate()).padStart(2, '0')}`

    const today = studyLogs.reduce((sum, log) => {
      const logDay = getStudyDay(new Date(log.started_at))
      const isToday = logDay === todayStr
      return isToday ? sum + log.study_minutes : sum
    }, 0)

    const week = studyLogs.reduce((sum, log) => {
      const logDay = getStudyDay(new Date(log.started_at))
      const isThisWeek = logDay >= weekStr
      return isThisWeek ? sum + log.study_minutes : sum
    }, 0)

    const month = studyLogs.reduce((sum, log) => {
      const logDay = getStudyDay(new Date(log.started_at))
      return logDay >= monthStr ? sum + log.study_minutes : sum
    }, 0)

    const total = studyLogs.reduce((sum, log) => sum + log.study_minutes, 0)

    return { todayMinutes: today, weekMinutes: week, monthMinutes: month, totalMinutes: total }
  }, [studyLogs])

  const streak = useMemo(() => calculateStreak(studyLogs), [studyLogs])
  const latestStudyLog = studyLogs[0] ?? null

  const comment = useMemo(() => {
    if (streak.currentStreak >= 7) return '🔥 最高！連続学習が続いてるよ！'
    if (streak.currentStreak >= 3) return '💪 いい感じ！このペースを維持しよう！'
    if (streak.currentStreak >= 1) return '✨ 今日も学習できたね！'
    return '📚 今日からスタート！一緒に頑張ろう！'
  }, [streak.currentStreak])

  const dailyTarget = useMemo(() => {
    if (!profile) return 60
    const today = new Date()
    const isWeekend = today.getDay() === 0 || today.getDay() === 6
    const defaultTarget = isWeekend
      ? profile.weekend_target_minutes ?? 120
      : profile.weekday_target_minutes ?? 60
    const todayStart = getTodayStart()
    const todayStr = `${todayStart.getUTCFullYear()}-${String(todayStart.getUTCMonth() + 1).padStart(2, '0')}-${String(todayStart.getUTCDate()).padStart(2, '0')}`
    if (profile.today_target_date === todayStr && profile.today_target_minutes) {
      return profile.today_target_minutes
    }
    return defaultTarget
  }, [profile])

  const weekTarget = useMemo(() => {
    if (!profile) return 420
    const weekStart = getThisWeekStart()
    const weekStr = `${weekStart.getUTCFullYear()}-${String(weekStart.getUTCMonth() + 1).padStart(2, '0')}-${String(weekStart.getUTCDate()).padStart(2, '0')}`
    if (profile.week_target_date === weekStr && profile.week_target_minutes) {
      return profile.week_target_minutes
    }
    return (profile.weekday_target_minutes ?? 60) * 5 + (profile.weekend_target_minutes ?? 120) * 2
  }, [profile])

  const monthTarget = useMemo(() => {
    if (!profile) return 1800
    const monthStart = getThisMonthStart()
    const monthStr = `${monthStart.getUTCFullYear()}-${String(monthStart.getUTCMonth() + 1).padStart(2, '0')}-${String(monthStart.getUTCDate()).padStart(2, '0')}`
    if (profile.month_target_date === monthStr && profile.month_target_minutes) {
      return profile.month_target_minutes
    }
    const daily = profile.weekday_target_minutes ?? 60
    const weekend = profile.weekend_target_minutes ?? 120
    return daily * 22 + weekend * 8
  }, [profile])

  const handleSaveTarget = async (type: 'today' | 'week' | 'month') => {
    if (!profile) return
    const value =
      type === 'today' ? parseInt(todayOverride, 10) : type === 'week' ? parseInt(weekOverride, 10) : parseInt(monthOverride, 10)
    if (isNaN(value) || value < 1) return
    if (type === 'today') setIsSavingToday(true)
    if (type === 'week') setIsSavingWeek(true)
    if (type === 'month') setIsSavingMonth(true)
    const todayStart = getTodayStart()
    const weekStart = getThisWeekStart()
    const monthStart = getThisMonthStart()
    const todayStr = `${todayStart.getUTCFullYear()}-${String(todayStart.getUTCMonth() + 1).padStart(2, '0')}-${String(todayStart.getUTCDate()).padStart(2, '0')}`
    const weekStr = `${weekStart.getUTCFullYear()}-${String(weekStart.getUTCMonth() + 1).padStart(2, '0')}-${String(weekStart.getUTCDate()).padStart(2, '0')}`
    const monthStr = `${monthStart.getUTCFullYear()}-${String(monthStart.getUTCMonth() + 1).padStart(2, '0')}-${String(monthStart.getUTCDate()).padStart(2, '0')}`
    const payload =
      type === 'today'
        ? { today_target_minutes: value, today_target_date: todayStr }
        : type === 'week'
          ? { week_target_minutes: value, week_target_date: weekStr }
          : { month_target_minutes: value, month_target_date: monthStr }
    await supabase.from('profiles').update({ ...payload, updated_at: new Date().toISOString() }).eq('user_id', userId)
    setProfile({ ...profile, ...payload })
    setIsSavingToday(false)
    setIsSavingWeek(false)
    setIsSavingMonth(false)
  }

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={80}
    >
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <View style={[styles.card, styles.mascotCard]}>
          <View style={styles.mascotRow}>
            <View style={styles.mascotCircle}>
              <Image source={{ uri: mascotUrl(process.env.EXPO_PUBLIC_API_BASE_URL) }} style={styles.mascotImage} />
            </View>
            <View style={styles.balloon}>
              <Text style={styles.balloonText}>{comment}</Text>
            </View>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>今日の目標</Text>
          <ProgressRow label="目標" value={`${dailyTarget}分`} />
          <ProgressBar progress={Math.min(100, Math.round((todayMinutes / Math.max(1, dailyTarget)) * 100))} />
          <Text style={styles.mutedText}>
            今日の学習: {todayMinutes}分 / 達成率 {Math.min(100, Math.round((todayMinutes / Math.max(1, dailyTarget)) * 100))}%
          </Text>
          <View style={styles.inlineRow}>
            <View style={styles.flex}>
              <Text style={styles.smallLabel}>今日の目標を変更</Text>
              <TextInput
                style={styles.input}
                placeholder={`${dailyTarget}`}
                keyboardType="numeric"
                value={todayOverride}
                onChangeText={setTodayOverride}
              />
            </View>
            <Pressable style={styles.primaryButton} onPress={() => handleSaveTarget('today')} disabled={isSavingToday}>
              <Text style={styles.primaryButtonText}>{isSavingToday ? '保存中...' : '更新'}</Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>今週の目標</Text>
          <ProgressRow label="今週の目標" value={`${weekTarget}分`} />
          <ProgressBar progress={Math.min(100, Math.round((weekMinutes / Math.max(1, weekTarget)) * 100))} />
          <Text style={styles.mutedText}>
            今週の学習: {weekMinutes}分 / 達成率 {Math.min(100, Math.round((weekMinutes / Math.max(1, weekTarget)) * 100))}%
          </Text>
          <View style={styles.inlineRow}>
            <View style={styles.flex}>
              <Text style={styles.smallLabel}>今週の目標を変更</Text>
              <TextInput
                style={styles.input}
                placeholder={`${weekTarget}`}
                keyboardType="numeric"
                value={weekOverride}
                onChangeText={setWeekOverride}
              />
            </View>
            <Pressable style={styles.primaryButton} onPress={() => handleSaveTarget('week')} disabled={isSavingWeek}>
              <Text style={styles.primaryButtonText}>{isSavingWeek ? '保存中...' : '更新'}</Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>今月の目標</Text>
          <ProgressRow label="今月の目標" value={`${monthTarget}分`} />
          <ProgressBar progress={Math.min(100, Math.round((monthMinutes / Math.max(1, monthTarget)) * 100))} />
          <Text style={styles.mutedText}>
            今月の学習: {monthMinutes}分 / 達成率 {Math.min(100, Math.round((monthMinutes / Math.max(1, monthTarget)) * 100))}%
          </Text>
          <View style={styles.inlineRow}>
            <View style={styles.flex}>
              <Text style={styles.smallLabel}>今月の目標を変更</Text>
              <TextInput
                style={styles.input}
                placeholder={`${monthTarget}`}
                keyboardType="numeric"
                value={monthOverride}
                onChangeText={setMonthOverride}
              />
            </View>
            <Pressable style={styles.primaryButton} onPress={() => handleSaveTarget('month')} disabled={isSavingMonth}>
              <Text style={styles.primaryButtonText}>{isSavingMonth ? '保存中...' : '更新'}</Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>学習記録</Text>
          <View style={styles.summaryItem}>
            <Text style={styles.summaryLabel}>累積学習時間</Text>
            <Text style={styles.summaryValue}>{formatMinutes(totalMinutes)}</Text>
          </View>
          {latestStudyLog && (
            <View style={[styles.summaryItem, styles.summarySecondary]}>
              <Text style={styles.summaryLabel}>最後の学習</Text>
              <Text style={styles.summaryValue}>{getStudyDay(new Date(latestStudyLog.started_at))}</Text>
            </View>
          )}
        </View>

        {streak.currentStreak > 0 && (
          <View style={[styles.card, styles.streakCard]}>
            <View style={styles.streakRow}>
              <View>
                <Text style={styles.streakTitle}>{streak.currentStreak}日連続</Text>
                <Text style={styles.mutedText}>最長記録: {streak.longestStreak}日</Text>
              </View>
              <Text style={styles.streakEmoji}>🔥</Text>
            </View>
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  )
}


function ProgressRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.progressRow}>
      <Text style={styles.mutedText}>{label}</Text>
      <Text style={styles.mutedText}>{value}</Text>
    </View>
  )
}

function ProgressBar({ progress }: { progress: number }) {
  return (
    <View style={styles.progressTrack}>
      <View style={[styles.progressFill, { width: `${progress}%` }]} />
    </View>
  )
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  container: {
    padding: 16,
    backgroundColor: '#f8fafc',
    gap: 12,
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 12,
  },
  mascotCard: {
    backgroundColor: '#eef2ff',
    borderColor: '#c7d2fe',
  },
  mascotRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  mascotCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#e0e7ff',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  mascotImage: {
    width: 70,
    height: 70,
    borderRadius: 35,
    resizeMode: 'cover',
  },
  balloon: {
    flex: 1,
    backgroundColor: '#ffffff',
    padding: 12,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#93c5fd',
  },
  balloonText: {
    fontSize: 13,
    color: '#0f172a',
    fontWeight: '600',
  },
  progressRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  progressTrack: {
    height: 12,
    backgroundColor: '#e2e8f0',
    borderRadius: 999,
    overflow: 'hidden',
    marginBottom: 8,
  },
  progressFill: {
    height: 12,
    backgroundColor: '#3b82f6',
  },
  inlineRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    marginTop: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: 14,
    backgroundColor: '#ffffff',
  },
  smallLabel: {
    fontSize: 11,
    color: '#64748b',
    marginBottom: 4,
  },
  primaryButton: {
    backgroundColor: '#2563eb',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '600',
  },
  mutedText: {
    fontSize: 12,
    color: '#64748b',
  },
  flex: {
    flex: 1,
  },
  summaryItem: {
    backgroundColor: '#eff6ff',
    padding: 12,
    borderRadius: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  summarySecondary: {
    backgroundColor: '#f5f3ff',
  },
  summaryLabel: {
    fontSize: 12,
    color: '#475569',
  },
  summaryValue: {
    fontSize: 14,
    fontWeight: '700',
    color: '#2563eb',
  },
  streakCard: {
    backgroundColor: '#fff7ed',
    borderColor: '#fed7aa',
  },
  streakRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  streakTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#ea580c',
  },
  streakEmoji: {
    fontSize: 24,
  },
})
