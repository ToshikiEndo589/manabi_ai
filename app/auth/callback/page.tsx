'use client'

import { useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

function AuthCallbackContent() {
    const router = useRouter()
    const searchParams = useSearchParams()
    const code = searchParams.get('code')
    const next = searchParams.get('next') ?? '/dashboard'
    const [error, setError] = useState<string | null>(null)
    const [loading, setLoading] = useState(false)
    const [verified, setVerified] = useState(false)

    const handleVerify = async () => {
        if (!code) {
            setError('認証コードが見つかりません。')
            return
        }

        setLoading(true)
        setError(null)

        try {
            const supabase = createClient()
            const { error } = await supabase.auth.exchangeCodeForSession(code)

            if (error) throw error

            setVerified(true)

            // 3秒後にリダイレクト
            setTimeout(() => {
                router.push(next)
            }, 3000)

        } catch (err: any) {
            console.error('Verification error:', err)
            setError(err.message || '認証に失敗しました。')
        } finally {
            setLoading(false)
        }
    }

    if (verified) {
        return (
            <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 p-4">
                <div className="w-full max-w-md space-y-8 rounded-xl bg-white p-8 shadow-lg text-center">
                    <div className="flex justify-center">
                        <div className="rounded-full bg-green-100 p-3">
                            <svg className="h-8 w-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                        </div>
                    </div>
                    <h2 className="text-2xl font-bold text-gray-900">認証完了</h2>
                    <p className="text-gray-600">
                        メールアドレスの確認が完了しました。<br />
                        自動的にリダイレクトします...
                    </p>
                </div>
            </div>
        )
    }

    return (
        <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 p-4">
            <div className="w-full max-w-md space-y-8 rounded-xl bg-white p-8 shadow-lg">
                <div className="text-center">
                    <h2 className="text-3xl font-bold tracking-tight text-gray-900">メールアドレスの確認</h2>
                    <p className="mt-2 text-sm text-gray-600">
                        以下のボタンをクリックして、認証を完了してください。
                    </p>
                </div>

                {error && (
                    <div className="rounded-md bg-red-50 p-4">
                        <div className="flex">
                            <div className="ml-3">
                                <h3 className="text-sm font-medium text-red-800">エラーが発生しました</h3>
                                <div className="mt-2 text-sm text-red-700">
                                    <p>{error}</p>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                <button
                    onClick={handleVerify}
                    disabled={loading || !code}
                    className={`group relative flex w-full justify-center rounded-md border border-transparent px-4 py-3 text-sm font-medium text-white transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${loading || !code
                            ? 'cursor-not-allowed bg-blue-400'
                            : 'bg-blue-600 hover:bg-blue-700'
                        }`}
                >
                    {loading ? (
                        <span className="flex items-center">
                            <svg className="mr-2 h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                            </svg>
                            処理中...
                        </span>
                    ) : (
                        '認証を完了する'
                    )}
                </button>
            </div>
        </div>
    )
}

export default function AuthCallbackPage() {
    return (
        <Suspense fallback={<div>Loading...</div>}>
            <AuthCallbackContent />
        </Suspense>
    )
}
