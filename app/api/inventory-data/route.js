export const runtime = 'nodejs'

import { createSign, createPrivateKey } from 'node:crypto'
import { NextResponse } from 'next/server'

const SPREADSHEET_ID = process.env.GOOGLE_SHEETS_PO_ID
const SHEET_ROW = 'Maxtrify - ROW'
const SHEET_US  = 'Maxtrify - US'

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
  const b64url = buf => Buffer.from(buf).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
  const header  = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const payload = b64url(JSON.stringify({
    iss: email, sub: email,
    aud: 'https://oauth2.googleapis.com/token',
    scope: 'https://www.googleapis.com/auth/spreadsheets.readonly',
    iat: now, exp: now + 3600,
  }))
  const signer = createSign('RSA-SHA256')
  signer.update(`${header}.${payload}`)
  const sig = signer.sign(privateKey, 'base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
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

async function fetchSheet(sheetName, token) {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${encodeURIComponent(sheetName)}!A:Z`
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
  if (!res.ok) {
    const err = await res.json()
    throw new Error(err.error?.message || 'Sheets API error')
  }
  const { values } = await res.json()
  return values || []
}

const norm = s => String(s).replace(/[\s ]+/g, ' ').trim().toLowerCase()

function parseSheet(values) {
  if (values.length < 2) return {}

  // Find header row
  let headerIdx = 0
  for (let i = 0; i < Math.min(5, values.length); i++) {
    if (values[i].some(c => norm(c).includes('variant sku'))) {
      headerIdx = i
      break
    }
  }

  const headers = values[headerIdx].map(norm)
  const col = (...keys) => {
    for (const key of keys) {
      const idx = headers.findIndex(h => h.includes(key))
      if (idx >= 0) return idx
    }
    return -1
  }

  const iTitle = col('title')
  const iSku   = col('variant sku')
  const iQty   = col('variant inventory qty', 'inventory qty', 'inventory')
  const iPrice = col('variant price', 'price')
  const iCost  = col('variant cost', 'cost')

  const result = {}
  for (const row of values.slice(headerIdx + 1)) {
    const sku = norm(row[iSku] ?? '')
    if (!sku) continue
    const qty = iQty >= 0 ? (parseFloat(row[iQty]) || 0) : 0
    if (result[sku]) {
      result[sku].qty += qty
    } else {
      result[sku] = {
        title: String(row[iTitle] ?? '').trim(),
        sku,
        qty,
        price: iPrice >= 0 ? (parseFloat(row[iPrice]) || 0) : 0,
        cost:  iCost  >= 0 ? (parseFloat(row[iCost])  || 0) : 0,
      }
    }
  }
  return result
}

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url)
    const debug = searchParams.get('debug') === '1'

    const token = await getAccessToken()
    const [rowValues, usValues] = await Promise.all([
      fetchSheet(SHEET_ROW, token),
      fetchSheet(SHEET_US,  token),
    ])

    if (debug) {
      const skuFilter = searchParams.get('sku')?.toLowerCase()
      const filterRows = (values) => {
        if (!skuFilter) return values.slice(0, 6)
        const header = values[0] || []
        const skuCol = header.findIndex(h => norm(h).includes('variant sku'))
        return [header, ...values.slice(1).filter(r => norm(r[skuCol] ?? '').includes(skuFilter))]
      }
      return NextResponse.json({
        row_headers: rowValues[0] || [],
        row_data:    filterRows(rowValues),
        us_headers:  usValues[0]  || [],
        us_data:     filterRows(usValues),
        col_count:   { row: (rowValues[0] || []).length, us: (usValues[0] || []).length },
      })
    }

    const row = parseSheet(rowValues)
    const us  = parseSheet(usValues)

    // Merge all SKUs
    const allSkus = new Set([...Object.keys(row), ...Object.keys(us)])
    const items = Array.from(allSkus).map(sku => ({
      sku,
      title:     row[sku]?.title || us[sku]?.title || '',
      qty_row:   row[sku]?.qty   ?? null,
      qty_us:    us[sku]?.qty    ?? null,
      price_row: row[sku]?.price ?? null,
      price_us:  us[sku]?.price  ?? null,
      cost:      row[sku]?.cost  || us[sku]?.cost || 0,
    }))

    return NextResponse.json({ items })
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
