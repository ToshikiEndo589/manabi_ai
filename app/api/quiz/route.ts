import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import { normalizeQuizText } from '@/lib/text-normalizer'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || 'dummy',
})

type QuizQuestion = {
  question: string
  choices: string[]
  correct_index: number
  explanation?: string
}

type Usage = {
  prompt_tokens: number
  completion_tokens: number
  total_tokens: number
}

const INPUT_COST_USD_PER_1M = 0.25
const OUTPUT_COST_USD_PER_1M = 2.0
const USD_TO_JPY = 155
const QUIZ_DIFFICULTY_TEXT = '普通（標準レベル）'

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

function shuffleChoices(choices: string[], correctIndex: number): { shuffledChoices: string[]; newCorrectIndex: number } {
  const indices = Array.from({ length: choices.length }, (_, i) => i)
  for (let i = indices.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[indices[i], indices[j]] = [indices[j], indices[i]]
  }

  return {
    shuffledChoices: indices.map((i) => choices[i]),
    newCorrectIndex: indices.indexOf(correctIndex),
  }
}

export async function POST(req: NextRequest) {
  try {
    const { note, count } = await req.json()

    const noteText = typeof note === 'string' ? note.trim() : ''
    if (!noteText) {
      return NextResponse.json({ error: 'note is required' }, { status: 400 })
    }

    const questionCount = Number.isFinite(count) ? Math.min(Math.max(count, 1), 5) : 3

    const systemPrompt =
      'あなたは受験生向けの復習クイズ作成AIです。' +
      'ユーザーの学習内容から4択問題を作成してください。' +
      `難易度は${QUIZ_DIFFICULTY_TEXT}に固定してください。` +
      '必ずJSONのみで出力し、形式は次の通りです。' +
      '{"questions":[{"question":"...","choices":["...","...","...","..."],"correct_index":0,"explanation":"..."}]}' +
      'choicesは必ず4つ、correct_indexは0-3の整数、explanationは簡潔な解説を含めてください。' +
      '【重要】同じ学習内容でも、毎回異なる切り口・表現で問題を作成してください（前回と同じ問題にならないように工夫してください）。'

    const completion = await openai.chat.completions.create({
      model: 'gpt-5-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: `学習内容:\n${noteText}\n\n問題数:${questionCount}\n難易度:${QUIZ_DIFFICULTY_TEXT}`,
        },
      ],
      response_format: { type: 'json_object' },
    })

    const extractedText = completion.choices[0]?.message?.content?.trim()
    if (!extractedText) {
      return NextResponse.json({ error: 'empty response' }, { status: 500 })
    }

    let parsed: { questions: QuizQuestion[] }
    try {
      parsed = JSON.parse(extractedText)
    } catch {
      return NextResponse.json({ error: 'invalid json' }, { status: 500 })
    }

    const questions = (parsed.questions || [])
      .filter((q) => q && Array.isArray(q.choices) && q.choices.length === 4)
      .map((q) => {
        const normalizedChoices = q.choices.map((choice: unknown) => normalizeQuizText(String(choice ?? '')))
        const correctIndex = Number(q.correct_index ?? 0)
        const { shuffledChoices, newCorrectIndex } = shuffleChoices(normalizedChoices, correctIndex)
        const normalizedQuestion = normalizeQuizText(String(q.question || '').trim())
        const normalizedExplanation = normalizeQuizText(String(q.explanation || '').trim())

        return {
          question: normalizedQuestion,
          choices: shuffledChoices,
          correct_index: newCorrectIndex,
          explanation: normalizedExplanation || undefined,
        }
      })
      .filter((q) => q.question && q.correct_index >= 0 && q.correct_index < 4)

    const usage = completion.usage as Usage | undefined
    const usageData = usage ? buildUsageData(usage) : undefined

    if (usageData) {
      console.log('--- OpenAI API Usage (gpt-5-mini) ---')
      console.log(`Input Tokens:  ${usageData.inputTokens} ($${usageData.inputCostUSD.toFixed(6)})`)
      console.log(`Output Tokens: ${usageData.outputTokens} ($${usageData.outputCostUSD.toFixed(6)})`)
      console.log(`Total Tokens:  ${usageData.totalTokens}`)
      console.log(`Total Cost:    $${usageData.totalCostUSD.toFixed(6)} (約 ${usageData.totalCostJPY.toFixed(4)} 円)`)
      console.log('---------------------------------------')
    }

    return NextResponse.json({ questions, usage: usageData })
  } catch (error) {
    console.error('Quiz API error:', error)

    if (error instanceof Error) {
      console.error('Error name:', error.name)
      console.error('Error message:', error.message)
      console.error('Error stack:', error.stack)
    }

    if (typeof error === 'object' && error !== null) {
      console.error('Error details:', JSON.stringify(error, null, 2))
    }

    const errorMessage = error instanceof Error ? error.message : 'server error'
    return NextResponse.json({ error: 'server error', details: errorMessage }, { status: 500 })
  }
}
