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

function parseGA4Rows(data) {
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
      grouped[key].revenue   = (grouped[key].revenue   || 0) + mv[0]
      grouped[key].purchased = (grouped[key].purchased || 0) + mv[1]
      grouped[key].viewed    = (grouped[key].viewed    || 0) + mv[2]
    } else {
      grouped[key].revenue_prev   = (grouped[key].revenue_prev   || 0) + mv[0]
      grouped[key].purchased_prev = (grouped[key].purchased_prev || 0) + mv[1]
      grouped[key].viewed_prev    = (grouped[key].viewed_prev    || 0) + mv[2]
    }
  }
  return Object.values(grouped).map(r => ({
    ...r,
    revenue_prev:   r.revenue_prev   ?? 0,
    purchased_prev: r.purchased_prev ?? 0,
    viewed_prev:    r.viewed_prev    ?? 0,
  }))
}

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url)
    const store = searchParams.get('store') || 'row'

    const propRow = process.env.GA4_PROPERTY_ID
    const propUS  = process.env.GA4_PROPERTY_ID_US
    if (!propRow) throw new Error('GA4_PROPERTY_ID not set')
    if (store === 'us' && !propUS) throw new Error('GA4_PROPERTY_ID_US not set')

    const token = await getAccessToken()

    let startDate, endDate
    if (searchParams.get('startDate') && searchParams.get('endDate')) {
      startDate = searchParams.get('startDate')
      endDate   = searchParams.get('endDate')
    } else {
      const days = parseInt(searchParams.get('days') || '7')
      const todayStr = new Date().toISOString().slice(0, 10)
      endDate   = todayStr
      startDate = shiftDate(todayStr, -days)
    }

    const diffDays  = Math.round((new Date(endDate) - new Date(startDate)) / 86400000)
    const prevEnd   = shiftDate(startDate, -1)
    const prevStart = shiftDate(prevEnd, -diffDays)

    const body = {
      dimensions: [{ name: 'itemName' }, { name: 'itemId' }],
      metrics: [{ name: 'itemRevenue' }, { name: 'itemsPurchased' }, { name: 'itemsViewed' }],
      dateRanges: [
        { startDate, endDate, name: 'current' },
        { startDate: prevStart, endDate: prevEnd, name: 'previous' },
      ],
      orderBys: [{ metric: { metricName: 'itemRevenue' }, desc: true }],
      limit: 5000,
    }

    let rows
    if (store === 'both') {
      if (!propUS) throw new Error('GA4_PROPERTY_ID_US not set')
      const [dataRow, dataUS] = await Promise.all([
        fetchGA4(propRow, body, token),
        fetchGA4(propUS,  body, token),
      ])
      const rowRows = parseGA4Rows(dataRow)
      const usRows  = parseGA4Rows(dataUS)
      // Merge by item_id, summing metrics
      const merged = {}
      for (const r of [...rowRows, ...usRows]) {
        const key = r.item_id || r.item_name
        if (!merged[key]) merged[key] = { ...r }
        else {
          merged[key].revenue       += r.revenue
          merged[key].purchased     += r.purchased
          merged[key].viewed        += r.viewed
          merged[key].revenue_prev  += r.revenue_prev
          merged[key].purchased_prev += r.purchased_prev
          merged[key].viewed_prev   += r.viewed_prev
        }
      }
      rows = Object.values(merged).sort((a, b) => b.revenue - a.revenue)
    } else {
      const propId = store === 'us' ? propUS : propRow
      const data = await fetchGA4(propId, body, token)
      rows = parseGA4Rows(data).sort((a, b) => b.revenue - a.revenue)
    }

    return NextResponse.json({ rows, startDate, endDate, store })
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
