export default function AuthCompletedPage() {
    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
            <div className="max-w-md w-full bg-white rounded-xl shadow-lg p-8 text-center">
                <div className="mb-6 flex justify-center">
                    <div className="bg-green-100 p-3 rounded-full">
                        <svg className="w-8 h-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                    </div>
                </div>

                <h2 className="text-2xl font-bold text-gray-900 mb-4">
                    メール確認が完了しました
                </h2>

                <p className="text-gray-600 mb-8">
                    アカウントの登録が完了しました。<br />
                    アプリに戻ってログインしてください。
                </p>

                <div className="bg-blue-50 p-4 rounded-lg text-sm text-blue-800">
                    この画面は閉じても大丈夫です。
                </div>
            </div>
        </div>
    )
}
