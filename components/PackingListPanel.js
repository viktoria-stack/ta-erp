'use client'
import { useState, useRef, useEffect, useCallback } from 'react'
import * as XLSX from 'xlsx'
import { T, Th, Td } from '@/components/ui'
import { supabase } from '@/lib/supabase'

const norm = s => String(s || '').toLowerCase().trim()

function parsePackingList(buffer) {
  const wb = XLSX.read(buffer, { type: 'array' })
  const ws = wb.Sheets[wb.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null })
  if (!rows.length) return { items: [], error: 'Empty file' }

  const matches = (h, patterns) => patterns.some(p => h === p || h.includes(p))
  const SKU_P  = ['variant sku', 'sku', 'item code', 'style no', 'style number', 'article no', 'article', 'product code', 'reference']
  const QTY_P  = ['variant inventory qty', 'inventory qty', 'total qty', 'total units', 'carton qty', 'units', 'qty', 'quantity']
  const NAME_P = ['title', 'description', 'product name', 'style name', 'name']
  const SIZES  = new Set(['xs', 's', 'm', 'l', 'xl', 'xxl', '2xl', 'xxxl', '3xl', '4xl', 'os', 'one size', 'one-size', 'free size', 'universal'])

  // ── Strategy 0: UK size-split format ──
  // Main table: header row has SKU, sub-header row has size names (S, M, L, XL, 2XL...)
  // Each data row has qty in only one size column; same SKU may appear in multiple rows (cartons)
  for (let i = 0; i < Math.min(25, rows.length); i++) {
    const r = rows[i]
    if (!r) continue
    const nh = r.map(norm)
    const si = nh.findIndex(h => matches(h, SKU_P))
    if (si < 0) continue

    // Check if the NEXT non-empty row has ≥2 size column headers
    let sizeRow = null
    for (let k = i + 1; k < Math.min(i + 4, rows.length); k++) {
      if (rows[k] && rows[k].some(Boolean)) { sizeRow = rows[k]; break }
    }
    if (!sizeRow) continue
    const sizeNh = sizeRow.map(norm)
    const sizeCols = sizeNh.reduce((acc, h, idx) => { if (SIZES.has(h)) acc.push(idx); return acc }, [])
    if (sizeCols.length < 2) continue // not a size-split table

    // Found UK-style table — read data rows, sum qty across size columns per SKU
    const nameCol = nh.findIndex(h => matches(h, NAME_P))
    const skuMap  = {}
    // find where data actually starts (skip sub-header rows)
    const dataStart = rows.indexOf(sizeRow) + 1
    for (let j = dataStart; j < rows.length; j++) {
      const d = rows[j]
      if (!d) continue
      if (d.some(c => norm(c).includes('packing list summary'))) break
      if (d.some(c => norm(c) === 'total')) continue
      const sku = String(d[si] || '').trim()
      if (!sku || norm(sku) === 'sku') continue
      const qty = sizeCols.reduce((sum, ci) => sum + (parseInt(d[ci]) || 0), 0)
      if (qty === 0) continue
      const pn = nameCol >= 0 ? String(d[nameCol] || '').trim() : ''
      if (skuMap[sku]) { skuMap[sku].units_actual += qty }
      else { skuMap[sku] = { sku, product_name: pn, units_actual: qty } }
    }
    const items = Object.values(skuMap)
    if (items.length > 0) return { items, error: null }
  }

  // ── Strategy 1: scan entire file for "Packing List Summary" section ──
  // For formats where the summary table has flat SKU + Units rows
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]
    if (!r) continue
    if (!r.some(c => norm(c).includes('packing list summary'))) continue

    let skuCol = -1, qtyCol = -1, nameCol = -1, headerRow = -1
    for (let j = i + 1; j < Math.min(i + 6, rows.length); j++) {
      const hr = rows[j]
      if (!hr) continue
      const nh = hr.map(norm)
      const si = nh.findIndex(h => matches(h, SKU_P))
      const qi = nh.findIndex(h => matches(h, QTY_P))
      if (si >= 0 && qi >= 0) {
        headerRow = j; skuCol = si; qtyCol = qi
        nameCol = nh.findIndex(h => matches(h, NAME_P))
        break
      }
    }
    if (headerRow < 0 || skuCol < 0 || qtyCol < 0) continue

    const items = []
    for (let j = headerRow + 1; j < rows.length; j++) {
      const r2 = rows[j]
      if (!r2) continue
      const sku = String(r2[skuCol] || '').trim()
      if (!sku || norm(sku) === 'sku' || norm(sku) === 'total') continue
      const units = parseInt(r2[qtyCol]) || 0
      if (units === 0) continue
      const product_name = nameCol >= 0 ? String(r2[nameCol] || '').trim() : ''
      items.push({ sku, product_name, units_actual: units })
    }
    if (items.length > 0) return { items, error: null }
  }

  // ── Strategy 2: flexible header detection anywhere in first 30 rows ──
  // US/Shopify export format: flat table with single Units/Qty column
  let headerRow = -1, skuCol = -1, qtyCol = -1, nameCol = -1
  for (let i = 0; i < Math.min(30, rows.length); i++) {
    const r = rows[i]
    if (!r) continue
    const nh = r.map(norm)
    const si = nh.findIndex(h => matches(h, SKU_P))
    if (si >= 0) {
      const qi = nh.findIndex(h => matches(h, QTY_P))
      if (qi < 0) continue // skip rows without a qty column (e.g. size-split tables)
      headerRow = i; skuCol = si; qtyCol = qi
      nameCol = nh.findIndex(h => matches(h, NAME_P))
      break
    }
  }

  if (headerRow < 0) {
    const preview = rows.slice(0, 6)
      .map(r => (r || []).filter(Boolean).slice(0, 6).join(' | '))
      .filter(Boolean).join('\n')
    return { items: [], error: `Nenašiel sa SKU stĺpec ani "Packing List Summary" sekcia.\nPrvé riadky súboru:\n${preview || '(prázdne)'}` }
  }

  const items = []
  for (let i = headerRow + 1; i < rows.length; i++) {
    const r = rows[i]
    if (!r) continue
    const sku = String(r[skuCol] || '').trim()
    if (!sku || norm(sku) === 'sku' || norm(sku) === 'total') continue
    const units = parseInt(r[qtyCol]) || 0
    if (units === 0) continue
    const product_name = nameCol >= 0 ? String(r[nameCol] || '').trim() : ''
    items.push({ sku, product_name, units_actual: units })
  }

  if (!items.length) {
    const headers = (rows[headerRow] || []).filter(Boolean).join(', ')
    return { items: [], error: `Hlavička nájdená (riadok ${headerRow + 1}): ${headers}\nŽiadne položky s qty > 0.` }
  }
  return { items, error: null }
}

