import { BottomNav } from '@/components/bottom-nav'

export default function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white pb-16">
      {children}
      <BottomNav />
    </div>
  )
}
