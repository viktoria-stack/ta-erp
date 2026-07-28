export const runtime = 'nodejs'

import { createSign, createPrivateKey } from 'node:crypto'
import { NextResponse } from 'next/server'

const SPREADSHEET_ID = '195mByA-m83AjH5c0IPe1Xc8RfR0Lcsgn2k9t36CmxWk'

function b64url(buf) {
  return Buffer.from(buf).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
}

async function getAccessToken() {
  let rawKey
  if (process.env.GOOGLE_PRIVATE_KEY_B64) {
    rawKey = Buffer.from(process.env.GOOGLE_PRIVATE_KEY_B64, 'base64').toString('utf-8')
  } else {
    rawKey = process.env.GOOGLE_PRIVATE_KEY
  }
  rawKey = rawKey.replace(/\\n/g, '\n').replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim()
  rawKey = rawKey.replace(/^["']|["']$/g, '').trim()
  const b64 = rawKey.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('-----')).join('')
  const der = Buffer.from(b64, 'base64')
  const privateKey = createPrivateKey({ key: der, format: 'der', type: 'pkcs8' })
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL
  if (!email) throw new Error('GOOGLE_SERVICE_ACCOUNT_EMAIL not set')
  const now = Math.floor(Date.now() / 1000)
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const payload = b64url(JSON.stringify({
    iss: email, sub: email,
    aud: 'https://oauth2.googleapis.com/token',
    scope: 'https://www.googleapis.com/auth/spreadsheets',
    iat: now, exp: now + 3600,
  }))
  const signingInput = `${header}.${payload}`
  const signer = createSign('RSA-SHA256')
  signer.update(signingInput)
  const signature = signer.sign(privateKey, 'base64')
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
  const jwt = `${signingInput}.${signature}`
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  })
  const { access_token, error } = await res.json()
  if (error) throw new Error(`Auth failed: ${error}`)
  return access_token
}

const ALL_SIZES = new Set(['XS','S','M','L','XL','XXL','XXXL','2XL','3XL','4XL','OS','ONE SIZE','ONE-SIZE','FREE SIZE'])
function variantSku(sku, size) {
  if (!size) return sku
  const up = sku.toUpperCase()
  const sz = size.toUpperCase()
  if (up.endsWith('-' + sz)) return sku
  const lastPart = up.split('-').pop()
  if (ALL_SIZES.has(lastPart)) {
    const base = sku.slice(0, sku.lastIndexOf('-'))
    return `${base}-${size}`
  }
  return `${sku}-${size}`
}

export async function POST(req) {
  try {
    const { shipment_ref, items, carton_count } = await req.json()
    if (!shipment_ref || !items?.length) {
      return NextResponse.json({ error: 'Missing shipment_ref or items' }, { status: 400 })
    }

    const token = await getAccessToken()

    // Check if tab already exists
    const metaRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}?fields=sheets.properties`,
      { headers: { Authorization: `Bearer ${token}` } }
    )
    const meta = await metaRes.json()
    if (meta.error) throw new Error(meta.error.message)

    const existingSheet = meta.sheets?.find(s => s.properties.title === shipment_ref)

    if (existingSheet) {
      // Clear existing tab
      await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${encodeURIComponent(shipment_ref)}:clear`,
        { method: 'POST', headers: { Authorization: `Bearer ${token}` } }
      )
    } else {
      // Create new tab
      const addRes = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}:batchUpdate`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ requests: [{ addSheet: { properties: { title: shipment_ref } } }] }),
        }
      )
      const addData = await addRes.json()
      if (addData.error) throw new Error(addData.error.message)
    }

    // Aggregate items by variant SKU
    const skuMap = {}
    for (const item of items) {
      const vSku = variantSku(item.sku, item.size)
      skuMap[vSku] = (skuMap[vSku] || 0) + item.units_actual
    }
    const variants = Object.entries(skuMap)

    const header = ['', 'Booked Day', 'Booked Date', 'Transporter', 'Trailer or Container', 'Trailer / Container ID', 'Inbound PO Ref', 'Total units', 'Total pallets', 'Number of variance']
    const rows = [header]
    variants.forEach(([vSku, units], i) => {
      if (i === 0) {
        rows.push(['', 'TBC', 'TBC', '', '', 'TBC', shipment_ref, units, carton_count ? `${carton_count} boxes` : '', vSku])
      } else {
        rows.push(['', '', '', '', '', '', '', units, '', vSku])
      }
    })

    // Write rows to sheet
    const writeRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${encodeURIComponent(shipment_ref + '!A1')}?valueInputOption=USER_ENTERED`,
      {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ values: rows }),
      }
    )
    const writeData = await writeRes.json()
    if (writeData.error) throw new Error(writeData.error.message)

    return NextResponse.json({ ok: true, tab: shipment_ref, variants: variants.length })
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
