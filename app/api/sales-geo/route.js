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

function aggregate(dataArr, dimKey) {
  const map = {}
  for (const data of dataArr) {
    for (const row of (data.rows || [])) {
      const key = row.dimensionValues[0].value
      const [sessions, revenue, txns] = row.metricValues.map(m => parseFloat(m.value) || 0)
      if (!map[key]) map[key] = { [dimKey]: key, sessions: 0, revenue: 0, transactions: 0 }
      map[key].sessions     += sessions
      map[key].revenue      += revenue
      map[key].transactions += txns
    }
  }
  return Object.values(map)
}

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url)
    const store = searchParams.get('store') || 'row'

    const propRow = process.env.GA4_PROPERTY_ID
    const propUS  = process.env.GA4_PROPERTY_ID_US
    if (!propRow) throw new Error('GA4_PROPERTY_ID not set')

    const props = store === 'both' ? [propRow, propUS].filter(Boolean)
                : store === 'us'   ? [propUS]
                :                    [propRow]

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

    const token = await getAccessToken()

    const countryBody = {
      dimensions: [{ name: 'country' }],
      metrics: [{ name: 'sessions' }, { name: 'purchaseRevenue' }, { name: 'transactions' }],
      dateRanges: [{ startDate, endDate }],
      orderBys: [{ metric: { metricName: 'purchaseRevenue' }, desc: true }],
      limit: 15,
    }
    const channelBody = {
      dimensions: [{ name: 'sessionDefaultChannelGroup' }],
      metrics: [{ name: 'sessions' }, { name: 'purchaseRevenue' }, { name: 'transactions' }],
      dateRanges: [{ startDate, endDate }],
      orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
      limit: 12,
    }

    const fetches = props.flatMap(prop => [
      fetchGA4(prop, countryBody, token),
      fetchGA4(prop, channelBody, token),
    ])
    const results = await Promise.all(fetches)

    const countryResults = props.map((_, i) => results[i * 2])
    const channelResults = props.map((_, i) => results[i * 2 + 1])

    const countries = aggregate(countryResults, 'country').sort((a, b) => b.revenue - a.revenue).slice(0, 15)
    const channels  = aggregate(channelResults, 'channel').sort((a, b) => b.sessions - a.sessions)

    return NextResponse.json({ countries, channels })
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
