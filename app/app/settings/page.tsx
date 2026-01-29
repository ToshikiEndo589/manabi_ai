'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'
import Image from 'next/image'
import { User } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

const settingsSchema = z.object({
  weekday_target_minutes: z
    .number()
    .min(1, '平日の目標は1分以上で入力してください')
    .max(1440, '平日の目標は1440分以内で入力してください'),
  weekend_target_minutes: z
    .number()
    .min(1, '土日祝の目標は1分以上で入力してください')
    .max(1440, '土日祝の目標は1440分以内で入力してください'),
})

type SettingsForm = z.infer<typeof settingsSchema>

export default function SettingsPage() {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)
  const [isLoadingProfile, setIsLoadingProfile] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false)
  const avatarInputRef = useRef<HTMLInputElement>(null)

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<SettingsForm>({
    resolver: zodResolver(settingsSchema),
  })

  useEffect(() => {
    const loadProfile = async () => {
      try {
        const supabase = createClient()
        const {
          data: { user },
        } = await supabase.auth.getUser()

        if (!user) {
          router.push('/login')
          return
        }

        const { data: profile, error } = await supabase
          .from('profiles')
          .select('*')
          .eq('user_id', user.id)
          .single()

        if (error) {
          throw error
        }

        if (profile) {
          reset({
            weekday_target_minutes: profile.weekday_target_minutes ?? 60,
            weekend_target_minutes: profile.weekend_target_minutes ?? 120,
          })
          if (profile.avatar_url) {
            setAvatarUrl(profile.avatar_url)
          }
        }
      } catch (err: any) {
        setError(err.message || 'プロフィールの読み込みに失敗しました')
      } finally {
        setIsLoadingProfile(false)
      }
    }

    loadProfile()
  }, [router, reset])

  const onSubmit = async (data: SettingsForm) => {
    setIsLoading(true)
    setError(null)

    try {
      const supabase = createClient()
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user) {
        throw new Error('ログインが必要です')
      }

      const { error: updateError } = await supabase
        .from('profiles')
        .update({
          weekday_target_minutes: data.weekday_target_minutes,
          weekend_target_minutes: data.weekend_target_minutes,
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', user.id)

      if (updateError) throw updateError

      router.refresh()
      alert('設定を更新しました')
    } catch (err: any) {
      setError(err.message || 'エラーが発生しました')
    } finally {
      setIsLoading(false)
    }
  }

  const handleAvatarSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) {
      alert('画像ファイルを選択してください')
      return
    }
    setIsUploadingAvatar(true)
    try {
      const supabase = createClient()
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) {
        alert('ログインが必要です')
        return
      }

      const fileExt = file.name.split('.').pop() || 'jpg'
      const filePath = `${user.id}/${Date.now()}.${fileExt}`
      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, file, { cacheControl: '3600', upsert: true })

      if (uploadError) {
        throw uploadError
      }

      const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(filePath)
      const publicUrl = urlData.publicUrl

      const { error: updateError } = await supabase
        .from('profiles')
        .update({
          avatar_url: publicUrl,
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', user.id)

      if (updateError) throw updateError

      setAvatarUrl(publicUrl)
      alert('アイコンを更新しました')
    } catch (err: any) {
      alert(err.message || 'アイコンのアップロードに失敗しました')
    } finally {
      setIsUploadingAvatar(false)
      if (avatarInputRef.current) {
        avatarInputRef.current.value = ''
      }
    }
  }

  const handleLogout = async () => {
    try {
      const supabase = createClient()
      await supabase.auth.signOut()
      router.push('/login')
      router.refresh()
    } catch (err: any) {
      setError(err.message || 'ログアウトに失敗しました')
    }
  }

  if (isLoadingProfile) {
    return (
      <div className="w-full px-4 py-8">
        <Card>
          <CardContent className="pt-6">
            <p className="text-center text-muted-foreground">読み込み中...</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="w-full px-3 py-6">
      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle>設定</CardTitle>
          <CardDescription>学習目標を更新できます</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            {error && (
              <div className="p-3 text-sm text-red-600 bg-red-50 rounded-md">
                {error}
              </div>
            )}

            <div className="flex items-center gap-4">
              <div className="relative w-16 h-16 rounded-full overflow-hidden bg-slate-100 flex items-center justify-center">
                {avatarUrl ? (
                  <Image src={avatarUrl} alt="アイコン" fill className="object-cover" />
                ) : (
                  <User className="w-7 h-7 text-slate-400" />
                )}
              </div>
              <div className="space-y-2">
                <input
                  ref={avatarInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleAvatarSelect}
                  className="hidden"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => avatarInputRef.current?.click()}
                  disabled={isUploadingAvatar}
                >
                  {isUploadingAvatar ? 'アップロード中...' : 'アイコンを変更'}
                </Button>
                <p className="text-xs text-muted-foreground">正方形の画像がきれいに表示されます</p>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="weekday_target_minutes">平日の目標学習時間（分）</Label>
              <Input
                id="weekday_target_minutes"
                type="number"
                min="1"
                max="1440"
                placeholder="60"
                {...register('weekday_target_minutes', {
                  valueAsNumber: true,
                })}
              />
              {errors.weekday_target_minutes && (
                <p className="text-sm text-red-600">
                  {errors.weekday_target_minutes.message}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="weekend_target_minutes">土日祝の目標学習時間（分）</Label>
              <Input
                id="weekend_target_minutes"
                type="number"
                min="1"
                max="1440"
                placeholder="120"
                {...register('weekend_target_minutes', {
                  valueAsNumber: true,
                })}
              />
              {errors.weekend_target_minutes && (
                <p className="text-sm text-red-600">
                  {errors.weekend_target_minutes.message}
                </p>
              )}
            </div>

            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? '更新中...' : '設定を更新'}
            </Button>
          </form>

          <div className="mt-6 pt-6 border-t space-y-3">
            <Button
              type="button"
              variant="destructive"
              className="w-full"
              onClick={handleLogout}
            >
              ログアウト
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
