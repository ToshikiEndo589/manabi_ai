import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || 'dummy',
})

type Usage = {
  prompt_tokens: number
  completion_tokens: number
  total_tokens: number
}

const INPUT_COST_USD_PER_1M = 0.25
const OUTPUT_COST_USD_PER_1M = 2.0
const USD_TO_JPY = 155

function buildUsageData(usage: Usage) {
  const inputCostUSD = (usage.prompt_tokens / 1_000_000) * INPUT_COST_USD_PER_1M
  const outputCostUSD = (usage.completion_tokens / 1_000_000) * OUTPUT_COST_USD_PER_1M
  const totalCostUSD = inputCostUSD + outputCostUSD

  return {
    inputTokens: usage.prompt_tokens,
    outputTokens: usage.completion_tokens,
    totalTokens: usage.total_tokens,
    inputCostUSD,
    outputCostUSD,
    totalCostUSD,
    totalCostJPY: totalCostUSD * USD_TO_JPY,
  }
}

function extractMessageText(content: unknown): string {
  if (typeof content === 'string') return content.trim()
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === 'string') return part
        if (part && typeof part === 'object' && 'text' in part) {
          const text = (part as { text?: unknown }).text
          return typeof text === 'string' ? text : ''
        }
        return ''
      })
      .join('\n')
      .trim()
  }
  return ''
}
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const questionText = typeof body?.question === 'string' ? body.question.trim() : ''
    const themeText = typeof body?.theme === 'string' ? body.theme.trim() : ''
    const subjectText =
      typeof body?.subject === 'string' && body.subject.trim() ? body.subject.trim() : '未分類'
    const explanationText =
      typeof body?.explanation === 'string' ? body.explanation.trim().slice(0, 2000) : ''
    const quizQuestionText =
      typeof body?.quizQuestion === 'string' ? body.quizQuestion.trim().slice(0, 2000) : ''

    if (!questionText) {
      return NextResponse.json({ error: 'question is required' }, { status: 400 })
    }
    if (!themeText) {
      return NextResponse.json({ error: 'theme is required' }, { status: 400 })
    }

    const systemPrompt = [
      'You are a study assistant.',
      'Respond in natural Japanese.',
      'Keep answers concise and practical.',
      'Use 1  short sentences.',
      'Include 1 appropriate emoji naturally in the answer.',
      'Use at most 3 bullet points only when needed.',
      'Start with a direct one-line answer first.',
      'Do not mention model names.',
    ].join(' ')

    const contextLines = [
      `科目: ${subjectText}`,
      `テーマ: ${themeText}`,
      quizQuestionText ? `直近の問題: ${quizQuestionText}` : '',
      explanationText ? `直近の解説: ${explanationText}` : '',
      `ユーザーの質問: ${questionText}`,
    ].filter(Boolean)

    const completion = await openai.chat.completions.create({
      model: 'gpt-5-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: contextLines.join('\n') },
      ],
      max_completion_tokens: 220,
    })

    const answerRaw = extractMessageText(completion.choices?.[0]?.message?.content)
    const refusal = (completion.choices?.[0]?.message as { refusal?: string } | undefined)?.refusal

    let answer = answerRaw.replace(/\n{3,}/g, '\n\n').trim().slice(0, 1200)
    if (!answer) {
      if (typeof refusal === 'string' && refusal.trim().length > 0) {
        answer = refusal.trim().slice(0, 1200)
      } else {
        console.warn('[theme-qa] empty model output', {
          finishReason: completion.choices?.[0]?.finish_reason,
          hasRefusal: Boolean(refusal),
        })
        answer = '回答を生成できませんでした。質問を少し短くして、もう一度お試しください 🙏'
      }
    }

    const usage = completion.usage as Usage | undefined
    const usageData = usage ? buildUsageData(usage) : undefined

    if (usageData) {
      console.log('--- OpenAI API Usage (theme-qa) ---')
      console.log(`Input Tokens:  ${usageData.inputTokens} ($${usageData.inputCostUSD.toFixed(6)})`)
      console.log(`Output Tokens: ${usageData.outputTokens} ($${usageData.outputCostUSD.toFixed(6)})`)
      console.log(`Total Tokens:  ${usageData.totalTokens}`)
      console.log(`Total Cost:    $${usageData.totalCostUSD.toFixed(6)} (¥${usageData.totalCostJPY.toFixed(4)})`)
      console.log('------------------------------------')
    }

    return NextResponse.json({ answer, usage: usageData })
  } catch (error) {
    console.error('Theme QA API error:', error)
    const errorMessage = error instanceof Error ? error.message : 'server error'
    return NextResponse.json({ error: 'server error', details: errorMessage }, { status: 500 })
  }
}
