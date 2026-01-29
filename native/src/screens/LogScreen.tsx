import React, { useEffect, useMemo, useState } from 'react'
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { supabase } from '../lib/supabase'
import { useProfile } from '../contexts/ProfileContext'
import type { ReferenceBook, ReviewTask, StudyLog } from '../types'
import { HeatmapGrid } from '../components/HeatmapGrid'
import { formatMinutes } from '../lib/format'
import { formatDateInput, formatDateLabel, rangeContains, startOfDay, startOfMonth, startOfWeek } from '../lib/date'

export function LogScreen() {
  const { userId } = useProfile()
  const [studyLogs, setStudyLogs] = useState<StudyLog[]>([])
  const [referenceBooks, setReferenceBooks] = useState<ReferenceBook[]>([])
  const [reviewTasks, setReviewTasks] = useState<ReviewTask[]>([])
  const [loading, setLoading] = useState(true)
  const [manualBookId, setManualBookId] = useState<string | null>(null)
  const [manualMinutes, setManualMinutes] = useState('')
  const [manualDate, setManualDate] = useState(formatDateInput(new Date()))
  const [manualNote, setManualNote] = useState('')

  const loadData = async () => {
    setLoading(true)
    const [logsResult, booksResult, tasksResult] = await Promise.all([
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
        .from('review_tasks')
        .select('id, due_at, status, study_log_id, study_logs(note, subject, started_at)')
        .eq('user_id', userId)
        .eq('status', 'pending')
        .lte('due_at', new Date().toISOString())
        .order('due_at', { ascending: true }),
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
    if (tasksResult.error) {
      Alert.alert('読み込みエラー', tasksResult.error.message)
    } else {
      const normalized = ((tasksResult.data as any[]) || []).map((task) => ({
        ...task,
        study_logs: Array.isArray(task.study_logs) ? task.study_logs[0] ?? null : task.study_logs ?? null,
      }))
      setReviewTasks(normalized as ReviewTask[])
    }
    setLoading(false)
  }

  useEffect(() => {
    loadData()
  }, [userId])

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
      .filter((log) => rangeContains(new Date(log.started_at), monthStart, new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 1)))
      .reduce((sum, log) => sum + log.study_minutes, 0)
    const total = studyLogs.reduce((sum, log) => sum + log.study_minutes, 0)
    return { today, week, month, total }
  }, [studyLogs, todayStart, weekStart, monthStart])

  const heatmapValues = useMemo(() => {
    return Array.from({ length: 30 }, (_, index) => {
      const date = new Date()
      date.setDate(date.getDate() - (29 - index))
      const start = startOfDay(date)
      const end = new Date(start.getTime() + 86400000)
      return studyLogs
        .filter((log) => rangeContains(new Date(log.started_at), start, end))
        .reduce((sum, log) => sum + log.study_minutes, 0)
    })
  }, [studyLogs])

  const subjectTotals = useMemo(() => {
    const map = new Map<string, number>()
    studyLogs.forEach((log) => {
      const key = log.subject || 'その他'
      map.set(key, (map.get(key) || 0) + log.study_minutes)
    })
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1])
  }, [studyLogs])

  const handleManualSubmit = async () => {
    const minutes = parseInt(manualMinutes, 10)
    if (!manualDate || isNaN(minutes) || minutes < 1) {
      Alert.alert('入力エラー', '日付と1分以上の学習時間を入力してください。')
      return
    }
    const selectedBook = referenceBooks.find((book) => book.id === manualBookId)
    const subject = selectedBook?.name?.trim() || 'その他'
    const date = new Date(manualDate)
    date.setHours(12, 0, 0, 0)
    const startedAt = date.toISOString()
    const { data, error } = await supabase
      .from('study_logs')
      .insert({
        user_id: userId,
        subject,
        reference_book_id: manualBookId || null,
        study_minutes: minutes,
        started_at: startedAt,
        note: manualNote.trim() ? manualNote.trim() : null,
      })
      .select()
      .single()
    if (error) {
      Alert.alert('保存エラー', error.message)
      return
    }
    if (manualNote.trim() && data?.id) {
      const base = new Date(startedAt)
      base.setHours(12, 0, 0, 0)
      const reviewDays = [1, 3, 7, 14, 30]
      const tasks = reviewDays.map((days) => {
        const due = new Date(base)
        due.setDate(due.getDate() + days)
        return {
          user_id: userId,
          study_log_id: data.id,
          due_at: due.toISOString(),
          status: 'pending',
        }
      })
      await supabase.from('review_tasks').insert(tasks)
    }
    setManualMinutes('')
    setManualNote('')
    setManualDate(formatDateInput(new Date()))
    setManualBookId(null)
    await loadData()
    Alert.alert('保存完了', '学習記録を追加しました。')
  }

  const handleDeleteLog = async (logId: string) => {
    const { error } = await supabase.from('study_logs').delete().eq('id', logId)
    if (error) {
      Alert.alert('削除エラー', error.message)
      return
    }
    setStudyLogs((prev) => prev.filter((log) => log.id !== logId))
  }

  const handleUpdateTask = async (taskId: string, status: 'completed' | 'skipped') => {
    const { error } = await supabase.from('review_tasks').update({ status }).eq('id', taskId)
    if (error) {
      Alert.alert('更新エラー', error.message)
      return
    }
    setReviewTasks((prev) => prev.filter((task) => task.id !== taskId))
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>学習ログ</Text>
        <Pressable style={styles.refreshButton} onPress={loadData}>
          <Text style={styles.refreshText}>更新</Text>
        </Pressable>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>学習時間サマリー</Text>
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
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>学習ヒートマップ（30日）</Text>
        <HeatmapGrid values={heatmapValues} />
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>復習タスク</Text>
        {reviewTasks.length === 0 ? (
          <Text style={styles.mutedText}>復習タスクはありません</Text>
        ) : (
          reviewTasks.map((task) => (
            <View key={task.id} style={styles.taskCard}>
              <Text style={styles.taskTitle}>{task.study_logs?.subject || '学習内容'}</Text>
              {task.study_logs?.note ? (
                <Text style={styles.noteText}>{task.study_logs.note}</Text>
              ) : (
                <Text style={styles.mutedText}>メモがありません</Text>
              )}
              <View style={styles.row}>
                <Pressable
                  style={[styles.primaryButton, styles.flex]}
                  onPress={() => handleUpdateTask(task.id, 'completed')}
                >
                  <Text style={styles.primaryButtonText}>完了</Text>
                </Pressable>
                <Pressable
                  style={[styles.outlineButton, styles.flex]}
                  onPress={() => handleUpdateTask(task.id, 'skipped')}
                >
                  <Text style={styles.outlineButtonText}>スキップ</Text>
                </Pressable>
              </View>
            </View>
          ))
        )}
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>科目別の学習時間</Text>
        {subjectTotals.length === 0 ? (
          <Text style={styles.mutedText}>記録がありません</Text>
        ) : (
          subjectTotals.map(([subject, minutes]) => (
            <View key={subject} style={styles.barRow}>
              <View style={styles.barLabelRow}>
                <Text style={styles.barLabel}>{subject}</Text>
                <Text style={styles.barValue}>{formatMinutes(minutes)}</Text>
              </View>
              <View style={styles.barTrack}>
                <View
                  style={[
                    styles.barFill,
                    { width: `${Math.min(100, Math.round((minutes / Math.max(1, summary.total)) * 100))}%` },
                  ]}
                />
              </View>
            </View>
          ))
        )}
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>学習記録の入力</Text>
        <View style={styles.inputGroup}>
          <Text style={styles.label}>教材</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.bookPicker}>
            <Pressable
              style={[styles.bookChip, !manualBookId && styles.bookChipActive]}
              onPress={() => setManualBookId(null)}
            >
              <Text style={styles.bookChipText}>その他</Text>
            </Pressable>
            {referenceBooks.map((book) => (
              <Pressable
                key={book.id}
                style={[styles.bookChip, manualBookId === book.id && styles.bookChipActive]}
                onPress={() => setManualBookId(book.id)}
              >
                <Text style={styles.bookChipText}>{book.name}</Text>
              </Pressable>
            ))}
          </ScrollView>
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
          <TextInput
            style={styles.input}
            value={manualDate}
            onChangeText={setManualDate}
            placeholder="YYYY-MM-DD"
          />
        </View>
        <View style={styles.inputGroup}>
          <Text style={styles.label}>学習メモ（任意）</Text>
          <TextInput
            style={[styles.input, styles.noteInput]}
            value={manualNote}
            onChangeText={setManualNote}
            placeholder="例: 二次関数の最大最小"
            multiline
          />
        </View>
        <Pressable style={styles.primaryButton} onPress={handleManualSubmit}>
          <Text style={styles.primaryButtonText}>保存する</Text>
        </Pressable>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>学習ログ一覧</Text>
        {studyLogs.length === 0 ? (
          <Text style={styles.mutedText}>記録がありません</Text>
        ) : (
          studyLogs.slice(0, 20).map((log) => (
            <View key={log.id} style={styles.logItem}>
              <View>
                <Text style={styles.logTitle}>
                  {log.subject} / {formatMinutes(log.study_minutes)}
                </Text>
                <Text style={styles.mutedText}>{formatDateLabel(new Date(log.started_at))}</Text>
                {log.note ? <Text style={styles.noteText}>{log.note}</Text> : null}
              </View>
              <Pressable onPress={() => handleDeleteLog(log.id)}>
                <Text style={styles.deleteText}>削除</Text>
              </Pressable>
            </View>
          ))
        )}
      </View>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: {
    padding: 24,
    backgroundColor: '#ffffff',
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
  },
  refreshButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
  },
  refreshText: {
    fontSize: 12,
    color: '#4f46e5',
  },
  card: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
  },
  summaryRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  summaryCard: {
    flexBasis: '48%',
    backgroundColor: '#f3f4f6',
    borderRadius: 10,
    padding: 12,
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
  input: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
  },
  noteInput: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  primaryButton: {
    backgroundColor: '#4f46e5',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  outlineButton: {
    borderWidth: 1,
    borderColor: '#4f46e5',
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  outlineButtonText: {
    color: '#4f46e5',
    fontWeight: '600',
  },
  primaryButtonText: {
    color: '#ffffff',
    fontWeight: '600',
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
  taskCard: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 10,
    padding: 12,
    marginBottom: 10,
    gap: 6,
  },
  taskTitle: {
    fontSize: 14,
    fontWeight: '600',
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
})
