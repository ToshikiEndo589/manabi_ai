import type { StudyLog } from '../types'
import { getStudyDay, getStudyDayDate } from './date'

export const calculateStreak = (studyLogs: StudyLog[]) => {
  if (studyLogs.length === 0) {
    return { currentStreak: 0, longestStreak: 0, lastStudyDate: null as Date | null }
  }

  const dates = new Set(studyLogs.map((log) => getStudyDay(new Date(log.started_at))))
  const sortedDates = Array.from(dates)
    .map((d) => getStudyDayDate(d))
    .sort((a, b) => b.getTime() - a.getTime())

  let currentStreak = 0
  let checkDate = getStudyDayDate(getStudyDay(new Date()))
  let lastStudyDate: Date | null = null

  for (const logDate of sortedDates) {
    const logDateStr = getStudyDay(logDate)
    const checkDateStr = getStudyDay(checkDate)
    const prevDateStr = getStudyDay(new Date(checkDate.getTime() - 24 * 60 * 60 * 1000))

    if (logDateStr === checkDateStr || logDateStr === prevDateStr) {
      currentStreak++
      if (lastStudyDate === null) {
        lastStudyDate = logDate
      }
      checkDate = new Date(logDate.getTime() - 24 * 60 * 60 * 1000)
    } else {
      break
    }
  }

  let longestStreak = 0
  let tempStreak = 0
  let prevDate: Date | null = null

  for (const date of sortedDates) {
    if (!prevDate) {
      tempStreak = 1
    } else {
      const diffDays = Math.round((prevDate.getTime() - date.getTime()) / (24 * 60 * 60 * 1000))
      if (diffDays === 1) {
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
