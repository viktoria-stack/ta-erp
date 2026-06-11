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

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url)
    const days = parseInt(searchParams.get('days') || '7')

    const propertyId = process.env.GA4_PROPERTY_ID
    if (!propertyId) throw new Error('GA4_PROPERTY_ID not set')

    const token = await getAccessToken()

    const prevEnd   = `${days + 1}daysAgo`
    const prevStart = `${days * 2}daysAgo`

    const body = {
      dimensions: [
        { name: 'itemName' },
        { name: 'itemId' },
      ],
      metrics: [
        { name: 'itemRevenue' },
        { name: 'itemsPurchased' },
        { name: 'itemsViewed' },
        { name: 'addToCarts' },
      ],
      dateRanges: [
        { startDate: `${days}daysAgo`, endDate: 'today', name: 'current' },
        { startDate: prevStart,        endDate: prevEnd,  name: 'previous' },
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
    const rows = (data.rows || []).map(row => {
      const [nameVal, idVal] = row.dimensionValues
      // With 2 date ranges + 4 metrics: values interleaved as [m0_cur, m0_prev, m1_cur, m1_prev, ...]
      const mv = row.metricValues.map(m => parseFloat(m.value) || 0)
      return {
        item_name:      nameVal.value,
        item_id:        idVal.value,
        revenue:        mv[0],
        revenue_prev:   mv[1],
        purchased:      mv[2],
        purchased_prev: mv[3],
        viewed:         mv[4],
        viewed_prev:    mv[5],
        add_to_cart:    mv[6],
        add_to_cart_prev: mv[7],
      }
    })

    return NextResponse.json({ rows, days })
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
