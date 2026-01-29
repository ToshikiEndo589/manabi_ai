import Image from 'next/image'

export function Loading() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-4">
      <div className="relative w-32 h-32 mb-4 animate-bounce-slow">
        <Image
          src="/images/mascot.png"
          alt="マスコット"
          fill
          className="object-contain"
          priority
        />
      </div>
      <p className="text-muted-foreground">読み込み中...</p>
    </div>
  )
}
