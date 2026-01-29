import type { StudyLog } from '@/types/database'
import { differenceInDays } from 'date-fns'
import { getStudyDay, getStudyDayDate } from '@/lib/date-utils'

/**
 * ストリーク（連続学習日数）を計算
 */
export function calculateStreak(studyLogs: StudyLog[]): {
  currentStreak: number
  longestStreak: number
  lastStudyDate: Date | null
} {
  if (studyLogs.length === 0) {
    return { currentStreak: 0, longestStreak: 0, lastStudyDate: null }
  }

  // 日付ごとにグループ化
  const dates = new Set(studyLogs.map((log) => getStudyDay(new Date(log.started_at))))
  const sortedDates = Array.from(dates)
    .map((d) => getStudyDayDate(d))
    .sort((a, b) => b.getTime() - a.getTime())

  const todayStr = getStudyDay(new Date())
  const yesterdayStr = getStudyDay(new Date(getStudyDayDate(todayStr).getTime() - 24 * 60 * 60 * 1000))

  // 現在のストリークを計算
  let currentStreak = 0
  let checkDate = getStudyDayDate(todayStr)
  let lastStudyDate: Date | null = null

  for (const logDate of sortedDates) {
    const logDateStr = getStudyDay(logDate)
    const checkDateStr = getStudyDay(checkDate)

    if (logDateStr === checkDateStr || logDateStr === getStudyDay(new Date(checkDate.getTime() - 24 * 60 * 60 * 1000))) {
      currentStreak++
      if (lastStudyDate === null) {
        lastStudyDate = logDate
      }
      checkDate = new Date(logDate.getTime() - 24 * 60 * 60 * 1000)
    } else {
      break
    }
  }

  // 最長ストリークを計算
  let longestStreak = 0
  let tempStreak = 0
  let prevDate: Date | null = null

  for (const date of sortedDates) {
    if (prevDate === null) {
      tempStreak = 1
    } else {
      const daysDiff = differenceInDays(prevDate, date)
      if (daysDiff === 1) {
        tempStreak++
      } else {
        longestStreak = Math.max(longestStreak, tempStreak)
        tempStreak = 1
      }
    }
    prevDate = date
  }
  longestStreak = Math.max(longestStreak, tempStreak)

  return {
    currentStreak,
    longestStreak,
    lastStudyDate: sortedDates[0] || null,
  }
}

/**
 * バッジを計算
 */
export function calculateBadges(
  profile: { current_deviation: number | null; target_deviation: number | null },
  studyLogs: StudyLog[],
  streak: { currentStreak: number; longestStreak: number }
): string[] {
  const badges: string[] = []
  const totalMinutes = studyLogs.reduce((sum, log) => sum + log.study_minutes, 0)
  const totalHours = Math.floor(totalMinutes / 60)

  // 学習時間バッジ
  if (totalHours >= 100) badges.push('🏆 学習マスター')
  else if (totalHours >= 50) badges.push('⭐ 学習エキスパート')
  else if (totalHours >= 20) badges.push('📚 学習上級者')
  else if (totalHours >= 10) badges.push('📖 学習中級者')
  else if (totalHours >= 1) badges.push('🌱 学習初心者')

  // ストリークバッジ
  if (streak.currentStreak >= 30) badges.push('🔥 30日連続達成')
  else if (streak.currentStreak >= 14) badges.push('💪 2週間連続達成')
  else if (streak.currentStreak >= 7) badges.push('✨ 1週間連続達成')
  else if (streak.currentStreak >= 3) badges.push('🎯 3日連続達成')

  // 偏差値バッジ
  if (profile.current_deviation && profile.target_deviation) {
    if (profile.current_deviation >= profile.target_deviation) {
      badges.push('🎓 目標達成')
    } else if (profile.current_deviation >= profile.target_deviation - 5) {
      badges.push('📈 目標まであと少し')
    }
  }

  // 科目バッジ
  const subjects = new Set(studyLogs.map((log) => log.subject))
  if (subjects.size >= 5) badges.push('📝 5科目マスター')
  else if (subjects.size >= 3) badges.push('📋 3科目マスター')

  return badges
}

/**
 * 今日のミッションを生成
 */
export function getTodayMission(
  studyLogs: StudyLog[],
  streak: { currentStreak: number }
): {
  title: string
  description: string
  target: number
  current: number
  completed: boolean
} {
  const todayStr = getStudyDay(new Date())
  const todayMinutes = studyLogs
    .filter((log) => getStudyDay(new Date(log.started_at)) === todayStr)
    .reduce((sum, log) => sum + log.study_minutes, 0)

  // ストリーク維持ミッション
  if (streak.currentStreak > 0) {
    return {
      title: '🔥 ストリーク維持',
      description: '今日も学習して連続記録を更新しよう！',
      target: 30, // 最低30分
      current: todayMinutes,
      completed: todayMinutes >= 30,
    }
  }

  // 初日ミッション
  return {
    title: '🚀 学習開始',
    description: '今日から学習習慣を始めよう！',
    target: 30,
    current: todayMinutes,
    completed: todayMinutes >= 30,
  }
}
