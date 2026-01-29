/**
 * 学習タイマーの永続化（localStorage）
 */

const STORAGE_KEY = 'study_timer_state'

export interface TimerState {
  isRunning: boolean
  seconds: number
  referenceBookId: string | null
  startTime: number | null // タイマー開始時刻（ミリ秒）
}

export function saveTimerState(state: TimerState): void {
  if (typeof window !== 'undefined') {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  }
}

export function loadTimerState(): TimerState | null {
  if (typeof window !== 'undefined') {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved) {
      try {
        const state = JSON.parse(saved) as TimerState
        // タイマーが実行中の場合、経過時間を再計算
        if (state.isRunning && state.startTime) {
          const elapsed = Math.floor((Date.now() - state.startTime) / 1000)
          state.seconds = elapsed
        }
        return state
      } catch (e) {
        console.error('Failed to load timer state:', e)
      }
    }
  }
  return null
}

export function clearTimerState(): void {
  if (typeof window !== 'undefined') {
    localStorage.removeItem(STORAGE_KEY)
  }
}
