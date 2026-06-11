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

const shiftDate = (dateStr, days) => {
  const d = new Date(dateStr)
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url)
    const propertyId = process.env.GA4_PROPERTY_ID
    if (!propertyId) throw new Error('GA4_PROPERTY_ID not set')

    const token = await getAccessToken()

    let startDate, endDate
    if (searchParams.get('startDate') && searchParams.get('endDate')) {
      startDate = searchParams.get('startDate')
      endDate   = searchParams.get('endDate')
    } else {
      const days = parseInt(searchParams.get('days') || '7')
      const today = new Date().toISOString().slice(0, 10)
      endDate   = today
      startDate = shiftDate(today, -days)
    }

    const diffDays = Math.round((new Date(endDate) - new Date(startDate)) / 86400000)
    const prevEnd   = shiftDate(startDate, -1)
    const prevStart = shiftDate(prevEnd, -diffDays)

    const body = {
      dimensions: [
        { name: 'itemName' },
        { name: 'itemId' },
      ],
      metrics: [
        { name: 'itemRevenue' },
        { name: 'itemsPurchased' },
        { name: 'itemsViewed' },
      ],
      dateRanges: [
        { startDate, endDate,   name: 'current' },
        { startDate: prevStart, endDate: prevEnd, name: 'previous' },
      ],
      orderBys: [{ metric: { metricName: 'itemRevenue' }, desc: true }],
      limit: 100,
    }

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

    const data = await res.json()

    // GA4 adds dateRange as an extra dimension when multiple ranges requested.
    // Each product appears twice: once for "current", once for "previous".
    const grouped = {}
    for (const row of (data.rows || [])) {
      const name  = row.dimensionValues[0]?.value || ''
      const id    = row.dimensionValues[1]?.value || ''
      const range = row.dimensionValues[2]?.value || 'current'
      const key   = `${name}||${id}`
      if (!grouped[key]) grouped[key] = { item_name: name, item_id: id }
      const mv = row.metricValues.map(m => parseFloat(m.value) || 0)
      const isCurrent = range === 'current' || range === 'date_range_0'
      if (isCurrent) {
        grouped[key].revenue   = mv[0]
        grouped[key].purchased = mv[1]
        grouped[key].viewed    = mv[2]
      } else {
        grouped[key].revenue_prev   = mv[0]
        grouped[key].purchased_prev = mv[1]
        grouped[key].viewed_prev    = mv[2]
      }
    }

    const rows = Object.values(grouped)
      .map(r => ({
        ...r,
        revenue_prev:   r.revenue_prev   ?? 0,
        purchased_prev: r.purchased_prev ?? 0,
        viewed_prev:    r.viewed_prev    ?? 0,
      }))
      .sort((a, b) => (b.revenue || 0) - (a.revenue || 0))

    return NextResponse.json({ rows, startDate, endDate })
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
