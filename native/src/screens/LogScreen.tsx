import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Alert,
  KeyboardAvoidingView,
  Linking,
  Modal,
  FlatList,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
  TouchableOpacity,
  Image,
  Platform as RNPlatform,
} from 'react-native'
import DateTimePicker from '@react-native-community/datetimepicker'
import Svg, { Circle, G } from 'react-native-svg'
// @ts-ignore - @expo/vector-icons types may not be available
import Ionicons from '@expo/vector-icons/Ionicons'
import { useFocusEffect } from '@react-navigation/native'
import { supabase } from '../lib/supabase'
import { useProfile } from '../contexts/ProfileContext'
import type { Profile, ReferenceBook, StudyLog } from '../types'
import { formatMinutes } from '../lib/format'
import {
  formatDateInput,
  formatDateLabel,
  getStudyDay,
  getStudyDayDate,
  getThisMonthStart,
  getThisWeekStart,
  getTodayStart,
  rangeContains,
  startOfDay,
  startOfMonth,
  startOfWeek,
} from '../lib/date'
import { calculateStreak } from '../lib/gamification'

const legendColors = [
  '#0ea5e9',
  '#f97316',
  '#22c55e',
  '#a855f7',
  '#f43f5e',
  '#14b8a6',
  '#f59e0b',
  '#3b82f6',
  '#84cc16',
  '#ec4899',
  '#06b6d4',
  '#6366f1',
]

