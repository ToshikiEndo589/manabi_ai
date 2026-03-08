import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'

export const runtime = 'nodejs'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || 'dummy',
})

const MAX_THEMES = 10

export async function POST(req: NextRequest) {
  try {
    const contentType = req.headers.get('content-type') || ''
    let dataUrl = ''

    if (contentType.includes('application/json')) {
      const body = await req.json().catch(() => ({}))
      const imageBase64Raw = typeof body?.imageBase64 === 'string' ? body.imageBase64 : ''
      const mimeType = typeof body?.mimeType === 'string' && body.mimeType ? body.mimeType : 'image/jpeg'
      const imageBase64 = imageBase64Raw.replace(/^data:[^;]+;base64,/, '').trim()
      if (!imageBase64) {
        return NextResponse.json({ error: 'imageBase64 is required' }, { status: 400 })
      }
      dataUrl = `data:${mimeType};base64,${imageBase64}`
    } else {
      const formData = await req.formData()
      const file = formData.get('image')
      if (!file || typeof file === 'string' || typeof (file as Blob).arrayBuffer !== 'function') {
        return NextResponse.json({ error: 'image file is required' }, { status: 400 })
      }
      const bytes = await (file as Blob).arrayBuffer()
      const base64 = Buffer.from(bytes).toString('base64')
      const mimeType = (file as File).type || 'image/jpeg'
      dataUrl = `data:${mimeType};base64,${base64}`
    }

    const systemPrompt =
      'You are a study assistant for exam students. ' +
      'Extract strictly ONLY the themes (study points) that are "truly worth reviewing" from images of reference books, notes, or handouts. ' +
      'Include only items with clear memorization value: headings, key terms, diagram explanations, and frequently-tested points. ' +
      'Do NOT include greetings, cautions, margin notes, rephrasings, or unimportant supplements. ' +
      'Do not force the count. Extract only the truly important ones; even 1 is fine. Maximum 10. ' +
      'One theme per line, concise. Examples: "Quadratic function max/min", "apple = \u308a\u3093\u3054", "Taika Reform 645 AD". ' +
      'Return ONLY valid JSON: {"themes": ["Theme 1", "Theme 2", ...]}'

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: [
            { type: 'image_url', image_url: { url: dataUrl, detail: 'low' } },
            {
              type: 'text',
              text:
                'From this image, extract ONLY the themes that are truly worth reviewing. ' +
                'Do NOT include unimportant items. Do not force the count to 10. Return ONLY JSON with the number you judge important (even 1 is fine, up to 10).',
            },
          ],
        },
      ],
      response_format: { type: 'json_object' },
    })

    // 料金計算とターミナル出力 (gpt-4o-mini)
    // - Input: $0.150 / 1M tokens
    // - Output: $0.600 / 1M tokens
    let costDetails = null
    if (completion.usage) {
      const promptTokens = completion.usage.prompt_tokens
      const completionTokens = completion.usage.completion_tokens
      const totalTokens = completion.usage.total_tokens

      const inputCostUSD = (promptTokens / 1_000_000) * 0.150
      const outputCostUSD = (completionTokens / 1_000_000) * 0.600
      const totalCostUSD = inputCostUSD + outputCostUSD

      // 1ドル = 155円として概算
      const totalCostJPY = totalCostUSD * 155

      costDetails = {
        promptTokens,
        completionTokens,
        totalTokens,
        totalCostUSD,
        totalCostJPY,
      }

      console.log('====================================')
      console.log('[Theme Extraction] API Usage & Cost')
      console.log(`Model: gpt-4o-mini`)
      console.log(`Tokens: ${totalTokens} (Input: ${promptTokens}, Output: ${completionTokens})`)
      console.log(`Cost (USD): $${totalCostUSD.toFixed(5)}`)
      console.log(`Cost (JPY): 約 ${totalCostJPY.toFixed(2)} 円`)
      console.log('====================================')
    }

    const raw = completion.choices[0]?.message?.content?.trim()
    if (!raw) {
      return NextResponse.json({ error: 'empty response' }, { status: 500 })
    }

    let parsed: { themes?: string[] }
    try {
      parsed = JSON.parse(raw)
    } catch {
      return NextResponse.json({ error: 'invalid json from model' }, { status: 500 })
    }

    const themes = (parsed.themes || [])
      .filter((t): t is string => typeof t === 'string' && t.trim().length > 0)
      .map((t) => t.trim())
      .slice(0, MAX_THEMES)

    return NextResponse.json({ themes, costDetails })
  } catch (error) {
    console.error('theme-from-image API error:', error)
    const message = error instanceof Error ? error.message : 'server error'
    return NextResponse.json({ error: 'server error', details: message }, { status: 500 })
  }
}
