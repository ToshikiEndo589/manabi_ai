'use client'

import { useEffect, useMemo, useState } from 'react'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'
import type { StudyLog, ReferenceBook } from '@/types/database'
import { getMaterialColor } from '@/lib/color-utils'

interface ReferenceBookChartProps {
  studyLogs: StudyLog[]
  referenceBooks: ReferenceBook[]
  range?: {
    start: Date
    end: Date
  }
}

export function ReferenceBookChart({
  studyLogs,
  referenceBooks,
  range,
}: ReferenceBookChartProps) {
  const [isSmallScreen, setIsSmallScreen] = useState(false)

  useEffect(() => {
    const mediaQuery = window.matchMedia('(max-width: 640px)')
    const handleChange = () => setIsSmallScreen(mediaQuery.matches)
    handleChange()
    mediaQuery.addEventListener('change', handleChange)
    return () => mediaQuery.removeEventListener('change', handleChange)
  }, [])

  const data = useMemo(() => {
    const bookMap = new Map<string, { name: string; minutes: number }>()

    studyLogs.forEach((log) => {
      const logDate = new Date(log.started_at)
      if (range) {
        if (logDate < range.start || logDate >= range.end) return
      }

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
        // 後方互換性: reference_book_idがない場合はsubjectを使用
        const key = `subject_${log.subject}`
        const existing = bookMap.get(key) || { name: log.subject, minutes: 0 }
        bookMap.set(key, {
          name: existing.name,
          minutes: existing.minutes + log.study_minutes,
        })
      }
    })

    const totalMinutes = Array.from(bookMap.values()).reduce((sum, book) => sum + book.minutes, 0)

    return Array.from(bookMap.values())
      .map((book) => ({
        name: book.name,
        value: book.minutes,
        percentage: totalMinutes > 0 ? Math.round((book.minutes / totalMinutes) * 100) : 0,
        color: getMaterialColor(book.name),
      }))
      .filter((item) => item.value > 0)
      .sort((a, b) => b.value - a.value)
  }, [studyLogs, referenceBooks, range])

  if (data.length === 0) {
    return <div className="text-center py-6 text-muted-foreground">学習記録がありません</div>
  }

  const formatTime = (minutes: number): string => {
    const hours = Math.floor(minutes / 60)
    const mins = minutes % 60
    if (hours > 0 && mins > 0) return `${hours}時間${mins}分`
    if (hours > 0) return `${hours}時間`
    return `${mins}分`
  }

  // カスタムラベルコンポーネント（常に表示される）
  const renderCustomLabel = (entry: any) => {
    const { cx, cy, midAngle, innerRadius, outerRadius, percentage, value, payload } = entry
    const RADIAN = Math.PI / 180
    const radius = outerRadius + 14
    const x = cx + radius * Math.cos(-midAngle * RADIAN)
    const y = cy + radius * Math.sin(-midAngle * RADIAN)

    return (
      <text
        x={x}
        y={y}
        fill={payload?.color || '#111827'}
        textAnchor={x > cx ? 'start' : 'end'}
        dominantBaseline="central"
        fontSize={12}
        fontWeight="bold"
        style={{ pointerEvents: 'none', userSelect: 'none' }}
      >
        {`${percentage}% (${formatTime(value)})`}
      </text>
    )
  }

  return (
    <div className="space-y-4">
      <ResponsiveContainer width="100%" height={240}>
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            innerRadius={isSmallScreen ? 35 : 45}
            outerRadius={isSmallScreen ? 80 : 90}
            paddingAngle={2}
            label={isSmallScreen ? undefined : renderCustomLabel}
            labelLine={false}
            isAnimationActive={false}
          >
            {data.map((item) => (
              <Cell key={`cell-${item.name}`} fill={item.color} />
            ))}
          </Pie>
          {!isSmallScreen && (
            <Tooltip
              formatter={(value) => {
                const numericValue = typeof value === 'number' ? value : 0
                return formatTime(numericValue)
              }}
            />
          )}
        </PieChart>
      </ResponsiveContainer>

      <div className="space-y-2">
        {data.map((item) => (
          <div key={item.name} className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div
                className="w-3 h-3 rounded"
                style={{ backgroundColor: item.color }}
              />
              <span className="text-sm">{item.name}</span>
            </div>
            <span className="text-sm font-semibold">
              {formatTime(item.value)} ({item.percentage}%)
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
