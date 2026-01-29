'use client'

import { useMemo, useState } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { format } from 'date-fns'
import { ja } from 'date-fns/locale'
import { getStudyDay, getTodayDate } from '@/lib/date-utils'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { StudyLog, ReferenceBook } from '@/types/database'
import { Button } from '@/components/ui/button'
import { getMaterialColor } from '@/lib/color-utils'

interface CategoryStackedChartProps {
  studyLogs: StudyLog[]
  referenceBooks?: ReferenceBook[]
}

const PERIOD_OPTIONS = [
  { label: '7日', type: 'week' as const },
  { label: '30日', type: 'month' as const },
] as const

export function CategoryStackedChart({ studyLogs, referenceBooks = [] }: CategoryStackedChartProps) {
  const [selectedPeriodType, setSelectedPeriodType] = useState<'week' | 'month'>('week')
  const [dateOffset, setDateOffset] = useState(0) // 日付のオフセット（クリックでシフト）
  const todayLabel = format(getTodayDate(), 'M/d')

  const { chartData, categories, maxValue, weekdayMap } = useMemo(() => {
    // 教材名の一覧を取得（reference_book_idがある場合はそのname、ない場合はsubject）
    const materialSet = new Set<string>()
    studyLogs.forEach((log) => {
      if (log.reference_book_id) {
        const book = referenceBooks.find((b) => b.id === log.reference_book_id)
        if (book) {
          materialSet.add(book.name)
        } else if (log.subject) {
          materialSet.add(log.subject)
        }
      } else if (log.subject) {
        materialSet.add(log.subject)
      }
    })
    const categoryList = Array.from(materialSet).sort()

    if (studyLogs.length === 0) {
      return { chartData: [], categories: categoryList, maxValue: 0, weekdayMap: new Map<string, string>() }
    }

    const logDates = studyLogs.map((log) => getStudyDay(new Date(log.started_at)))
    const uniqueDates = Array.from(new Set(logDates)).sort()

    if (uniqueDates.length === 0) {
      return { chartData: [], categories: categoryList, maxValue: 0, weekdayMap: new Map<string, string>() }
    }

    const today = getTodayDate() // 03:00-03:00の区切りで今日を取得

    // 表示する日付の範囲を決定
    let startDate = new Date(today)
    let endDate = new Date(today)

    if (selectedPeriodType === 'week') {
      // 直近7日（今日が先頭）
      endDate = new Date(today)
      endDate.setDate(endDate.getDate() - dateOffset * 7)
      startDate = new Date(endDate)
      startDate.setDate(startDate.getDate() - 6)
    } else if (selectedPeriodType === 'month') {
      // 直近30日（今日が先頭）
      endDate = new Date(today)
      endDate.setDate(endDate.getDate() - dateOffset * 30)
      startDate = new Date(endDate)
      startDate.setDate(startDate.getDate() - 29)
    }
    
    // 開始日の時刻を12:00:00に設定して、getStudyDayの判定に影響されないようにする
    startDate.setHours(12, 0, 0, 0)
    endDate.setHours(12, 0, 0, 0)

    // 日付ごとのデータを生成
    const result: Array<{
      date: string
      fullDate: string
      [key: string]: string | number
    }> = []

    const currentDate = new Date(endDate)
    
    while (currentDate >= startDate) {
      // グラフの日付ラベル用（表示のみ）
      const dateLabel = format(currentDate, 'M/d')
      // データの日付判定用（03:00-03:00の区切りで判定）
      // currentDateは12:00:00に設定されているので、getStudyDayはその日付をそのまま返す
      const studyDay = getStudyDay(currentDate)

      const dayData: { date: string; fullDate: string; [key: string]: string | number } = {
        date: dateLabel,
        fullDate: studyDay,
      }

      // 各カテゴリの学習時間を集計
      // started_atの日付を03:00-03:00の区切りで判定して、グラフの日付と一致するか確認
      const dayLogs = studyLogs.filter((log) => {
        const logDay = getStudyDay(new Date(log.started_at))
        return logDay === studyDay
      })

      categoryList.forEach((category) => {
        const categoryMinutes = dayLogs
          .filter((log) => log.subject === category)
          .reduce((sum, log) => sum + log.study_minutes, 0)
        // 0分の場合はキーを設定しない（バーを表示しない）
        if (categoryMinutes > 0) {
          // 時間に変換（小数点第2位まで保持して、数分のデータも正確に表示）
          dayData[category] = Math.round((categoryMinutes / 60) * 100) / 100
        }
      })

      result.push(dayData)
      currentDate.setDate(currentDate.getDate() - 1)
      // 時刻を12:00:00に維持
      currentDate.setHours(12, 0, 0, 0)
    }

    // データの最大値を計算（0より大きい値のみ）
    const allValues = result.flatMap((d) =>
      categoryList.map((cat) => (d[cat] as number) || 0)
    ).filter((v) => v > 0)
    const maxValue = allValues.length > 0 ? Math.max(...allValues) : 0

    const weekdayMap = new Map<string, string>()
    result.forEach(({ date, fullDate }) => {
      const dateObj = new Date(`${fullDate}T12:00:00`)
      weekdayMap.set(date, format(dateObj, 'EEE', { locale: ja }))
    })

    return { chartData: result, categories: categoryList, maxValue, weekdayMap }
  }, [studyLogs, selectedPeriodType, dateOffset])

  const WeekTick = ({ x, y, payload }: { x?: number; y?: number; payload?: { value?: string } }) => {
    const label = payload?.value || ''
    const weekday = weekdayMap.get(label) || ''
    const isToday = label === todayLabel
    const dateText = isToday ? '今日' : label
    if (x === undefined || y === undefined) return null
    return (
      <g transform={`translate(${x},${y})`}>
        <text textAnchor="middle" fill="#6b7280" fontSize={10}>
          <tspan x="0" dy="0">{dateText}</tspan>
          <tspan x="0" dy="12">{weekday}</tspan>
        </text>
      </g>
    )
  }

  // 期間ラベルを生成
  const getPeriodLabel = (): string => {
    if (selectedPeriodType === 'week') {
      if (dateOffset === 0) return '過去7日'
      const start = dateOffset * 7
      const end = dateOffset * 7 + 6
      return `${start}日前〜${end}日前`
    } else if (selectedPeriodType === 'month') {
      if (dateOffset === 0) return '過去30日'
      const start = dateOffset * 30
      const end = dateOffset * 30 + 29
      return `${start}日前〜${end}日前`
    }
    return ''
  }

  if (chartData.length === 0 || categories.length === 0) {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="flex gap-1">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setDateOffset(dateOffset + 1)}
                className="h-7 w-7 p-0"
                title="前の期間を見る"
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setDateOffset(Math.max(0, dateOffset - 1))}
                disabled={dateOffset === 0}
                className="h-7 w-7 p-0"
                title="次の期間を見る"
              >
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
            {getPeriodLabel() && (
              <span className="text-sm text-muted-foreground font-medium">
                {getPeriodLabel()}
              </span>
            )}
          </div>
          <div className="flex gap-2">
            {PERIOD_OPTIONS.map((option) => (
              <Button
                key={option.label}
                variant={selectedPeriodType === option.type ? 'default' : 'outline'}
                size="sm"
                onClick={() => {
                  setSelectedPeriodType(option.type)
                  setDateOffset(0)
                }}
                className="h-7 text-xs"
              >
                {option.label}
              </Button>
            ))}
          </div>
        </div>
        <div className="text-center py-8 text-muted-foreground">
          学習記録がありません
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {/* 期間選択ボタンとナビゲーション */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="flex gap-1">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setDateOffset(dateOffset + 1)}
              className="h-7 w-7 p-0"
              title="前の期間を見る"
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setDateOffset(Math.max(0, dateOffset - 1))}
              disabled={dateOffset === 0}
              className="h-7 w-7 p-0"
              title="次の期間を見る"
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
          {getPeriodLabel() && (
            <span className="text-sm text-muted-foreground font-medium">
              {getPeriodLabel()}
            </span>
          )}
        </div>
        <div className="flex gap-2">
            {PERIOD_OPTIONS.map((option) => (
            <Button
              key={option.label}
                variant={selectedPeriodType === option.type ? 'default' : 'outline'}
              size="sm"
              onClick={() => {
                setSelectedPeriodType(option.type)
                setDateOffset(0) // 期間変更時はオフセットをリセット
              }}
              className="h-7 text-xs"
            >
              {option.label}
            </Button>
          ))}
        </div>
      </div>

      <div className="relative">
        <div>
          <div>
            <ResponsiveContainer width="100%" height={selectedPeriodType === 'month' ? 250 : 200}>
          <BarChart data={chartData} margin={{ top: 5, right: 40, left: 20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
            <XAxis
              dataKey="date"
              axisLine={false}
              tickLine={false}
              tick={selectedPeriodType === 'week' ? <WeekTick /> : { fontSize: 10, fill: '#6b7280' }}
              tickFormatter={
                selectedPeriodType === 'week'
                  ? undefined
                  : (label: string) => (label === todayLabel ? '今日' : label)
              }
              reversed
              angle={selectedPeriodType === 'month' ? -45 : 0}
              textAnchor={selectedPeriodType === 'month' ? 'end' : 'middle'}
              height={selectedPeriodType === 'month' ? 60 : 36}
              interval={selectedPeriodType === 'month' ? 2 : 0}
            />
            <YAxis
              tick={{ fontSize: 11, fill: '#6b7280' }}
              axisLine={false}
              tickLine={false}
              label={{ value: '時間', position: 'insideLeft', style: { textAnchor: 'middle', fill: '#6b7280', fontSize: 11 } }}
              domain={[0, (dataMax: number) => {
                // データの最大値に応じて適切なスケールを設定
                if (dataMax === 0) return 0.1 // データがない場合は0.1時間（6分）
                // 数分のデータも見えるように、常に少し余裕を持たせる
                if (dataMax < 0.05) return 0.05 // 3分未満の場合は0.05時間（3分）
                if (dataMax < 0.1) return 0.1 // 6分未満の場合は0.1時間（6分）
                if (dataMax < 0.5) return Math.max(0.1, Math.ceil(dataMax * 20) / 20) // 30分未満の場合は0.05時間刻み
                if (dataMax < 1) return Math.ceil(dataMax * 2) / 2 // 1時間未満の場合は0.5時間刻み
                if (dataMax < 5) return Math.ceil(dataMax) + 0.5 // 5時間未満の場合は少し余裕を持たせる
                return Math.max(5, Math.ceil(dataMax / 5) * 5) // 5時間以上の場合は5時間刻み
              }]}
              allowDecimals={true}
              tickFormatter={(value: number) => {
                // 目盛りの表示形式を調整
                if (value < 1) {
                  // 1時間未満の場合は分で表示
                  const minutes = Math.round(value * 60)
                  if (minutes === 0) return '0'
                  return `${minutes}分`
                }
                return `${value}時間`
              }}
            />
            <Tooltip
              formatter={(value, name) => {
                const numericValue = typeof value === 'number' ? value : 0
                // 0または非常に小さい値（0.001時間未満、約0.06秒）のみ非表示
                if (numericValue === 0 || numericValue < 0.001) return null
                const totalMinutes = Math.round(numericValue * 60)
                if (totalMinutes === 0) return null
                const hours = Math.floor(totalMinutes / 60)
                const mins = totalMinutes % 60
                if (hours > 0 && mins > 0) {
                  return [`${hours}時間${mins}分`, String(name)]
                } else if (hours > 0) {
                  return [`${hours}時間`, String(name)]
                } else {
                  return [`${mins}分`, String(name)]
                }
              }}
              labelFormatter={(label) => `日付: ${label}`}
              contentStyle={{
                backgroundColor: 'white',
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                padding: '8px',
              }}
            />
            {categories.map((category, index) => (
              <Bar
                key={category}
                dataKey={category}
                stackId="a"
                fill={getMaterialColor(category)}
                radius={index === categories.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]}
              />
            ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  )
}
