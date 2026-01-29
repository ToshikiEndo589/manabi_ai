/**
 * Markdown記法をプレーンテキストに変換
 */
export function markdownToText(text: string): string {
  return text
    // エスケープ文字を削除
    .replace(/\\([*_`#\[\]()\\])/g, '$1')
    // 太字・斜体を削除
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/__(.*?)__/g, '$1')
    .replace(/_(.*?)_/g, '$1')
    // コードブロックを削除
    .replace(/```[\s\S]*?```/g, '')
    .replace(/`([^`]+)`/g, '$1')
    // リンクをテキストに変換
    .replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1')
    // 見出し記号を削除
    .replace(/^#{1,6}\s+/gm, '')
    // リスト記号を削除
    .replace(/^[\*\-\+]\s+/gm, '')
    .replace(/^\d+\.\s+/gm, '')
    // 引用記号を削除
    .replace(/^>\s+/gm, '')
    // 水平線を削除
    .replace(/^---+$/gm, '')
    // 改行を保持
    .trim()
}
