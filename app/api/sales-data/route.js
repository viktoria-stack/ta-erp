export const runtime = 'nodejs'

import { createSign, createPrivateKey } from 'node:crypto'
import { NextResponse } from 'next/server'

const GA4_PROPERTY_ID = '376140937'

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
  const payload = b64url(JSON.stringify({
    iss: email, sub: email,
    aud: 'https://oauth2.googleapis.com/token',
    scope: 'https://www.googleapis.com/auth/analytics.readonly',
    iat: now, exp: now + 3600,
  }))
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

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url)
    const startDate = searchParams.get('start') || '2024-01-01'
    const endDate   = searchParams.get('end')   || 'today'

    const token = await getAccessToken()

    const body = {
      dateRanges: [{ startDate, endDate }],
      dimensions: [
        { name: 'itemName' },
        { name: 'itemId' },
      ],
      metrics: [
        { name: 'itemsPurchased' },
        { name: 'itemRevenue' },
      ],
      limit: 10000,
      orderBys: [{ metric: { metricName: 'itemsPurchased' }, desc: true }],
    }

    const res = await fetch(
      `https://analyticsdata.googleapis.com/v1beta/properties/${GA4_PROPERTY_ID}:runReport`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }
    )

    if (!res.ok) {
      const err = await res.json()
      throw new Error(err.error?.message || `GA4 API error ${res.status}`)
    }

    const data = await res.json()
    const rows = (data.rows || []).map(row => ({
      product_name:  row.dimensionValues[0]?.value || '',
      sku:           row.dimensionValues[1]?.value || '',
      units_sold:    parseInt(row.metricValues[0]?.value  || '0'),
      revenue:       parseFloat(row.metricValues[1]?.value || '0'),
    })).filter(r => r.product_name || r.sku)

    return NextResponse.json({ rows, dateRange: { startDate, endDate } })
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
