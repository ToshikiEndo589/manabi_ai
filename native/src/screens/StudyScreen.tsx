import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  Alert,
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
import { Ionicons } from '@expo/vector-icons'
import * as ImagePicker from 'expo-image-picker'
import { supabase } from '../lib/supabase'
import { useProfile } from '../contexts/ProfileContext'
import type { ReferenceBook, ReviewTask } from '../types'
import { formatTimer } from '../lib/format'
import { formatDateLabel, getStudyDay, getStudyDayDate } from '../lib/date'

const REVIEW_DAYS = [1, 3, 7, 14, 30, 60, 120, 240, 365, 730]
const DEFAULT_DIFFICULTY = 'normal'

type Difficulty = 'easy' | 'normal' | 'hard'

type QuizQuestion = {
  question: string
  choices: string[]
  correct_index: number
  explanation?: string
  theme?: string
}

type ThemeQuizState = {
  loading: boolean
  questions: QuizQuestion[]
  answers: Record<number, number>
}

type QuizState = {
  themes: Record<string, ThemeQuizState>
}

export function StudyScreen() {
  const { userId } = useProfile()
  const [referenceBooks, setReferenceBooks] = useState<ReferenceBook[]>([])
  const [selectedBookId, setSelectedBookId] = useState<string | null>(null)
  const [newBookName, setNewBookName] = useState('')
  const [notes, setNotes] = useState<string[]>([''])
  const [isRunning, setIsRunning] = useState(false)
  const [seconds, setSeconds] = useState(0)
  const [loading, setLoading] = useState(true)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [reviewTasks, setReviewTasks] = useState<ReviewTask[]>([])
  const [quizByTask, setQuizByTask] = useState<Record<string, QuizState>>({})
  const [skippedThemes, setSkippedThemes] = useState<Record<string, string[]>>({})
  const [difficultyByTheme, setDifficultyByTheme] = useState<Record<string, Difficulty>>({})
  const [showBookPicker, setShowBookPicker] = useState(false)
  const [showAddBookForm, setShowAddBookForm] = useState(false)
  const [newBookImage, setNewBookImage] = useState<string | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const endpoint = useMemo(() => {
    const direct = process.env.EXPO_PUBLIC_QA_ENDPOINT
    const base = process.env.EXPO_PUBLIC_API_BASE_URL
    if (direct) return direct.replace(/\/api\/qa$/, '') + '/api/quiz'
    if (base) return `${base.replace(/\/$/, '')}/api/quiz`
    return ''
  }, [])

  const selectedBook = useMemo(
    () => referenceBooks.find((book) => book.id === selectedBookId) || null,
    [referenceBooks, selectedBookId]
  )

  useEffect(() => {
    const loadBooks = async () => {
      setLoading(true)
      const [booksResult, tasksResult] = await Promise.all([
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
      if (!booksResult.error) {
        setReferenceBooks((booksResult.data || []) as ReferenceBook[])
      }
      if (!tasksResult.error) {
        const normalized = ((tasksResult.data as any[]) || []).map((task) => ({
          ...task,
          study_logs: Array.isArray(task.study_logs) ? task.study_logs[0] ?? null : task.study_logs ?? null,
        }))
        setReviewTasks(normalized as ReviewTask[])
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
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [isRunning])

  const handleAddBook = async () => {
    if (!newBookName.trim()) return
    let imageUrl: string | null = null
    if (newBookImage) {
      try {
        const response = await fetch(newBookImage)
        const blob = await response.blob()
        const filePath = `${userId}/${Date.now()}.jpg`
        const { error: uploadError } = await supabase.storage
          .from('reference-books')
          .upload(filePath, blob, { cacheControl: '3600', upsert: false })
        if (!uploadError) {
          const { data } = supabase.storage.from('reference-books').getPublicUrl(filePath)
          imageUrl = data.publicUrl
        }
      } catch (_error) {
        Alert.alert('画像のアップロードに失敗しました', '画像なしで教材を追加します。')
      }
    }

    const { data: deletedBook } = await supabase
      .from('reference_books')
      .select('*')
      .eq('user_id', userId)
      .eq('name', newBookName.trim())
      .not('deleted_at', 'is', null)
      .order('deleted_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (deletedBook) {
      const { error } = await supabase
        .from('reference_books')
        .update({
          deleted_at: null,
          image_url: imageUrl || deletedBook.image_url,
          updated_at: new Date().toISOString(),
        })
        .eq('id', deletedBook.id)
      if (error) {
        Alert.alert('保存エラー', error.message)
        return
      }
      const restored = {
        ...(deletedBook as ReferenceBook),
        deleted_at: null,
        image_url: imageUrl || deletedBook.image_url,
      }
      setReferenceBooks((prev) => [restored, ...prev])
    } else {
      const { error, data } = await supabase
        .from('reference_books')
        .insert({
          user_id: userId,
          name: newBookName.trim(),
          image_url: imageUrl,
          type: 'book',
        })
        .select()
        .single()
      if (error) {
        Alert.alert('保存エラー', error.message)
        return
      }
      setReferenceBooks((prev) => [data as ReferenceBook, ...prev])
    }
    setNewBookName('')
    setNewBookImage(null)
    setShowAddBookForm(false)
  }

  const handleDeleteBook = async (bookId: string) => {
    const { error } = await supabase
      .from('reference_books')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', bookId)
    if (error) {
      Alert.alert('削除エラー', error.message)
      return
    }
    setReferenceBooks((prev) => prev.filter((book) => book.id !== bookId))
    if (selectedBookId === bookId) setSelectedBookId(null)
  }

  const handleStart = () => {
    if (!selectedBookId) {
      Alert.alert('教材を選択してください')
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
    if (!selectedBookId) {
      Alert.alert('教材を選択してください')
      setSeconds(0)
      return
    }
    const minutes = Math.floor(seconds / 60)
    const subject = selectedBook?.name?.trim() || 'その他'
    const startedAt = new Date().toISOString()
    const noteValue = notes
      .map((value) => value.trim())
      .filter(Boolean)
      .map((value) => `・${value}`)
      .join('\n')
    const { data, error } = await supabase
      .from('study_logs')
      .insert({
        user_id: userId,
        subject,
        reference_book_id: selectedBook?.id || null,
        study_minutes: minutes,
        started_at: startedAt,
        note: noteValue ? noteValue : null,
      })
      .select()
      .single()
    if (error) {
      Alert.alert('保存エラー', error.message)
      return
    }
    if (noteValue && data?.id) {
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
    const messages = [
      `🎉 ${subject}を${minutes}分学習したね！素晴らしい！`,
      `✨ ${minutes}分の学習、お疲れ様！合格に一歩近づいたよ！`,
      `💪 ${subject}を${minutes}分頑張ったね！この調子で続けよう！`,
      `🔥 ${minutes}分の学習を記録したよ！連続記録を更新しよう！`,
    ]
    setSuccessMessage(messages[Math.floor(Math.random() * messages.length)])
    setSeconds(0)
    setNotes([''])
  }

  const getEncouragementMessage = () => {
    const minutes = Math.floor(seconds / 60)
    if (minutes === 0) return '🚀 学習を始めよう！一緒に頑張るよ！'
    if (minutes < 30) return `💪 ${minutes}分経過！この調子で続けよう！`
    if (minutes < 60) return `✨ ${minutes}分頑張ってるね！素晴らしい集中力だよ！`
    return `🔥 ${Math.floor(minutes / 60)}時間以上！本当に頑張ってるね！`
  }

  const splitThemes = (text: string) => {
    return text
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => line.replace(/^[-*•・]\s*/, '').trim())
      .filter(Boolean)
  }

  const getThemeKey = (taskId: string, theme: string) => `${taskId}::${theme}`

  const formatReviewDate = (dateString?: string | null) => {
    if (!dateString) return ''
    const studyDay = getStudyDay(new Date(dateString))
    const studyDate = getStudyDayDate(studyDay)
    const today = getStudyDayDate(getStudyDay(new Date()))
    const diffDays = Math.max(0, Math.round((today.getTime() - studyDate.getTime()) / 86400000))
    return `${formatDateLabel(studyDate)}(${diffDays}日前)`
  }

  const pickBookImage = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (permission.status !== 'granted') {
      Alert.alert('権限が必要です', '写真へのアクセスを許可してください。')
      return
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
    })
    if (!result.canceled && result.assets[0]?.uri) {
      setNewBookImage(result.assets[0].uri)
    }
  }

  const handleGenerateQuiz = async (task: ReviewTask, theme?: string) => {
    if (!endpoint) return
    const noteValue = task.study_logs?.note?.trim()
    if (!noteValue) return
    const themeValue = theme || noteValue
    const difficultyKey = getThemeKey(task.id, themeValue)
    const difficulty = difficultyByTheme[difficultyKey] || DEFAULT_DIFFICULTY
    setQuizByTask((prev) => {
      const current = prev[task.id]?.themes || {}
      const existing = current[themeValue]
      return {
        ...prev,
        [task.id]: {
          themes: {
            ...current,
            [themeValue]: {
              loading: true,
              questions: existing?.questions || [],
              answers: existing?.answers || {},
            },
          },
        },
      }
    })
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note: themeValue, count: 1, difficulty }),
      })
      if (!response.ok) throw new Error('クイズの生成に失敗しました')
      const data = await response.json()
      const questions = (data.questions || []).map((q: QuizQuestion) => ({
        ...q,
        theme: themeValue,
      }))
      setQuizByTask((prev) => {
        const current = prev[task.id]?.themes || {}
        const existing = current[themeValue]
        return {
          ...prev,
          [task.id]: {
            themes: {
              ...current,
              [themeValue]: {
                loading: false,
                questions,
                answers: existing?.answers || {},
              },
            },
          },
        }
      })
    } catch (_error) {
      setQuizByTask((prev) => {
        const next = { ...prev }
        delete next[task.id]
        return next
      })
      Alert.alert('エラー', 'クイズの生成に失敗しました。')
    }
  }

  const handleAnswer = async (taskId: string, theme: string, qIndex: number, choiceIndex: number) => {
    const quiz = quizByTask[taskId]
    const themeQuiz = quiz?.themes[theme]
    if (!themeQuiz || themeQuiz.loading) return
    if (themeQuiz.answers[qIndex] !== undefined) return

    const question = themeQuiz.questions[qIndex]
    if (!question) return

    const isCorrect = choiceIndex === question.correct_index
    await supabase.from('quiz_attempts').insert({
      user_id: userId,
      review_task_id: taskId,
      question: question.question,
      choices: question.choices,
      correct_index: question.correct_index,
      selected_index: choiceIndex,
      is_correct: isCorrect,
    })

    const nextAnswers = { ...themeQuiz.answers, [qIndex]: choiceIndex }
    const nextThemes = { ...(quiz?.themes || {}), [theme]: { ...themeQuiz, answers: nextAnswers } }
    setQuizByTask((prev) => ({ ...prev, [taskId]: { themes: nextThemes } }))

    const task = reviewTasks.find((t) => t.id === taskId)
    const allThemes = splitThemes(task?.study_logs?.note || '')
    const hidden = skippedThemes[taskId] || []
    const isComplete = allThemes.every((themeItem) => {
      if (hidden.includes(themeItem)) return true
      const state = nextThemes[themeItem]
      if (!state || state.questions.length === 0) return false
      return Object.keys(state.answers).length >= state.questions.length
    })
    if (isComplete) {
      await supabase.from('review_tasks').update({ status: 'completed' }).eq('id', taskId)
      setReviewTasks((prev) => prev.filter((t) => t.id !== taskId))
    }
  }

  const handleSkipTask = async (taskId: string) => {
    await supabase.from('review_tasks').update({ status: 'skipped' }).eq('id', taskId)
    setReviewTasks((prev) => prev.filter((t) => t.id !== taskId))
  }

  const handleSkipTheme = (taskId: string, theme: string, remaining: string[]) => {
    setSkippedThemes((prev) => {
      const current = prev[taskId] || []
      if (current.includes(theme)) return prev
      return { ...prev, [taskId]: [...current, theme] }
    })
    setQuizByTask((prev) => {
      const current = prev[taskId]
      if (!current) return prev
      const nextThemes = { ...current.themes }
      delete nextThemes[theme]
      return { ...prev, [taskId]: { themes: nextThemes } }
    })
    const nextRemaining = remaining.filter((t) => t !== theme)
    if (nextRemaining.length === 0) handleSkipTask(taskId)
  }

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={80}
    >
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <View style={styles.card}>
        <Text style={styles.cardTitle}>教材選択</Text>
        <Text style={styles.cardSubtitle}>学習する教材を選択してください</Text>
        <View style={styles.rowBetween}>
          <Text style={styles.mutedText}>{selectedBook ? selectedBook.name : '教材が未選択です'}</Text>
          <Pressable style={styles.outlineButton} onPress={() => setShowBookPicker((prev) => !prev)}>
            <Text style={styles.outlineButtonText}>{showBookPicker ? '閉じる' : '教材を選ぶ'}</Text>
          </Pressable>
        </View>
        {showBookPicker && (
          <View style={styles.bookPickerArea}>
            <View style={styles.bookHeaderRow}>
              <Text style={styles.bookHeaderText}>教材</Text>
              <Pressable style={styles.addChipButton} onPress={() => setShowAddBookForm((prev) => !prev)}>
                <Ionicons name="add" size={16} color="#334155" />
                <Text style={styles.addChipText}>追加</Text>
              </Pressable>
            </View>
            {showAddBookForm && (
              <View style={styles.addCard}>
                <Text style={styles.addCardTitle}>新しい教材を追加</Text>
                <Text style={styles.label}>名前</Text>
                <TextInput
                  style={styles.input}
                  placeholder="例: チャート式数学I"
                  value={newBookName}
                  onChangeText={setNewBookName}
                />
                <Text style={styles.label}>画像（任意）</Text>
                <Pressable style={styles.imageSelectButton} onPress={pickBookImage}>
                  <Text style={styles.imageSelectText}>画像を選択</Text>
                </Pressable>
                <View style={styles.row}>
                  <Pressable
                    style={[styles.outlineButton, styles.flex]}
                    onPress={() => {
                      setShowAddBookForm(false)
                      setNewBookName('')
                      setNewBookImage(null)
                    }}
                  >
                    <Text style={styles.outlineButtonText}>キャンセル</Text>
                  </Pressable>
                  <Pressable style={[styles.primaryButton, styles.flex]} onPress={handleAddBook}>
                    <Text style={styles.primaryButtonText}>追加</Text>
                  </Pressable>
                </View>
              </View>
            )}
            {loading ? (
              <Text style={styles.mutedText}>読み込み中...</Text>
            ) : (
              <View style={styles.bookGrid}>
                {referenceBooks.map((book) => (
                  <View
                    key={book.id}
                    style={[
                      styles.bookCard,
                      selectedBookId === book.id && styles.bookCardActive,
                    ]}
                  >
                    <Pressable style={styles.trashButton} onPress={() => handleDeleteBook(book.id)}>
                      <Ionicons name="trash-outline" size={14} color="#64748b" />
                    </Pressable>
                    <Pressable
                      style={styles.bookSelectArea}
                      onPress={() => {
                        if (isRunning) {
                          Alert.alert('計測中は教材を変更できません')
                          return
                        }
                        setSelectedBookId(book.id)
                      }}
                    >
                      <View style={styles.bookImageBox}>
                        {book.image_url ? (
                          <Image source={{ uri: book.image_url }} style={styles.bookImage} />
                        ) : (
                          <Ionicons name="book-outline" size={32} color="#94a3b8" />
                        )}
                      </View>
                      <Text style={styles.bookCardText}>{book.name}</Text>
                    </Pressable>
                  </View>
                ))}
              </View>
            )}
          </View>
        )}
      </View>

      {successMessage && (
        <View style={styles.successCard}>
          <Text style={styles.successText}>{successMessage}</Text>
        </View>
      )}
      {isRunning && seconds > 0 && (
        <View style={styles.successCard}>
          <Text style={styles.successText}>{getEncouragementMessage()}</Text>
        </View>
      )}

      <View style={styles.card}>
        <Text style={styles.cardTitle}>リアルタイム計測</Text>
        <Text style={styles.timer}>{formatTimer(seconds)}</Text>
        <Text style={styles.mutedText}>教材を選択してください</Text>
        <Pressable
          style={[styles.startButton, !selectedBookId && styles.startButtonDisabled]}
          onPress={handleStart}
          disabled={!selectedBookId}
        >
          <Ionicons name="play" size={18} color="#fff" />
          <Text style={styles.startButtonText}>
            {selectedBookId ? '開始' : '教材を選択してください'}
          </Text>
        </Pressable>
        {isRunning && (
          <View style={styles.row}>
            <Pressable style={styles.outlineButton} onPress={handlePause}>
              <Text style={styles.outlineButtonText}>一時停止</Text>
            </Pressable>
            <Pressable style={styles.primaryButton} onPress={handleStop}>
              <Text style={styles.primaryButtonText}>停止・保存</Text>
            </Pressable>
          </View>
        )}
        <View style={styles.noteHeader}>
          <Text style={styles.noteTitle}>学習メモ（復習カードで使います）</Text>
          <Text style={styles.noteHelper}>
            1つの入力欄＝1テーマです。なるべく具体的に書いてください。
          </Text>
        </View>
        {notes.map((value, index) => (
          <View key={`note-${index}`} style={styles.noteRow}>
            <TextInput
              style={[styles.input, styles.noteInput, styles.noteField]}
              placeholder="例: 英文法の比較級。"
              value={value}
              onChangeText={(text) => {
                const next = [...notes]
                next[index] = text
                setNotes(next)
              }}
              multiline
            />
            <Pressable
              style={styles.noteDeleteButton}
              onPress={() => {
                const next = notes.filter((_, i) => i !== index)
                setNotes(next.length ? next : [''])
              }}
            >
              <Ionicons name="trash-outline" size={14} color="#94a3b8" />
            </Pressable>
          </View>
        ))}
        <Pressable style={styles.addNoteButton} onPress={() => setNotes([...notes, ''])}>
          <Ionicons name="add" size={16} color="#334155" />
          <Text style={styles.addNoteText}>学習メモを追加</Text>
        </Pressable>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>復習カード</Text>
        <Text style={styles.cardSubtitle}>忘却曲線に合わせて今日の復習を出題します</Text>
        {reviewTasks.length === 0 && <Text style={styles.mutedText}>今日は復習タスクがありません</Text>}
        {reviewTasks.map((task) => {
          const quiz = quizByTask[task.id]
          const themes = splitThemes(task.study_logs?.note || '')
          const visibleThemes = themes.filter((theme) => !(skippedThemes[task.id] || []).includes(theme))
          return (
            <View key={task.id} style={styles.taskCard}>
              {visibleThemes.map((theme, index) => {
                const themeQuiz = quiz?.themes?.[theme]
                const themeKey = getThemeKey(task.id, theme)
                const selectedDifficulty = difficultyByTheme[themeKey] || DEFAULT_DIFFICULTY
                return (
                  <View key={`${task.id}-${index}`} style={styles.themeCard}>
                    <View style={styles.themeHeader}>
                      <Text style={styles.themeTitle}>{task.study_logs?.subject || '学習内容'}</Text>
                      <Text style={styles.mutedText}>{formatReviewDate(task.study_logs?.started_at)}</Text>
                    </View>
                    <Text style={styles.mutedText}>{theme}</Text>
                    <View style={styles.difficultyRow}>
                      <Text style={styles.difficultyLabel}>難易度</Text>
                      {[
                        { key: 'easy' as Difficulty, label: '易しい' },
                        { key: 'normal' as Difficulty, label: '普通' },
                        { key: 'hard' as Difficulty, label: '難しい' },
                      ].map((item) => (
                        <Pressable
                          key={item.key}
                          style={[
                            styles.difficultyButton,
                            selectedDifficulty === item.key && styles.difficultyButtonActive,
                          ]}
                          onPress={() =>
                            setDifficultyByTheme((prev) => ({ ...prev, [themeKey]: item.key }))
                          }
                        >
                          <Text
                            style={[
                              styles.difficultyText,
                              selectedDifficulty === item.key && styles.difficultyTextActive,
                            ]}
                          >
                            {item.label}
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                    <Pressable style={styles.outlineButton} onPress={() => handleSkipTheme(task.id, theme, visibleThemes)}>
                      <Text style={styles.outlineButtonText}>このテーマを消す</Text>
                    </Pressable>
                    {!themeQuiz && (
                      <Pressable style={styles.outlineButton} onPress={() => handleGenerateQuiz(task, theme)}>
                        <Text style={styles.outlineButtonText}>4択を作成（1問）</Text>
                      </Pressable>
                    )}
                    {themeQuiz?.loading && <Text style={styles.mutedText}>クイズ作成中...</Text>}
                    {themeQuiz?.questions?.length > 0 && (
                      <View style={styles.quizBlock}>
                        {themeQuiz.questions.map((q, qIndex) => {
                          const answered = themeQuiz.answers[qIndex] !== undefined
                          return (
                            <View key={`${task.id}-${qIndex}`} style={styles.quizItem}>
                              <Text style={styles.quizQuestion}>{qIndex + 1}. {q.question}</Text>
                              {q.choices.map((choice, cIndex) => {
                                const selected = themeQuiz.answers[qIndex] === cIndex
                                const isCorrect = q.correct_index === cIndex
                                return (
                                  <Pressable
                                    key={`${task.id}-${qIndex}-${cIndex}`}
                                    onPress={() => handleAnswer(task.id, theme, qIndex, cIndex)}
                                    disabled={answered}
                                    style={[
                                      styles.choiceButton,
                                      selected && (isCorrect ? styles.choiceCorrect : styles.choiceWrong),
                                    ]}
                                  >
                                    <Text style={styles.choiceText}>{choice}</Text>
                                  </Pressable>
                                )
                              })}
                              {answered && (
                                <Text style={styles.mutedText}>
                                  正解: {q.correct_index + 1}番
                                </Text>
                              )}
                            </View>
                          )
                        })}
                      </View>
                    )}
                  </View>
                )
              })}
              {visibleThemes.length === 0 && (
                <Text style={styles.mutedText}>この日の復習テーマはすべて非表示にしました</Text>
              )}
            </View>
          )
        })}
      </View>
      </ScrollView>
    </KeyboardAvoidingView>
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
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 16,
    padding: 16,
    backgroundColor: '#ffffff',
    gap: 10,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  cardSubtitle: {
    fontSize: 12,
    color: '#94a3b8',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  rowBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  flex: {
    flex: 1,
  },
  input: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
  },
  noteInput: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  noteHeader: {
    marginTop: 4,
    gap: 4,
  },
  noteTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0f172a',
  },
  noteHelper: {
    fontSize: 11,
    color: '#64748b',
  },
  noteRow: {
    position: 'relative',
    marginTop: 8,
  },
  noteField: {
    paddingRight: 36,
  },
  noteDeleteButton: {
    position: 'absolute',
    right: 8,
    top: 8,
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f8fafc',
  },
  addNoteButton: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#cbd5f5',
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#f8fafc',
    justifyContent: 'center',
  },
  addNoteText: {
    fontSize: 12,
    color: '#334155',
    fontWeight: '600',
  },
  primaryButton: {
    backgroundColor: '#2563eb',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 10,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: '#ffffff',
    fontWeight: '600',
  },
  outlineButton: {
    borderWidth: 1,
    borderColor: '#cbd5f5',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  outlineButtonText: {
    color: '#2563eb',
    fontWeight: '600',
    fontSize: 12,
  },
  bookPickerArea: {
    gap: 8,
    marginTop: 8,
  },
  bookHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  bookHeaderText: {
    fontSize: 16,
    fontWeight: '700',
  },
  addChipButton: {
    borderWidth: 1,
    borderColor: '#dbeafe',
    backgroundColor: '#f8fafc',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  addChipText: {
    fontSize: 12,
    color: '#334155',
    fontWeight: '600',
  },
  addCard: {
    borderWidth: 2,
    borderColor: '#bfdbfe',
    borderRadius: 12,
    padding: 12,
    backgroundColor: '#f8fafc',
    gap: 8,
  },
  addCardTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  imageSelectButton: {
    borderWidth: 1,
    borderColor: '#cbd5f5',
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
    backgroundColor: '#f1f5f9',
  },
  imageSelectText: {
    fontSize: 12,
    color: '#334155',
    fontWeight: '600',
  },
  bookGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  bookCard: {
    width: '48%',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    padding: 12,
    backgroundColor: '#ffffff',
    position: 'relative',
  },
  bookCardActive: {
    borderColor: '#2563eb',
    shadowColor: '#93c5fd',
    shadowOpacity: 0.4,
    shadowRadius: 6,
  },
  bookSelectArea: {
    alignItems: 'center',
    gap: 8,
  },
  bookImageBox: {
    width: 64,
    height: 64,
    borderRadius: 8,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  bookImage: {
    width: 64,
    height: 64,
    resizeMode: 'cover',
  },
  bookCardText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#0f172a',
  },
  trashButton: {
    position: 'absolute',
    right: 8,
    top: 8,
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f8fafc',
    zIndex: 2,
  },
  deleteText: {
    color: '#ef4444',
    fontSize: 12,
  },
  mutedText: {
    fontSize: 12,
    color: '#64748b',
  },
  timer: {
    fontSize: 42,
    fontWeight: '700',
    textAlign: 'center',
    color: '#2563eb',
  },
  startButton: {
    backgroundColor: '#7fb8e5',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
  },
  startButtonDisabled: {
    backgroundColor: '#cbd5e1',
  },
  startButtonText: {
    color: '#ffffff',
    fontWeight: '600',
  },
  successCard: {
    backgroundColor: '#ecfdf3',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#bbf7d0',
  },
  successText: {
    color: '#166534',
    fontSize: 13,
    fontWeight: '600',
  },
  taskCard: {
    marginTop: 12,
    gap: 12,
  },
  themeCard: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    padding: 12,
    gap: 8,
  },
  themeHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  themeTitle: {
    fontSize: 13,
    fontWeight: '600',
  },
  difficultyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  difficultyLabel: {
    fontSize: 12,
    color: '#64748b',
    marginRight: 4,
  },
  difficultyButton: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: '#f8fafc',
  },
  difficultyButtonActive: {
    borderColor: '#2563eb',
    backgroundColor: '#2563eb',
  },
  difficultyText: {
    fontSize: 11,
    color: '#334155',
    fontWeight: '600',
  },
  difficultyTextActive: {
    color: '#ffffff',
  },
  quizBlock: {
    gap: 10,
  },
  quizItem: {
    gap: 8,
  },
  quizQuestion: {
    fontSize: 13,
    fontWeight: '600',
  },
  choiceButton: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 8,
    padding: 8,
  },
  choiceCorrect: {
    backgroundColor: '#dcfce7',
    borderColor: '#22c55e',
  },
  choiceWrong: {
    backgroundColor: '#fee2e2',
    borderColor: '#ef4444',
  },
  choiceText: {
    fontSize: 12,
  },
})
