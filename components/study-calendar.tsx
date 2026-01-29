'use client'

import { useState, useMemo } from 'react'
import { format, startOfMonth, endOfMonth, eachDayOfInterval, addMonths, subMonths, isSameMonth, isSameDay, getDay } from 'date-fns'
import { ja } from 'date-fns/locale'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { getStudyDay, getStudyDayFromCalendarDate, getTodayDate } from '@/lib/date-utils'
import type { StudyLog, ReferenceBook } from '@/types/database'
import { cn } from '@/lib/utils'

interface StudyCalendarProps {
  studyLogs: StudyLog[]
  referenceBooks: ReferenceBook[]
}

export function StudyCalendar({ studyLogs, referenceBooks }: StudyCalendarProps) {
  const [currentMonth, setCurrentMonth] = useState(new Date())
  const [selectedDate, setSelectedDate] = useState<string | null>(null)

  // 日別の学習時間を集計
  const dailyStudyData = useMemo(() => {
    const data: Record<string, { minutes: number; logs: StudyLog[] }> = {}
    
    studyLogs.forEach((log) => {
      const studyDay = getStudyDay(new Date(log.started_at))
      if (!data[studyDay]) {
        data[studyDay] = { minutes: 0, logs: [] }
      }
      data[studyDay].minutes += log.study_minutes
      data[studyDay].logs.push(log)
    })

    return data
  }, [studyLogs])

  // カレンダーの日付を生成
  const calendarDays = useMemo(() => {
    const monthStart = startOfMonth(currentMonth)
    const monthEnd = endOfMonth(currentMonth)
    
    // 月の最初の日が何曜日か（0=日曜, 1=月曜, ...）
    const startDay = getDay(monthStart)
    
    // カレンダー表示用の開始日（前月の日付も含める）
    const calendarStart = new Date(monthStart)
    calendarStart.setDate(calendarStart.getDate() - startDay)
    
    // カレンダー表示用の終了日（次月の日付も含める）
    const calendarEnd = new Date(monthEnd)
    const daysToAdd = 6 - getDay(monthEnd)
    calendarEnd.setDate(calendarEnd.getDate() + daysToAdd)
    
    return eachDayOfInterval({ start: calendarStart, end: calendarEnd })
  }, [currentMonth])

  // 最大学習時間を取得（色の濃さの基準）
  const maxMinutes = useMemo(() => {
    const values = Object.values(dailyStudyData).map(d => d.minutes)
    return Math.max(...values, 1)
  }, [dailyStudyData])

  const getIntensity = (minutes: number) => {
    if (minutes === 0) return 0
    const ratio = minutes / maxMinutes
    if (ratio < 0.2) return 1
    if (ratio < 0.4) return 2
    if (ratio < 0.6) return 3
    if (ratio < 0.8) return 4
    return 5
  }

  const getColorClass = (intensity: number) => {
    switch (intensity) {
      case 0:
        return 'bg-gray-100'
      case 1:
        return 'bg-blue-100'
      case 2:
        return 'bg-blue-200'
      case 3:
        return 'bg-blue-300'
      case 4:
        return 'bg-blue-400'
      case 5:
        return 'bg-blue-500'
      default:
        return 'bg-gray-100'
    }
  }

  const handlePrevMonth = () => {
    setCurrentMonth(subMonths(currentMonth, 1))
    setSelectedDate(null)
  }

  const handleNextMonth = () => {
    setCurrentMonth(addMonths(currentMonth, 1))
    setSelectedDate(null)
  }

  const handleDateClick = (date: Date) => {
    // カレンダーの日付から学習記録の日付を取得
    const studyDay = getStudyDayFromCalendarDate(date)
    if (dailyStudyData[studyDay] && dailyStudyData[studyDay].minutes > 0) {
      setSelectedDate(studyDay)
    }
  }

  const selectedDayData = selectedDate ? dailyStudyData[selectedDate] : null

  // 選択された日の参考書別学習時間
  const selectedDayBookData = useMemo(() => {
    if (!selectedDayData) return []
    
    const bookMap = new Map<string, { name: string; minutes: number }>()
    
    selectedDayData.logs.forEach((log) => {
      if (log.reference_book_id) {
        const book = referenceBooks.find((b) => b.id === log.reference_book_id)
        if (book) {
          const existing = bookMap.get(log.reference_book_id) || { name: book.name, minutes: 0 }
          bookMap.set(log.reference_book_id, {
            name: existing.name,
            minutes: existing.minutes + log.study_minutes,
          })
        }
      } else if (log.subject) {
        const existing = bookMap.get(`subject_${log.subject}`) || { name: log.subject, minutes: 0 }
        bookMap.set(`subject_${log.subject}`, {
          name: existing.name,
          minutes: existing.minutes + log.study_minutes,
        })
      }
    })

    return Array.from(bookMap.values()).sort((a, b) => b.minutes - a.minutes)
  }, [selectedDayData, referenceBooks])

  return (
    <div className="space-y-4">
      {/* カレンダーヘッダー */}
      <div className="flex items-center justify-between">
        <Button variant="outline" size="icon" onClick={handlePrevMonth}>
          <ChevronLeft className="w-4 h-4" />
        </Button>
        <h2 className="text-xl font-bold">
          {format(currentMonth, 'yyyy年M月', { locale: ja })}
        </h2>
        <Button variant="outline" size="icon" onClick={handleNextMonth}>
          <ChevronRight className="w-4 h-4" />
        </Button>
      </div>

      {/* カレンダーグリッド */}
      <div className="grid grid-cols-7 gap-1">
        {/* 曜日ヘッダー */}
        {['日', '月', '火', '水', '木', '金', '土'].map((day) => (
          <div key={day} className="text-center text-sm font-semibold text-muted-foreground py-2">
            {day}
          </div>
        ))}

        {/* 日付セル */}
        {calendarDays.map((date) => {
          // カレンダーの日付から学習記録の日付を取得
          // カレンダーの日付は00:00:00として扱うので、03:00より前として前日の学習記録を参照
          const studyDay = getStudyDayFromCalendarDate(date)
          const dayData = dailyStudyData[studyDay]
          const minutes = dayData?.minutes || 0
          const intensity = getIntensity(minutes)
          const isCurrentMonth = isSameMonth(date, currentMonth)
          
          // 今日の判定（03:00-03:00の区切りで）
          const todayDate = getTodayDate()
          const isToday = isSameDay(date, todayDate)
          const isSelected = selectedDate === studyDay

          return (
            <button
              key={date.toISOString()}
              onClick={() => handleDateClick(date)}
              className={cn(
                'aspect-square p-1 text-xs transition-colors',
                !isCurrentMonth && 'text-muted-foreground/50',
                isCurrentMonth && minutes > 0 && 'cursor-pointer hover:opacity-80',
                isCurrentMonth && minutes === 0 && 'cursor-default',
                isSelected && 'ring-2 ring-blue-500 ring-offset-2'
              )}
            >
              <div
                className={cn(
                  'w-full h-full rounded flex flex-col items-center justify-center',
                  getColorClass(intensity),
                  isToday && 'ring-2 ring-blue-600'
                )}
              >
                <span className={cn('text-xs font-medium', intensity > 2 && 'text-white')}>
                  {format(date, 'd')}
                </span>
                {minutes > 0 && (
                  <span className={cn('text-[10px]', intensity > 2 ? 'text-white' : 'text-gray-600')}>
                    {Math.floor(minutes / 60)}h
                  </span>
                )}
              </div>
            </button>
          )
        })}
      </div>

      {/* 凡例 */}
      <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
        <span>少ない</span>
        <div className="flex gap-1">
          <div className="w-4 h-4 rounded bg-blue-100" />
          <div className="w-4 h-4 rounded bg-blue-200" />
          <div className="w-4 h-4 rounded bg-blue-300" />
          <div className="w-4 h-4 rounded bg-blue-400" />
          <div className="w-4 h-4 rounded bg-blue-500" />
        </div>
        <span>多い</span>
      </div>

      {/* 選択された日の詳細 */}
      {selectedDayData && selectedDayData.minutes > 0 && selectedDate && (
        <Card className="mt-4">
          <CardHeader>
            <CardTitle className="text-lg">
              {/* 選択された日付（学習記録の日付）を表示 */}
              {(() => {
                const [year, month, day] = selectedDate.split('-').map(Number)
                const displayDate = new Date(year, month - 1, day)
                return format(displayDate, 'yyyy年M月d日', { locale: ja })
              })()}の学習記録
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="text-center">
                <div className="text-3xl font-bold text-blue-600">
                  {Math.floor(selectedDayData.minutes / 60)}時間{selectedDayData.minutes % 60}分
                </div>
                <div className="text-sm text-muted-foreground mt-1">
                  合計学習時間
                </div>
              </div>

              {selectedDayBookData.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold mb-2">教材別</h3>
                  <div className="space-y-2">
                    {selectedDayBookData.map((book) => (
                      <div key={book.name} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                        <span className="text-sm">{book.name}</span>
                        <span className="text-sm font-semibold">
                          {Math.floor(book.minutes / 60)}時間{book.minutes % 60}分
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="pt-2 border-t">
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={() => setSelectedDate(null)}
                >
                  閉じる
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
