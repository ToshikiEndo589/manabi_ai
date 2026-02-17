export default function RootPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 p-4">
      <div className="w-full max-w-md space-y-8 rounded-xl bg-white p-8 shadow-lg text-center">
        <h2 className="text-2xl font-bold text-gray-900">モバイルアプリをご利用ください</h2>
        <p className="text-gray-600">
          このWebサイトはアプリの補助機能（メール認証など）のために使用されます。<br />
          学習機能はモバイルアプリをご利用ください。
        </p>
      </div>
    </div>
  )
}
