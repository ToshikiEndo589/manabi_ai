'use client'

import { useEffect, useMemo, useState } from 'react'
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from 'recharts'
import type { StudyLog } from '@/types/database'

interface SubjectChartProps {
  studyLogs: StudyLog[]
}

const COLORS = [
  '#3b82f6', // blue-500
  '#10b981', // green-500
  '#f59e0b', // amber-500
  '#ef4444', // red-500
  '#8b5cf6', // violet-500
  '#ec4899', // pink-500
  '#06b6d4', // cyan-500
  '#f97316', // orange-500
  '#84cc16', // lime-500
  '#6366f1', // indigo-500
]

export function SubjectChart({ studyLogs }: SubjectChartProps) {
  const [isSmallScreen, setIsSmallScreen] = useState(false)

  useEffect(() => {
    const mediaQuery = window.matchMedia('(max-width: 640px)')
    const handleChange = () => setIsSmallScreen(mediaQuery.matches)
    handleChange()
    mediaQuery.addEventListener('change', handleChange)
    return () => mediaQuery.removeEventListener('change', handleChange)
  }, [])

  const data = useMemo(() => {
    const subjectMap = new Map<string, number>()

    studyLogs.forEach((log) => {
      const existing = subjectMap.get(log.subject) || 0
      subjectMap.set(log.subject, existing + log.study_minutes)
    })

    return Array.from(subjectMap.entries())
      .map(([subject, minutes]) => ({
        name: subject,
        value: Math.round(minutes / 60 * 10) / 10, // 時間に変換（小数点第1位まで）
        minutes,
      }))
      .sort((a, b) => b.value - a.value)
  }, [studyLogs])

  if (data.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        学習記録がありません
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <ResponsiveContainer width="100%" height={260}>
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            labelLine={false}
            label={isSmallScreen ? undefined : ({ name, value }) => `${name}: ${value}h`}
            outerRadius={isSmallScreen ? 70 : 80}
            fill="#8884d8"
            dataKey="value"
          >
            {data.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
            ))}
          </Pie>
          {!isSmallScreen && (
            <Tooltip
              formatter={(value) => {
                const numericValue = typeof value === 'number' ? value : 0
                return [`${numericValue}時間`, '学習時間']
              }}
            />
          )}
        </PieChart>
      </ResponsiveContainer>

      <div className="space-y-2">
        {data.map((item, index) => (
          <div key={item.name} className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div
                className="w-4 h-4 rounded"
                style={{ backgroundColor: COLORS[index % COLORS.length] }}
              />
              <span className="text-sm">{item.name}</span>
            </div>
            <span className="text-sm font-semibold">{item.value}時間</span>
          </div>
        ))}
      </div>
    </div>
  )
}
