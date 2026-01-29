/**
 * 日付判定のユーティリティ
 * 一日の区切りを03:00-03:00で管理（JST固定）
 */

const JST_OFFSET_MS = 9 * 60 * 60 * 1000
const STUDY_DAY_START_HOUR = 3
const STUDY_DAY_SHIFT_MS = (9 - STUDY_DAY_START_HOUR) * 60 * 60 * 1000

const formatYmdUTC = (date: Date): string => {
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

export function getStudyDayDate(studyDay: string): Date {
  const [year, month, day] = studyDay.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day) - JST_OFFSET_MS)
}

/**
 * 指定された日時がどの「日」に属するかを判定
 * 03:00-03:00で区切る（深夜3時で日付が切り替わる）
 * @param date 判定する日時
 * @returns その日時が属する「日」の日付（yyyy-MM-dd形式）
 */
export function getStudyDay(date: Date): string {
  const shifted = new Date(date.getTime() + STUDY_DAY_SHIFT_MS)
  return formatYmdUTC(shifted)
}

/**
 * カレンダー表示用の日付から学習記録の日付を取得
 * カレンダーの日付はその日の00:00:00として扱う
 * 学習記録は03:00-03:00で区切られているため：
 * - カレンダーの1月25日 → 1月25日 03:00 〜 1月26日 02:59 の記録を見たい
 * - この記録は「1月25日」の学習記録として保存されている
 * - カレンダーの日付をそのまま使う（03:00の判定は不要）
 * @param calendarDate カレンダー上の日付（00:00:00として扱う）
 * @returns その日付に対応する学習記録の日付（yyyy-MM-dd形式）
 */
export function getStudyDayFromCalendarDate(calendarDate: Date): string {
  // カレンダーの日付をそのまま学習記録の日付として使う（JST基準）
  const shifted = new Date(calendarDate.getTime() + JST_OFFSET_MS)
  return formatYmdUTC(shifted)
}

/**
 * 現在の日付を取得（03:00-03:00の区切りで）
 * @returns 現在の「日」の日付（Dateオブジェクト、時刻は00:00:00）
 */
export function getTodayDate(): Date {
  const { year, month, day } = getJstParts(new Date())
  return new Date(Date.UTC(year, month - 1, day) - JST_OFFSET_MS)
}

/**
 * 今日の開始時刻（03:00）を取得
 */
export function getTodayStart(): Date {
  return getStudyDayStart(new Date())
}

/**
 * 今週の開始時刻（月曜日の03:00）を取得
 */
export function getThisWeekStart(): Date {
  const todayStart = getTodayStart()
  const { year, month, day } = getJstParts(todayStart)
  const dayOfWeek = new Date(Date.UTC(year, month - 1, day)).getUTCDay() // 0=日曜, 1=月曜, ...
  const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1

  const weekStart = new Date(todayStart)
  weekStart.setUTCDate(weekStart.getUTCDate() - daysToMonday)

  return weekStart
}

/**
 * 今月の開始時刻（1日の03:00）を取得
 */
export function getThisMonthStart(): Date {
  const todayStart = getTodayStart()
  const { year, month } = getJstParts(todayStart)
  return new Date(Date.UTC(year, month - 1, 1, STUDY_DAY_START_HOUR) - JST_OFFSET_MS)
}

/**
 * 指定された週の開始日（月曜日）を取得
 * @param offset 週のオフセット（0=今週、-1=先週、-2=2週間前など）
 * @returns その週の月曜日のDateオブジェクト（時刻は03:00:00）
 */
export function getWeekStart(offset: number = 0): Date {
  const todayStart = getTodayStart()
  const { year, month, day } = getJstParts(todayStart)
  const dayOfWeek = new Date(Date.UTC(year, month - 1, day)).getUTCDay() // 0=日曜, 1=月曜, ...
  const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1

  const weekStart = new Date(todayStart)
  weekStart.setUTCDate(weekStart.getUTCDate() - daysToMonday - (offset * 7))

  return weekStart
}

/**
 * 指定された月の開始日を取得
 * @param offset 月のオフセット（0=今月、-1=先月、-2=2ヶ月前など）
 * @returns その月の1日のDateオブジェクト（時刻は03:00:00）
 */
export function getMonthStart(offset: number = 0): Date {
  const todayStart = getTodayStart()
  const { year, month } = getJstParts(todayStart)
  return new Date(Date.UTC(year, month - 1 + offset, 1, STUDY_DAY_START_HOUR) - JST_OFFSET_MS)
}

/**
 * 指定された日時が指定された期間内かどうかを判定
 */
export function isInPeriod(date: Date, periodStart: Date): boolean {
  return date >= periodStart
}
