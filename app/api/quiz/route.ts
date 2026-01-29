import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

type QuizQuestion = {
  question: string
  choices: string[]
  correct_index: number
  explanation?: string
}

export async function POST(req: NextRequest) {
  try {
    const { note, count } = await req.json()
    const questionCount = Number.isFinite(count) ? Math.min(Math.max(count, 1), 5) : 3

    if (!note || typeof note !== 'string' || note.trim().length === 0) {
      return NextResponse.json({ error: 'note is required' }, { status: 400 })
    }

    const instructions =
      'あなたは受験生向けの復習クイズ作成AIです。' +
      'ユーザーの学習内容から4択問題を作成してください。' +
      '必ずJSONのみで出力し、形式は次の通りです。' +
      '{"questions":[{"question":"...","choices":["...","...","...","..."],"correct_index":0,"explanation":"..."}]}' +
      'choicesは必ず4つ、correct_indexは0-3の整数、explanationは簡潔に。'

    const completion = await openai.responses.create({
      model: 'gpt-5',
      instructions,
      input: [
        {
          role: 'user',
          content: [{ type: 'input_text', text: `学習内容:\n${note}\n\n問題数:${questionCount}` }],
        },
      ],
      max_output_tokens: 700,
      reasoning: { effort: 'minimal' },
      text: { verbosity: 'low' },
    })

    const extractedText =
      completion.output_text?.trim() ||
      completion.output
        ?.flatMap((item: any) => item.content || [])
        .filter((c: any) => c.type === 'output_text')
        .map((c: any) => c.text)
        .join('\n')
        .trim()

    if (!extractedText) {
      return NextResponse.json({ error: 'empty response' }, { status: 500 })
    }

    let parsed: { questions: QuizQuestion[] }
    try {
      parsed = JSON.parse(extractedText)
    } catch (error) {
      return NextResponse.json({ error: 'invalid json' }, { status: 500 })
    }

    const questions = (parsed.questions || [])
      .filter((q) => q && Array.isArray(q.choices) && q.choices.length === 4)
      .map((q) => ({
        question: String(q.question || '').trim(),
        choices: q.choices.map((c: any) => String(c)),
        correct_index: Number(q.correct_index ?? 0),
        explanation: String(q.explanation || '').trim() || undefined,
      }))
      .filter((q) => q.question && q.correct_index >= 0 && q.correct_index < 4)

    return NextResponse.json({ questions })
  } catch (error) {
    console.error('Quiz API error:', error)
    return NextResponse.json({ error: 'server error' }, { status: 500 })
  }
}
