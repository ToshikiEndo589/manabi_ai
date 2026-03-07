'use client'

import Image from 'next/image'

interface MascotMessageProps {
  message: string
  emotion?: 'happy' | 'encouraging' | 'warning' | 'excited'
}

export function MascotMessage({ message, emotion = 'happy' }: MascotMessageProps) {
  const emotionClass = {
    happy: 'border-blue-300 bg-blue-50',
    encouraging: 'border-green-300 bg-green-50',
    warning: 'border-orange-300 bg-orange-50',
    excited: 'border-purple-300 bg-purple-50',
  }[emotion]

  return (
    <div key={message} className="flex items-start space-x-4 animate-in fade-in duration-300">
      <div className="relative w-20 h-20 flex-shrink-0 rounded-full overflow-hidden" style={{ background: 'linear-gradient(to bottom right, rgb(239 246 255), rgb(238 242 255))' }}>
        <Image
          src="/images/mascot.png"
          alt="マスコット"
          fill
          className="object-cover animate-bounce-slow"
        />
      </div>
      <div className="flex-1 pt-2">
        <div className={`rounded-lg p-4 border-2 shadow-md relative ${emotionClass}`}>
          <div className="absolute -left-2 top-6 w-0 h-0 border-t-8 border-t-transparent border-r-8 border-r-current border-b-8 border-b-transparent" />
          <p className="text-sm font-medium text-foreground leading-relaxed relative z-10">
            {message}
          </p>
        </div>
      </div>
    </div>
  )
}
