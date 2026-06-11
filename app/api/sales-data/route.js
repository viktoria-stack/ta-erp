export const runtime = 'nodejs'

import { createSign, createPrivateKey } from 'node:crypto'
import { NextResponse } from 'next/server'

const SPREADSHEET_ID = '1-O2BD5mQmZgJgpIgefbqgDtexeoUQ8x9PQfZLYV-MJw'
const SHEET_NAME = 'Core | Live Stock & Commitment'

async function getAccessToken() {
  let rawKey
  if (process.env.GOOGLE_PRIVATE_KEY_B64) {
    rawKey = Buffer.from(process.env.GOOGLE_PRIVATE_KEY_B64, 'base64').toString('utf-8')
  } else if (process.env.GOOGLE_PRIVATE_KEY) {
    rawKey = process.env.GOOGLE_PRIVATE_KEY
  } else {
    throw new Error('No Google private key configured')
  }
  rawKey = rawKey.replace(/\\n/g, '\n').replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim().replace(/^["']|["']$/g, '').trim()
  const b64 = rawKey.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('-----')).join('')
  const der = Buffer.from(b64, 'base64')
  const privateKey = createPrivateKey({ key: der, format: 'der', type: 'pkcs8' })
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL
  if (!email) throw new Error('GOOGLE_SERVICE_ACCOUNT_EMAIL not set')
  const now = Math.floor(Date.now() / 1000)
  const b64url = buf => Buffer.from(buf).toString('base64').replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_')
  const header  = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const payload = b64url(JSON.stringify({ iss: email, sub: email, aud: 'https://oauth2.googleapis.com/token', scope: 'https://www.googleapis.com/auth/spreadsheets.readonly', iat: now, exp: now + 3600 }))
  const signer = createSign('RSA-SHA256')
  signer.update(`${header}.${payload}`)
  const sig = signer.sign(privateKey, 'base64').replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_')
  const jwt = `${header}.${payload}.${sig}`
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt }),
  })
  const { access_token, error } = await res.json()
  if (error) throw new Error(`Auth failed: ${error}`)
  return access_token
}

const num = v => parseFloat(String(v ?? '').replace(/[£$,\s]/g, '')) || 0

export async function GET() {
  try {
    const token = await getAccessToken()
    // Columns: A=season, B=product, C=sku,
    // D=stock_row, E=stock_us, F=stock_total,
    // G=sold_row, H=sold_us, I=sold_total,
    // J=weeks_row, K=weeks_us, L=weeks_total,
    // M=cost_row,  N=cost_us,
    // O=sell_row,  P=sell_us
    const range = `'${SHEET_NAME}'!A:P`
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${encodeURIComponent(range)}`
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
    if (!res.ok) {
      const err = await res.json()
      throw new Error(err.error?.message || 'Sheets API error')
    }
    const { values } = await res.json()
    if (!values || values.length < 2) return NextResponse.json({ rows: [] })

    let lastSeason = '', lastProduct = ''
    const rows = []

    for (const row of values) {
      const season  = String(row[0] ?? '').trim()
      const product = String(row[1] ?? '').trim()
      const sku     = String(row[2] ?? '').trim()

      if (!sku || sku.toUpperCase() === 'TOTALS' || sku === 'NO_HEADER') continue

      if (season)  lastSeason  = season
      if (product) lastProduct = product

      rows.push({
        season:       lastSeason,
        product_name: lastProduct,
        sku,
        stock_row:    num(row[3]),
        stock_us:     num(row[4]),
        stock_total:  num(row[5]),
        sold_row:     num(row[6]),
        sold_us:      num(row[7]),
        sold_total:   num(row[8]),
        weeks_row:    num(row[9]),
        weeks_us:     num(row[10]),
        weeks_total:  num(row[11]),
        cost_row:     num(row[12]),
        cost_us:      num(row[13]),
        sell_row:     num(row[14]),
        sell_us:      num(row[15]),
      })
    }

    return NextResponse.json({ rows })
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
