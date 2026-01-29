'use client'

import { useMemo } from 'react'
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from 'recharts'
import type { StudyLog } from '@/types/database'

interface CategoryPieChartProps {
  studyLogs: StudyLog[]
}

// カテゴリ別の色定義（CategoryStackedChartと同じ）
const CATEGORY_COLORS: Record<string, string> = {
  赤本: '#ef4444', // red-500
  古文: '#ec4899', // pink-500
  数学: '#10b981', // emerald-500
  英語: '#eab308', // yellow-500
  対策シリーズ: '#3b82f6', // blue-500
  物理: '#8b5cf6', // violet-500
  化学: '#f97316', // orange-500
  生物: '#06b6d4', // cyan-500
  日本史: '#84cc16', // lime-500
  世界史: '#6366f1', // indigo-500
}

// デフォルトの色パレット
const DEFAULT_COLORS = [
  '#ef4444', '#ec4899', '#10b981', '#eab308', '#3b82f6',
  '#8b5cf6', '#f97316', '#06b6d4', '#84cc16', '#6366f1',
]

export function CategoryPieChart({ studyLogs }: CategoryPieChartProps) {
  const data = useMemo(() => {
    const categoryMap = new Map<string, number>()

    studyLogs.forEach((log) => {
      if (log.subject) {
        const existing = categoryMap.get(log.subject) || 0
        categoryMap.set(log.subject, existing + log.study_minutes)
      }
    })

    const totalMinutes = Array.from(categoryMap.values()).reduce((sum, minutes) => sum + minutes, 0)

    if (totalMinutes === 0) {
      return []
    }

    return Array.from(categoryMap.entries())
      .map(([category, minutes]) => ({
        name: category,
        value: minutes,
        hours: Math.round((minutes / 60) * 10) / 10,
        percentage: 0, // 後で計算
      }))
      .map((item) => ({
        ...item,
        percentage: Math.round((item.value / totalMinutes) * 100),
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
    <div className="relative">
      <div className="flex flex-col md:flex-row items-center gap-6 pr-8">
        <div className="w-full md:w-1/2 flex justify-center">
          <ResponsiveContainer width="100%" height={250}>
            <PieChart>
              <Pie
                data={data}
                cx="50%"
                cy="50%"
                labelLine={false}
                outerRadius={80}
                fill="#8884d8"
                dataKey="value"
              >
                {data.map((entry, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={CATEGORY_COLORS[entry.name] || DEFAULT_COLORS[index % DEFAULT_COLORS.length]}
                  />
                ))}
              </Pie>
              <Tooltip
                formatter={(value, name, props) => {
                  const numericValue = typeof value === 'number' ? value : 0
                  const hours = Math.floor(numericValue / 60)
                  const minutes = numericValue % 60
                  const percentage =
                    typeof props?.payload?.percentage === 'number' ? props.payload.percentage : 0
                  return [`${hours}時間${minutes}分 (${percentage}%)`, String(name)]
                }}
                contentStyle={{
                  backgroundColor: 'white',
                  border: '1px solid #e5e7eb',
                  borderRadius: '8px',
                  padding: '8px',
                }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="w-full md:w-1/2 space-y-2.5">
          {data.map((item, index) => (
            <div key={item.name} className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div
                  className="w-3 h-3 rounded-full flex-shrink-0"
                  style={{
                    backgroundColor: CATEGORY_COLORS[item.name] || DEFAULT_COLORS[index % DEFAULT_COLORS.length],
                  }}
                />
                <span className="text-sm text-foreground">{item.name}</span>
              </div>
              <span className="text-sm font-semibold text-foreground">{item.percentage}%</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
