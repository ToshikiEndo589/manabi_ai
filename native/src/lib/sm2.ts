/**
 * SM-2 スペースドリペティションアルゴリズム
 *
 * quality（品質）の定義:
 *   5 = 完璧   - すぐに思い出せた
 *   3 = うろ覚え - 思い出せたが時間がかかった / まぐれ正解
 *   1 = 苦手   - 思い出せなかった / 不正解（自動）
 */

export type SM2Quality = 5 | 3 | 1
export type SM2Rating = 'perfect' | 'good' | 'hard'

export interface SM2State {
    interval: number      // 次の復習までの日数
    easeFactor: number    // 易しさの係数（最低 1.3）
    repetitions: number   // 連続正解回数
}

export interface SM2Result extends SM2State {
    nextDueDays: number   // 次の復習は何日後か
}

const MIN_EASE_FACTOR = 1.3

const QUALITY_MAP: Record<SM2Rating, SM2Quality> = {
    perfect: 5,
    good: 3,
    hard: 1,
}

/**
 * SM-2 アルゴリズムで次の復習日を計算する
 */
export function calculateSM2(
    rating: SM2Rating,
    state: SM2State
): SM2Result {
    const quality = QUALITY_MAP[rating]
    let { interval, easeFactor, repetitions } = state

    if (quality < 3) {
        // 苦手 (hard): 連続正解リセット → 明日から再スタート
        repetitions = 0
        interval = 1
        // 易しさの係数を下げる（最低値を下回らないように）
        easeFactor = Math.max(MIN_EASE_FACTOR, easeFactor - 0.54)
    } else {
        // 正解（完璧 or うろ覚え）
        if (repetitions === 0) {
            interval = 1       // 初回正解 → 1日後
        } else if (repetitions === 1) {
            interval = 6       // 2回目正解 → 6日後
        } else {
            // 3回目以降 → 直前インターバル × 易しさ係数
            interval = Math.round(interval * easeFactor)
        }
        repetitions += 1

        // 易しさの係数を更新（完璧なら上昇、うろ覚えなら低下）
        const delta = 0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02)
        easeFactor = Math.max(MIN_EASE_FACTOR, easeFactor + delta)
    }

    return {
        interval,
        easeFactor,
        repetitions,
        nextDueDays: interval,
    }
}

/**
 * 次の復習日時を計算する（JST 0時基準）
 */
export function getNextDueDate(nextDueDays: number): Date {
    const now = new Date()
    const jstNow = new Date(now.getTime() + 9 * 60 * 60 * 1000)
    const jstMidnight = new Date(
        Date.UTC(jstNow.getUTCFullYear(), jstNow.getUTCMonth(), jstNow.getUTCDate())
    )
    // 日本時間0時 = UTC前日15時 → JST補正して翌日の正確な0時を作る
    const baseMidnightUTC = jstMidnight.getTime() - 9 * 60 * 60 * 1000
    return new Date(baseMidnightUTC + nextDueDays * 24 * 60 * 60 * 1000 + 9 * 60 * 60 * 1000)
}
