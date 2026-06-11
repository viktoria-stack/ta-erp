export const runtime = 'nodejs'

import Anthropic from '@anthropic-ai/sdk'
import { NextResponse } from 'next/server'

const PROMPT = `Extract all invoice information from this document. Return ONLY a valid JSON object — no markdown, no explanation.

Fields to extract (use null if not found):
{
  "invoice_number": string,
  "supplier_name": string,
  "invoice_date": "YYYY-MM-DD",
  "currency": "USD" | "GBP" | "EUR",
  "payment_terms": string,
  "deposit_amount": number,
  "deposit_due_date": "YYYY-MM-DD",
  "balance_amount": number,
  "balance_due_date": "YYYY-MM-DD",
  "total_amount": number,
  "notes": string
}

Rules:
- Convert all dates to YYYY-MM-DD format
- Strip currency symbols from amounts — numbers only
- If payment terms say "30% deposit, 70% balance" and total is known, calculate deposit_amount and balance_amount
- If only a single total is shown with no deposit/balance split, put it in balance_amount
- Detect currency from symbols: $ = USD, £ = GBP, € = EUR
- Return ONLY the JSON object`

export async function POST(request) {
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) return NextResponse.json({ error: 'ANTHROPIC_API_KEY not configured' }, { status: 500 })

    const formData = await request.formData()
    const file = formData.get('file')
    if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })

    const buffer = Buffer.from(await file.arrayBuffer())
    const base64 = buffer.toString('base64')
    const mediaType = file.type || 'application/octet-stream'

    const isPDF = mediaType === 'application/pdf'
    const isImage = mediaType.startsWith('image/')
    if (!isPDF && !isImage) {
      return NextResponse.json({ error: 'Only PDF and image files are supported' }, { status: 400 })
    }

    const client = new Anthropic({ apiKey })

    const fileBlock = isPDF
      ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } }
      : { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } }

    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      messages: [{ role: 'user', content: [fileBlock, { type: 'text', text: PROMPT }] }],
    })

    const text = response.content[0]?.text?.trim() || ''
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error('Could not parse response from Claude')

    const data = JSON.parse(jsonMatch[0])
    return NextResponse.json({ success: true, data })
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
