/**
 * 教材名から一貫した色を生成する関数
 * 同じ教材名は常に同じ色になる
 */

const COLOR_PALETTE = [
  '#ef4444', // red-500
  '#ec4899', // pink-500
  '#10b981', // emerald-500
  '#eab308', // yellow-500
  '#3b82f6', // blue-500
  '#8b5cf6', // violet-500
  '#f97316', // orange-500
  '#06b6d4', // cyan-500
  '#84cc16', // lime-500
  '#6366f1', // indigo-500
  '#f59e0b', // amber-500
  '#14b8a6', // teal-500
  '#a855f7', // purple-500
  '#f43f5e', // rose-500
  '#22c55e', // green-500
]

/**
 * 教材名から色を取得（同じ名前は常に同じ色）
 */
export function getMaterialColor(materialName: string): string {
  // 文字列のハッシュ値を計算
  let hash = 0
  for (let i = 0; i < materialName.length; i++) {
    const char = materialName.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash // Convert to 32bit integer
  }
  
  // ハッシュ値から色を選択
  const index = Math.abs(hash) % COLOR_PALETTE.length
  return COLOR_PALETTE[index]
}

/**
 * 全ての教材名と色のマッピングを取得
 */
export function getMaterialColorMap(materialNames: string[]): Map<string, string> {
  const map = new Map<string, string>()
  materialNames.forEach((name) => {
    if (!map.has(name)) {
      map.set(name, getMaterialColor(name))
    }
  })
  return map
}
