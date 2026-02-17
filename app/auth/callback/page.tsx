'use client'

import { useState, Suspense, useRef, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

function AuthCallbackContent() {
    const router = useRouter()
    const searchParams = useSearchParams()
    const code = searchParams.get('code')
    const next = searchParams.get('next') ?? '/dashboard'
    const [error, setError] = useState<string | null>(null)
    const [verified, setVerified] = useState(false)
    const [verifying, setVerifying] = useState(false)
    const verifyAttempted = useRef(false)

    useEffect(() => {
        if (code && !verifyAttempted.current) {
            verifyAttempted.current = true
            handleVerify()
        } else if (!code && !verified) {
            setError('認証コードが見つかりません。')
        }
    }, [code])

    const handleVerify = async () => {
        if (!code) return

        setVerifying(true)
        setError(null)

        try {
            const supabase = createClient()
            const { error } = await supabase.auth.exchangeCodeForSession(code)

            if (error) throw error

            setVerified(true)

            // リダイレクトせず、完了画面を表示したままにする
        } catch (err: any) {
            console.error('Verification error:', err)
            // すでに使用済みなどの場合も想定されるが、ここではエラーを表示
            setError(err.message || '認証に失敗しました。')
        } finally {
            setVerifying(false)
        }
    }

    if (error) {
        return (
            <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 p-4">
                <div className="w-full max-w-md space-y-4 rounded-xl bg-white p-8 shadow-lg text-center">
                    <h2 className="text-xl font-bold text-red-600">認証エラー</h2>
                    <p className="text-gray-600 mb-4">{error}</p>
                    <p className="text-sm text-gray-500">
                        リンクが期限切れの可能性があります。<br />
                        アプリからもう一度登録をやり直してください。
                    </p>
                </div>
            </div>
        )
    }

    return (
        <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 p-4">
            <div className="w-full max-w-md space-y-8 rounded-xl bg-white p-8 shadow-lg text-center">
                <div className="flex justify-center">
                    {verified ? (
                        <div className="rounded-full bg-green-100 p-3">
                            <svg className="h-8 w-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                        </div>
                    ) : (
                        <div className="rounded-full bg-blue-100 p-3">
                            <svg className="h-8 w-8 text-blue-600 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                            </svg>
                        </div>
                    )}
                </div>

                <h2 className="text-2xl font-bold text-gray-900">
                    {verified ? '認証完了' : '認証中...'}
                </h2>

                <p className="text-gray-600">
                    {verified
                        ? 'メールアドレスの確認が完了しました。アプリに戻ります。'
                        : 'メールアドレスを確認しています。しばらくお待ちください...'}
                </p>
            </div>
        </div>
    )
}
// Need to add useRef to imports


export default function AuthCallbackPage() {
    return (
        <Suspense fallback={<div>Loading...</div>}>
            <AuthCallbackContent />
        </Suspense>
    )
}