export function LogScreen() {
  const { userId, profile: cachedProfile, loading: profileLoading } = useProfile()
  const [studyLogs, setStudyLogs] = useState<StudyLog[]>([])
  const [referenceBooks, setReferenceBooks] = useState<ReferenceBook[]>([])

  // Home Screen Feature States
  const [isSavingToday, setIsSavingToday] = useState(false)
  const [isSavingWeek, setIsSavingWeek] = useState(false)
  const [isSavingMonth, setIsSavingMonth] = useState(false)
  const [todayOverride, setTodayOverride] = useState('')
  const [weekOverride, setWeekOverride] = useState('')
  const [monthOverride, setMonthOverride] = useState('')

  // Helper function to get the current display name for a study log
  const getLogDisplayName = (log: StudyLog): string => {
    if (log.reference_book_id) {
      const book = referenceBooks.find(b => b.id === log.reference_book_id)
      return book?.name || log.subject || 'その他'
    }
    return log.subject || 'その他'
  }
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [manualBookId, setManualBookId] = useState<string | null>(null)
  const [manualMinutes, setManualMinutes] = useState('')
  const [manualDate, setManualDate] = useState(new Date())
  const [showManualDatePicker, setShowManualDatePicker] = useState(false)
  const [showManualInput, setShowManualInput] = useState(false)
  const [showBookModal, setShowBookModal] = useState(false)
  const [showEditBookModal, setShowEditBookModal] = useState(false)
  const [showMemoLogs, setShowMemoLogs] = useState(false)
  const [showEditLogs, setShowEditLogs] = useState(false)
  const [editingLogIds, setEditingLogIds] = useState<string[]>([])
  const [editBookId, setEditBookId] = useState<string | null>(null)
  const [editSubject, setEditSubject] = useState('')
  const [editMinutes, setEditMinutes] = useState('')
  const [editDate, setEditDate] = useState(new Date())
  const [showEditDatePicker, setShowEditDatePicker] = useState(false)
  const [showEditNotes, setShowEditNotes] = useState(false)
  const [editingNoteLogIds, setEditingNoteLogIds] = useState<string[]>([])
  const [editNote, setEditNote] = useState('')
  const [showPastGoals, setShowPastGoals] = useState(false)
  const [materialRangeType, setMaterialRangeType] = useState<'day' | 'week' | 'month' | 'total'>('day')
  const [dayOffset, setDayOffset] = useState(0)
  const [weekOffset, setWeekOffset] = useState(1)
  const [monthOffset, setMonthOffset] = useState(1)
  const [chartRange, setChartRange] = useState<'7' | '30'>('7')
  const [chartOffset, setChartOffset] = useState(0)
  const [showShareBanner, setShowShareBanner] = useState(true)
  const [showRangeMenu, setShowRangeMenu] = useState(false)
  const [showOffsetMenu, setShowOffsetMenu] = useState(false)
  const [showWeekMenu, setShowWeekMenu] = useState(false)
  const [showMonthMenu, setShowMonthMenu] = useState(false)
  const [selectedDayData, setSelectedDayData] = useState<{
    date: string
    weekday: string
    totals: Record<string, number>
    totalMinutes: number
  } | null>(null)
  const [showAllMemoLogs, setShowAllMemoLogs] = useState(false)

  const normalizePickerDate = (date: Date) => {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12, 0, 0, 0)
  }

  const buildStartedAtFromDisplayedDate = (date: Date) => {
    // Simple: use the selected date at noon UTC
    const [year, month, day] = formatDateInput(date).split('-').map(Number)
    return new Date(Date.UTC(year, month - 1, day, 12, 0, 0, 0))
  }

  const loadData = async () => {
    setLoading(true)
    const [logsResult, booksResult, profileResult] = await Promise.all([
      supabase
        .from('study_logs')
        .select('*')
        .eq('user_id', userId)
        .order('started_at', { ascending: false }),
      supabase
        .from('reference_books')
        .select('*')
        .eq('user_id', userId)
        .is('deleted_at', null)
        .order('created_at', { ascending: false }),
      supabase
        .from('profiles')
        .select('*')
        .eq('user_id', userId)
        .single(),
    ])
    if (logsResult.error) {
      Alert.alert('読み込みエラー', logsResult.error.message)
    } else {
      setStudyLogs((logsResult.data || []) as StudyLog[])
    }
    if (booksResult.error) {
      Alert.alert('読み込みエラー', booksResult.error.message)
    } else {
      setReferenceBooks((booksResult.data || []) as ReferenceBook[])
    }
    if (!profileResult.error && profileResult.data) {
      setProfile(profileResult.data as Profile)

      // Initialize overrides from profile
      if (profileResult.data) {
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
    }
    setLoading(false)
  }

  useEffect(() => {
    loadData()
  }, [userId])

  useFocusEffect(
    useCallback(() => {
      loadData()
    }, [userId])
  )

  const todayStart = startOfDay()
  const weekStart = startOfWeek()
  const monthStart = startOfMonth()

  const summary = useMemo(() => {
    const today = studyLogs
      .filter((log) => rangeContains(new Date(log.started_at), todayStart, new Date(todayStart.getTime() + 86400000)))
      .reduce((sum, log) => sum + log.study_minutes, 0)
    const week = studyLogs
      .filter((log) => rangeContains(new Date(log.started_at), weekStart, new Date(weekStart.getTime() + 7 * 86400000)))
      .reduce((sum, log) => sum + log.study_minutes, 0)
    const month = studyLogs
      .filter((log) =>
        rangeContains(new Date(log.started_at), monthStart, new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 1))
      )
      .reduce((sum, log) => sum + log.study_minutes, 0)
    const total = studyLogs.reduce((sum, log) => sum + log.study_minutes, 0)
    return { today, week, month, total }
  }, [studyLogs, todayStart, weekStart, monthStart])


  const subjectTotals = useMemo(() => {
    const map = new Map<string, number>()
    studyLogs.forEach((log) => {
      const key = getLogDisplayName(log)
      map.set(key, (map.get(key) || 0) + log.study_minutes)
    })
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1])
  }, [studyLogs, referenceBooks])

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

  const getMinutesInRange = (start: Date, end: Date): number => {
    return studyLogs
      .filter((log) => {
        const logDate = new Date(log.started_at)
        return logDate >= start && logDate < end
      })
      .reduce((sum, log) => sum + log.study_minutes, 0)
  }

  const getDayRange = (offset: number) => {
    const start = getTodayStart()
    start.setDate(start.getDate() - offset)
    const end = new Date(start)
    end.setDate(end.getDate() + 1)
    return { start, end }
  }

  const getWeekRange = (offset: number) => {
    const start = getThisWeekStart()
    start.setDate(start.getDate() - 7 * offset)
    const end = new Date(start)
    end.setDate(end.getDate() + 7)
    return { start, end }
  }

  const getMonthRange = (offset: number) => {
    const start = getThisMonthStart()
    start.setMonth(start.getMonth() - offset)
    const end = new Date(start.getFullYear(), start.getMonth() + 1, 1)
    return { start, end }
  }



  const deleteGroup = async (group: typeof groupedEditLogs[0]) => {
    Alert.alert(
      '削除確認',
      `${group.studyDay}の${group.subject}の記録を削除しますか？`,
      [
        { text: 'キャンセル', style: 'cancel' },
        {
          text: '削除',
          style: 'destructive',
          onPress: async () => {
            try {
              const { error } = await supabase
                .from('study_logs')
                .delete()
                .in('id', group.ids)

              if (error) throw error

              await loadData()
              Alert.alert('削除完了', '学習記録を削除しました。')
            } catch (err) {
              console.error('Delete error:', err)
              Alert.alert('エラー', '削除に失敗しました。')
            }
          }
        }
      ]
    )
  }

  const handleManualSubmit = async () => {
    if (!manualBookId) {
      Alert.alert('入力エラー', '教材を選択してください')
      return
    }
    if (!manualDate) {
      Alert.alert('入力エラー', '日付を入力してください')
      return
    }
    if (!manualMinutes) {
      Alert.alert('入力エラー', '学習時間を入力してください')
      return
    }

    const minutes = parseInt(manualMinutes, 10)
    if (isNaN(minutes) || minutes < 1) {
      Alert.alert('入力エラー', '1分以上の学習時間を入力してください。')
      return
    }
    const selectedBook = referenceBooks.find((book) => book.id === manualBookId)
    const subject = selectedBook!.name

    const startedAt = buildStartedAtFromDisplayedDate(manualDate)

    const { data, error } = await supabase
      .from('study_logs')
      .insert({
        user_id: userId,
        subject,
        reference_book_id: manualBookId || null,
        study_minutes: minutes,
        started_at: startedAt.toISOString(),
        note: null,
      })
      .select()
      .single()
    if (error) {
      Alert.alert('保存エラー', error.message)
      return
    }

    setManualMinutes('')
    setManualDate(new Date())
    setManualBookId(null)
    setShowManualInput(false)
    await loadData()
    Alert.alert('保存完了', '学習記録を追加しました。')
  }


  const logsWithNotes = useMemo(() => {
    const merged = new Map<string, {
      subject: string
      study_minutes: number
      started_at: string
      note: string
      reference_book_id: string | null
    }>()

    studyLogs.forEach((log) => {
      if (!log.note || !log.note.trim()) return

      const studyDay = getStudyDay(new Date(log.started_at))
      const keyBase = log.reference_book_id ? `book:${log.reference_book_id}` : `subject:${log.subject}`
      const key = `${studyDay}::${keyBase}`

      const existing = merged.get(key)
      if (existing) {
        existing.study_minutes += log.study_minutes
        existing.note = `${existing.note}\n${log.note.trim()}`
      } else {
        merged.set(key, {
          subject: log.subject,
          study_minutes: log.study_minutes,
          started_at: log.started_at,
          note: log.note.trim(),
          reference_book_id: log.reference_book_id
        })
      }
    })

    return Array.from(merged.values()).sort((a, b) =>
      new Date(b.started_at).getTime() - new Date(a.started_at).getTime()
    )
  }, [studyLogs])

  const groupedEditLogs = useMemo(() => {
    const groups = new Map<
      string,
      {
        ids: string[]
        subject: string
        reference_book_id: string | null
        started_at: string
        study_minutes: number
        note: string | null
        studyDay: string
      }
    >()
    studyLogs.forEach((log) => {
      const studyDay = getStudyDay(new Date(log.started_at))
      const keyBase = log.reference_book_id ? `book:${log.reference_book_id}` : `subject:${log.subject}`
      const key = `${studyDay}::${keyBase}`
      const existing = groups.get(key)
      if (!existing) {
        groups.set(key, {
          ids: [log.id],
          subject: log.subject,
          reference_book_id: log.reference_book_id || null,
          started_at: log.started_at,
          study_minutes: log.study_minutes,
          note: log.note || null,
          studyDay,
        })
      } else {
        existing.ids.push(log.id)
        existing.study_minutes += log.study_minutes
        if (log.note && log.note.trim()) {
          existing.note = existing.note ? `${existing.note}\n\n${log.note.trim()}` : log.note.trim()
        }
      }
    })
    return Array.from(groups.values())
  }, [studyLogs])

  const startEditGroup = (group: (typeof groupedEditLogs)[number]) => {
    setEditingLogIds(group.ids)
    setEditBookId(group.reference_book_id)
    setEditSubject(group.subject)
    setEditMinutes(String(group.study_minutes))
    // Simple: use studyDay date directly
    const [year, month, day] = group.studyDay.split('-').map(Number)
    setEditDate(new Date(year, month - 1, day))
  }

  const cancelEditLog = () => {
    setEditingLogIds([])
    setEditBookId(null)
    setEditSubject('')
    setEditMinutes('')
    setEditDate(new Date())
  }

  const saveEditLog = async () => {
    if (editingLogIds.length === 0) return
    const minutes = parseInt(editMinutes, 10)
    if (isNaN(minutes) || minutes < 1) {
      Alert.alert('入力エラー', '1分以上の学習時間を入力してください。')
      return
    }
    const selectedBook = referenceBooks.find((b) => b.id === editBookId)
    const subject = selectedBook?.name?.trim() || editSubject.trim() || 'その他'

    const startedAt = buildStartedAtFromDisplayedDate(editDate).toISOString()
    const targetId = editingLogIds[0]
    const { error } = await supabase
      .from('study_logs')
      .update({
        subject,
        reference_book_id: editBookId || null,
        study_minutes: minutes,
        started_at: startedAt,
      })
      .eq('id', targetId)
    if (error) {
      Alert.alert('更新エラー', error.message)
      return
    }
    if (editingLogIds.length > 1) {
      const idsToDelete = editingLogIds.filter((id) => id !== targetId)
      await supabase.from('study_logs').delete().in('id', idsToDelete)
    }
    cancelEditLog()
    await loadData()
  }

  const deleteLogGroup = async (ids: string[]) => {
    await supabase.from('study_logs').delete().in('id', ids)
    await loadData()
  }

  const startEditNote = (group: (typeof groupedEditLogs)[number]) => {
    setEditingNoteLogIds(group.ids)
    setEditNote(group.note || '')
  }

  const cancelEditNote = () => {
    setEditingNoteLogIds([])
    setEditNote('')
  }

  const saveEditNote = async () => {
    if (editingNoteLogIds.length === 0) return

    // Update all logs in the group with the new note
    const { error } = await supabase
      .from('study_logs')
      .update({ note: editNote.trim() || null })
      .in('id', editingNoteLogIds)

    if (error) {
      Alert.alert('更新エラー', error.message)
      return
    }

    cancelEditNote()
    await loadData()
    Alert.alert('保存完了', '復習カードを更新しました。')
  }

  const buildShareText = () => {
    const stats = `今日の学習: ${formatMinutes(summary.today)} / 今週: ${formatMinutes(summary.week)} / 今月: ${formatMinutes(
      summary.month
    )} / 累計: ${formatMinutes(summary.total)}`
    return `${stats}\n\n#まなびAI #まなびAIのタイムライン`
  }

  const handleShare = async () => {
    // Debug: Simple alert to prove button works
    Alert.alert('確認', '共有処理を開始します')
    // console.log('=== handleShare called ===')

    const message = buildShareText()
    // Use intent URL directly as it is most reliable
    const url = `https://twitter.com/intent/tweet?text=${encodeURIComponent(message)}`

    // Attempt to open
    try {
      await Linking.openURL(url)
    } catch (e) {
      Alert.alert('エラー', 'Xアプリを開けませんでした')
    }
  }

  const getDailyTargetForDate = (date: Date) => {
    if (!profile) return 60
    const day = date.getDay()
    const isWeekend = day === 0 || day === 6
    const defaultTarget = isWeekend
      ? profile.weekend_target_minutes ?? 120
      : profile.weekday_target_minutes ?? 60
    const dateString = formatDateInput(date)
    if (profile.today_target_date === dateString && profile.today_target_minutes) {
      return profile.today_target_minutes
    }
    return defaultTarget
  }

  const getWeekTarget = (weekStart: Date) => {
    if (!profile) return 420
    const weekStartDateString = formatDateInput(weekStart)
    if (profile.week_target_date === weekStartDateString && profile.week_target_minutes) {
      return profile.week_target_minutes
    }
    let total = 0
    const cursor = new Date(weekStart)
    for (let i = 0; i < 7; i++) {
      total += getDailyTargetForDate(cursor)
      cursor.setDate(cursor.getDate() + 1)
    }
    return total
  }

  const getMonthTarget = (monthStart: Date) => {
    if (!profile) return 1800
    const monthStartDateString = formatDateInput(monthStart)
    if (profile.month_target_date === monthStartDateString && profile.month_target_minutes) {
      return profile.month_target_minutes
    }
    let total = 0
    const cursor = new Date(monthStart)
    const end = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 1)
    while (cursor < end) {
      total += getDailyTargetForDate(cursor)
      cursor.setDate(cursor.getDate() + 1)
    }
    return total
  }

  const logsRangeTotals = useMemo(() => {
    const range =
      materialRangeType === 'day'
        ? getDayRange(dayOffset)
        : materialRangeType === 'week'
          ? getWeekRange(weekOffset)
          : materialRangeType === 'month'
            ? getMonthRange(monthOffset)
            : null
    const filtered = range
      ? studyLogs.filter((log) => rangeContains(new Date(log.started_at), range.start, range.end))
      : studyLogs
    const map = new Map<string, number>()
    filtered.forEach((log) => {
      const key = getLogDisplayName(log)
      map.set(key, (map.get(key) || 0) + log.study_minutes)
    })
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1])
  }, [studyLogs, materialRangeType, dayOffset, weekOffset, monthOffset, referenceBooks])

  const selectedWeekMinutes = useMemo(() => {
    const range = getWeekRange(weekOffset)
    return getMinutesInRange(range.start, range.end)
  }, [studyLogs, weekOffset])

  const selectedMonthMinutes = useMemo(() => {
    const range = getMonthRange(monthOffset)
    return getMinutesInRange(range.start, range.end)
  }, [studyLogs, monthOffset])

  const chartData = useMemo(() => {
    const days = 7
    const subjects = Array.from(new Set(studyLogs.map((log) => getLogDisplayName(log))))
    return Array.from({ length: days }, (_, index) => {
      const date = new Date()
      date.setDate(date.getDate() - (days - 1 - index + chartOffset * days))
      const studyDay = getStudyDay(date)
      const start = getStudyDayDate(studyDay)
      const end = new Date(start)
      end.setDate(end.getDate() + 1)
      const totals: Record<string, number> = {}
      subjects.forEach((subject) => {
        totals[subject] = 0
      })
      studyLogs.forEach((log) => {
        const logDate = new Date(log.started_at)
        if (logDate >= start && logDate < end) {
          const key = getLogDisplayName(log)
          totals[key] = (totals[key] || 0) + log.study_minutes
        }
      })
      const totalMinutes = Object.values(totals).reduce((sum, value) => sum + value, 0)
      const weekdayShort = ['日', '月', '火', '水', '木', '金', '土'][date.getDay()]
      return {
        date: formatDateLabel(date),
        label: formatDateLabel(date),
        weekday: weekdayShort,
        totals,
        totalMinutes,
        subjects,
      }
    })
  }, [chartOffset, studyLogs, referenceBooks])

  const rangeTypeLabel = useMemo(() => {
    if (materialRangeType === 'day') return '一日'
    if (materialRangeType === 'week') return '一週間'
    if (materialRangeType === 'month') return '一ヶ月'
    return '総計'
  }, [materialRangeType])

  const offsetLabel = useMemo(() => {
    if (materialRangeType === 'day') {
      return dayOffset === 0 ? '今日' : `${dayOffset}日前`
    }
    if (materialRangeType === 'week') {
      return weekOffset === 1 ? '先週' : `${weekOffset}週間前`
    }
    if (materialRangeType === 'month') {
      return monthOffset === 1 ? '先月' : `${monthOffset}ヶ月前`
    }
    return '総計'
  }, [materialRangeType, dayOffset, weekOffset, monthOffset])

  const cycleRangeType = () => {
    setMaterialRangeType((prev) => {
      if (prev === 'day') return 'week'
      if (prev === 'week') return 'month'
      if (prev === 'month') return 'total'
      return 'day'
    })
    setDayOffset(0)
    setWeekOffset(0)
    setMonthOffset(0)
  }

  const cycleOffset = () => {
    if (materialRangeType === 'day') setDayOffset((prev) => (prev + 1) % 4)
    if (materialRangeType === 'week') setWeekOffset((prev) => (prev % 6) + 1)
    if (materialRangeType === 'month') setMonthOffset((prev) => (prev % 13) + 1)
  }

  const subjectColorMap = useMemo(() => {
    const map = new Map<string, string>()
    const subjects = Array.from(new Set(studyLogs.map((log) => getLogDisplayName(log))))
    subjects.forEach((subject, index) => {
      if (map.has(subject)) return
      const hash = Array.from(subject).reduce((acc, ch) => acc + ch.charCodeAt(0), 0)
      const paletteColor = legendColors[index % legendColors.length]
      const fallbackColor = `hsl(${(hash * 137.508) % 360}, 70%, 45%)`
      map.set(subject, paletteColor || fallbackColor)
    })
    return map
  }, [studyLogs, referenceBooks])

  const maxChartMinutes = Math.max(1, ...chartData.map((item) => item.totalMinutes))
  const chartSubjects = useMemo(() => {
    return Array.from(new Set(studyLogs.map((log) => getLogDisplayName(log))))
  }, [studyLogs, referenceBooks])

  const rangeOptions: { label: string; value: 'day' | 'week' | 'month' | 'total' }[] = [
    { label: '一日', value: 'day' },
    { label: '1週間', value: 'week' },
    { label: '1ヶ月', value: 'month' },
    { label: '総累計', value: 'total' },
  ]

  const offsetOptions = useMemo(() => {
    if (materialRangeType === 'day') {
      return [
        { label: '今日', value: 0 },
        { label: '昨日', value: 1 },
        { label: '2日前', value: 2 },
        { label: '3日前', value: 3 },
        { label: '4日前', value: 4 },
        { label: '5日前', value: 5 },
        { label: '6日前', value: 6 },
        { label: '7日前', value: 7 },
      ]
    }
    if (materialRangeType === 'week') {
      return Array.from({ length: 6 }, (_, index) => ({
        label: index === 0 ? '先週' : `${index + 1}週間前`,
        value: index + 1,
      }))
    }
    if (materialRangeType === 'month') {
      return Array.from({ length: 13 }, (_, index) => ({
        label: index === 0 ? '先月' : `${index + 1}ヶ月前`,
        value: index + 1,
      }))
    }
    return []
  }, [materialRangeType])
  const weekOptions = Array.from({ length: 6 }, (_, index) => ({
    label: index === 0 ? '先週' : `${index + 1}週間前`,
    value: index + 1,
  }))
  const monthOptions = Array.from({ length: 13 }, (_, index) => ({
    label: index === 0 ? '先月' : `${index + 1}ヶ月前`,
    value: index + 1,
  }))

  const totalMinutesForDonut = logsRangeTotals.reduce((sum, [, minutes]) => sum + minutes, 0)
  const donutData = logsRangeTotals.map(([subject, minutes], index) => ({
    subject,
    minutes,
    color: subjectColorMap.get(subject) || legendColors[index % legendColors.length],
    percent: totalMinutesForDonut > 0 ? Math.round((minutes / totalMinutesForDonut) * 100) : 0,
  }))

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={80}
    >
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>学習時間</Text>
          {loading ? (
            <Text style={styles.mutedText}>読み込み中...</Text>
          ) : (
            <View style={styles.summaryRow}>
              {[
                { label: '今日', value: summary.today },
                { label: '今週', value: summary.week },
                { label: '今月', value: summary.month },
                { label: '総計', value: summary.total },
              ].map((item) => (
                <View key={item.label} style={styles.summaryCard}>
                  <Text style={styles.summaryValue}>{formatMinutes(item.value)}</Text>
                  <Text style={styles.summaryLabel}>{item.label}</Text>
                </View>
              ))}
            </View>
          )}
          <View style={styles.smallCardRow}>
            <View style={styles.smallCard}>
              <View style={styles.smallCardHeader}>
                <Text style={styles.smallCardLabel}>先週</Text>
                <View style={[styles.selectWrap, styles.selectWrapShrink]}>
                  <Pressable style={styles.smallSelectButton} onPress={() => setShowWeekMenu((prev) => !prev)}>
                    <Text style={styles.smallSelectText} numberOfLines={1}>{weekOffset === 1 ? '先週' : `${weekOffset - 1}週間前`}</Text>
                    <Ionicons name="chevron-down" size={14} color="#334155" />
                  </Pressable>
                  {showWeekMenu && (
                    <View style={[styles.selectMenu, styles.selectMenuSmall]}>
                      {weekOptions.map((option) => (
                        <Pressable
                          key={option.value}
                          style={styles.selectMenuItem}
                          onPress={() => {
                            setWeekOffset(option.value)
                            setShowWeekMenu(false)
                          }}
                        >
                          <Text style={styles.selectMenuText}>{option.label}</Text>
                        </Pressable>
                      ))}
                    </View>
                  )}
                </View>
              </View>
              <View style={styles.smallCardValueWrap}>
                <Text style={styles.smallCardValue}>{formatMinutes(selectedWeekMinutes)}</Text>
              </View>
            </View>
            <View style={styles.smallCard}>
              <View style={styles.smallCardHeader}>
                <Text style={styles.smallCardLabel}>先月</Text>
                <View style={[styles.selectWrap, styles.selectWrapShrink]}>
                  <Pressable style={styles.smallSelectButton} onPress={() => setShowMonthMenu((prev) => !prev)}>
                    <Text style={styles.smallSelectText} numberOfLines={1}>{monthOffset === 1 ? '先月' : `${monthOffset - 1}ヶ月前`}</Text>
                    <Ionicons name="chevron-down" size={14} color="#334155" />
                  </Pressable>
                  {showMonthMenu && (
                    <View style={[styles.selectMenu, styles.selectMenuSmall, styles.selectMenuRight]}>
                      {monthOptions.map((option) => (
                        <Pressable
                          key={option.value}
                          style={styles.selectMenuItem}
                          onPress={() => {
                            setMonthOffset(option.value)
                            setShowMonthMenu(false)
                          }}
                        >
                          <Text style={styles.selectMenuText}>{option.label}</Text>
                        </Pressable>
                      ))}
                    </View>
                  )}
                </View>
              </View>
              <View style={styles.smallCardValueWrap}>
                <Text style={styles.smallCardValue}>{formatMinutes(selectedMonthMinutes)}</Text>
              </View>
            </View>
          </View>
        </View>

        {showShareBanner && (
          <View style={styles.shareBanner}>
            <Pressable style={styles.row} onPress={handleShare}>
              <Ionicons name="share-social-outline" size={18} color="#2563eb" />
              <Text style={styles.shareText}>学習記録を共有</Text>
            </Pressable>
            <Pressable style={styles.closeButton} onPress={() => setShowShareBanner(false)}>
              <Ionicons name="close" size={16} color="#334155" />
            </Pressable>
          </View>
        )}

        <View style={styles.card}>
          <View style={styles.headerRow}>
            <View style={styles.row}>
              <Pressable
                style={styles.navButton}
                onPress={() => setChartOffset((prev) => prev + 1)}
              >
                <Ionicons name="chevron-back" size={16} color="#334155" />
              </Pressable>
              <Text style={styles.sectionTitle}>過去7日</Text>
              <Pressable
                style={[styles.navButton, chartOffset === 0 && styles.navButtonDisabled]}
                onPress={() => setChartOffset((prev) => Math.max(0, prev - 1))}
                disabled={chartOffset === 0}
              >
                <Ionicons name="chevron-forward" size={16} color={chartOffset === 0 ? '#cbd5e1' : '#334155'} />
              </Pressable>
            </View>

          </View>
          <View style={styles.chartArea}>
            <View style={styles.chartRow}>
              <View style={styles.yAxis}>
                <Text style={styles.yAxisTitle}>時間</Text>
                <Text style={styles.yAxisLabel}>{formatMinutes(maxChartMinutes)}</Text>
                <Text style={styles.yAxisLabel}>{formatMinutes(Math.round(maxChartMinutes / 2))}</Text>
                <Text style={styles.yAxisLabel}>0</Text>
              </View>
              <View style={styles.chartBody}>
                <View style={styles.chartBars}>
                  {chartData.map((item, index) => {
                    const segments = chartSubjects
                      .map((subject) => ({
                        subject,
                        minutes: item.totals[subject] || 0,
                        color: subjectColorMap.get(subject),
                      }))
                      .filter((segment) => segment.minutes > 0)
                    return (
                      <Pressable key={`${item.label}-${index}`} style={styles.chartBarItem} onPress={() => setSelectedDayData(item)}>
                        <View style={styles.chartStack}>
                          {segments.map((segment) => {
                            return (
                              <View
                                key={`${item.label}-${segment.subject}`}
                                style={[
                                  styles.chartBarSegment,
                                  {
                                    height: Math.round((segment.minutes / maxChartMinutes) * 120),
                                    backgroundColor: segment.color,
                                  },
                                ]}
                              />
                            )
                          })}
                        </View>
                      </Pressable>
                    )
                  })}
                </View>
                <View style={styles.chartLabels}>
                  {chartData.map((item, index) => (
                    <View key={`${item.label}-label-${index}`} style={styles.chartLabelContainer}>
                      <Text style={styles.chartLabel}>{item.label}</Text>
                      <Text style={styles.chartWeekday}>{item.weekday}</Text>
                    </View>
                  ))}
                </View>
              </View>
            </View>
            <View style={styles.chartLegend}>
              {chartSubjects.map((subject) => (
                <View key={`legend-${subject}`} style={styles.legendItem}>
                  <View style={[styles.legendDot, { backgroundColor: subjectColorMap.get(subject) }]} />
                  <Text style={styles.legendText}>{subject}</Text>
                </View>
              ))}
            </View>
            {selectedDayData && (
              <View style={styles.chartDetailBox}>
                <Text style={styles.chartDetailDate}>
                  日付: {selectedDayData.date} / 合計: {formatMinutes(selectedDayData.totalMinutes)}
                </Text>
                {Object.entries(selectedDayData.totals)
                  .filter(([, minutes]) => minutes > 0)
                  .sort(([, a], [, b]) => b - a)
                  .map(([subject, minutes]) => (
                    <Text
                      key={subject}
                      style={[
                        styles.chartDetailText,
                        { color: subjectColorMap.get(subject) || '#0f172a' }
                      ]}
                    >
                      {subject}：{formatMinutes(minutes)}
                    </Text>
                  ))}
              </View>
            )}
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>教材別の学習時間</Text>
          <View style={styles.rangeControlRow}>
            <View style={styles.rangeControl}>
              <Text style={styles.rangeControlLabel}>表示期間</Text>
              <View style={styles.selectWrap}>
                <Pressable style={styles.selectButton} onPress={() => setShowRangeMenu((prev) => !prev)}>
                  <Text style={styles.selectButtonText}>{rangeTypeLabel}</Text>
                  <Ionicons name="chevron-down" size={14} color="#334155" />
                </Pressable>
                {showRangeMenu && (
                  <View style={styles.selectMenu}>
                    {rangeOptions.map((option) => (
                      <Pressable
                        key={option.value}
                        style={styles.selectMenuItem}
                        onPress={() => {
                          setMaterialRangeType(option.value)
                          setDayOffset(0)
                          setWeekOffset(option.value === 'week' ? 1 : 0)
                          setMonthOffset(option.value === 'month' ? 1 : 0)
                          setShowRangeMenu(false)
                        }}
                      >
                        <Text style={styles.selectMenuText}>{option.label}</Text>
                      </Pressable>
                    ))}
                  </View>
                )}
              </View>
            </View>
            {materialRangeType !== 'total' && (
              <View style={styles.selectWrap}>
                <Pressable style={styles.selectButton} onPress={() => setShowOffsetMenu((prev) => !prev)}>
                  <Text style={styles.selectButtonText}>{offsetLabel}</Text>
                  <Ionicons name="chevron-down" size={14} color="#334155" />
                </Pressable>
                {showOffsetMenu && (
                  <View style={[styles.selectMenu, styles.selectMenuRight]}>
                    {offsetOptions.map((option) => (
                      <Pressable
                        key={option.label}
                        style={styles.selectMenuItem}
                        onPress={() => {
                          if (materialRangeType === 'day') setDayOffset(option.value)
                          if (materialRangeType === 'week') setWeekOffset(option.value)
                          if (materialRangeType === 'month') setMonthOffset(option.value)
                          setShowOffsetMenu(false)
                        }}
                      >
                        <Text style={styles.selectMenuText}>{option.label}</Text>
                      </Pressable>
                    ))}
                  </View>
                )}
              </View>
            )}
          </View>
          {logsRangeTotals.length === 0 ? (
            <Text style={styles.mutedText}>学習記録がありません</Text>
          ) : (
            <>
              <View style={styles.donutWrap}>
                <Svg width={220} height={220}>
                  <G rotation={-90} origin="110, 110">
                    {donutData.reduce<{ offset: number; nodes: React.ReactElement[] }>(
                      (acc, item, idx) => {
                        const radius = 70
                        const circumference = 2 * Math.PI * radius
                        const dash = (item.minutes / Math.max(1, totalMinutesForDonut)) * circumference
                        const gap = circumference - dash
                        acc.nodes.push(
                          <Circle
                            key={`${item.subject}-${idx}`}
                            cx="110"
                            cy="110"
                            r={radius}
                            stroke={item.color}
                            strokeWidth={26}
                            strokeDasharray={`${dash} ${gap}`}
                            strokeDashoffset={-acc.offset}
                            strokeLinecap="round"
                            fill="transparent"
                          />
                        )
                        acc.offset += dash
                        return acc
                      },
                      { offset: 0, nodes: [] }
                    ).nodes}
                  </G>
                </Svg>
              </View>
              {donutData.map((item) => (
                <View key={item.subject} style={styles.donutRow}>
                  <View style={styles.legendItem}>
                    <View style={[styles.legendDot, { backgroundColor: item.color }]} />
                    <Text style={styles.legendText}>{item.subject}</Text>
                  </View>
                  <Text style={styles.donutValue}>
                    {formatMinutes(item.minutes)} ({item.percent}%)
                  </Text>
                </View>
              ))}
            </>
          )}
        </View>

        <View style={styles.card}>
          <View style={styles.headerRow}>
            <View>
              <Text style={styles.sectionTitle}>学習記録の入力</Text>
              <Text style={styles.sectionSubtitle}>今日や過去の学習内容をまとめて入力できます</Text>
            </View>
            <Pressable style={styles.plusButton} onPress={() => setShowManualInput((prev) => !prev)}>
              <Ionicons name={showManualInput ? 'remove' : 'add'} size={18} color="#334155" />
            </Pressable>
          </View>
          {showManualInput && (
            <>
              <View style={styles.inputGroup}>
                <Text style={styles.label}>教材</Text>
                <Pressable
                  style={styles.selectTrigger}
                  onPress={() => setShowBookModal((prev) => !prev)}
                >
                  <Text style={styles.selectTriggerText}>
                    {manualBookId
                      ? referenceBooks.find((b) => b.id === manualBookId)?.name
                      : '教材を選択'}
                  </Text>
                  <Ionicons name="chevron-down" size={20} color="#64748b" />
                </Pressable>
                {showBookModal && (
                  <View style={styles.inlineDropdown}>
                    {referenceBooks.map((item) => (
                      <Pressable
                        key={item.id}
                        style={styles.dropdownItem}
                        onPress={() => {
                          setManualBookId(item.id || null)
                          setShowBookModal(false)
                        }}
                      >
                        <Text
                          style={[
                            styles.dropdownItemText,
                            manualBookId === (item.id || null) && styles.dropdownItemTextSelected,
                          ]}
                        >
                          {item.name}
                        </Text>
                        {manualBookId === (item.id || null) && (
                          <Ionicons name="checkmark" size={20} color="#2563eb" />
                        )}
                      </Pressable>
                    ))}
                  </View>
                )}
              </View>
              <View style={styles.inputGroup}>
                <Text style={styles.label}>学習時間（分）</Text>
                <TextInput
                  style={styles.input}
                  keyboardType="numeric"
                  value={manualMinutes}
                  onChangeText={setManualMinutes}
                  placeholder="60"
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>学習日</Text>
                <TouchableOpacity
                  style={styles.input}
                  onPress={() => setShowManualDatePicker(true)}
                >
                  <Text>{formatDateInput(manualDate)}</Text>
                </TouchableOpacity>
                {showManualDatePicker && (
                  <DateTimePicker
                    value={manualDate}
                    mode="date"
                    locale="ja-JP"
                    display={RNPlatform.OS === 'ios' ? 'inline' : 'calendar'}
                    onChange={(event, selectedDate) => {
                      if (selectedDate) {
                        setManualDate(normalizePickerDate(selectedDate))
                      }
                      setShowManualDatePicker(false)
                    }}
                  />
                )}
              </View>


              <Pressable style={styles.primaryButton} onPress={handleManualSubmit}>
                <Text style={styles.primaryButtonText}>送信</Text>
              </Pressable>
            </>
          )}
        </View>

        <View style={styles.card}>
          <View style={styles.headerRow}>
            <View>
              <Text style={styles.sectionTitle}>学習内容</Text>
              <Text style={styles.sectionSubtitle}>入力した内容をあとから見返せます</Text>
            </View>
            <Pressable style={styles.plusButton} onPress={() => setShowMemoLogs((prev) => !prev)}>
              <Ionicons name={showMemoLogs ? 'remove' : 'add'} size={18} color="#334155" />
            </Pressable>
          </View>
          {showMemoLogs && (
            <>
              {logsWithNotes.length === 0 ? (
                <Text style={styles.mutedText}>まだメモがありません</Text>
              ) : (
                <ScrollView style={{ maxHeight: 600 }} nestedScrollEnabled>
                  {logsWithNotes.map((log, index) => (
                    <View key={`${log.subject}-${log.started_at}-${index}`} style={styles.logItem}>
                      <View>
                        <Text style={styles.logTitle}>
                          {log.subject} / {formatMinutes(log.study_minutes)}
                        </Text>
                        <Text style={styles.mutedText}>{getStudyDay(new Date(log.started_at))}</Text>
                        <Text style={styles.noteText}>{log.note}</Text>
                      </View>
                    </View>
                  ))}
                </ScrollView>
              )}
            </>
          )}
        </View>

        <View style={styles.card}>
          <View style={styles.headerRow}>
            <View>
              <Text style={styles.sectionTitle}>学習記録の修正</Text>
              <Text style={styles.sectionSubtitle}>直近の記録を編集・削除できます</Text>
            </View>
            <Pressable style={styles.plusButton} onPress={() => setShowEditLogs((prev) => !prev)}>
              <Ionicons name={showEditLogs ? 'remove' : 'add'} size={18} color="#334155" />
            </Pressable>
          </View>
          {showEditLogs && (
            <>
              {groupedEditLogs.length === 0 && <Text style={styles.mutedText}>学習記録がありません</Text>}
              <ScrollView style={{ maxHeight: 600 }} nestedScrollEnabled>
                {groupedEditLogs.slice(0, 6).map((group) => (
                  <View key={`${group.studyDay}-${group.subject}-${group.reference_book_id || 'none'}`} style={styles.logItem}>
                    {editingLogIds.length > 0 && editingLogIds.includes(group.ids[0]) ? (
                      <View>
                        <Text style={styles.label}>教材</Text>
                        <Pressable
                          style={styles.selectTrigger}
                          onPress={() => setShowEditBookModal((prev) => !prev)}
                        >
                          <Text style={styles.selectTriggerText}>
                            {editBookId
                              ? referenceBooks.find((b) => b.id === editBookId)?.name
                              : '教材を選択'}
                          </Text>
                          <Ionicons name="chevron-down" size={20} color="#64748b" />
                        </Pressable>
                        {showEditBookModal && (
                          <View style={styles.inlineDropdown}>
                            {referenceBooks.map((item) => (
                              <Pressable
                                key={item.id}
                                style={styles.dropdownItem}
                                onPress={() => {
                                  setEditBookId(item.id || null)
                                  setShowEditBookModal(false)
                                }}
                              >
                                <Text
                                  style={[
                                    styles.dropdownItemText,
                                    editBookId === (item.id || null) && styles.dropdownItemTextSelected,
                                  ]}
                                >
                                  {item.name}
                                </Text>
                                {editBookId === (item.id || null) && (
                                  <Ionicons name="checkmark" size={20} color="#2563eb" />
                                )}
                              </Pressable>
                            ))}
                          </View>
                        )}
                        <Text style={styles.label}>科目名（自由入力）</Text>
                        <TextInput style={styles.input} value={editSubject} onChangeText={setEditSubject} />
                        <Text style={styles.label}>学習時間（分）</Text>
                        <TextInput style={styles.input} value={editMinutes} onChangeText={setEditMinutes} keyboardType="numeric" />
                        <Text style={styles.label}>学習日</Text>
                        <TouchableOpacity
                          style={styles.input}
                          onPress={() => setShowEditDatePicker(true)}
                        >
                          <Text>{formatDateInput(editDate)}</Text>
                        </TouchableOpacity>
                        {showEditDatePicker && (
                          <View style={{ width: '100%', overflow: 'hidden' }}>
                            <View style={{ transform: [{ scale: 0.85 }], transformOrigin: 'left top' }}>
                              <DateTimePicker
                                value={editDate}
                                mode="date"
                                locale="ja-JP"
                                display={RNPlatform.OS === 'ios' ? 'inline' : 'calendar'}
                                onChange={(event, selectedDate) => {
                                  if (selectedDate) setEditDate(normalizePickerDate(selectedDate))
                                  setShowEditDatePicker(false)
                                }}
                              />
                            </View>
                          </View>
                        )}

                        <View style={styles.row}>
                          <Pressable style={styles.primaryButton} onPress={saveEditLog}>
                            <Text style={styles.primaryButtonText}>保存</Text>
                          </Pressable>
                          <Pressable style={styles.outlineButton} onPress={cancelEditLog}>
                            <Text style={styles.outlineButtonText}>キャンセル</Text>
                          </Pressable>
                          <Pressable style={styles.deleteButton} onPress={() => deleteLogGroup(group.ids)}>
                            <Text style={styles.deleteText}>削除</Text>
                          </Pressable>
                        </View>
                      </View>
                    ) : (
                      <View>
                        <Text style={styles.mutedText}>
                          {group.studyDay}
                        </Text>
                        <Text style={styles.logTitle}>
                          {group.subject} / {formatMinutes(group.study_minutes)}
                        </Text>
                        <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                          <Pressable style={styles.outlineButton} onPress={() => startEditGroup(group)}>
                            <Text style={styles.outlineButtonText}>編集</Text>
                          </Pressable>
                          <Pressable
                            style={[styles.outlineButton, { borderColor: '#dc2626', backgroundColor: '#dc2626' }]}
                            onPress={() => deleteGroup(group)}
                          >
                            <Text style={[styles.outlineButtonText, { color: '#ffffff' }]}>削除</Text>
                          </Pressable>
                        </View>
                      </View>
                    )}
                  </View>
                ))}
              </ScrollView>
            </>
          )}
        </View>

        <View style={styles.card}>
          <View style={styles.headerRow}>
            <View>
              <Text style={styles.sectionTitle}>復習カードの修正</Text>
              <Text style={styles.sectionSubtitle}>復習カードの内容を編集できます</Text>
            </View>
            <Pressable style={styles.plusButton} onPress={() => setShowEditNotes((prev) => !prev)}>
              <Ionicons name={showEditNotes ? 'remove' : 'add'} size={18} color="#334155" />
            </Pressable>
          </View>
          {showEditNotes && (
            <>
              {groupedEditLogs.filter(g => g.note).length === 0 && <Text style={styles.mutedText}>復習カードがありません</Text>}
              <ScrollView style={{ maxHeight: 600 }} nestedScrollEnabled>
                {groupedEditLogs.filter(g => g.note).slice(0, 6).map((group) => {
                  const isEditing = editingNoteLogIds.some(id => group.ids.includes(id))
                  return (
                    <View key={`${group.studyDay}-${group.subject}-${group.reference_book_id || 'none'}-note`} style={styles.logItem}>
                      {isEditing ? (
                        <View>
                          <Text style={styles.mutedText}>{group.studyDay}</Text>
                          <Text style={styles.logTitle}>
                            {group.subject} / {formatMinutes(group.study_minutes)}
                          </Text>
                          <Text style={styles.label}>復習カード内容</Text>
                          <TextInput
                            style={[styles.input, { minHeight: 120, textAlignVertical: 'top', backgroundColor: '#f8fafc', padding: 12 }]}
                            value={editNote}
                            onChangeText={setEditNote}
                            multiline
                            autoFocus
                            placeholder="復習カードの内容を入力..."
                          />
                          <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                            <Pressable style={styles.primaryButton} onPress={saveEditNote}>
                              <Text style={styles.primaryButtonText}>保存</Text>
                            </Pressable>
                            <Pressable style={styles.outlineButton} onPress={cancelEditNote}>
                              <Text style={styles.outlineButtonText}>キャンセル</Text>
                            </Pressable>
                          </View>
                        </View>
                      ) : (
                        <View>
                          <Text style={styles.mutedText}>{group.studyDay}</Text>
                          <Text style={styles.logTitle}>
                            {group.subject} / {formatMinutes(group.study_minutes)}
                          </Text>
                          {group.note && <Text style={styles.noteText}>{group.note}</Text>}
                          <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                            <Pressable style={styles.outlineButton} onPress={() => startEditNote(group)}>
                              <Text style={styles.outlineButtonText}>編集</Text>
                            </Pressable>
                          </View>
                        </View>
                      )}
                    </View>
                  )
                })}
              </ScrollView>
            </>
          )}
        </View>

        {profile && (
          <View style={styles.card}>
            <View style={styles.headerRow}>
              <View>
                <Text style={styles.sectionTitle}>過去の目標達成状況</Text>
                <Text style={styles.sectionSubtitle}>過去の日・週・月の目標達成状況を確認</Text>
              </View>
              <Pressable style={styles.plusButton} onPress={() => setShowPastGoals((prev) => !prev)}>
                <Ionicons name={showPastGoals ? 'remove' : 'add'} size={18} color="#334155" />
              </Pressable>
            </View>
            {showPastGoals && (
              <>
                {[1, 2, 3, 4, 5].map((i) => {
                  const date = new Date()
                  date.setDate(date.getDate() - i)
                  const target = getDailyTargetForDate(date)
                  const dayStart = new Date(date)
                  dayStart.setHours(3, 0, 0, 0)
                  const dayEnd = new Date(dayStart)
                  dayEnd.setDate(dayEnd.getDate() + 1)
                  const actual = getMinutesInRange(dayStart, dayEnd)
                  const progress = Math.min(100, Math.round((actual / Math.max(1, target)) * 100))
                  return (
                    <View key={`past-day-${i}`} style={styles.goalItem}>
                      <Text style={styles.mutedText}>{date.toLocaleDateString('ja-JP')}</Text>
                      <Text style={styles.goalText}>
                        {formatMinutes(actual)} / {formatMinutes(target)}（達成率 {progress}%）
                      </Text>
                      <ProgressBar progress={progress} />
                    </View>
                  )
                })}
                {[1, 2, 3].map((i) => {
                  const weekStart = getThisWeekStart()
                  weekStart.setDate(weekStart.getDate() - 7 * i)
                  const weekEnd = new Date(weekStart)
                  weekEnd.setDate(weekEnd.getDate() + 7)
                  const target = getWeekTarget(weekStart)
                  const actual = getMinutesInRange(weekStart, weekEnd)
                  const progress = Math.min(100, Math.round((actual / Math.max(1, target)) * 100))
                  return (
                    <View key={`past-week-${i}`} style={styles.goalItem}>
                      <Text style={styles.mutedText}>{formatDateLabel(weekStart)} 週</Text>
                      <Text style={styles.goalText}>
                        {formatMinutes(actual)} / {formatMinutes(target)}（達成率 {progress}%）
                      </Text>
                      <ProgressBar progress={progress} />
                    </View>
                  )
                })}
                {[1, 2, 3].map((i) => {
                  const monthStart = getThisMonthStart()
                  monthStart.setMonth(monthStart.getMonth() - i)
                  const monthEnd = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 1)
                  const target = getMonthTarget(monthStart)
                  const actual = getMinutesInRange(monthStart, monthEnd)
                  const progress = Math.min(100, Math.round((actual / Math.max(1, target)) * 100))
                  return (
                    <View key={`past-month-${i}`} style={styles.goalItem}>
                      <Text style={styles.mutedText}>
                        {monthStart.getFullYear()}年{monthStart.getMonth() + 1}月
                      </Text>
                      <Text style={styles.goalText}>
                        {formatMinutes(actual)} / {formatMinutes(target)}（達成率 {progress}%）
                      </Text>
                      <ProgressBar progress={progress} />
                    </View>
                  )
                })}
              </>
            )}
          </View>
        )}

        {/* --- Home Screen Features (Merged) --- */}
        <View style={styles.divider} />

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>現在の目標達成状況</Text>
          <Text style={styles.sectionSubtitle}>今日の頑張りをチェック！</Text>

          <View style={[styles.mascotRow, { marginTop: 16, marginBottom: 16 }]}>
            <View style={styles.mascotCircle}>
              <Image source={{ uri: `${(process.env.EXPO_PUBLIC_API_BASE_URL || 'https://ai-yobikou.vercel.app').replace(/\/$/, '')}/images/mascot.png` }} style={styles.mascotImage} />
            </View>
            <View style={styles.balloon}>
              <Text style={styles.balloonText}>{
                (() => {
                  const streak = calculateStreak(studyLogs)
                  if (streak.currentStreak >= 7) return '🔥 最高！連続学習が続いてるよ！'
                  if (streak.currentStreak >= 3) return '💪 いい感じ！このペースを維持しよう！'
                  if (streak.currentStreak >= 1) return '✨ 今日も学習できたね！'
                  return '📚 今日からスタート！一緒に頑張ろう！'
                })()
              }</Text>
            </View>
          </View>

          {/* Today Target */}
          <View style={styles.targetCard}>
            <Text style={styles.targetCardTitle}>今日の目標</Text>
            <ProgressRow label="目標" value={`${(() => {
              if (!profile) return 60
              const today = new Date()
              const isWeekend = today.getDay() === 0 || today.getDay() === 6
              const defaultTarget = isWeekend ? profile.weekend_target_minutes ?? 120 : profile.weekday_target_minutes ?? 60
              const todayStart = getTodayStart()
              const todayStr = `${todayStart.getUTCFullYear()}-${String(todayStart.getUTCMonth() + 1).padStart(2, '0')}-${String(todayStart.getUTCDate()).padStart(2, '0')}`
              if (profile.today_target_date === todayStr && profile.today_target_minutes) return profile.today_target_minutes
              return defaultTarget
            })()}分`} />
            <ProgressBar progress={Math.min(100, Math.round((() => {
              const todayStart = getTodayStart()
              const todayStr = `${todayStart.getUTCFullYear()}-${String(todayStart.getUTCMonth() + 1).padStart(2, '0')}-${String(todayStart.getUTCDate()).padStart(2, '0')}`
              const todayMinutes = studyLogs.reduce((sum, log) => {
                const logDay = getStudyDay(new Date(log.started_at))
                return logDay === todayStr ? sum + log.study_minutes : sum
              }, 0)
              const target = (() => {
                if (!profile) return 60
                const today = new Date()
                const isWeekend = today.getDay() === 0 || today.getDay() === 6
                const defaultTarget = isWeekend ? profile.weekend_target_minutes ?? 120 : profile.weekday_target_minutes ?? 60
                const todayStart2 = getTodayStart()
                const todayStr2 = `${todayStart2.getUTCFullYear()}-${String(todayStart2.getUTCMonth() + 1).padStart(2, '0')}-${String(todayStart2.getUTCDate()).padStart(2, '0')}`
                if (profile.today_target_date === todayStr2 && profile.today_target_minutes) return profile.today_target_minutes
                return defaultTarget
              })()
              return (todayMinutes / Math.max(1, target)) * 100
            })()))} />
            <View style={styles.inlineRow}>
              <View style={styles.flex}>
                <Text style={styles.smallLabel}>今日の目標を変更</Text>
                <TextInput
                  style={styles.input}
                  placeholder="目標(分)"
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

          {/* Week Target */}
          <View style={styles.targetCard}>
            <Text style={styles.targetCardTitle}>今週の目標</Text>
            <ProgressRow label="目標" value={`${(() => {
              if (!profile) return 420
              const weekStart = getThisWeekStart()
              const weekStr = `${weekStart.getUTCFullYear()}-${String(weekStart.getUTCMonth() + 1).padStart(2, '0')}-${String(weekStart.getUTCDate()).padStart(2, '0')}`
              if (profile.week_target_date === weekStr && profile.week_target_minutes) return profile.week_target_minutes
              return (profile.weekday_target_minutes ?? 60) * 5 + (profile.weekend_target_minutes ?? 120) * 2
            })()}分`} />
            <ProgressBar progress={Math.min(100, Math.round((() => {
              const weekStart = getThisWeekStart()
              const weekStr = `${weekStart.getUTCFullYear()}-${String(weekStart.getUTCMonth() + 1).padStart(2, '0')}-${String(weekStart.getUTCDate()).padStart(2, '0')}`
              const weekMinutes = studyLogs.reduce((sum, log) => {
                const logDay = getStudyDay(new Date(log.started_at))
                return logDay >= weekStr ? sum + log.study_minutes : sum
              }, 0)
              const target = (() => {
                if (!profile) return 420
                const weekStart2 = getThisWeekStart()
                const weekStr2 = `${weekStart2.getUTCFullYear()}-${String(weekStart2.getUTCMonth() + 1).padStart(2, '0')}-${String(weekStart2.getUTCDate()).padStart(2, '0')}`
                if (profile.week_target_date === weekStr2 && profile.week_target_minutes) return profile.week_target_minutes
                return (profile.weekday_target_minutes ?? 60) * 5 + (profile.weekend_target_minutes ?? 120) * 2
              })()
              return (weekMinutes / Math.max(1, target)) * 100
            })()))} />
            <View style={styles.inlineRow}>
              <View style={styles.flex}>
                <Text style={styles.smallLabel}>今週の目標を変更</Text>
                <TextInput
                  style={styles.input}
                  placeholder="目標(分)"
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

          {/* Month Target */}
          <View style={styles.targetCard}>
            <Text style={styles.targetCardTitle}>今月の目標</Text>
            <ProgressRow label="目標" value={`${(() => {
              if (!profile) return 1800
              const monthStart = getThisMonthStart()
              const monthStr = `${monthStart.getUTCFullYear()}-${String(monthStart.getUTCMonth() + 1).padStart(2, '0')}-${String(monthStart.getUTCDate()).padStart(2, '0')}`
              if (profile.month_target_date === monthStr && profile.month_target_minutes) return profile.month_target_minutes
              const daily = profile.weekday_target_minutes ?? 60
              const weekend = profile.weekend_target_minutes ?? 120
              return daily * 22 + weekend * 8
            })()}分`} />
            <ProgressBar progress={Math.min(100, Math.round((() => {
              const monthStart = getThisMonthStart()
              const monthStr = `${monthStart.getUTCFullYear()}-${String(monthStart.getUTCMonth() + 1).padStart(2, '0')}-${String(monthStart.getUTCDate()).padStart(2, '0')}`
              const monthMinutes = studyLogs.reduce((sum, log) => {
                const logDay = getStudyDay(new Date(log.started_at))
                return logDay >= monthStr ? sum + log.study_minutes : sum
              }, 0)
              const target = (() => {
                if (!profile) return 1800
                const monthStart2 = getThisMonthStart()
                const monthStr2 = `${monthStart2.getUTCFullYear()}-${String(monthStart2.getUTCMonth() + 1).padStart(2, '0')}-${String(monthStart2.getUTCDate()).padStart(2, '0')}`
                if (profile.month_target_date === monthStr2 && profile.month_target_minutes) return profile.month_target_minutes
                const daily = profile.weekday_target_minutes ?? 60
                const weekend = profile.weekend_target_minutes ?? 120
                return daily * 22 + weekend * 8
              })()
              return (monthMinutes / Math.max(1, target)) * 100
            })()))} />
            <View style={styles.inlineRow}>
              <View style={styles.flex}>
                <Text style={styles.smallLabel}>今月の目標を変更</Text>
                <TextInput
                  style={styles.input}
                  placeholder="目標(分)"
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

        </View>

        {(() => {
          const streak = calculateStreak(studyLogs)
          if (streak.currentStreak > 0) return (
            <View style={[styles.card, styles.streakCard]}>
              <View style={styles.streakRow}>
                <View>
                  <Text style={styles.streakTitle}>{streak.currentStreak}日連続</Text>
                  <Text style={styles.mutedText}>最長記録: {streak.longestStreak}日</Text>
                </View>
                <Text style={styles.streakEmoji}>🔥</Text>
              </View>
            </View>
          )
          return null
        })()}

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
    backgroundColor: '#f1f5fb',
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  card: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    backgroundColor: '#ffffff',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  sectionSubtitle: {
    fontSize: 12,
    color: '#94a3b8',
  },
  summaryRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
  },
  summaryCard: {
    flexBasis: '48%',
    backgroundColor: '#f3f4f6',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  summaryValue: {
    fontSize: 16,
    fontWeight: '700',
  },
  summaryLabel: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 4,
  },
  smallCardRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
  },
  smallCard: {
    flex: 1,
    minWidth: 0,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    padding: 12,
    backgroundColor: '#f8fafc',
  },
  smallCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  smallCardLabel: {
    fontSize: 12,
    color: '#94a3b8',
  },
  smallSelectButton: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#eef2f7',
    flexShrink: 1,
    minWidth: 0,
  },
  smallSelectText: {
    fontSize: 12,
    color: '#334155',
    fontWeight: '600',
    flexShrink: 1,
  },
  smallCardBadge: {
    fontSize: 11,
    color: '#334155',
    backgroundColor: '#e2e8f0',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
  },
  smallCardValueWrap: {
    marginTop: 8,
    paddingVertical: 6,
    paddingHorizontal: 8,
    backgroundColor: '#f1f5f9',
    borderRadius: 8,
  },
  smallCardValue: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0f172a',
  },
  shareBanner: {
    borderWidth: 1,
    borderColor: '#cbd5f5',
    borderRadius: 12,
    padding: 12,
    backgroundColor: '#eef2ff',
    marginBottom: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  shareText: {
    color: '#2563eb',
    fontWeight: '600',
    marginLeft: 8,
  },
  closeButton: {
    width: 28,
    height: 28,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#cbd5f5',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f8fafc',
  },
  rangeToggle: {
    borderWidth: 1,
    borderColor: '#cbd5f5',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: '#f8fafc',
  },
  rangeToggleActive: {
    backgroundColor: '#2563eb',
    borderColor: '#2563eb',
  },
  rangeToggleText: {
    color: '#0f172a',
    fontSize: 12,
  },
  rangeToggleTextActive: {
    color: '#ffffff',
  },
  navButton: {
    width: 28,
    height: 28,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f8fafc',
  },
  navButtonDisabled: {
    backgroundColor: '#f1f5f9',
    borderColor: '#e2e8f0',
  },
  chartArea: {
    marginTop: 12,
  },
  chartRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  yAxis: {
    width: 44,
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    height: 150,
    paddingBottom: 18,
  },
  yAxisTitle: {
    fontSize: 10,
    color: '#94a3b8',
    marginBottom: 4,
  },
  yAxisLabel: {
    fontSize: 9,
    color: '#94a3b8',
  },
  chartBody: {
    flex: 1,
  },
  chartBars: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    minHeight: 130,
    paddingHorizontal: 4,
  },
  chartStack: {
    height: 120,
    justifyContent: 'flex-end',
    alignItems: 'center',
    flexDirection: 'column',
    gap: 0,
  },
  chartBarItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginHorizontal: 2,
  },
  chartBarSegment: {
    width: 10,
    borderRadius: 0,
  },
  chartLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 6,
  },
  chartLabelContainer: {
    flex: 1,
    alignItems: 'center',
  },
  chartLabel: {
    fontSize: 9,
    color: '#94a3b8',
    textAlign: 'center',
  },
  chartWeekday: {
    fontSize: 8,
    color: '#cbd5e1',
    textAlign: 'center',
    marginTop: 2,
  },
  chartLegend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
  },
  legendRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
    flexWrap: 'wrap',
  },
  donutWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    marginBottom: 8,
  },
  donutRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  donutValue: {
    fontSize: 12,
    color: '#0f172a',
    fontWeight: '600',
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 999,
  },
  legendText: {
    fontSize: 11,
    color: '#475569',
  },
  rangeControlRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10,
  },
  rangeControl: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  rangeControlLabel: {
    fontSize: 12,
    color: '#64748b',
  },
  selectButton: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#f8fafc',
  },
  selectButtonText: {
    fontSize: 12,
    color: '#334155',
  },
  selectWrap: {
    position: 'relative',
  },
  selectWrapShrink: {
    flex: 1,
    minWidth: 0,
  },
  selectMenu: {
    position: 'absolute',
    top: 40,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(226,232,240,0.8)',
    paddingVertical: 8,
    minWidth: 160,
    paddingHorizontal: 4,
    shadowColor: '#94a3b8',
    shadowOpacity: 0.15,
    shadowRadius: 8,
    zIndex: 10,
  },
  selectMenuSmall: {
    minWidth: 140,
  },
  selectMenuRight: {
    left: 'auto',
    right: 0,
    minWidth: 180,
  },
  selectMenuItem: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
  },
  selectMenuText: {
    fontSize: 13,
    color: '#334155',
  },
  barRow: {
    marginBottom: 12,
  },
  barLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  barLabel: {
    fontSize: 12,
    color: '#111827',
  },
  barValue: {
    fontSize: 12,
    color: '#6b7280',
  },
  barTrack: {
    height: 8,
    borderRadius: 999,
    backgroundColor: '#e5e7eb',
    overflow: 'hidden',
  },
  barFill: {
    height: 8,
    borderRadius: 999,
    backgroundColor: '#4f46e5',
  },
  inputGroup: {
    marginBottom: 12,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  flex: {
    flex: 1,
  },
  label: {
    fontSize: 12,
    color: '#6b7280',
    marginBottom: 4,
  },
  toggleButton: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 8,
  },
  toggleButtonText: {
    fontSize: 12,
    color: '#2563eb',
  },
  plusButton: {
    width: 36,
    height: 36,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f8fafc',
  },
  input: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
    backgroundColor: '#f8fafc',
  },
  noteInput: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  primaryButton: {
    backgroundColor: '#2563eb',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: '#ffffff',
    fontWeight: '600',
    fontSize: 12,
  },
  deleteButton: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  bookPicker: {
    gap: 8,
  },
  bookChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  bookChipActive: {
    backgroundColor: '#eef2ff',
    borderColor: '#4f46e5',
  },
  bookChipText: {
    fontSize: 12,
  },
  logItem: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 10,
    padding: 12,
    marginBottom: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  logTitle: {
    fontSize: 14,
    fontWeight: '600',
  },
  mutedText: {
    fontSize: 12,
    color: '#6b7280',
  },
  noteText: {
    fontSize: 12,
    color: '#374151',
    marginTop: 6,
  },
  deleteText: {
    color: '#ef4444',
    fontSize: 12,
  },
  noteRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginBottom: 8,
  },
  goalItem: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 10,
    padding: 10,
    marginBottom: 8,
    gap: 4,
  },
  goalText: {
    fontSize: 12,
    color: '#0f172a',
  },
  progressTrack: {
    height: 12,
    backgroundColor: '#e2e8f0',
    borderRadius: 999,
    overflow: 'hidden',
    marginTop: 4,
    marginBottom: 8,
  },
  progressFill: {
    height: 12,
    backgroundColor: '#3b82f6',
  },
  checkboxContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    padding: 8,
    borderRadius: 8,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  checkboxLabel: {
    marginLeft: 8,
    fontSize: 14,
    color: '#334155',
    fontWeight: '500',
    flex: 1,
  },
  selectTrigger: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: '#ffffff',
  },
  selectTriggerText: {
    fontSize: 14,
    color: '#0f172a',
  },
  outlineButton: {
    borderWidth: 1,
    borderColor: '#3b82f6',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    alignItems: 'center',
  },
  outlineButtonText: {
    fontSize: 14,
    color: '#3b82f6',
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0f172a',
  },
  modalItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  modalItemText: {
    fontSize: 16,
    color: '#334155',
  },
  modalItemTextSelected: {
    color: '#2563eb',
    fontWeight: '600',
  },
  chartDetailBox: {
    marginTop: 16,
    padding: 12,
    backgroundColor: '#f8fafc',
    borderRadius: 8,
  },
  chartDetailDate: {
    fontSize: 15,
    fontWeight: '600',
    color: '#0f172a',
    marginBottom: 8,
  },
  chartDetailText: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  inlineDropdown: {
    marginTop: 8,
    backgroundColor: '#ffffff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(226,232,240,0.8)',
    paddingVertical: 4,
    shadowColor: '#64748b',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 4,
    zIndex: 50,
  },
  progressRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  divider: {
    height: 1,
    backgroundColor: '#e2e8f0',
    marginVertical: 16,
  },
  targetCard: {
    marginBottom: 24,
    paddingBottom: 24,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  targetCardTitle: {
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 8,
    color: '#334155',
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
    resizeMode: 'cover',
  },
  balloon: {
    flex: 1,
    backgroundColor: '#f8fafc',
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

  smallLabel: {
    fontSize: 11,
    color: '#64748b',
    marginBottom: 4,
  },
  inlineRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    marginTop: 8,
  },
  dropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  dropdownItemText: {
    fontSize: 16,
    color: '#334155',
  },
  dropdownItemTextSelected: {
    color: '#2563eb',
    fontWeight: '600',
  },
  modalSection: {
    marginTop: 12,
  },
  modalSectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0f172a',
    marginBottom: 12,
  },
  modalDateTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#0f172a',
    marginBottom: 12,
  },
  modalMaterialText: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
  },
  modalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  modalRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  modalSubject: {
    fontSize: 14,
    color: '#334155',
  },
  modalTime: {
    fontSize: 14,
    fontWeight: '500',
    color: '#0f172a',
  },
  modalRowTotal: {
    borderBottomWidth: 0,
    paddingTop: 12,
    marginTop: 8,
    borderTopWidth: 2,
    borderTopColor: '#e2e8f0',
  },
  modalTotalLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0f172a',
  },
  modalTotalTime: {
    fontSize: 15,
    fontWeight: '700',
    color: '#2563eb',
  },
})
