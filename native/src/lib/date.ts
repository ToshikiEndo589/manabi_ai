const JST_OFFSET_MS = 9 * 60 * 60 * 1000
const STUDY_DAY_START_HOUR = 0  // Changed from 3 to 0 (midnight)
const STUDY_DAY_SHIFT_MS = 0  // No shifting needed for midnight cutoff

const formatYmdUTC = (date: Date) => {
  const year = date.getUTCFullYear()
  const month = String(date.getUTCMonth() + 1).padStart(2, '0')
  const day = String(date.getUTCDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const getJstParts = (date: Date) => {
  const shifted = new Date(date.getTime() + JST_OFFSET_MS)
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
  }
}

const getStudyDayStart = (date: Date): Date => {
  const [year, month, day] = getStudyDay(date).split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day, STUDY_DAY_START_HOUR) - JST_OFFSET_MS)
}

export const getStudyDayDate = (studyDay: string): Date => {
  const [year, month, day] = studyDay.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day) - JST_OFFSET_MS)
}

export const getStudyDay = (date: Date): string => {
  const shifted = new Date(date.getTime() + STUDY_DAY_SHIFT_MS)
  return formatYmdUTC(shifted)
}

export const getTodayStart = () => {
  return getStudyDayStart(new Date())
}

export const getThisWeekStart = () => {
  const todayStart = getTodayStart()
  const { year, month, day } = getJstParts(todayStart)
  const dayOfWeek = new Date(Date.UTC(year, month - 1, day)).getUTCDay()
  const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1
  const weekStart = new Date(todayStart)
  weekStart.setUTCDate(weekStart.getUTCDate() - daysToMonday)
  return weekStart
}

export const getThisMonthStart = () => {
  const todayStart = getTodayStart()
  const { year, month } = getJstParts(todayStart)
  return new Date(Date.UTC(year, month - 1, 1, STUDY_DAY_START_HOUR) - JST_OFFSET_MS)
}

export const startOfDay = (date = new Date()) => {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  return d
}

export const startOfWeek = (date = new Date()) => {
  const d = startOfDay(date)
  const day = d.getDay()
  const diff = (day + 6) % 7
  d.setDate(d.getDate() - diff)
  return d
}

export const startOfMonth = (date = new Date()) => {
  const d = startOfDay(date)
  d.setDate(1)
  return d
}

export const formatDateLabel = (date: Date) => {
  return date.toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' })
}

export const formatDateInput = (date: Date) => {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export const rangeContains = (date: Date, start: Date, end: Date) => {
  return date >= start && date < end
}
