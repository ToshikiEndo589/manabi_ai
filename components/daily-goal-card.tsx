'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { Profile } from '@/types/database'

interface DailyGoalCardProps {
  profile: Profile
  todayMinutes: number
}

const getLocalDateString = () => {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function DailyGoalCard({ profile, todayMinutes }: DailyGoalCardProps) {
  const router = useRouter()
  const [isSaving, setIsSaving] = useState(false)
  const [overrideMinutes, setOverrideMinutes] = useState<string>(() => {
    if (profile.today_target_date === getLocalDateString() && profile.today_target_minutes) {
      return String(profile.today_target_minutes)
    }
    return ''
  })

  const { targetMinutes, isWeekend } = useMemo(() => {
    const today = new Date()
    const day = today.getDay()
    const weekend = day === 0 || day === 6
    const defaultTarget = weekend
      ? profile.weekend_target_minutes ?? 120
      : profile.weekday_target_minutes ?? 60

    const todayOverride =
      profile.today_target_date === getLocalDateString()
        ? profile.today_target_minutes
        : null

    return {
      targetMinutes: todayOverride ?? defaultTarget,
      isWeekend: weekend,
    }
  }, [profile])

  const progress = Math.min(100, Math.round((todayMinutes / Math.max(1, targetMinutes)) * 100))

  const handleSaveTodayTarget = async () => {
    const minutes = parseInt(overrideMinutes, 10)
    if (isNaN(minutes) || minutes < 1) {
      alert('1分以上で入力してください')
      return
    }
    setIsSaving(true)
    try {
      const supabase = createClient()
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) return

      const today = getLocalDateString()
      const { error } = await supabase
        .from('profiles')
        .update({
          today_target_minutes: minutes,
          today_target_date: today,
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', user.id)

      if (error) throw error
      router.refresh()
    } catch (err: any) {
      alert(err.message || '更新に失敗しました')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Card className="shadow-lg border-2 border-blue-200">
      <CardHeader>
        <CardTitle className="text-lg">今日の目標</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>{isWeekend ? '土日祝' : '平日'}の目標</span>
            <span>{targetMinutes}分</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-4 overflow-hidden">
            <div
              className="h-full bg-blue-500 transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="text-sm text-muted-foreground">
            今日の学習: {todayMinutes}分 / 達成率 {progress}%
          </div>
        </div>

        <div className="flex items-end gap-2">
          <div className="flex-1 space-y-1">
            <label className="text-xs text-muted-foreground">今日の目標を変更</label>
            <Input
              type="number"
              min="1"
              value={overrideMinutes}
              onChange={(e) => setOverrideMinutes(e.target.value)}
              placeholder={`${targetMinutes}`}
            />
          </div>
          <Button onClick={handleSaveTodayTarget} disabled={isSaving}>
            {isSaving ? '保存中...' : '更新'}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
