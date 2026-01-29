'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

interface BadgeDisplayProps {
  badges: string[]
}

export function BadgeDisplay({ badges }: BadgeDisplayProps) {
  if (badges.length === 0) {
    return (
      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle className="text-lg">実績バッジ</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground text-center py-4">
            まだバッジはありません。学習を続けて獲得しましょう！
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="shadow-lg">
      <CardHeader>
        <CardTitle className="text-lg">実績バッジ</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap gap-2">
          {badges.map((badge, index) => (
            <div
              key={index}
              className="px-3 py-2 bg-gradient-to-r from-blue-100 to-purple-100 rounded-full text-sm font-semibold border border-blue-200 animate-fade-in"
            >
              {badge}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
