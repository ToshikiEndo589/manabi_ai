'use client'

import { useRouter } from 'next/navigation'
import { useEffect } from 'react'

export default function AuthCodeError() {
    const router = useRouter()

    useEffect(() => {
        // After 3 seconds, redirect to login
        const timer = setTimeout(() => {
            router.push('/login')
        }, 3000)

        return () => clearTimeout(timer)
    }, [router])

    return (
        <div className="min-h-screen flex items-center justify-center bg-blue-50 px-4">
            <div className="max-w-md w-full bg-white rounded-2xl shadow-lg p-8">
                <div className="text-center">
                    <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-red-100 mb-4">
                        <svg className="h-8 w-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </div>
                    <h2 className="text-2xl font-bold text-gray-900 mb-2">認証エラー</h2>
                    <p className="text-gray-600 mb-4">
                        リンクが無効または期限切れです。
                    </p>
                    <p className="text-sm text-gray-500">
                        もう一度パスワードリセットをリクエストしてください。
                    </p>
                    <p className="text-sm text-gray-400 mt-4">
                        3秒後にログイン画面にリダイレクトします...
                    </p>
                </div>
            </div>
        </div>
    )
}
