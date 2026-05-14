import { google } from 'googleapis'
import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const SPREADSHEET_ID = process.env.GOOGLE_SHEETS_PO_ID
const SHEET_GID = '434068651'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
)

function getAuth() {
  return new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    },
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  })
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
    const auth = getAuth()
    const sheets = google.sheets({ version: 'v4', auth })

    // Get sheet name from GID
    const meta = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID })
    const sheet = meta.data.sheets.find(s => String(s.properties.sheetId) === SHEET_GID)
    if (!sheet) return NextResponse.json({ error: 'Sheet tab not found' }, { status: 404 })
    const sheetName = sheet.properties.title

    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: sheetName,
    })

    const rows = res.data.values || []
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

    let upsertedPOs = 0
    let upsertedShipments = 0
    const errors = []

    for (const { po, shipments } of Object.values(poMap)) {
      const { error: poErr } = await supabase
        .from('purchase_orders')
        .upsert(po, { onConflict: 'id' })
      if (poErr) { errors.push(`PO ${po.id}: ${poErr.message}`); continue }
      upsertedPOs++

      for (const sh of shipments) {
        const { error: shErr } = await supabase
          .from('shipments')
          .upsert({ ...sh, po_id: po.id }, { onConflict: 'shipment_ref' })
        if (shErr) errors.push(`Shipment ${sh.shipment_ref}: ${shErr.message}`)
        else upsertedShipments++
      }
    }

    return NextResponse.json({ upsertedPOs, upsertedShipments, errors })
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