function generateASN(shipment, items) {
  const eta = shipment.eta ? shipment.eta.slice(0, 10).split('-').reverse().join('/') : ''
  const rows = [
    ['PO Number', 'Business Type', 'Shipment Number', 'Facility', 'Carrier Number', 'Seal Number', 'Load Number', 'Shipping Method', 'Shipped At', 'Arrival At', 'Case Barcode', 'Sku Code', '', 'Quantity', 'Country of Origin']
  ]
  items.forEach(item => {
    rows.push([shipment.shipment_ref, '', shipment.shipment_ref, 'FBF06', '', '', '', '', '', eta, '', item.sku, '', item.units_actual, ''])
  })
  const csv = rows.map(r => r.join(',')).join('\r\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = `${shipment.shipment_ref}_ASN.csv`; a.click()
  URL.revokeObjectURL(url)
}

export default function PackingListPanel({ shipment, poLines = [], onSaved }) {
  const [items, setItems]         = useState(null)
  const [parseError, setParseError] = useState(null)
  const [saved, setSaved]         = useState(shipment.packing_list_uploaded || false)
  const [savedItems, setSavedItems] = useState([])
  const [saving, setSaving]       = useState(false)
  const [loading, setLoading]     = useState(false)
  const [syncMsg, setSyncMsg]     = useState(null)
  const fileRef = useRef()
  const isUS = shipment.dc === 'US'

  const loadSaved = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('packing_list_items')
      .select('*')
      .eq('shipment_ref', shipment.shipment_ref)
      .order('sku')
    setSavedItems(data || [])
    setLoading(false)
  }, [shipment.shipment_ref])

  // Auto-load saved items on mount
  useEffect(() => {
    if (shipment.packing_list_uploaded) loadSaved()
  }, [loadSaved])

  async function handleFile(e) {
    const file = e.target.files[0]
    if (!file) return
    e.target.value = ''
    setParseError(null)
    const buffer = await file.arrayBuffer()
    const { items: parsed, error } = parsePackingList(new Uint8Array(buffer))
    if (error) { setParseError(error); return }

    const col = isUS ? 'us' : 'uk'
    const withPlanned = parsed.map(item => {
      const planned = poLines.find(l => (l.sku || '').toUpperCase() === item.sku.toUpperCase())
      const units_planned = planned
        ? (col === 'uk' ? (planned.qty_uk || 0) : (planned.qty_usa || planned.qty_us || 0))
        : 0
      return { ...item, units_planned }
    })
    setItems(withPlanned)
  }

  async function handleSave() {
    if (!items?.length) return
    setSaving(true); setSyncMsg(null)
    const col = isUS ? 'us' : 'uk'
    const total = items.reduce((s, i) => s + i.units_actual, 0)

    await supabase.from('packing_list_items').delete().eq('shipment_ref', shipment.shipment_ref)
    await supabase.from('packing_list_items').insert(
      items.map(i => ({
        shipment_id: shipment.id,
        shipment_ref: shipment.shipment_ref,
        sku: i.sku,
        product_name: i.product_name,
        units_actual: i.units_actual,
        units_planned: i.units_planned,
      }))
    )
    await supabase.from('shipments').update({
      packing_list_uploaded: true,
      actual_units: total,
    }).eq('id', shipment.id)

    // Sync incoming qty + ETA → inventory_incoming
    if (shipment.eta) {
      const etaDate = shipment.eta.slice(0, 10)
      const upsertRows = items.map(i => ({
        sku: i.sku.toUpperCase(),
        [`incoming_${col}`]: i.units_actual,
        [`restock_date_${col}`]: etaDate,
        shipment_ref: shipment.shipment_ref,
        updated_at: new Date().toISOString(),
      }))
      const { error: syncErr } = await supabase
        .from('inventory_incoming')
        .upsert(upsertRows, { onConflict: 'sku' })
      setSyncMsg(syncErr ? `⚠ Inventory sync failed: ${syncErr.message}` : `✓ Inventory updated — restock ${col.toUpperCase()} set to ${etaDate}`)
    } else {
      setSyncMsg('⚠ Shipment nemá ETA — inventory restock date nebol aktualizovaný')
    }

    setSaving(false)
    setSaved(true)
    setItems(null)
    loadSaved()
    if (onSaved) onSaved()
  }

  const displayItems = items || savedItems
  const totalActual  = displayItems.reduce((s, i) => s + (i.units_actual || 0), 0)
  const totalPlanned = displayItems.reduce((s, i) => s + (i.units_planned || 0), 0)
  const totalDiff    = totalActual - totalPlanned

  return (
    <div style={{ marginTop: 16, borderTop: `1px solid ${T.border}`, paddingTop: 16 }}>
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: T.muted, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            📦 Packing List
          </span>
          {saved && (
            <span style={{ background: '#22c55e20', color: '#22c55e', border: '1px solid #22c55e40', borderRadius: 4, padding: '2px 8px', fontSize: 11, fontWeight: 700 }}>
              ✓ Uploaded
            </span>
          )}
          {saved && shipment.eta && (
            <span style={{ background: '#3b82f620', color: '#3b82f6', border: '1px solid #3b82f640', borderRadius: 4, padding: '2px 8px', fontSize: 11 }}>
              ETA {new Date(shipment.eta).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' })}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {saved && savedItems.length > 0 && isUS && (
            <button
              onClick={() => generateASN(shipment, savedItems)}
              style={{ background: '#8b5cf620', color: '#8b5cf6', border: '1px solid #8b5cf640', borderRadius: 5, padding: '5px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
            >
              ⬇ Download ASN
            </button>
          )}
          <button
            onClick={() => fileRef.current?.click()}
            style={{ background: T.accent, color: '#fff', border: 'none', borderRadius: 5, padding: '5px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
          >
            {saved ? '↻ Re-upload' : '⬆ Upload Packing List'}
          </button>
          <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" style={{ display: 'none' }} onChange={handleFile} />
        </div>
      </div>

      {/* Parse error */}
      {parseError && (
        <div style={{ background: '#ef444415', border: '1px solid #ef444430', borderRadius: 6, padding: '10px 14px', fontSize: 11, color: '#ef4444', marginBottom: 12, whiteSpace: 'pre-wrap', fontFamily: 'monospace' }}>
          ⚠ {parseError}
        </div>
      )}

      {/* Sync result message */}
      {syncMsg && (
        <div style={{ background: syncMsg.startsWith('✓') ? '#22c55e15' : '#f59e0b15', border: `1px solid ${syncMsg.startsWith('✓') ? '#22c55e30' : '#f59e0b30'}`, borderRadius: 6, padding: '8px 12px', fontSize: 11, color: syncMsg.startsWith('✓') ? '#22c55e' : '#f59e0b', marginBottom: 12 }}>
          {syncMsg}
        </div>
      )}

      {loading && <div style={{ textAlign: 'center', padding: 20, color: T.muted, fontSize: 12 }}>Loading...</div>}

      {!loading && displayItems.length > 0 && (
        <>
          {/* Summary bar */}
          <div style={{ display: 'flex', gap: 16, marginBottom: 10, padding: '8px 12px', background: T.surface, borderRadius: 6, fontSize: 12 }}>
            <span style={{ color: T.muted }}>{displayItems.length} SKUs</span>
            <span style={{ color: T.text, fontWeight: 700 }}>Actual: {totalActual.toLocaleString()} units</span>
            {totalPlanned > 0 && <>
              <span style={{ color: T.muted }}>Planned: {totalPlanned.toLocaleString()}</span>
              <span style={{ color: totalDiff === 0 ? '#22c55e' : totalDiff > 0 ? '#f59e0b' : '#ef4444', fontWeight: 700 }}>
                {totalDiff > 0 ? '+' : ''}{totalDiff} diff
              </span>
            </>}
          </div>

          {/* Table */}
          <div style={{ overflowX: 'auto', maxHeight: 320, overflowY: 'auto', border: `1px solid ${T.border}`, borderRadius: 6 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead style={{ position: 'sticky', top: 0 }}>
                <tr style={{ background: T.surface }}>
                  <Th>SKU</Th>
                  <Th>Product</Th>
                  <Th style={{ textAlign: 'right' }}>Actual</Th>
                  {totalPlanned > 0 && <Th style={{ textAlign: 'right' }}>Planned</Th>}
                  {totalPlanned > 0 && <Th style={{ textAlign: 'right' }}>Diff</Th>}
                </tr>
              </thead>
              <tbody>
                {displayItems.map((item, i) => {
                  const diff = item.units_actual - (item.units_planned || 0)
                  const diffColor = diff === 0 ? T.muted : diff > 0 ? '#f59e0b' : '#ef4444'
                  return (
                    <tr key={i} style={{ borderTop: `1px solid ${T.border}` }}>
                      <Td style={{ fontFamily: 'monospace', fontSize: 11, color: T.accent }}>{item.sku}</Td>
                      <Td style={{ fontSize: 12, color: T.muted, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.product_name || '—'}</Td>
                      <Td style={{ textAlign: 'right', fontWeight: 700 }}>{item.units_actual}</Td>
                      {totalPlanned > 0 && <Td style={{ textAlign: 'right', color: T.muted }}>{item.units_planned || '—'}</Td>}
                      {totalPlanned > 0 && <Td style={{ textAlign: 'right', color: diffColor, fontWeight: diff !== 0 ? 700 : 400 }}>{diff !== 0 ? (diff > 0 ? '+' : '') + diff : '—'}</Td>}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Save / Cancel buttons (only when fresh upload, not viewing saved) */}
          {items && (
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 10 }}>
              <button onClick={() => { setItems(null); setParseError(null) }} style={{ background: T.subtle, color: T.muted, border: 'none', borderRadius: 5, padding: '7px 14px', fontSize: 12, cursor: 'pointer' }}>
                Cancel
              </button>
              {isUS && (
                <button onClick={() => generateASN(shipment, items)} style={{ background: '#8b5cf620', color: '#8b5cf6', border: '1px solid #8b5cf640', borderRadius: 5, padding: '7px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                  ⬇ Download ASN
                </button>
              )}
              <button onClick={handleSave} disabled={saving} style={{ background: '#22c55e', color: '#fff', border: 'none', borderRadius: 5, padding: '7px 16px', fontSize: 12, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.6 : 1 }}>
                {saving ? 'Saving...' : `✓ Save${shipment.eta ? ' & Sync Inventory' : ''}`}
              </button>
            </div>
          )}
        </>
      )}

      {!loading && !items && saved && savedItems.length === 0 && !parseError && (
        <div style={{ textAlign: 'center', padding: '14px 0', color: T.muted, fontSize: 12 }}>
          No items found in saved packing list.
        </div>
      )}
    </div>
  )
}
