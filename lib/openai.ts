/**
 * OpenAI API クライアント
 * 第2段階のQ&A機能で使用予定
 */

export async function createOpenAIClient() {
  const apiKey = process.env.OPENAI_API_KEY

  if (!apiKey) {
    throw new Error(
      'Missing OpenAI API key. Please set OPENAI_API_KEY in your .env.local file.'
    )
  }

  // 第2段階で実装予定
  return {
    apiKey,
    // ここにOpenAI API呼び出し関数を追加
  }
}
