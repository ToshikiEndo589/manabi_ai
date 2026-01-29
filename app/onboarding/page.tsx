'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

const onboardingSchema = z.object({
  school_name: z.string().min(1, '志望校名を入力してください'),
  current_deviation: z
    .number()
    .min(0, '偏差値は0以上で入力してください')
    .max(100, '偏差値は100以下で入力してください'),
  target_deviation: z
    .number()
    .min(0, '目標偏差値は0以上で入力してください')
    .max(100, '目標偏差値は100以下で入力してください'),
  exam_date: z.string().optional(), // 第1段階ではオプショナル
})

type OnboardingForm = z.infer<typeof onboardingSchema>

export default function OnboardingPage() {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<OnboardingForm>({
    resolver: zodResolver(onboardingSchema),
    defaultValues: {
      current_deviation: 50,
      target_deviation: 50,
      exam_date: undefined, // 第1段階ではオプショナル
    },
  })

  const currentDeviation = watch('current_deviation')

  // 目標偏差値が変更されたら、現在偏差値と同じ値に更新
  const handleCurrentDeviationChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseFloat(e.target.value) || 0
    // 目標偏差値も同じ値に設定
    const targetInput = document.getElementById('target_deviation') as HTMLInputElement
    if (targetInput) {
      targetInput.value = value.toString()
    }
  }

  const onSubmit = async (data: OnboardingForm) => {
    setIsLoading(true)
    setError(null)

    try {
      const supabase = createClient()
      
      // セッションを確認し、必要に応じて再取得
      let {
        data: { user },
      } = await supabase.auth.getUser()

      // ユーザーが取得できない場合、セッションを再取得
      if (!user) {
        const {
          data: { session },
        } = await supabase.auth.getSession()
        
        if (!session) {
          // セッションがない場合、少し待ってから再試行
          await new Promise((resolve) => setTimeout(resolve, 500))
          const retryResult = await supabase.auth.getUser()
          user = retryResult.data.user
        } else {
          // セッションがある場合は、ユーザー情報を再取得
          const retryResult = await supabase.auth.getUser()
          user = retryResult.data.user
        }
      }

      if (!user) {
        throw new Error('ログインが必要です。ページをリロードして再度お試しください。')
      }

      // プロフィールを作成
      const { error: profileError } = await supabase.from('profiles').insert({
        user_id: user.id,
        school_name: data.school_name,
        current_deviation: data.current_deviation,
        target_deviation: data.target_deviation,
        exam_date: data.exam_date || null, // オプショナルなのでnullを許可
        onboarding_completed: true,
      })

      if (profileError) {
        // 既にプロフィールが存在する場合は更新
        if (profileError.code === '23505') {
          const { error: updateError } = await supabase
            .from('profiles')
            .update({
              school_name: data.school_name,
              current_deviation: data.current_deviation,
              target_deviation: data.target_deviation,
              exam_date: data.exam_date || null, // オプショナルなのでnullを許可
              onboarding_completed: true,
              updated_at: new Date().toISOString(),
            })
            .eq('user_id', user.id)

          if (updateError) throw updateError
        } else {
          throw profileError
        }
      }

      // オンボーディング完了後、ホームへ
      router.push('/app/home')
      router.refresh()
    } catch (err: any) {
      setError(err.message || 'エラーが発生しました')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-gradient-to-b from-blue-50 to-white">
      <div className="w-full max-w-md space-y-8">
        {/* マスコット画像 */}
        <div className="flex justify-center">
          <div className="relative w-32 h-32">
            <Image
              src="/images/mascot.png"
              alt="マスコット"
              fill
              className="object-contain"
              priority
            />
          </div>
        </div>

        <Card className="shadow-lg">
          <CardHeader className="space-y-1">
            <CardTitle className="text-2xl font-bold text-center">
              初回設定
            </CardTitle>
            <CardDescription className="text-center">
              志望校、現在の偏差値、試験年度を入力してください
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              {error && (
                <div className="p-3 text-sm text-red-600 bg-red-50 rounded-md">
                  {error}
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="school_name">志望校名</Label>
                <Input
                  id="school_name"
                  type="text"
                  placeholder="例: 東京大学"
                  {...register('school_name')}
                />
                {errors.school_name && (
                  <p className="text-sm text-red-600">{errors.school_name.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="current_deviation">現在の偏差値</Label>
                <Input
                  id="current_deviation"
                  type="number"
                  min="0"
                  max="100"
                  step="0.1"
                  placeholder="50"
                  {...register('current_deviation', {
                    valueAsNumber: true,
                    onChange: handleCurrentDeviationChange,
                  })}
                />
                {errors.current_deviation && (
                  <p className="text-sm text-red-600">
                    {errors.current_deviation.message}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="target_deviation">目標偏差値</Label>
                <Input
                  id="target_deviation"
                  type="number"
                  min="0"
                  max="100"
                  step="0.1"
                  placeholder="50"
                  {...register('target_deviation', {
                    valueAsNumber: true,
                  })}
                />
                {errors.target_deviation && (
                  <p className="text-sm text-red-600">
                    {errors.target_deviation.message}
                  </p>
                )}
                <p className="text-xs text-muted-foreground">
                  初期値は現在の偏差値と同じ値に設定されます
                </p>
              </div>

              {/* 第1段階では試験日はオプショナル（後で設定で変更可能） */}
              <div className="space-y-2">
                <Label htmlFor="exam_date">試験日（任意）</Label>
                <Input
                  id="exam_date"
                  type="date"
                  {...register('exam_date')}
                />
                {errors.exam_date && (
                  <p className="text-sm text-red-600">
                    {errors.exam_date.message}
                  </p>
                )}
                <p className="text-xs text-muted-foreground">
                  試験日が近づくにつれて、合格率の精度が上がります。後で設定から変更できます。
                </p>
              </div>

              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? '処理中...' : '設定を完了する'}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
