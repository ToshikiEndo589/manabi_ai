import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

type HistoryMsg = { role: 'user' | 'assistant'; content: string; imageUrl?: string }

const buildResponsesInput = (
  history: HistoryMsg[],
  message?: string,
  image?: string
) => {
  const input: any[] = (history || []).map((msg) => {
    if (msg.role === 'user') {
      const content: any[] = [{ type: 'input_text', text: msg.content }]
      if (msg.imageUrl) {
        content.push({ type: 'input_image', image_url: msg.imageUrl, detail: 'auto' })
      }
      return {
        role: 'user',
        content,
      }
    }
    return {
      role: 'assistant',
      content: [{ type: 'output_text', text: msg.content }],
    }
  })

  if (image) {
    input.push({
      role: 'user',
      content: [
        {
          type: 'input_text',
          text: message || 'この画像について具体的に説明してください。',
        },
        {
          type: 'input_image',
          image_url: image, // URL でも data URL でもOK
          detail: 'auto', // 'low' | 'high' | 'auto'
        },
      ],
    })
  } else {
    input.push({
      role: 'user',
      content: [{ type: 'input_text', text: message || '' }],
    })
  }

  return input
}

const formatMathResponse = (text: string): string => {
  let out = text

  // ¥/¥¥ を \\ に変換（日本語キーボードのバックスラッシュ問題を解決）
  out = out.replace(/¥+/g, '\\\\')

  // LaTeX記法をMarkdown形式に変換（数式はすべてブロック $$ $$ に統一）
  // \( \) をブロック数式に変換
  out = out.replace(/\\\(([\s\S]*?)\\\)/g, (_match, content) => `\n\n$$${content}$$\n\n`)

  // \[ \] をブロック数式に変換
  out = out.replace(/\\\[(?:\s*\n)?([\s\S]*?)(?:\s*\n)?\\\]/g, '\n\n$$$1$$\n\n')

  // 単独の $...$ を $$...$$ に統一（同一行内のみ）
  // ただし日本語を含む場合は数式として扱わず $ を外す
  out = out.replace(/(^|[^$])\$(?!\$)([^\n$]+)\$(?!\$)/g, (_m, prefix, content) => {
    const hasJapanese = /[\u3040-\u30ff\u4e00-\u9faf]/.test(content)
    if (hasJapanese) {
      return `${prefix}${content}`
    }
    return `${prefix}\n\n$$${content}$$\n\n`
  })

  // 囲まれていないcases環境を検出してブロック数式に変換
  out = out.replace(/(\\begin\{cases\}[\s\S]*?\\end\{cases\})/g, (match) => {
    if (!match.includes('\\(') && !match.includes('\\[') && !match.includes('$$')) {
      return `\n\n$$${match}$$\n\n`
    }
    return match
  })

  // cases環境の区切りを補正（「;」「；」「、」を行区切りにする）
  out = out.replace(/\\begin\{cases\}([\s\S]*?)\\end\{cases\}/g, (_match, content) => {
    const fixed = content
      // 日本語キーボード由来の "\;" を改行扱いにする
      .replace(/\\\s*;/g, '\\\\')
      // カンマ区切りも改行扱いにする
      .replace(/,\s*/g, '\\\\')
      .replace(/；\s*/g, '\\\\')
      .replace(/;\s*/g, '\\\\')
      .replace(/、\s*/g, '\\\\')
    return `\\begin{cases}${fixed}\\end{cases}`
  })

  // $$$$ / $$$ を $$ に正規化
  out = out.replace(/\$\$\$\$+/g, '$$')
  out = out.replace(/\$\$\$+/g, '$$')

  // $$...$$ をブロック数式として独立行に強制
  // 日本語が含まれる場合は数式として扱わず $$ を外す
  out = out.replace(/\$\$([\s\S]*?)\$\$/g, (_match, content) => {
    const trimmed = String(content).trim()
    const hasJapanese = /[\u3040-\u30ff\u4e00-\u9faf]/.test(trimmed)
    if (hasJapanese) {
      return `\n\n${trimmed}\n\n`
    }
    return `\n\n$$\n${trimmed}\n$$\n\n`
  })

  // 既に$$で囲まれているcases環境の¥¥を\\に変換
  out = out.replace(/\$\$([\s\S]*?)\$\$/g, (match, content) => {
    if (content.includes('\\begin{cases}') || content.includes('cases')) {
      const fixed = content.replace(/¥¥/g, '\\\\')
      return `$$${fixed}$$`
    }
    return match
  })

  // 孤立した $（単独行や余分な閉じ$）を除去
  out = out.replace(/^\s*\$\s*$/gm, '')
  out = out.replace(/\n\s*\$\s*$/gm, '\n')
  out = out.replace(/\n{3,}/g, '\n\n').trim()

  // 見出しの整理（ただし、LaTeXコマンドを含む行は除外）
  out = out.replace(/^.*解説して.*$/m, (match) => {
    if (/\\[a-zA-Z]+\{/.test(match) || /\\[a-zA-Z]+/.test(match)) return match
    return '## 問題'
  })
  out = out.replace(/^\s*解説\s*$/m, (match) => {
    if (/\\[a-zA-Z]+\{/.test(match) || /\\[a-zA-Z]+/.test(match)) return match
    return '## 解法'
  })
  out = out.replace(/^\s*ステップ\d+[:：]\s*/gm, (match) => {
    if (/\\[a-zA-Z]+\{/.test(match) || /\\[a-zA-Z]+/.test(match)) return match
    return '- '
  })
  
  if (!/^\s*ポイント\s*$/m.test(out)) {
    out = out.replace(
      /^\s*解法\s*$/m,
      (match) => {
        if (/\\[a-zA-Z]+\{/.test(match) || /\\[a-zA-Z]+/.test(match)) return match
        return '## ポイント\n- 最大値条件と範囲条件を確認\n\n## 解法'
      }
    )
  }
  
  // 見出しの正規化（Markdown形式に、ただしLaTeXコマンドを含む行は除外）
  out = out.replace(/^\s*問題\s*$/m, (match) => {
    if (/\\[a-zA-Z]+\{/.test(match) || /\\[a-zA-Z]+/.test(match)) return match
    return '## 問題'
  })
  out = out.replace(/^\s*ポイント\s*$/m, (match) => {
    if (/\\[a-zA-Z]+\{/.test(match) || /\\[a-zA-Z]+/.test(match)) return match
    return '## ポイント'
  })
  out = out.replace(/^\s*解法\s*$/m, (match) => {
    if (/\\[a-zA-Z]+\{/.test(match) || /\\[a-zA-Z]+/.test(match)) return match
    return '## 解法'
  })
  out = out.replace(/^\s*結論\s*$/m, (match) => {
    if (/\\[a-zA-Z]+\{/.test(match) || /\\[a-zA-Z]+/.test(match)) return match
    return '## 結論'
  })
  
  // 箇条書きの整形
  out = out.replace(/^\s*-\s+/gm, '- ')
  
  // 余計な空行を整形
  out = out.replace(/\n{3,}/g, '\n\n').trim()
  
  return out
}

export async function POST(request: NextRequest) {
  try {
    const { message, image, history } = await request.json()

    if (!message && !image) {
      return NextResponse.json(
        { error: 'メッセージまたは画像が必要です' },
        { status: 400 }
      )
    }

    const systemPromptBase =
      'あなたは受験生向けの学習サポートAIです。' +
      '数式はLaTeX記法で記述し、すべての数式を必ずブロック数式（$$ ... $$）として単独行で示してください。' +
      'インライン数式は使わず、数式を文中に混ぜないでください。' +
      '見出しはMarkdown形式（## 見出し）を使用してください。' +
      'cases環境や長い式は必ず $$ ... $$ で囲み、途中で改行しても構いません。'
    const systemPrompt = image
      ? `${systemPromptBase} 画像がある場合は必ず画像内容に言及してください。`
      : systemPromptBase

    const model = 'gpt-5'
    
    // 会話履歴を最新3件に制限（コスト削減）
    const limitedHistory = (history || []).slice(-3)
    const input = buildResponsesInput(limitedHistory, message, image)

    const completion = await openai.responses.create({
      model,
      instructions: systemPrompt,
      input,
      max_output_tokens: 2000,
      reasoning: { effort: 'minimal' },
      text: { verbosity: 'medium' },
    })

    // トークン数の取得とコスト計算
    const usage = (completion as any).usage || {}
    const inputTokens = usage.input_tokens || 0
    const outputTokens = usage.output_tokens || 0
    const cachedInputTokens = usage.cached_input_tokens || 0
    
    // GPT-5 Standard料金（1Mトークンあたり）
    const INPUT_RATE = 1.25 / 1_000_000
    const OUTPUT_RATE = 10.00 / 1_000_000
    const CACHED_INPUT_RATE = 0.125 / 1_000_000
    
    const cost = 
      inputTokens * INPUT_RATE +
      outputTokens * OUTPUT_RATE +
      cachedInputTokens * CACHED_INPUT_RATE
    
    // ログ出力
    console.log('=== OpenAI API Usage ===')
    console.log(`Input tokens: ${inputTokens.toLocaleString()}`)
    console.log(`Output tokens: ${outputTokens.toLocaleString()}`)
    console.log(`Cached input tokens: ${cachedInputTokens.toLocaleString()}`)
    console.log(`Total tokens: ${(inputTokens + outputTokens).toLocaleString()}`)
    console.log(`Estimated cost: $${cost.toFixed(6)} (約¥${(cost * 150).toFixed(2)})`)
    console.log('=======================')

    const extractedText =
      completion.output_text?.trim() ||
      completion.output
        ?.flatMap((item: any) => item.content || [])
        .filter((c: any) => c.type === 'output_text')
        .map((c: any) => c.text)
        .join('\n')
        .trim() ||
      completion.output
        ?.flatMap((item: any) => item.content || [])
        .filter((c: any) => c.type === 'refusal')
        .map((c: any) => c.refusal)
        .join('\n')
        .trim()

    const response =
      extractedText || '出力が途中で打ち切られました。もう一度送ってください。'

    return NextResponse.json({ response: formatMathResponse(response) })
  } catch (error: any) {
    console.error('OpenAI API Error:', error)
    return NextResponse.json(
      { error: error.message || 'AIからの応答を取得できませんでした' },
      { status: 500 }
    )
  }
}
