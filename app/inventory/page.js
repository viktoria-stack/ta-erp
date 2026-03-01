'use client'
import { useEffect, useState, useRef } from 'react'
import * as XLSX from 'xlsx'
import Shell from '@/components/Shell'
import { T, KPI, Card, Th, Td, BtnPrimary, BtnGhost, Modal, Loading, ErrorMsg, fmt } from '@/components/ui'
import { supabase } from '@/lib/supabase'

const SIZES = ['XS','S','M','L','XL','XXL','ONE SIZE']

async function getInventory() {
  const { data, error } = await supabase.from('inventory').select('*').order('product_name').order('size')
  if (error) throw error
  return data || []
}

// ─── SHOPIFY CSV IMPORT MODAL ─────────────────────────────────
function ImportModal({ onClose, onSaved }) {
  const [ukFile, setUkFile] = useState(null)
  const [usFile, setUsFile] = useState(null)
  const [ukRows, setUkRows] = useState(null)
  const [usRows, setUsRows] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const ukRef = useRef()
  const usRef = useRef()

  const parseShopifyCSV = (data) => {
    const headers = data[0].map(String)
    const col = (pat) => headers.findIndex(h => new RegExp(pat,'i').test(h))
    const rows = []

    for (const r of data.slice(1)) {
      if (!r[col('title')] && !r[col('variant sku|^sku')]) continue
      rows.push({
        product_name: String(r[col('^title$')] || ''),
        variant_title: String(r[col('option1 value|variant.*title')] || ''),
        sku: String(r[col('variant sku|^sku')] || '').trim(),
        barcode: String(r[col('barcode')] || '').trim(),
        size: String(r[col('option.*size|size')] || '').trim(),
        colour: String(r[col('option.*color|option.*colour|color|colour')] || '').trim(),
        qty: parseInt(r[col('variant inventory qty|inventory qty|quantity')] || '0') || 0,
        cost_price: parseFloat(String(r[col('cost per item|cost')] || '0').replace(/[$£,]/g,'')) || 0,
        retail_price: parseFloat(String(r[col('variant price|^price')] || '0').replace(/[$£,]/g,'')) || 0,
        product_type: String(r[col('type|product type')] || '').trim(),
        vendor: String(r[col('vendor')] || '').trim(),
        shopify_variant_id: String(r[col('variant id')] || '').trim(),
        shopify_product_id: String(r[col('^id$|product id')] || '').trim(),
      })
    }
    return rows.filter(r => r.product_name || r.sku)
  }

  const readFile = (file, setRows) => {
    const reader = new FileReader()
    reader.onload = (evt) => {
      try {
        const wb = XLSX.read(evt.target.result, { type: 'binary' })
        const data = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1 })
        setRows(parseShopifyCSV(data))
        setError('')
      } catch(e) { setError('Could not read file: ' + e.message) }
    }
    reader.readAsBinaryString(file)
  }

  const handleUK = (e) => { const f = e.target.files[0]; if(f){setUkFile(f);readFile(f,setUkRows)} }
  const handleUS = (e) => { const f = e.target.files[0]; if(f){setUsFile(f);readFile(f,setUsRows)} }

  const doImport = async () => {
    setSaving(true)
    try {
      // Clear existing inventory
      await supabase.from('inventory').delete().neq('id', '00000000-0000-0000-0000-000000000000')

      // Build merged map keyed by SKU
      const map = {}

      for (const r of (ukRows || [])) {
        const key = r.sku || `${r.product_name}__${r.variant_title}`
        if (!map[key]) map[key] = { ...r, qty_uk: 0, qty_us: 0 }
        map[key].qty_uk = r.qty
        map[key].shopify_variant_id_uk = r.shopify_variant_id
        map[key].shopify_product_id_uk = r.shopify_product_id
      }

      for (const r of (usRows || [])) {
        const key = r.sku || `${r.product_name}__${r.variant_title}`
        if (!map[key]) map[key] = { ...r, qty_uk: 0, qty_us: 0 }
        map[key].qty_us = r.qty
        map[key].shopify_variant_id_us = r.shopify_variant_id
        map[key].shopify_product_id_us = r.shopify_product_id
      }

      const rows = Object.values(map).map(r => ({
        product_name: r.product_name,
        variant_title: r.variant_title,
        sku: r.sku || null,
        barcode: r.barcode || null,
        size: r.size || null,
        colour: r.colour || null,
        qty_uk: r.qty_uk || 0,
        qty_us: r.qty_us || 0,
        cost_price: r.cost_price || 0,
        retail_price: r.retail_price || 0,
        currency: 'GBP',
        product_type: r.product_type || null,
        vendor: r.vendor || null,
        shopify_product_id_uk: r.shopify_product_id_uk || null,
        shopify_variant_id_uk: r.shopify_variant_id_uk || null,
        shopify_product_id_us: r.shopify_product_id_us || null,
        shopify_variant_id_us: r.shopify_variant_id_us || null,
        last_synced_at: new Date().toISOString(),
      }))

      // Insert in batches of 500
      for (let i = 0; i < rows.length; i += 500) {
        const { error } = await supabase.from('inventory').insert(rows.slice(i, i+500))
        if (error) throw error
      }

      onSaved()
      onClose()
    } catch(e) {
      setError(e.message)
      setSaving(false)
    }
  }

  const DropZone = ({ label, flag, file, inputRef, onChange }) => (
    <div onClick={() => inputRef.current.click()} style={{ background: file ? T.greenDim : T.surface, border: `2px dashed ${file ? T.green : T.border}`, borderRadius: 8, padding: 24, textAlign: 'center', cursor: 'pointer', flex: 1 }}>
      <div style={{ fontSize: 28, marginBottom: 6 }}>{flag}</div>
      <div style={{ fontWeight: 700, color: file ? T.green : T.text, marginBottom: 4 }}>{label}</div>
      {file
        ? <div style={{ fontSize: 12, color: T.green }}>✓ {file.name} ({file.inputRef?.length || '?'} rows)</div>
        : <div style={{ fontSize: 12, color: T.muted }}>Click to upload Shopify products CSV</div>
      }
      <input ref={inputRef} type="file" accept=".csv,.xlsx" onChange={onChange} style={{ display: 'none' }} />
    </div>
  )

  const ready = ukRows || usRows

  return (
    <Modal title="Import Shopify Inventory" width={700} onClose={onClose}>
      <div style={{ fontSize: 12, color: T.muted, marginBottom: 16, lineHeight: 1.6 }}>
        Export from each Shopify store: <strong style={{ color: T.text }}>Products → Export → All products → Plain CSV</strong>
      </div>

      <div style={{ display: 'flex', gap: 16, marginBottom: 20 }}>
        <DropZone label="UK Store" flag="🇬🇧" file={ukFile} inputRef={ukRef} onChange={handleUK} />
        <DropZone label="US Store" flag="🇺🇸" file={usFile} inputRef={usRef} onChange={handleUS} />
      </div>

      {error && <div style={{ color: T.red, background: T.redDim, border: `1px solid ${T.red}40`, borderRadius: 5, padding: '10px 14px', marginBottom: 16, fontSize: 13 }}>⚠ {error}</div>}

      {ready && (
        <div style={{ background: T.greenDim, border: `1px solid ${T.green}40`, borderRadius: 8, padding: 14, marginBottom: 20 }}>
          <div style={{ fontWeight: 700, color: T.green, marginBottom: 8 }}>✓ Ready to import</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {ukRows && <div style={{ fontSize: 13 }}>🇬🇧 UK: <strong>{ukRows.length}</strong> variants</div>}
            {usRows && <div style={{ fontSize: 13 }}>🇺🇸 US: <strong>{usRows.length}</strong> variants</div>}
          </div>
          {ukRows && usRows && (
            <div style={{ fontSize: 12, color: T.muted, marginTop: 6 }}>
              Will merge by SKU — variants in both stores shown with UK + US qty
            </div>
          )}
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
        <BtnGhost onClick={onClose}>Cancel</BtnGhost>
        <BtnPrimary onClick={doImport} disabled={saving || !ready}>
          {saving ? 'Importing…' : 'Import Inventory'}
        </BtnPrimary>
      </div>
    </Modal>
  )
}

// ─── MAIN PAGE ────────────────────────────────────────────────
export default function InventoryPage() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [store, setStore] = useState('All')
  const [search, setSearch] = useState('')
  const [showImport, setShowImport] = useState(false)

  const load = () => {
    setLoading(true)
    getInventory().then(setItems).catch(e => setError(e.message)).finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const filtered = items.filter(p => {
    const matchStore = store === 'All'
      || (store === 'UK' && p.qty_uk > 0)
      || (store === 'US' && p.qty_us > 0)
      || (store === 'Out of stock' && p.qty_uk === 0 && p.qty_us === 0)
    const matchSearch = !search
      || p.product_name?.toLowerCase().includes(search.toLowerCase())
      || p.sku?.toLowerCase().includes(search.toLowerCase())
      || p.barcode?.includes(search)
      || p.colour?.toLowerCase().includes(search.toLowerCase())
    return matchStore && matchSearch
  })

  const totalUK = items.reduce((s, p) => s + (p.qty_uk || 0), 0)
  const totalUS = items.reduce((s, p) => s + (p.qty_us || 0), 0)
  const outOfStock = items.filter(p => p.qty_uk === 0 && p.qty_us === 0).length
  const lowStock = items.filter(p => (p.qty_uk > 0 && p.qty_uk < 10) || (p.qty_us > 0 && p.qty_us < 10)).length

  const qtyStyle = (qty) => ({
    textAlign: 'right', fontWeight: qty === 0 ? 400 : 700,
    color: qty === 0 ? T.border : qty < 10 ? T.yellow : T.text
  })

  return (
    <Shell title="Inventory">
      {showImport && <ImportModal onClose={() => setShowImport(false)} onSaved={load} />}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12, marginBottom: 20 }}>
        <KPI label="Total SKUs" value={items.length.toLocaleString()} />
        <KPI label="🇬🇧 UK Units" value={totalUK.toLocaleString()} color={'#3b82f6'} />
        <KPI label="🇺🇸 US Units" value={totalUS.toLocaleString()} color={'#8b5cf6'} />
        <KPI label="Low Stock" value={lowStock} color={T.yellow} />
        <KPI label="Out of Stock" value={outOfStock} color={T.red} />
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', gap: 6 }}>
          {[
            { id: 'All', label: 'All' },
            { id: 'UK', label: '🇬🇧 UK' },
            { id: 'US', label: '🇺🇸 US' },
            { id: 'Out of stock', label: '⚠ Out of Stock' },
          ].map(f => (
            <button key={f.id} onClick={() => setStore(f.id)} style={{ background: store === f.id ? T.accent : T.subtle, color: store === f.id ? '#fff' : T.muted, border: 'none', borderRadius: 4, padding: '5px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
              {f.label}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input placeholder="Search product, SKU, barcode…" value={search} onChange={e => setSearch(e.target.value)}
            style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 5, padding: '7px 12px', color: T.text, fontSize: 13, width: 260, outline: 'none' }} />
          <BtnPrimary onClick={() => setShowImport(true)}>⬆ Import from Shopify</BtnPrimary>
        </div>
      </div>

      {error && <ErrorMsg msg={error} />}
      {loading ? <Loading /> : (
        <Card>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: T.surface }}>
                  <Th>Product Name</Th>
                  <Th>Variant</Th>
                  <Th>Size</Th>
                  <Th>Colour</Th>
                  <Th>SKU</Th>
                  <Th>Barcode</Th>
                  <Th style={{ textAlign: 'right', color: '#3b82f6' }}>🇬🇧 UK</Th>
                  <Th style={{ textAlign: 'right', color: '#8b5cf6' }}>🇺🇸 US</Th>
                  <Th style={{ textAlign: 'right' }}>Total</Th>
                  <Th style={{ textAlign: 'right' }}>Cost</Th>
                  <Th style={{ textAlign: 'right' }}>Retail</Th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((p, i) => {
                  const total = (p.qty_uk || 0) + (p.qty_us || 0)
                  return (
                    <tr key={p.id || i} className="row-hover">
                      <Td style={{ fontWeight: 600, maxWidth: 200 }}>{p.product_name}</Td>
                      <Td style={{ color: T.muted, fontSize: 12 }}>{p.variant_title || '—'}</Td>
                      <Td>
                        {p.size && <span style={{ background: T.subtle, color: T.text, borderRadius: 4, padding: '2px 8px', fontSize: 11, fontWeight: 700 }}>{p.size}</span>}
                      </Td>
                      <Td style={{ color: T.muted, fontSize: 12 }}>{p.colour || '—'}</Td>
                      <Td style={{ fontFamily: 'monospace', fontSize: 11, color: T.muted }}>{p.sku || '—'}</Td>
                      <Td style={{ fontFamily: 'monospace', fontSize: 11, color: T.muted }}>{p.barcode || '—'}</Td>
                      <Td style={qtyStyle(p.qty_uk || 0)}>{(p.qty_uk || 0).toLocaleString()}</Td>
                      <Td style={qtyStyle(p.qty_us || 0)}>{(p.qty_us || 0).toLocaleString()}</Td>
                      <Td style={{ textAlign: 'right', fontWeight: 700, color: total === 0 ? T.red : total < 20 ? T.yellow : T.text }}>{total.toLocaleString()}</Td>
                      <Td style={{ textAlign: 'right', color: T.muted, fontSize: 12 }}>{p.cost_price ? fmt(p.cost_price, p.currency) : '—'}</Td>
                      <Td style={{ textAlign: 'right', color: T.accent, fontSize: 12 }}>{p.retail_price ? fmt(p.retail_price, p.currency) : '—'}</Td>
                    </tr>
                  )
                })}
                {filtered.length === 0 && (
                  <tr><td colSpan={11} style={{ padding: 32, textAlign: 'center', color: T.muted }}>
                    {items.length === 0 ? 'No inventory yet — import from Shopify to get started' : 'No items match your search'}
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
          {filtered.length > 0 && (
            <div style={{ padding: '12px 16px', borderTop: `1px solid ${T.border}`, fontSize: 12, color: T.muted }}>
              Showing {filtered.length.toLocaleString()} of {items.length.toLocaleString()} variants
            </div>
          )}
        </Card>
      )}
    </Shell>
  )
}
