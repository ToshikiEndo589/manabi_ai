'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Play, Pause, Square } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { MascotMessage } from '@/components/mascot-message'
import { ReferenceBookManager } from '@/components/reference-book-manager'
import { saveTimerState, loadTimerState, clearTimerState, type TimerState } from '@/lib/storage/study-timer'
import { getStudyDay, getStudyDayDate } from '@/lib/date-utils'
import type { ReferenceBook } from '@/types/database'

type ReviewTask = {
  id: string
  due_at: string
  status: string
  study_log_id: string
  study_logs?: {
    note: string | null
    subject: string | null
    started_at: string | null
  } | null
}

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

export default function StudyPage() {
  const router = useRouter()
  const [referenceBooks, setReferenceBooks] = useState<ReferenceBook[]>([])
  const [selectedBookId, setSelectedBookId] = useState<string | null>(null)
  const [isRunning, setIsRunning] = useState(false)
  const [seconds, setSeconds] = useState(0)
  const [isSaving, setIsSaving] = useState(false)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [showBookPicker, setShowBookPicker] = useState(false)
  const [reviewTasks, setReviewTasks] = useState<ReviewTask[]>([])
  const [quizByTask, setQuizByTask] = useState<Record<string, QuizState>>({})
  const [skippedThemes, setSkippedThemes] = useState<Record<string, string[]>>({})
  const intervalRef = useRef<NodeJS.Timeout | null>(null)
  const startTimeRef = useRef<number | null>(null)

  // 教材一覧を読み込む
  useEffect(() => {
    const loadReferenceBooks = async () => {
      try {
        const supabase = createClient()
        const {
          data: { user },
        } = await supabase.auth.getUser()

        if (!user) {
          router.push('/login')
          return
        }

        const [{ data, error }, { data: tasksData, error: tasksError }] = await Promise.all([
          supabase
            .from('reference_books')
            .select('*')
            .eq('user_id', user.id)
            .is('deleted_at', null)
            .order('created_at', { ascending: false }),
          supabase
            .from('review_tasks')
            .select('id, due_at, status, study_log_id, study_logs(note, subject, started_at)')
            .eq('user_id', user.id)
            .eq('status', 'pending')
            .lte('due_at', new Date().toISOString())
            .order('due_at', { ascending: true }),
        ])

        if (error) throw error
        if (tasksError) throw tasksError
        setReferenceBooks(data || [])
        const normalizedTasks = ((tasksData as any[]) || []).map((task) => ({
          ...task,
          study_logs: Array.isArray(task.study_logs) ? task.study_logs[0] ?? null : task.study_logs ?? null,
        })) as ReviewTask[]
        setReviewTasks(normalizedTasks)
      } catch (error: any) {
        console.error('Failed to load reference books:', error)
      } finally {
        setIsLoading(false)
      }
    }

    loadReferenceBooks()
  }, [router])

  // タイマー状態を復元
  useEffect(() => {
    const saved = loadTimerState()
    if (saved) {
      setSelectedBookId(saved.referenceBookId)
      if (saved.isRunning && saved.startTime) {
        // 経過時間を再計算
        const elapsed = Math.floor((Date.now() - saved.startTime) / 1000)
        setSeconds(saved.seconds + elapsed)
        setIsRunning(true)
        startTimeRef.current = saved.startTime
      } else {
        setSeconds(saved.seconds)
        setIsRunning(false)
      }
    }
  }, [])

  // タイマーの実行
  useEffect(() => {
    if (isRunning) {
      intervalRef.current = setInterval(() => {
        setSeconds((prev) => {
          const newSeconds = prev + 1
          // 状態を保存
          saveTimerState({
            isRunning: true,
            seconds: newSeconds,
            referenceBookId: selectedBookId,
            startTime: startTimeRef.current || Date.now(),
          })
          return newSeconds
        })
      }, 1000)
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
      }
      // 停止時も状態を保存
      if (selectedBookId !== null) {
        saveTimerState({
          isRunning: false,
          seconds,
          referenceBookId: selectedBookId,
          startTime: null,
        })
      }
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
      }
    }
  }, [isRunning, selectedBookId, seconds])

  // ページが非表示になった時も計測を続ける（バックグラウンド計測）
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden && isRunning && startTimeRef.current) {
        // ページが非表示になった時、現在の経過時間を保存
        const elapsed = Math.floor((Date.now() - startTimeRef.current) / 1000)
        saveTimerState({
          isRunning: true,
          seconds: seconds + elapsed,
          referenceBookId: selectedBookId,
          startTime: startTimeRef.current,
        })
      } else if (!document.hidden && isRunning && startTimeRef.current) {
        // ページが表示された時、経過時間を再計算
        const elapsed = Math.floor((Date.now() - startTimeRef.current) / 1000)
        setSeconds((prev) => prev + elapsed)
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [isRunning, selectedBookId, seconds])

  const formatTime = (totalSeconds: number) => {
    const hours = Math.floor(totalSeconds / 3600)
    const minutes = Math.floor((totalSeconds % 3600) / 60)
    const secs = totalSeconds % 60
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }

  const handleStart = () => {
    if (!selectedBookId) {
      alert('教材を選択してください')
      return
    }
    setIsRunning(true)
    startTimeRef.current = Date.now()
    saveTimerState({
      isRunning: true,
      seconds: 0,
      referenceBookId: selectedBookId,
      startTime: Date.now(),
    })
  }

  const handlePause = () => {
    setIsRunning(false)
    startTimeRef.current = null
  }

  const handleStop = async () => {
    setIsRunning(false)
    
    if (seconds === 0) {
      setSeconds(0)
      startTimeRef.current = null
      clearTimerState()
      return
    }

    const minutes = Math.floor(seconds / 60)
    // 1分未満の場合は保存しない（59秒以下は記録されない）
    if (minutes < 1) {
      setSeconds(0)
      startTimeRef.current = null
      clearTimerState()
      alert('1分以上の学習時間を記録してください（現在: ' + Math.floor(seconds) + '秒）')
      return
    }
    
    // デバッグ: 保存する分数を確認
    console.log('Saving study log:', { seconds, minutes, selectedBookId })

    // 教材が選択されていない場合は保存できない
    if (!selectedBookId) {
      alert('教材を選択してください')
      setIsRunning(false)
      setSeconds(0)
      startTimeRef.current = null
      clearTimerState()
      return
    }

    await saveStudyLog(selectedBookId, minutes, new Date().toISOString(), '')

    setSeconds(0)
    startTimeRef.current = null
    clearTimerState()
  }

  const saveStudyLog = async (
    referenceBookId: string,
    minutes: number,
    startedAt: string,
    note: string
  ) => {
    setIsSaving(true)
    try {
      const supabase = createClient()
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user) {
        alert('ログインが必要です')
        router.push('/login')
        return
      }

      // 教材が有効か確認（削除されていないか）
      const { data: bookData } = await supabase
        .from('reference_books')
        .select('id, name')
        .eq('id', referenceBookId)
        .is('deleted_at', null)
        .single()

      if (!bookData) {
        throw new Error('選択された教材が見つかりません。教材を再選択してください。')
      }

      const subject = bookData.name?.trim() || 'その他'

      if (!subject || subject.length === 0) {
        throw new Error('科目名が設定されていません')
      }

      console.log('Saving study log:', { minutes, subject, startedAt, referenceBookId })
      
      const { data, error } = await supabase
        .from('study_logs')
        .insert({
          user_id: user.id,
          subject: subject,
          reference_book_id: referenceBookId || null,
          study_minutes: minutes,
          started_at: startedAt,
          note: note.trim() || null,
        })
        .select()
        .single()

      if (error) {
        console.error('Study log save error:', error)
        throw new Error(`保存に失敗しました: ${error.message}`)
      }

      if (!data) {
        throw new Error('保存に失敗しました: データが返されませんでした')
      }
      
      console.log('Study log saved successfully:', data)

      if (note.trim()) {
        const baseDate = new Date(startedAt)
        baseDate.setHours(12, 0, 0, 0)
        const reviewDays = [1, 3, 7, 14, 30]
        const tasks = reviewDays.map((days) => {
          const due = new Date(baseDate)
          due.setDate(due.getDate() + days)
          return {
            user_id: user.id,
            study_log_id: data.id,
            due_at: due.toISOString(),
            status: 'pending',
          }
        })

        const { error: taskError } = await supabase.from('review_tasks').insert(tasks)
        if (taskError) {
          console.warn('Failed to create review tasks:', taskError)
        } else {
          const { data: tasksData } = await supabase
            .from('review_tasks')
            .select('id, due_at, status, study_log_id, study_logs(note, subject, started_at)')
            .eq('user_id', user.id)
            .eq('status', 'pending')
            .lte('due_at', new Date().toISOString())
            .order('due_at', { ascending: true })
          const normalizedTasks = ((tasksData as any[]) || []).map((task) => ({
            ...task,
            study_logs: Array.isArray(task.study_logs) ? task.study_logs[0] ?? null : task.study_logs ?? null,
          })) as ReviewTask[]
          setReviewTasks(normalizedTasks)
        }
      }

      const messages = [
        `🎉 ${subject}を${minutes}分学習したね！素晴らしい！`,
        `✨ ${minutes}分の学習、お疲れ様！合格に一歩近づいたよ！`,
        `💪 ${subject}を${minutes}分頑張ったね！この調子で続けよう！`,
        `🔥 ${minutes}分の学習を記録したよ！連続記録を更新しよう！`,
      ]
      setSuccessMessage(messages[Math.floor(Math.random() * messages.length)])

      // カスタムイベントで記録画面に通知
      window.dispatchEvent(new Event('studyLogSaved'))

      // 保存成功後、すぐにリフレッシュ
      router.refresh()

      setTimeout(() => {
        setSuccessMessage(null)
      }, 3000)
    } catch (err: any) {
      console.error('Save study log error:', err)
      alert(err.message || '保存に失敗しました。もう一度お試しください。')
    } finally {
      setIsSaving(false)
    }
  }

  const splitThemes = (note: string): string[] => {
    const lines = note
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => line.replace(/^[-*•・]\s*/, '').trim())
      .filter(Boolean)

    if (lines.length === 0) return []
    if (lines.length === 1) return [lines[0]]
    return lines
  }

  const formatDueLabel = (studyStartedAt?: string | null): string => {
    if (!studyStartedAt) return ''
    const dueStudyDay = getStudyDay(new Date(studyStartedAt))
    const todayStudyDay = getStudyDay(new Date())
    const dueDate = getStudyDayDate(dueStudyDay)
    const todayDate = getStudyDayDate(todayStudyDay)
    const diffDays = Math.round((todayDate.getTime() - dueDate.getTime()) / (24 * 60 * 60 * 1000))
    const labelDate = dueDate.toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' })
    if (diffDays === 0) return `${labelDate}(今日)`
    if (diffDays === 1) return `${labelDate}(1日前)`
    if (diffDays > 1) return `${labelDate}(${diffDays}日前)`
    return `${labelDate}(${Math.abs(diffDays)}日後)`
  }

  const handleGenerateQuiz = async (task: ReviewTask, theme?: string) => {
    const note = task.study_logs?.note?.trim()
    if (!note) return
    const themeValue = theme || note
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
      const targetThemes = [themeValue]
      const results = await Promise.all(
        targetThemes.map(async (themeItem) => {
          const response = await fetch('/api/quiz', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ note: themeItem, count: 3 }),
          })
          if (!response.ok) {
            throw new Error('クイズの生成に失敗しました')
          }
          const data = await response.json()
          const questions = (data.questions || []).map((q: QuizQuestion) => ({
            ...q,
            theme: themeItem,
          }))
          return questions
        })
      )
      const questions = results.flat()
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
    } catch (error) {
      console.error('Failed to generate quiz:', error)
      setQuizByTask((prev) => {
        const next = { ...prev }
        delete next[task.id]
        return next
      })
      alert('クイズの生成に失敗しました。もう一度お試しください。')
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
    const supabase = createClient()
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) return
      await supabase.from('quiz_attempts').insert({
        user_id: user.id,
        review_task_id: taskId,
        question: question.question,
        choices: question.choices,
        correct_index: question.correct_index,
        selected_index: choiceIndex,
        is_correct: isCorrect,
      })
    } catch (error) {
      console.warn('Failed to save quiz attempt:', error)
    }

    const nextAnswers = { ...themeQuiz.answers, [qIndex]: choiceIndex }
    const nextThemes = {
      ...(quiz?.themes || {}),
      [theme]: { ...themeQuiz, answers: nextAnswers },
    }
    const nextQuizState = { themes: nextThemes }
    setQuizByTask((prev) => ({
      ...prev,
      [taskId]: nextQuizState,
    }))

    const task = reviewTasks.find((t) => t.id === taskId)
    const allThemes = (() => {
      const list = splitThemes(task?.study_logs?.note || '')
      return list.length > 0 ? list : [task?.study_logs?.note || '']
    })()
    const hidden = skippedThemes[taskId] || []
    const isComplete = allThemes.every((themeItem) => {
      if (hidden.includes(themeItem)) return true
      const state = nextThemes[themeItem]
      if (!state || state.questions.length === 0) return false
      return Object.keys(state.answers).length >= state.questions.length
    })

    if (isComplete) {
      try {
        await supabase.from('review_tasks').update({ status: 'completed' }).eq('id', taskId)
      } catch (error) {
        console.warn('Failed to complete review task:', error)
      } finally {
        setReviewTasks((prev) => prev.filter((t) => t.id !== taskId))
        setQuizByTask((prev) => {
          const next = { ...prev }
          delete next[taskId]
          return next
        })
        setSkippedThemes((prev) => {
          const next = { ...prev }
          delete next[taskId]
          return next
        })
      }
    }
  }

  const handleSkipTask = async (taskId: string) => {
    const supabase = createClient()
    try {
      await supabase.from('review_tasks').update({ status: 'skipped' }).eq('id', taskId)
    } catch (error) {
      console.warn('Failed to skip review task:', error)
    } finally {
      setReviewTasks((prev) => prev.filter((t) => t.id !== taskId))
      setQuizByTask((prev) => {
        const next = { ...prev }
        delete next[taskId]
        return next
      })
    }
  }

  const handleSkipTheme = (taskId: string, theme: string, remainingThemes: string[]) => {
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

    const nextRemaining = remainingThemes.filter((t) => t !== theme)
    if (nextRemaining.length === 0) {
      handleSkipTask(taskId)
    }
  }

  const getEncouragementMessage = (): string => {
    const minutes = Math.floor(seconds / 60)
    if (minutes === 0) {
      return '🚀 学習を始めよう！一緒に頑張るよ！'
    } else if (minutes < 30) {
      return `💪 ${minutes}分経過！この調子で続けよう！`
    } else if (minutes < 60) {
      return `✨ ${minutes}分頑張ってるね！素晴らしい集中力だよ！`
    } else {
      return `🔥 ${Math.floor(minutes / 60)}時間以上！本当に頑張ってるね！`
    }
  }

  const selectedBook = referenceBooks.find((b) => b.id === selectedBookId)
  const tasksWithNote = reviewTasks.filter((task) => task.study_logs?.note?.trim())

  if (isLoading) {
    return (
      <div className="w-full px-4 py-8">
        <Card>
          <CardContent className="pt-6">
            <p className="text-center text-muted-foreground">読み込み中...</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="w-full px-3 py-6">
      <div className="space-y-6">
        {/* 成功メッセージ */}
        {successMessage && (
          <Card className="shadow-lg bg-gradient-to-r from-green-50 to-emerald-50 border-green-200">
            <CardContent className="pt-6">
              <MascotMessage message={successMessage} emotion="excited" />
            </CardContent>
          </Card>
        )}

        {/* 学習中の励ましメッセージ */}
        {isRunning && seconds > 0 && (
          <Card className="shadow-lg bg-gradient-to-r from-blue-50 to-indigo-50 border-blue-200">
            <CardContent className="pt-6">
              <MascotMessage message={getEncouragementMessage()} emotion="encouraging" />
            </CardContent>
          </Card>
        )}

        {/* 教材選択 */}
        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle>教材選択</CardTitle>
            <CardDescription>学習する教材を選択してください</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm text-muted-foreground">
                {selectedBook ? selectedBook.name : '教材が未選択です'}
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowBookPicker((prev) => !prev)}
              >
                {showBookPicker ? '閉じる' : '教材を選ぶ'}
              </Button>
            </div>

            {showBookPicker && (
              <div className="mt-4">
                <ReferenceBookManager
                  referenceBooks={referenceBooks}
                  selectedBookId={selectedBookId}
                  onSelect={(bookId) => {
                    if (isRunning) {
                      alert('計測中は参考書を変更できません')
                      return
                    }
                    setSelectedBookId(bookId)
                    setShowBookPicker(false)
                  }}
                  onRefresh={async () => {
                    const supabase = createClient()
                    const {
                      data: { user },
                    } = await supabase.auth.getUser()
                    if (user) {
                      const { data } = await supabase
                        .from('reference_books')
                        .select('*')
                        .eq('user_id', user.id)
                        .is('deleted_at', null)
                        .order('created_at', { ascending: false })
                      setReferenceBooks(data || [])
                    }
                  }}
                />
              </div>
            )}
          </CardContent>
        </Card>

        {/* ストップウォッチ */}
        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle>リアルタイム計測</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="text-center">
              <div className="text-6xl font-mono font-bold text-primary mb-4">
                {formatTime(seconds)}
              </div>
              <div className="text-sm text-muted-foreground">
                {selectedBook ? selectedBook.name : '教材を選択してください'}
              </div>
            </div>

            <div className="flex justify-center gap-2">
              {!isRunning ? (
                <Button
                  onClick={handleStart}
                  disabled={!selectedBookId || isSaving}
                  size="lg"
                  className="flex-1"
                  title={!selectedBookId ? '教材を選択してください' : ''}
                >
                  <Play className="w-5 h-5 mr-2" />
                  {!selectedBookId ? '教材を選択してください' : '開始'}
                </Button>
              ) : (
                <>
                  <Button
                    onClick={handlePause}
                    variant="outline"
                    size="lg"
                    className="flex-1"
                  >
                    <Pause className="w-5 h-5 mr-2" />
                    一時停止
                  </Button>
                  <Button
                    onClick={handleStop}
                    variant="destructive"
                    size="lg"
                    className="flex-1"
                    disabled={isSaving}
                  >
                    <Square className="w-5 h-5 mr-2" />
                    停止・保存
                  </Button>
                </>
              )}
            </div>
          </CardContent>
        </Card>

        {/* 復習カード */}
        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle>復習カード</CardTitle>
            <CardDescription>忘却曲線に合わせて今日の復習を出題します</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {tasksWithNote.length === 0 && (
              <div className="text-sm text-muted-foreground">今日は復習タスクがありません</div>
            )}
            {tasksWithNote.map((task) => {
              const quiz = quizByTask[task.id]
              const themes = splitThemes(task.study_logs?.note || '')
              const cardThemes = themes.length > 0 ? themes : [task.study_logs?.note || '']
              const hiddenThemes = skippedThemes[task.id] || []
              const visibleThemes = cardThemes.filter((theme) => !hiddenThemes.includes(theme))
              return (
                <div key={task.id} className="space-y-3">
                  {visibleThemes.map((theme, index) => (
                    <div key={`${task.id}-theme-${index}`} className="rounded-lg border border-muted p-3 space-y-3">
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-sm font-semibold text-foreground">
                          {task.study_logs?.subject || '学習内容'}
                        </div>
                        <div className="text-xs text-muted-foreground">
                      {formatDueLabel(task.study_logs?.started_at)}
                        </div>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-sm text-muted-foreground whitespace-pre-wrap">
                          {theme}
                        </div>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => handleSkipTheme(task.id, theme, visibleThemes)}
                        >
                          このテーマを消す
                        </Button>
                      </div>
                      {(() => {
                        const themeQuiz = quiz?.themes?.[theme]
                        if (!themeQuiz) return true
                        return !themeQuiz.loading && themeQuiz.questions.length === 0
                      })() && (
                        <div className="flex flex-wrap items-center gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => handleGenerateQuiz(task, theme)}
                          >
                            4択を作成（3問）
                          </Button>
                        </div>
                      )}
                      {quiz?.themes?.[theme]?.loading && (
                        <div className="text-sm text-muted-foreground">クイズ作成中...</div>
                      )}
                      {quiz?.themes?.[theme] && !quiz.themes[theme].loading && quiz.themes[theme].questions.length > 0 && (
                        <div className="space-y-4">
                          {quiz.themes[theme].questions.map((q, qIndex) => {
                              const answered = quiz.themes[theme].answers[qIndex] !== undefined
                              const correctText = q.choices?.[q.correct_index] ?? ''
                              return (
                                <div key={`${task.id}-${theme}-${qIndex}`} className="space-y-2">
                                  <div className="text-sm font-medium">{qIndex + 1}. {q.question}</div>
                                  <div className="grid gap-2">
                                    {q.choices.map((choice, cIndex) => {
                                      const selected = quiz.themes[theme].answers[qIndex] === cIndex
                                      const isCorrect = q.correct_index === cIndex
                                      return (
                                        <button
                                          key={`${task.id}-${theme}-${qIndex}-${cIndex}`}
                                          type="button"
                                          onClick={() => handleAnswer(task.id, theme, qIndex, cIndex)}
                                          className={`text-left rounded-md border px-3 py-2 text-sm transition ${
                                            selected
                                              ? isCorrect
                                                ? 'border-green-500 bg-green-50 text-green-700'
                                                : 'border-red-500 bg-red-50 text-red-700'
                                              : 'border-input hover:bg-muted'
                                          } ${answered ? 'cursor-default' : 'cursor-pointer'}`}
                                          disabled={answered}
                                        >
                                          {choice}
                                        </button>
                                      )
                                    })}
                                  </div>
                                  {answered && (
                                    <>
                                      <div
                                        className={`text-sm font-semibold ${
                                          quiz.themes[theme].answers[qIndex] === q.correct_index
                                            ? 'text-green-600'
                                            : 'text-red-600'
                                        }`}
                                      >
                                        {quiz.themes[theme].answers[qIndex] === q.correct_index ? '○ 正解' : '× 不正解'}
                                        <span className="ml-2 text-muted-foreground">
                                          正解: {q.correct_index + 1}番（{correctText}）
                                        </span>
                                      </div>
                                      {q.explanation && (
                                        <div className="rounded-md border border-muted bg-muted/40 px-3 py-2 text-sm whitespace-pre-wrap">
                                          解説: {q.explanation}
                                        </div>
                                      )}
                                    </>
                                  )}
                                </div>
                              )
                            })}
                          {(() => {
                            const themeQuiz = quiz.themes[theme]
                            const isThemeComplete =
                              themeQuiz.questions.length > 0 &&
                              Object.keys(themeQuiz.answers).length >= themeQuiz.questions.length
                            if (!isThemeComplete) return null
                            return (
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => handleSkipTheme(task.id, theme, visibleThemes)}
                              >
                                完了して戻る
                              </Button>
                            )
                          })()}
                        </div>
                      )}
                    </div>
                  ))}
                  {visibleThemes.length === 0 && (
                    <div className="text-sm text-muted-foreground">
                      この日の復習テーマはすべて非表示にしました
                    </div>
                  )}
                </div>
              )
            })}
          </CardContent>
        </Card>

      </div>
    </div>
  )
}
