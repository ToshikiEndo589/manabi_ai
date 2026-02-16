import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || 'dummy',
})

type QuizQuestion = {
  question: string
  choices: string[]
  correct_index: number
  explanation?: string
}

export async function POST(req: NextRequest) {
  try {
    const { note, count, difficulty } = await req.json()
    const questionCount = Number.isFinite(count) ? Math.min(Math.max(count, 1), 5) : 3
    const normalizedDifficulty =
      difficulty === 'easy' || difficulty === 'normal' || difficulty === 'hard'
        ? difficulty
        : 'normal'
    const difficultyText =
      normalizedDifficulty === 'easy'
        ? '易しい（基本・基礎中心）'
        : normalizedDifficulty === 'hard'
          ? '難しい（応用・ひっかけ含む）'
          : '普通（標準レベル）'

    if (!note || typeof note !== 'string' || note.trim().length === 0) {
      return NextResponse.json({ error: 'note is required' }, { status: 400 })
    }

    const systemPrompt =
      'あなたは受験生向けの復習クイズ作成AIです。' +
      'ユーザーの学習内容から4択問題を作成してください。' +
      `難易度は${difficultyText}に合わせてください。` +
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
          content: `学習内容:\n${note}\n\n問題数:${questionCount}\n難易度:${difficultyText}`,
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
    } catch (error) {
      return NextResponse.json({ error: 'invalid json' }, { status: 500 })
    }

    const questions = (parsed.questions || [])
      .filter((q) => q && Array.isArray(q.choices) && q.choices.length === 4)
      .map((q) => {
        const originalChoices = q.choices.map((c: unknown) => String(c))
        const correctIndex = Number(q.correct_index ?? 0)

        // Create an array of indices [0, 1, 2, 3] and shuffle them
        const indices = Array.from({ length: originalChoices.length }, (_, i) => i)
        for (let i = indices.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [indices[i], indices[j]] = [indices[j], indices[i]]
        }

        // Reorder choices based on shuffled indices
        const shuffledChoices = indices.map((i) => originalChoices[i])

        // Find where the original correct answer moved to
        // indices[newIndex] = oldIndex
        // We want newIndex where indices[newIndex] == correctIndex
        const newCorrectIndex = indices.indexOf(correctIndex)

        return {
          question: String(q.question || '').trim(),
          choices: shuffledChoices,
          correct_index: newCorrectIndex,
          explanation: String(q.explanation || '').trim() || undefined,
        }
      })
      .filter((q) => q.question && q.correct_index >= 0 && q.correct_index < 4)

    return NextResponse.json({ questions })
  } catch (error) {
    console.error('Quiz API error:', error)
    // エラーの詳細をログに出力
    if (error instanceof Error) {
      console.error('Error name:', error.name)
      console.error('Error message:', error.message)
      console.error('Error stack:', error.stack)
    }
    // OpenAI APIのエラーの場合、詳細情報を取得
    if (typeof error === 'object' && error !== null) {
      console.error('Error details:', JSON.stringify(error, null, 2))
    }

    const errorMessage = error instanceof Error ? error.message : 'server error'
    return NextResponse.json(
      { error: 'server error', details: errorMessage },
      { status: 500 }
    )
  }
}
