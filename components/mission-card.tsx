'use client'

import { Card, CardContent } from '@/components/ui/card'
import { CheckCircle2, Circle } from 'lucide-react'

interface MissionCardProps {
  title: string
  description: string
  target: number
  current: number
  completed: boolean
}

export function MissionCard({
  title,
  description,
  target,
  current,
  completed,
}: MissionCardProps) {
  const progress = Math.min(100, (current / target) * 100)

  return (
    <Card
      className={`shadow-lg transition-all ${
        completed
          ? 'bg-gradient-to-r from-green-50 to-emerald-50 border-green-200'
          : 'bg-gradient-to-r from-blue-50 to-indigo-50'
      }`}
    >
      <CardContent className="pt-6">
        <div className="flex items-start justify-between mb-3">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              {completed ? (
                <CheckCircle2 className="w-5 h-5 text-green-600" />
              ) : (
                <Circle className="w-5 h-5 text-blue-600" />
              )}
              <h3 className="font-bold text-lg">{title}</h3>
            </div>
            <p className="text-sm text-muted-foreground mb-3">{description}</p>
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">進捗</span>
            <span className="font-semibold">
              {current}分 / {target}分
            </span>
          </div>
          <div className="w-full bg-muted rounded-full h-3 overflow-hidden">
            <div
              className={`h-full transition-all duration-500 rounded-full ${
                completed
                  ? 'bg-gradient-to-r from-green-500 to-emerald-500'
                  : 'bg-gradient-to-r from-blue-500 to-indigo-500'
              }`}
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        {completed && (
          <div className="mt-3 text-center">
            <span className="text-sm font-semibold text-green-600">
              🎉 ミッション達成！
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
