'use client'
import { useState, useRef } from 'react'
import * as XLSX from 'xlsx'
import { T, Th, Td } from '@/components/ui'
import { supabase } from '@/lib/supabase'

// ─── Parse packing list Excel — extracts SKU Summary section ───
function parsePackingList(buffer) {
  const wb = XLSX.read(buffer, { type: 'array' })
  const ws = wb.Sheets[wb.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null })

  // Find "Packing List Summary" header row
  let summaryStart = -1
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]
    if (r && r.some(c => c && String(c).toLowerCase().includes('packing list summary'))) {
      summaryStart = i
      break
    }
  }

  // If no summary section, fall back to full packing list rows
  let dataStart = summaryStart >= 0 ? summaryStart + 2 : -1

  // Find header row with SKU column
  if (dataStart < 0) {
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i]
      if (r && r.some(c => c && String(c).toUpperCase() === 'SKU')) {
        dataStart = i + 1
        break
      }
    }
  }

  if (dataStart < 0) return []

  const items = []
  for (let i = dataStart; i < rows.length; i++) {
    const r = rows[i]
    if (!r || !r[3]) continue // SKU in col 3
    const sku = String(r[3]).trim()
    if (!sku || sku.toLowerCase() === 'sku') continue
    if (String(r[1] || '').toLowerCase() === 'total') continue

    const product_name = String(r[1] || '').trim()
    const units = parseInt(r[4]) || 0
    if (units === 0) continue

    items.push({ sku, product_name, units_actual: units })
  }
  return items
}

