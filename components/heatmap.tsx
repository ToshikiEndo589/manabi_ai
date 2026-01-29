'use client'

import { useMemo } from 'react'
import { format, startOfYear, eachDayOfInterval, isSameDay, addDays, subDays } from 'date-fns'
import type { StudyLog } from '@/types/database'
import { cn } from '@/lib/utils'

interface HeatmapProps {
  studyLogs: StudyLog[]
}

export function Heatmap({ studyLogs }: HeatmapProps) {
  const heatmapData = useMemo(() => {
    const today = new Date()
    const startDate = subDays(today, 364) // 過去365日
    const days = eachDayOfInterval({ start: startDate, end: today })

    // 日付ごとの学習時間を集計
    const studyByDate = new Map<string, number>()
    studyLogs.forEach((log) => {
      const date = format(new Date(log.started_at), 'yyyy-MM-dd')
      const existing = studyByDate.get(date) || 0
      studyByDate.set(date, existing + log.study_minutes)
    })

    // 各日のデータを作成
    return days.map((day) => {
      const dateStr = format(day, 'yyyy-MM-dd')
      const minutes = studyByDate.get(dateStr) || 0
      return {
        date: day,
        minutes,
        dateStr,
      }
    })
  }, [studyLogs])

  // 最大学習時間を取得（色の濃さの基準）
  const maxMinutes = Math.max(...heatmapData.map((d) => d.minutes), 1)

  const getIntensity = (minutes: number) => {
    if (minutes === 0) return 0
    if (minutes < 30) return 1
    if (minutes < 60) return 2
    if (minutes < 120) return 3
    return 4
  }

  type HeatmapDay = (typeof heatmapData)[number]
  // 週ごとにグループ化
  const weeks: HeatmapDay[][] = []
  let currentWeek: HeatmapDay[] = []
  heatmapData.forEach((day, index) => {
    if (index % 7 === 0 && currentWeek.length > 0) {
      weeks.push(currentWeek)
      currentWeek = []
    }
    currentWeek.push(day)
  })
  if (currentWeek.length > 0) {
    weeks.push(currentWeek)
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-1 overflow-x-auto pb-2">
        {weeks.map((week, weekIndex) => (
          <div key={weekIndex} className="flex flex-col gap-1">
            {week.map((day) => {
              const intensity = getIntensity(day.minutes)
              return (
                <div
                  key={day.dateStr}
                  className={cn(
                    'w-3 h-3 rounded-sm',
                    intensity === 0 && 'bg-gray-100',
                    intensity === 1 && 'bg-blue-200',
                    intensity === 2 && 'bg-blue-400',
                    intensity === 3 && 'bg-blue-600',
                    intensity === 4 && 'bg-blue-800'
                  )}
                  title={`${format(day.date, 'yyyy年MM月dd日')}: ${day.minutes}分`}
                />
              )
            })}
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>少ない</span>
        <div className="flex gap-1">
          <div className="w-3 h-3 rounded-sm bg-gray-100" />
          <div className="w-3 h-3 rounded-sm bg-blue-200" />
          <div className="w-3 h-3 rounded-sm bg-blue-400" />
          <div className="w-3 h-3 rounded-sm bg-blue-600" />
          <div className="w-3 h-3 rounded-sm bg-blue-800" />
        </div>
        <span>多い</span>
      </div>
    </div>
  )
}
