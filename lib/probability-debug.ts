/**
 * デバッグ用: 合格率計算の詳細をログ出力
 */
import type { Profile } from '@/types/database'

export function debugProbabilityCalculation(profile: Profile) {
  console.log('=== 合格率計算デバッグ ===')
  console.log('Profile:', {
    current_deviation: profile.current_deviation,
    target_deviation: profile.target_deviation,
    exam_date: profile.exam_date,
  })
  
  const examDate = profile.exam_date 
    ? new Date(profile.exam_date.split('T')[0] + 'T00:00:00')
    : new Date(`${new Date().getFullYear() + 1}-02-01T00:00:00`)
  
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const examDateOnly = new Date(examDate.getFullYear(), examDate.getMonth(), examDate.getDate())
  
  const daysUntilExam = Math.max(0, Math.ceil((examDateOnly.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)))
  
  console.log('Date calculations:', {
    examDate: examDate.toISOString(),
    today: today.toISOString(),
    examDateOnly: examDateOnly.toISOString(),
    daysUntilExam,
  })
  
  return daysUntilExam
}
