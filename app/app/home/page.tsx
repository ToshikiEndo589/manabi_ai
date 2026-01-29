import Image from 'next/image'
import { getProfile, getStudyLogs } from '@/lib/supabase/queries'
import { createClient } from '@/lib/supabase/server'
import { calculateStreak } from '@/lib/gamification'
import { getThisMonthStart, getThisWeekStart, getTodayStart } from '@/lib/date-utils'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { StreakDisplay } from '@/components/streak-display'
import { DailyGoalCard } from '@/components/daily-goal-card'
import { WeeklyMonthlyGoalCards } from '@/components/weekly-monthly-goal-cards'

export default async function HomePage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return null
  }

  const [profile, studyLogs] = await Promise.all([
    getProfile(user.id),
    getStudyLogs(user.id),
  ])

  if (!profile) {
    return null
  }

  const streak = calculateStreak(studyLogs)
  const latestStudyLog = studyLogs[0] ?? null

  const getComment = (currentStreak: number): string => {
    if (currentStreak >= 7) return '🔥 最高！連続学習が続いてるよ！'
    if (currentStreak >= 3) return '💪 いい感じ！このペースを維持しよう！'
    if (currentStreak >= 1) return '✨ 今日も学習できたね！'
    return '📚 今日からスタート！一緒に頑張ろう！'
  }

  const todayStart = getTodayStart()
  const todayMinutes = studyLogs.reduce((sum, log) => {
    const logDate = new Date(log.started_at)
    return logDate >= todayStart ? sum + log.study_minutes : sum
  }, 0)

  const weekStart = getThisWeekStart()
  const monthStart = getThisMonthStart()

  const weekMinutes = studyLogs.reduce((sum, log) => {
    const logDate = new Date(log.started_at)
    return logDate >= weekStart ? sum + log.study_minutes : sum
  }, 0)

  const monthMinutes = studyLogs.reduce((sum, log) => {
    const logDate = new Date(log.started_at)
    return logDate >= monthStart ? sum + log.study_minutes : sum
  }, 0)

  return (
    <div className="w-full px-3 py-6">
      <div className="space-y-6">
        {/* マスコットと吹き出し */}
        <Card className="shadow-lg bg-gradient-to-br from-blue-50 to-indigo-50 border-blue-200">
          <CardContent className="pt-6">
            <div className="flex items-start space-x-4">
              <div className="relative w-24 h-24 flex-shrink-0 animate-bounce-slow rounded-full overflow-hidden" style={{ background: 'linear-gradient(to bottom right, rgb(239 246 255), rgb(238 242 255))' }}>
                <Image
                  src="/images/mascot.png"
                  alt="マスコット"
                  fill
                  className="object-cover"
                  priority
                />
              </div>
              <div className="flex-1 pt-2">
                <div className="bg-white rounded-lg p-4 border-2 border-blue-300 shadow-md relative">
                  <div className="absolute -left-2 top-6 w-0 h-0 border-t-8 border-t-transparent border-r-8 border-r-blue-300 border-b-8 border-b-transparent" />
                  <p className="text-sm font-medium text-foreground leading-relaxed">
                    {getComment(streak.currentStreak)}
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <DailyGoalCard
          profile={profile}
          todayMinutes={todayMinutes}
        />

        <WeeklyMonthlyGoalCards
          profile={profile}
          weekMinutes={weekMinutes}
          monthMinutes={monthMinutes}
        />

        {/* 学習記録サマリー */}
        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle className="text-lg">学習記録</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex justify-between items-center p-3 bg-blue-50 rounded-lg">
                <span className="text-muted-foreground font-medium">累積学習時間</span>
                <span className="font-bold text-lg text-blue-600">
                  {(() => {
                    const totalMinutes = studyLogs.reduce((sum, log) => sum + log.study_minutes, 0)
                    const hours = Math.floor(totalMinutes / 60)
                    const mins = totalMinutes % 60
                    if (hours > 0 && mins > 0) {
                      return `${hours}時間${mins}分`
                    } else if (hours > 0) {
                      return `${hours}時間`
                    } else {
                      return `${mins}分`
                    }
                  })()}
                </span>
              </div>
              {latestStudyLog && (
                <div className="flex justify-between items-center p-3 bg-purple-50 rounded-lg">
                  <span className="text-muted-foreground font-medium">最後の学習</span>
                  <span className="font-bold text-lg text-purple-600">
                    {new Date(latestStudyLog.started_at).toLocaleDateString('ja-JP')}
                  </span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* ストリーク表示 */}
        {streak.currentStreak > 0 && (
          <StreakDisplay
            currentStreak={streak.currentStreak}
            longestStreak={streak.longestStreak}
          />
        )}
      </div>
    </div>
  )
}
