import React, { useEffect, useMemo, useRef, useState } from 'react'
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
import type { ReferenceBook } from '../types'
import { formatTimer } from '../lib/format'

const REVIEW_DAYS = [1, 3, 7, 14, 30]

export function StudyScreen() {
  const { userId } = useProfile()
  const [referenceBooks, setReferenceBooks] = useState<ReferenceBook[]>([])
  const [selectedBookId, setSelectedBookId] = useState<string | null>(null)
  const [newBookName, setNewBookName] = useState('')
  const [manualSubject, setManualSubject] = useState('')
  const [note, setNote] = useState('')
  const [isRunning, setIsRunning] = useState(false)
  const [seconds, setSeconds] = useState(0)
  const [loading, setLoading] = useState(true)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const selectedBook = useMemo(
    () => referenceBooks.find((book) => book.id === selectedBookId) || null,
    [referenceBooks, selectedBookId]
  )

  useEffect(() => {
    const loadBooks = async () => {
      setLoading(true)
      const { data, error } = await supabase
        .from('reference_books')
        .select('*')
        .eq('user_id', userId)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
      if (!error) {
        setReferenceBooks((data || []) as ReferenceBook[])
      }
      setLoading(false)
    }
    loadBooks()
  }, [userId])

  useEffect(() => {
    if (isRunning) {
      intervalRef.current = setInterval(() => {
        setSeconds((prev) => prev + 1)
      }, 1000)
    }
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
      }
    }
  }, [isRunning])

  const handleAddBook = async () => {
    if (!newBookName.trim()) return
    const { error, data } = await supabase
      .from('reference_books')
      .insert({
        user_id: userId,
        name: newBookName.trim(),
        type: 'book',
      })
      .select()
      .single()
    if (error) {
      Alert.alert('保存エラー', error.message)
      return
    }
    setReferenceBooks((prev) => [data as ReferenceBook, ...prev])
    setNewBookName('')
  }

  const handleDeleteBook = async (bookId: string) => {
    const target = referenceBooks.find((book) => book.id === bookId)
    if (!target) return
    const { error } = await supabase
      .from('reference_books')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', bookId)
    if (error) {
      Alert.alert('削除エラー', error.message)
      return
    }
    setReferenceBooks((prev) => prev.filter((book) => book.id !== bookId))
    if (selectedBookId === bookId) {
      setSelectedBookId(null)
    }
  }

  const handleStart = () => {
    if (!selectedBook && !manualSubject.trim()) {
      Alert.alert('教材または科目を選択してください')
      return
    }
    setIsRunning(true)
  }

  const handlePause = () => {
    setIsRunning(false)
  }

  const handleStop = async () => {
    setIsRunning(false)
    if (seconds < 60) {
      setSeconds(0)
      Alert.alert('1分以上の学習時間を記録してください')
      return
    }
    const minutes = Math.floor(seconds / 60)
    const subject = selectedBook?.name?.trim() || manualSubject.trim() || 'その他'
    const startedAt = new Date().toISOString()
    const { data, error } = await supabase
      .from('study_logs')
      .insert({
        user_id: userId,
        subject,
        reference_book_id: selectedBook?.id || null,
        study_minutes: minutes,
        started_at: startedAt,
        note: note.trim() ? note.trim() : null,
      })
      .select()
      .single()
    if (error) {
      Alert.alert('保存エラー', error.message)
      return
    }
    if (note.trim() && data?.id) {
      const base = new Date(startedAt)
      base.setHours(12, 0, 0, 0)
      const tasks = REVIEW_DAYS.map((days) => {
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
    setSeconds(0)
    setNote('')
    Alert.alert('保存完了', `${subject}を${minutes}分記録しました。`)
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>学習記録</Text>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>教材の追加</Text>
        <View style={styles.row}>
          <TextInput
            style={[styles.input, styles.flex]}
            placeholder="教材名"
            value={newBookName}
            onChangeText={setNewBookName}
          />
          <Pressable style={styles.primaryButton} onPress={handleAddBook}>
            <Text style={styles.primaryButtonText}>追加</Text>
          </Pressable>
        </View>
        {loading ? (
          <Text style={styles.mutedText}>読み込み中...</Text>
        ) : (
          <View style={styles.bookList}>
            {referenceBooks.length === 0 && <Text style={styles.mutedText}>教材がありません</Text>}
            {referenceBooks.map((book) => (
              <View key={book.id} style={styles.bookItem}>
                <Pressable
                  style={[
                    styles.bookButton,
                    selectedBookId === book.id && styles.bookButtonActive,
                  ]}
                  onPress={() => setSelectedBookId(book.id)}
                >
                  <Text style={styles.bookButtonText}>{book.name}</Text>
                </Pressable>
                <Pressable onPress={() => handleDeleteBook(book.id)}>
                  <Text style={styles.deleteText}>削除</Text>
                </Pressable>
              </View>
            ))}
          </View>
        )}
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>ストップウォッチ</Text>
        <Text style={styles.timer}>{formatTimer(seconds)}</Text>
        {!selectedBook && (
          <TextInput
            style={styles.input}
            placeholder="科目名（教材未選択の場合）"
            value={manualSubject}
            onChangeText={setManualSubject}
          />
        )}
        <TextInput
          style={[styles.input, styles.noteInput]}
          placeholder="学習メモ（任意）"
          value={note}
          onChangeText={setNote}
          multiline
        />
        <View style={styles.row}>
          {!isRunning ? (
            <Pressable style={[styles.primaryButton, styles.flex]} onPress={handleStart}>
              <Text style={styles.primaryButtonText}>開始</Text>
            </Pressable>
          ) : (
            <>
              <Pressable style={[styles.outlineButton, styles.flex]} onPress={handlePause}>
                <Text style={styles.outlineButtonText}>一時停止</Text>
              </Pressable>
              <Pressable style={[styles.primaryButton, styles.flex]} onPress={handleStop}>
                <Text style={styles.primaryButtonText}>停止・保存</Text>
              </Pressable>
            </>
          )}
        </View>
      </View>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: {
    padding: 24,
    backgroundColor: '#ffffff',
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 16,
  },
  card: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    backgroundColor: '#ffffff',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
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
  input: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
    marginBottom: 8,
  },
  noteInput: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  primaryButton: {
    backgroundColor: '#4f46e5',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: '#ffffff',
    fontWeight: '600',
  },
  outlineButton: {
    borderWidth: 1,
    borderColor: '#4f46e5',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  outlineButtonText: {
    color: '#4f46e5',
    fontWeight: '600',
  },
  bookList: {
    gap: 8,
  },
  bookItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  bookButton: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    flex: 1,
    marginRight: 12,
  },
  bookButtonActive: {
    borderColor: '#4f46e5',
    backgroundColor: '#eef2ff',
  },
  bookButtonText: {
    fontSize: 14,
  },
  deleteText: {
    color: '#ef4444',
    fontSize: 12,
  },
  mutedText: {
    fontSize: 12,
    color: '#6b7280',
  },
  timer: {
    fontSize: 40,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 12,
  },
})
