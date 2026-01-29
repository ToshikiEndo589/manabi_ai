'use client'

import { useMemo } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { format, subDays } from 'date-fns'
import { getStudyDay } from '@/lib/date-utils'

interface DailyStudyChartProps {
  dailyStudyMinutes: Record<string, number>
}

export function DailyStudyChart({ dailyStudyMinutes }: DailyStudyChartProps) {
  const data = useMemo(() => {
    const result = []
    const today = new Date()

    // 過去30日分のデータを生成
    for (let i = 29; i >= 0; i--) {
      const date = subDays(today, i)
      const studyDay = getStudyDay(date)
      const minutes = dailyStudyMinutes[studyDay] || 0

      result.push({
        date: format(date, 'M/d'),
        fullDate: studyDay,
        minutes,
        hours: Math.floor(minutes / 60),
        minutesRemainder: minutes % 60,
      })
    }

    return result
  }, [dailyStudyMinutes])

  if (data.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        学習記録がありません
      </div>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
        <XAxis
          dataKey="date"
          tick={{ fontSize: 12 }}
          interval="preserveStartEnd"
        />
        <YAxis
          tick={{ fontSize: 12 }}
          label={{ value: '学習時間(分)', angle: -90, position: 'insideLeft' }}
        />
        <Tooltip
          formatter={(value) => {
            const numericValue = typeof value === 'number' ? value : 0
            const hours = Math.floor(numericValue / 60)
            const minutes = numericValue % 60
            if (hours > 0) {
              return `${hours}時間${minutes}分`
            }
            return `${minutes}分`
          }}
          labelFormatter={(label, payload) => {
            if (payload && payload[0]) {
              return `日付: ${payload[0].payload.fullDate}`
            }
            return `日付: ${label}`
          }}
        />
        <Bar dataKey="minutes" fill="#3b82f6" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}
