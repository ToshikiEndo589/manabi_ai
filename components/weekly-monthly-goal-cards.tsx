'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { getThisMonthStart, getThisWeekStart } from '@/lib/date-utils'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { Profile } from '@/types/database'

interface WeeklyMonthlyGoalCardsProps {
  profile: Profile
  weekMinutes: number
  monthMinutes: number
}

const getLocalDateString = (date: Date) => {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function WeeklyMonthlyGoalCards({
  profile,
  weekMinutes,
  monthMinutes,
}: WeeklyMonthlyGoalCardsProps) {
  const router = useRouter()
  const [isSavingWeek, setIsSavingWeek] = useState(false)
  const [isSavingMonth, setIsSavingMonth] = useState(false)

  const weekStartDateString = useMemo(() => getLocalDateString(getThisWeekStart()), [])
  const monthStartDateString = useMemo(() => getLocalDateString(getThisMonthStart()), [])

  const [weekOverrideMinutes, setWeekOverrideMinutes] = useState<string>(() => {
    if (profile.week_target_date === weekStartDateString && profile.week_target_minutes) {
      return String(profile.week_target_minutes)
    }
    return ''
  })

  const [monthOverrideMinutes, setMonthOverrideMinutes] = useState<string>(() => {
    if (profile.month_target_date === monthStartDateString && profile.month_target_minutes) {
      return String(profile.month_target_minutes)
    }
    return ''
  })

  const todayDateString = getLocalDateString(new Date())

  const getDailyTargetForDate = (date: Date) => {
    const day = date.getDay()
    const isWeekend = day === 0 || day === 6
    const defaultTarget = isWeekend
      ? profile.weekend_target_minutes ?? 120
      : profile.weekday_target_minutes ?? 60

    if (profile.today_target_date === todayDateString) {
      const dateString = getLocalDateString(date)
      if (dateString === todayDateString && profile.today_target_minutes) {
        return profile.today_target_minutes
      }
    }

    return defaultTarget
  }

  const getTargetSum = (startDate: Date, endDate: Date) => {
    const cursor = new Date(startDate)
    cursor.setHours(12, 0, 0, 0)
    const end = new Date(endDate)
    end.setHours(12, 0, 0, 0)

    let total = 0
    while (cursor <= end) {
      total += getDailyTargetForDate(cursor)
      cursor.setDate(cursor.getDate() + 1)
    }
    return total
  }

  const weekTarget =
    profile.week_target_date === weekStartDateString && profile.week_target_minutes
      ? profile.week_target_minutes
      : getTargetSum(getThisWeekStart(), new Date())

  const monthTarget =
    profile.month_target_date === monthStartDateString && profile.month_target_minutes
      ? profile.month_target_minutes
      : getTargetSum(getThisMonthStart(), new Date())

  const weekProgress = Math.min(
    100,
    Math.round((weekMinutes / Math.max(1, weekTarget)) * 100)
  )
  const monthProgress = Math.min(
    100,
    Math.round((monthMinutes / Math.max(1, monthTarget)) * 100)
  )

  const handleSaveWeekTarget = async () => {
    const minutes = parseInt(weekOverrideMinutes, 10)
    if (isNaN(minutes) || minutes < 1) {
      alert('1分以上で入力してください')
      return
    }
    setIsSavingWeek(true)
    try {
      const supabase = createClient()
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) return

      const { error } = await supabase
        .from('profiles')
        .update({
          week_target_minutes: minutes,
          week_target_date: weekStartDateString,
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', user.id)

      if (error) throw error
      router.refresh()
    } catch (err: any) {
      alert(err.message || '更新に失敗しました')
    } finally {
      setIsSavingWeek(false)
    }
  }

  const handleSaveMonthTarget = async () => {
    const minutes = parseInt(monthOverrideMinutes, 10)
    if (isNaN(minutes) || minutes < 1) {
      alert('1分以上で入力してください')
      return
    }
    setIsSavingMonth(true)
    try {
      const supabase = createClient()
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) return

      const { error } = await supabase
        .from('profiles')
        .update({
          month_target_minutes: minutes,
          month_target_date: monthStartDateString,
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', user.id)

      if (error) throw error
      router.refresh()
    } catch (err: any) {
      alert(err.message || '更新に失敗しました')
    } finally {
      setIsSavingMonth(false)
    }
  }

  return (
    <>
      <Card className="shadow-lg border-2 border-blue-200">
        <CardHeader>
          <CardTitle className="text-lg">今週の目標</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>今週の目標</span>
              <span>{weekTarget}分</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-4 overflow-hidden">
              <div
                className="h-full bg-blue-500 transition-all"
                style={{ width: `${weekProgress}%` }}
              />
            </div>
            <div className="text-sm text-muted-foreground">
              今週の学習: {weekMinutes}分 / 達成率 {weekProgress}%
            </div>
          </div>

          <div className="flex items-end gap-2">
            <div className="flex-1 space-y-1">
              <label className="text-xs text-muted-foreground">今週の目標を変更</label>
              <Input
                type="number"
                min="1"
                value={weekOverrideMinutes}
                onChange={(e) => setWeekOverrideMinutes(e.target.value)}
                placeholder={`${weekTarget}`}
              />
            </div>
            <Button onClick={handleSaveWeekTarget} disabled={isSavingWeek}>
              {isSavingWeek ? '保存中...' : '更新'}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="shadow-lg border-2 border-blue-200">
        <CardHeader>
          <CardTitle className="text-lg">今月の目標</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>今月の目標</span>
              <span>{monthTarget}分</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-4 overflow-hidden">
              <div
                className="h-full bg-blue-500 transition-all"
                style={{ width: `${monthProgress}%` }}
              />
            </div>
            <div className="text-sm text-muted-foreground">
              今月の学習: {monthMinutes}分 / 達成率 {monthProgress}%
            </div>
          </div>

          <div className="flex items-end gap-2">
            <div className="flex-1 space-y-1">
              <label className="text-xs text-muted-foreground">今月の目標を変更</label>
              <Input
                type="number"
                min="1"
                value={monthOverrideMinutes}
                onChange={(e) => setMonthOverrideMinutes(e.target.value)}
                placeholder={`${monthTarget}`}
              />
            </div>
            <Button onClick={handleSaveMonthTarget} disabled={isSavingMonth}>
              {isSavingMonth ? '保存中...' : '更新'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </>
  )
}
