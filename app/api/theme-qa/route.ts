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

type ResponseUsage = {
  input_tokens: number
  output_tokens: number
  total_tokens: number
}

const INPUT_COST_USD_PER_1M = 0.25
const OUTPUT_COST_USD_PER_1M = 2.0
const USD_TO_JPY = 155

function buildUsageData(usage: Usage | ResponseUsage) {
  const inputTokens = 'prompt_tokens' in usage ? usage.prompt_tokens : usage.input_tokens
  const outputTokens = 'completion_tokens' in usage ? usage.completion_tokens : usage.output_tokens
  const totalTokens = usage.total_tokens

  const inputCostUSD = (inputTokens / 1_000_000) * INPUT_COST_USD_PER_1M
  const outputCostUSD = (outputTokens / 1_000_000) * OUTPUT_COST_USD_PER_1M
  const totalCostUSD = inputCostUSD + outputCostUSD

  return {
    inputTokens,
    outputTokens,
    totalTokens,
    inputCostUSD,
    outputCostUSD,
    totalCostUSD,
    totalCostJPY: totalCostUSD * USD_TO_JPY,
  }
}

function normalizeThemeQaAnswer(text: string) {
  return text
    .split('\n')
    .map((line) => line.replace(/^\s*[-*\u2022\u30fb]\s+/, '').trimEnd())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
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
      'Use 2 to 5 short sentences.',
      'Do not use bullet points, markdown lists, or leading hyphens.',
      'If you want separation, use blank lines only.',
      'Start with a direct one-line answer first.',
      'Do not mention model names.',
      'Please also use emojis.',
    ].join(' ')

    const contextLines = [
      `Subject: ${subjectText}`,
      `Theme: ${themeText}`,
      quizQuestionText ? `Recent Question: ${quizQuestionText}` : '',
      explanationText ? `Recent Explanation: ${explanationText}` : '',
      `User Question: ${questionText}`,
    ].filter(Boolean)

    const completion = await openai.responses.create({
      model: 'gpt-5-mini',
      instructions: systemPrompt,
      input: contextLines.join('\n'),
      reasoning: { effort: 'minimal' },
      text: { verbosity: 'low' },
      max_output_tokens: 220,
    })

    if (completion.error) {
      return NextResponse.json({ error: 'server error', details: completion.error.message }, { status: 500 })
    }

    const answerRaw = typeof completion.output_text === 'string' ? completion.output_text.trim() : ''

    let answer = normalizeThemeQaAnswer(answerRaw).slice(0, 1200)
    if (!answer) {
      console.warn('[theme-qa] empty model output', {
        status: completion.status,
        incompleteDetails: completion.incomplete_details,
      })
      answer = '回答を生成できませんでした。質問を少し短くして、もう一度お試しください 🙏'
    }

    const usage = completion.usage as ResponseUsage | undefined
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
