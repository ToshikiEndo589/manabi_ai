'use client'

import { Flame } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'

interface StreakDisplayProps {
  currentStreak: number
  longestStreak: number
}

export function StreakDisplay({ currentStreak, longestStreak }: StreakDisplayProps) {
  return (
    <Card className="bg-gradient-to-r from-orange-50 to-red-50 border-orange-200 shadow-lg">
      <CardContent className="pt-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="relative">
              <Flame className="w-8 h-8 text-orange-500 animate-pulse" />
              {currentStreak > 0 && (
                <div className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center text-white text-xs font-bold">
                  {currentStreak}
                </div>
              )}
            </div>
            <div>
              <div className="text-2xl font-bold text-orange-600">
                {currentStreak}日連続
              </div>
              <div className="text-sm text-muted-foreground">
                最長記録: {longestStreak}日
              </div>
            </div>
          </div>
          {currentStreak > 0 && (
            <div className="text-right">
              <div className="text-xs text-muted-foreground">🔥 燃えてる！</div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
