export const runtime = 'nodejs'

import { createSign, createPrivateKey } from 'node:crypto'
import { NextResponse } from 'next/server'

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
    scope: 'https://www.googleapis.com/auth/analytics.readonly',
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

async function fetchGA4(propertyId, body, token) {
  const res = await fetch(
    `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }
  )
  if (!res.ok) {
    const err = await res.json()
    throw new Error(err.error?.message || 'GA4 API error')
  }
  return res.json()
}

function parseTrendRows(data) {
  const byDate = {}
  for (const row of (data.rows || [])) {
    const date    = row.dimensionValues[0]?.value || ''
    const revenue = parseFloat(row.metricValues[0]?.value) || 0
    // GA4 returns dates as YYYYMMDD — normalise to YYYY-MM-DD
    const iso = date.length === 8
      ? `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}`
      : date
    byDate[iso] = (byDate[iso] || 0) + revenue
  }
  return byDate
}

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url)
    const days  = Math.max(1, parseInt(searchParams.get('days') || '30'))
    const store = searchParams.get('store') || 'both'

    const propRow = process.env.GA4_PROPERTY_ID
    const propUS  = process.env.GA4_PROPERTY_ID_US
    if (!propRow) throw new Error('GA4_PROPERTY_ID not set')
    if ((store === 'us' || store === 'both') && !propUS) throw new Error('GA4_PROPERTY_ID_US not set')

    const todayStr = new Date().toISOString().slice(0, 10)
    const startD   = new Date(todayStr)
    startD.setDate(startD.getDate() - days)
    const startDate = startD.toISOString().slice(0, 10)
    const endDate   = todayStr

    const body = {
      dimensions: [{ name: 'date' }],
      metrics:    [{ name: 'totalRevenue' }],
      dateRanges: [{ startDate, endDate }],
      orderBys:   [{ dimension: { dimensionName: 'date' }, desc: false }],
    }

    const token = await getAccessToken()

    let rowByDate = {}
    let usByDate  = {}

    if (store === 'row') {
      const data = await fetchGA4(propRow, body, token)
      rowByDate = parseTrendRows(data)
    } else if (store === 'us') {
      const data = await fetchGA4(propUS, body, token)
      usByDate = parseTrendRows(data)
    } else {
      // both — fetch in parallel
      const [dataRow, dataUS] = await Promise.all([
        fetchGA4(propRow, body, token),
        fetchGA4(propUS,  body, token),
      ])
      rowByDate = parseTrendRows(dataRow)
      usByDate  = parseTrendRows(dataUS)
    }

    // Build a sorted list of all dates in the requested range
    const allDates = new Set([...Object.keys(rowByDate), ...Object.keys(usByDate)])
    // Fill every calendar day in the range so the arrays are gap-free
    const cur = new Date(startDate)
    const end = new Date(endDate)
    while (cur <= end) {
      allDates.add(cur.toISOString().slice(0, 10))
      cur.setDate(cur.getDate() + 1)
    }
    const dates = Array.from(allDates).sort()

    const rowArr = dates.map(d => rowByDate[d] ?? 0)
    const usArr  = dates.map(d => usByDate[d]  ?? 0)

    return NextResponse.json({ dates, row: rowArr, us: usArr })
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
