export const runtime = 'nodejs'

import { createSign, createPrivateKey } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const SPREADSHEET_ID = '1-O2BD5mQmZgJgpIgefbqgDtexeoUQ8x9PQfZLYV-MJw'
const SHEET_GID = '434068651'

const getSupabase = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
)

function b64url(str) {
  return Buffer.from(str).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
}

async function getAccessToken() {
  const rawKey = Buffer.from(process.env.GOOGLE_PRIVATE_KEY_B64 || '', 'base64').toString('utf-8')
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL
  const now = Math.floor(Date.now() / 1000)

  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const payload = b64url(JSON.stringify({
    iss: email, sub: email,
    aud: 'https://oauth2.googleapis.com/token',
    scope: 'https://www.googleapis.com/auth/spreadsheets.readonly',
    iat: now, exp: now + 3600,
  }))

  const signingInput = `${header}.${payload}`
  const privateKey = createPrivateKey(rawKey)
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

async function sheetsGet(token, range) {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${encodeURIComponent(range)}`
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
  if (!res.ok) {
    const err = await res.json()
    throw new Error(err.error?.message || 'Sheets API error')
  }
  return res.json()
}

async function getSheetName(token) {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}?fields=sheets.properties`
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
  const data = await res.json()
  const sheet = data.sheets?.find(s => String(s.properties.sheetId) === SHEET_GID)
  return sheet?.properties?.title
}

function colIdx(headers, pattern) {
  return headers.findIndex(h => new RegExp(pattern, 'i').test(String(h).trim()))
}

function cleanNum(val) {
  return parseFloat(String(val || '0').replace(/[$£,\s]/g, '')) || 0
}

function cleanBool(val) {
  return String(val || '').toUpperCase() === 'TRUE'
}

function parsePORef(raw) {
  const po = raw.trim().replace('/', '')
  const shipmentType = /AIR/.test(po) ? 'AIR' : /TRUCK/.test(po) ? 'TRUCK' : 'SEA'
  let dc = null
  if (/USA(SEA|AIR|TRUCK)?$/.test(po)) dc = 'US'
  else if (/US(SEA|AIR|TRUCK)?$/.test(po) && !/USA/.test(po)) dc = 'US'
  else if (/UK(SEA|AIR|TRUCK)?$/.test(po)) dc = 'UK'
  const base = po.replace(/(USA|UK|US)(SEA|AIR|TRUCK)$/, '').trim() || po
  const hasSuffix = base !== po
  return { base, dc, shipmentType, hasSuffix }
}

export async function POST() {
  try {
    const token = await getAccessToken()
    const sheetName = await getSheetName(token)
    if (!sheetName) return NextResponse.json({ error: 'Sheet tab not found' }, { status: 404 })

    const data = await sheetsGet(token, sheetName)
    const rows = data.values || []
    if (rows.length < 2) return NextResponse.json({ error: 'Sheet is empty' }, { status: 400 })

    const headers = rows[0].map(h => String(h).trim())
    const dataRows = rows.slice(1).filter(r => r[0]?.toString().trim())

    const g = (row, pattern) => {
      const i = colIdx(headers, pattern)
      return i >= 0 ? String(row[i] || '').trim() : ''
    }

    const poMap = {}

    for (const row of dataRows) {
      const rawRef = String(row[0]).trim()
      if (!rawRef) continue

      const { base, dc: dcFromRef, shipmentType, hasSuffix } = parsePORef(rawRef)
      const dcColVal = g(row, '^dc$')
      const dc = dcFromRef || dcColVal || null

      if (!poMap[base]) {
        poMap[base] = {
          po: {
            id: base,
            supplier_ref: g(row, 'supplier.?ref'),
            supplier_name: g(row, 'supplier.?ref'),
            seasonality: g(row, 'season'),
            total_cost_value: cleanNum(g(row, 'total.?cost')),
            deposit_cost_value: cleanNum(g(row, 'deposit.?cost')),
            deposit_payment_date: g(row, 'deposit.?pay'),
            ex_factory_date: g(row, 'ex.?factory'),
            currency: 'USD',
            skus_created: cleanBool(g(row, '^skus?')),
            barcodes_sent: cleanBool(g(row, 'barcode')),
            polybags_sent: cleanBool(g(row, 'poly')),
            po_splits_confirmed: cleanBool(g(row, 'po.?splits')) || hasSuffix,
          },
          shipments: [],
        }
      } else {
        // Fill in any PO-level fields that were empty from the first row
        const po = poMap[base].po
        if (!po.ex_factory_date)      po.ex_factory_date      = g(row, 'ex.?factory')
        if (!po.supplier_ref)         po.supplier_ref         = g(row, 'supplier.?ref')
        if (!po.supplier_name)        po.supplier_name        = g(row, 'supplier.?ref')
        if (!po.seasonality)          po.seasonality          = g(row, 'season')
        if (!po.total_cost_value)     po.total_cost_value     = cleanNum(g(row, 'total.?cost'))
        if (!po.deposit_cost_value)   po.deposit_cost_value   = cleanNum(g(row, 'deposit.?cost'))
        if (!po.deposit_payment_date) po.deposit_payment_date = g(row, 'deposit.?pay')
        if (!po.po_splits_confirmed)  po.po_splits_confirmed  = cleanBool(g(row, 'po.?splits')) || hasSuffix
      }

      if (hasSuffix && dc) {
        const status = g(row, 'po.?status|^status$')
        poMap[base].shipments.push({
          shipment_ref: rawRef,
          dc,
          shipment_type: shipmentType,
          status: (!status || status === 'In production') ? 'In transit - awaiting freight info' : status,
          units: parseInt(g(row, '^units$').replace(/,/g, '')) || 0,
          cartons: parseInt(g(row, 'carton').replace(/,/g, '')) || 0,
          freight_forwarder: g(row, 'freight.?forward'),
          shipment_date: g(row, 'shipment.?date'),
          eta: g(row, '^eta$'),
          total_freight_cost: cleanNum(g(row, 'total.?freight')),
          unit_freight_cost_usd: cleanNum(g(row, '\\$usd|unit.?freight.*usd')),
          unit_freight_cost_gbp: cleanNum(g(row, 'new.?exchange|gbp.?new|unit.?freight.*gbp')),
          import_tax_status: g(row, 'import.?tax'),
          tracking_number: g(row, 'tracking'),
          delivery_date: g(row, 'delivery.?date'),
          booked_in_date: g(row, 'booked.?in'),
          added_to_warehouse: cleanBool(g(row, 'added.?to.?warehouse')),
          delivery_booked: cleanBool(g(row, 'delivery.?book')),
          quantities_verified: cleanBool(g(row, 'quantities.?ver')),
          stock_on_shopify: cleanBool(g(row, 'shopify')),
        })
      }
    }

    const supabase = getSupabase()
    const allPOs = Object.values(poMap).map(({ po }) => po)
    const allShipments = Object.values(poMap).flatMap(({ po, shipments }) =>
      shipments.map(sh => ({ ...sh, po_id: po.id }))
    )

    const CHUNK = 100
    let upsertedPOs = 0
    let upsertedShipments = 0
    const errors = []

    for (let i = 0; i < allPOs.length; i += CHUNK) {
      const { error } = await supabase.from('purchase_orders').upsert(allPOs.slice(i, i + CHUNK), { onConflict: 'id' })
      if (error) errors.push(`POs batch ${i}: ${error.message}`)
      else upsertedPOs += Math.min(CHUNK, allPOs.length - i)
    }

    for (let i = 0; i < allShipments.length; i += CHUNK) {
      const { error } = await supabase.from('shipments').upsert(allShipments.slice(i, i + CHUNK), { onConflict: 'shipment_ref' })
      if (error) errors.push(`Shipments batch ${i}: ${error.message}`)
      else upsertedShipments += Math.min(CHUNK, allShipments.length - i)
    }

    return NextResponse.json({ upsertedPOs, upsertedShipments, errors })
  } catch (err) {
    return NextResponse.json({ error: err.message, stack: err.stack?.split('\n').slice(0,3).join(' | ') }, { status: 500 })
  }
}