// ─── Generate ASN CSV for US warehouse ─────────────────────────
function generateASN(shipment, items) {
  const eta = shipment.eta ? shipment.eta.slice(0,10).split('-').reverse().join('/') : ''
  const rows = [
    ['PO Number','Business Type','Shipment Number','Facility','Carrier Number','Seal Number','Load Number','Shipping Method','Shipped At','Arrival At','Case Barcode','Sku Code','','Quantity','Country of Origin']
  ]
  items.forEach(item => {
    rows.push([
      shipment.shipment_ref, '', shipment.shipment_ref, 'FBF06',
      '', '', '', '', '', eta,
      '', item.sku, '', item.units_actual, ''
    ])
  })
  const csv = rows.map(r => r.join(',')).join('\r\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${shipment.shipment_ref}_ASN.csv`
  a.click()
  URL.revokeObjectURL(url)
}

// ─── Main component ─────────────────────────────────────────────
export default function PackingListPanel({ shipment, poLines = [], onSaved }) {
  const [items, setItems] = useState(null) // parsed from Excel
  const [saved, setSaved] = useState(shipment.packing_list_uploaded || false)
  const [savedItems, setSavedItems] = useState([])
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(false)
  const fileRef = useRef()
  const isUS = shipment.dc === 'US'

  // Load saved items
  async function loadSaved() {
    setLoading(true)
    const { data } = await supabase
      .from('packing_list_items')
      .select('*')
      .eq('shipment_ref', shipment.shipment_ref)
      .order('sku')
    setSavedItems(data || [])
    setLoading(false)
  }

  // Parse uploaded file
  async function handleFile(e) {
    const file = e.target.files[0]
    if (!file) return
    const buffer = await file.arrayBuffer()
    const parsed = parsePackingList(new Uint8Array(buffer))

    // Match with po_lines to get planned quantities
    const withPlanned = parsed.map(item => {
      const planned = poLines.find(l => l.sku === item.sku)
      const units_planned = planned
        ? (shipment.dc === 'UK' ? (planned.qty_uk || 0) : (planned.qty_us || 0))
        : 0
      return { ...item, units_planned }
    })
    setItems(withPlanned)
  }

  async function handleSave() {
    if (!items?.length) return
    setSaving(true)

    // Delete existing and insert new
    await supabase.from('packing_list_items').delete().eq('shipment_ref', shipment.shipment_ref)
    const total = items.reduce((s, i) => s + i.units_actual, 0)
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
      actual_units: total
    }).eq('id', shipment.id)

    setSaving(false)
    setSaved(true)
    setItems(null)
    loadSaved()
    if (onSaved) onSaved()
  }

  const totalActual = (items || savedItems).reduce((s, i) => s + (i.units_actual || 0), 0)
  const totalPlanned = (items || savedItems).reduce((s, i) => s + (i.units_planned || 0), 0)
  const totalDiff = totalActual - totalPlanned

  const displayItems = items || (saved ? savedItems : null)

  return (
    <div style={{ marginTop: 16, borderTop: `1px solid ${T.border}`, paddingTop: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: T.muted, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            📦 Packing List
          </span>
          {saved && <span style={{ background: '#22c55e20', color: '#22c55e', border: '1px solid #22c55e40', borderRadius: 4, padding: '2px 8px', fontSize: 11, fontWeight: 700 }}>✓ Uploaded</span>}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {saved && !items && (
            <>
              {savedItems.length === 0 && (
                <button onClick={loadSaved} style={{ background: T.subtle, color: T.muted, border: `1px solid ${T.border}`, borderRadius: 5, padding: '5px 12px', fontSize: 12, cursor: 'pointer' }}>
                  View Items
                </button>
              )}
              {isUS && savedItems.length > 0 && (
                <button onClick={() => generateASN(shipment, savedItems)} style={{ background: '#8b5cf620', color: '#8b5cf6', border: '1px solid #8b5cf640', borderRadius: 5, padding: '5px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                  ⬇ Download ASN
                </button>
              )}
            </>
          )}
          <button
            onClick={() => fileRef.current.click()}
            style={{ background: T.accent, color: '#fff', border: 'none', borderRadius: 5, padding: '5px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
          >
            {saved ? '↻ Re-upload' : '⬆ Upload Packing List'}
          </button>
          <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" style={{ display: 'none' }} onChange={handleFile} />
        </div>
      </div>

      {/* Preview parsed items */}
      {displayItems && displayItems.length > 0 && (
        <>
          {/* Summary bar */}
          <div style={{ display: 'flex', gap: 16, marginBottom: 10, padding: '8px 12px', background: T.surface, borderRadius: 6, fontSize: 12 }}>
            <span style={{ color: T.muted }}>{displayItems.length} SKUs</span>
            <span style={{ color: T.text, fontWeight: 700 }}>Actual: {totalActual.toLocaleString()} units</span>
            {totalPlanned > 0 && (
              <>
                <span style={{ color: T.muted }}>Planned: {totalPlanned.toLocaleString()}</span>
                <span style={{ color: totalDiff === 0 ? '#22c55e' : totalDiff > 0 ? '#f59e0b' : '#ef4444', fontWeight: 700 }}>
                  {totalDiff > 0 ? '+' : ''}{totalDiff} diff
                </span>
              </>
            )}
          </div>

          {/* Table */}
          <div style={{ overflowX: 'auto', maxHeight: 300, overflowY: 'auto', border: `1px solid ${T.border}`, borderRadius: 6 }}>
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

          {/* Save + ASN buttons for new upload */}
          {items && (
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 10 }}>
              <button onClick={() => setItems(null)} style={{ background: T.subtle, color: T.muted, border: 'none', borderRadius: 5, padding: '7px 14px', fontSize: 12, cursor: 'pointer' }}>Cancel</button>
              {isUS && (
                <button onClick={() => generateASN(shipment, items)} style={{ background: '#8b5cf620', color: '#8b5cf6', border: '1px solid #8b5cf640', borderRadius: 5, padding: '7px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                  ⬇ Download ASN
                </button>
              )}
              <button onClick={handleSave} disabled={saving} style={{ background: '#22c55e', color: '#fff', border: 'none', borderRadius: 5, padding: '7px 16px', fontSize: 12, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.6 : 1 }}>
                {saving ? 'Saving...' : '✓ Save Packing List'}
              </button>
            </div>
          )}

          {/* ASN button for already saved US shipment */}
          {!items && isUS && savedItems.length > 0 && (
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>
              <button onClick={() => generateASN(shipment, savedItems)} style={{ background: '#8b5cf620', color: '#8b5cf6', border: '1px solid #8b5cf640', borderRadius: 5, padding: '7px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                ⬇ Download ASN CSV
              </button>
            </div>
          )}
        </>
      )}

      {loading && <div style={{ textAlign: 'center', padding: 20, color: T.muted, fontSize: 12 }}>Loading...</div>}
    </div>
  )
}
