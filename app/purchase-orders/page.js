'use client'
import { useEffect, useState, useRef } from 'react'
import * as XLSX from 'xlsx'
import Shell from '@/components/Shell'
import {
  T, KPI, Card, Badge, Th, Td, Input, BtnPrimary, BtnGhost, Modal,
  SIZES, WAREHOUSES, CURRENCIES, PO_STATUSES, fmt, poTotal, totalInGBP, Loading, ErrorMsg
} from '@/components/ui'
import {
  getPurchaseOrders, getSuppliers, getProducts,
  createPurchaseOrder, updatePurchaseOrder
} from '@/lib/supabase'

// ─── PO DETAIL MODAL ──────────────────────────────────────────────────────────
function PODetail({ po, onClose, onSaved }) {
  const [status, setStatus] = useState(po.status)
  const [notes, setNotes] = useState(po.notes || '')
  const [saving, setSaving] = useState(false)

  const save = async () => {
    setSaving(true)
    await updatePurchaseOrder(po.id, { status, notes })
    onSaved()
    onClose()
  }

  const total = poTotal(po)

  return (
    <Modal title={`Purchase Order — ${po.id}`} width={1000} onClose={onClose}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 24 }}>
        {[
          { label: 'Supplier', value: po.supplier_name },
          { label: 'Warehouse', value: po.warehouse },
          { label: 'Created', value: po.created_at?.split('T')[0] },
          { label: 'Expected Delivery', value: po.expected_delivery || '—' },
        ].map(f => (
          <div key={f.label} style={{ background: T.surface, borderRadius: 6, padding: '12px 14px', border: `1px solid ${T.border}` }}>
            <div style={{ fontSize: 10, color: T.muted, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>{f.label}</div>
            <div style={{ fontSize: 13, color: T.text, fontWeight: 600 }}>{f.value}</div>
          </div>
        ))}
      </div>

      <div style={{ marginBottom: 20 }}>
        <div style={{ fontFamily: 'Barlow Condensed', fontWeight: 700, fontSize: 14, color: T.muted, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>
          Line Items
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: T.surface }}>
                <Th>SKU</Th>
                <Th>Product</Th>
                {SIZES.map(s => <Th key={s} style={{ textAlign: 'center' }}>{s}</Th>)}
                <Th style={{ textAlign: 'right' }}>Total Qty</Th>
                <Th style={{ textAlign: 'right' }}>Unit Cost</Th>
                <Th style={{ textAlign: 'right' }}>Line Total</Th>
              </tr>
            </thead>
            <tbody>
              {(po.po_lines || []).map((l, i) => {
                const qty = SIZES.reduce((s, sz) => s + (l.sizes?.[sz] || 0), 0)
                return (
                  <tr key={i}>
                    <Td style={{ color: T.muted, fontFamily: 'monospace', fontSize: 12 }}>{l.sku}</Td>
                    <Td style={{ fontWeight: 600 }}>{l.product}</Td>
                    {SIZES.map(sz => <Td key={sz} style={{ textAlign: 'center', color: T.muted }}>{l.sizes?.[sz] || 0}</Td>)}
                    <Td style={{ textAlign: 'right', fontWeight: 700 }}>{qty.toLocaleString()}</Td>
                    <Td style={{ textAlign: 'right', color: T.muted }}>{fmt(l.unit_cost, po.currency)}</Td>
                    <Td style={{ textAlign: 'right', color: T.accent, fontWeight: 700 }}>{fmt(qty * l.unit_cost, po.currency)}</Td>
                  </tr>
                )
              })}
              <tr style={{ background: T.surface }}>
                <Td colSpan={8} style={{ border: 'none' }}></Td>
                <Td style={{ textAlign: 'right', fontWeight: 800, fontSize: 14 }}>PO TOTAL</Td>
                <Td style={{ textAlign: 'right', fontWeight: 800, color: T.accent, fontSize: 16 }}>{fmt(total, po.currency)}</Td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr', gap: 16, marginBottom: 20 }}>
        <Input label="Update Status" value={status} onChange={setStatus} options={PO_STATUSES} />
        <Input label="Notes" value={notes} onChange={setNotes} placeholder="Internal notes..." />
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
        <BtnGhost onClick={onClose}>Cancel</BtnGhost>
        <BtnPrimary onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save Changes'}</BtnPrimary>
      </div>
    </Modal>
  )
}

// ─── NEW PO MODAL ─────────────────────────────────────────────────────────────
function NewPOModal({ suppliers, products, onClose, onSaved }) {
  const [supplier, setSupplier] = useState(suppliers[0]?.name || '')
  const [warehouse, setWarehouse] = useState(WAREHOUSES[0])
  const [currency, setCurrency] = useState('GBP')
  const [delivery, setDelivery] = useState('')
  const [notes, setNotes] = useState('')
  const [lines, setLines] = useState([{ sku: products[0]?.id || '', product: products[0]?.name || '', sizes: { XS: 0, S: 0, M: 0, L: 0, XL: 0, XXL: 0 }, unit_cost: 0 }])
  const [saving, setSaving] = useState(false)

  const updateLine = (i, field, val) => {
    const l = [...lines]; l[i] = { ...l[i], [field]: val }
    if (field === 'sku') {
      const p = products.find(p => p.id === val)
      if (p) l[i].product = p.name
    }
    setLines(l)
  }
  const updateSize = (i, sz, val) => {
    const l = [...lines]; l[i] = { ...l[i], sizes: { ...l[i].sizes, [sz]: +val || 0 } }; setLines(l)
  }
  const addLine = () => setLines([...lines, { sku: products[0]?.id || '', product: products[0]?.name || '', sizes: { XS: 0, S: 0, M: 0, L: 0, XL: 0, XXL: 0 }, unit_cost: 0 }])

  const grandTotal = lines.reduce((s, l) => s + SIZES.reduce((q, sz) => q + (l.sizes[sz] || 0), 0) * (l.unit_cost || 0), 0)

  const save = async () => {
    setSaving(true)
    const sup = suppliers.find(s => s.name === supplier)
    await createPurchaseOrder(
      { supplier_id: sup?.id, supplier_name: supplier, warehouse, currency, expected_delivery: delivery || null, notes, status: 'Draft' },
      lines
    )
    onSaved()
    onClose()
  }

  return (
    <Modal title="New Purchase Order" width={1100} onClose={onClose}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 12, marginBottom: 20 }}>
        <Input label="Supplier" value={supplier} onChange={setSupplier} options={suppliers.filter(s => s.status === 'Active').map(s => s.name)} />
        <Input label="Warehouse" value={warehouse} onChange={setWarehouse} options={WAREHOUSES} />
        <Input label="Currency" value={currency} onChange={setCurrency} options={CURRENCIES} />
        <Input label="Expected Delivery" value={delivery} onChange={setDelivery} type="date" />
      </div>

      <div style={{ marginBottom: 12, fontFamily: 'Barlow Condensed', fontWeight: 700, fontSize: 14, color: T.muted, textTransform: 'uppercase' }}>Line Items</div>
      <div style={{ overflowX: 'auto', marginBottom: 16 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 900 }}>
          <thead>
            <tr style={{ background: T.surface }}>
              <Th style={{ minWidth: 180 }}>SKU / Product</Th>
              {SIZES.map(s => <Th key={s} style={{ textAlign: 'center', minWidth: 60 }}>{s}</Th>)}
              <Th style={{ textAlign: 'right', minWidth: 100 }}>Unit Cost</Th>
              <Th style={{ textAlign: 'right' }}>Line Total</Th>
              <Th></Th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l, i) => {
              const qty = SIZES.reduce((s, sz) => s + (l.sizes[sz] || 0), 0)
              return (
                <tr key={i}>
                  <Td>
                    <select value={l.sku} onChange={e => updateLine(i, 'sku', e.target.value)} style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 4, padding: '5px 8px', color: T.text, fontSize: 12, width: '100%', outline: 'none' }}>
                      {products.map(p => <option key={p.id} value={p.id}>{p.id} — {p.name}</option>)}
                    </select>
                  </Td>
                  {SIZES.map(sz => (
                    <Td key={sz} style={{ textAlign: 'center', padding: '8px 4px' }}>
                      <input type="number" min="0" value={l.sizes[sz] || 0} onChange={e => updateSize(i, sz, e.target.value)}
                        style={{ width: 54, background: T.surface, border: `1px solid ${T.border}`, borderRadius: 4, padding: '5px 6px', color: T.text, fontSize: 12, textAlign: 'center', outline: 'none' }} />
                    </Td>
                  ))}
                  <Td style={{ textAlign: 'right', padding: '8px 8px' }}>
                    <input type="number" min="0" step="0.01" value={l.unit_cost} onChange={e => updateLine(i, 'unit_cost', +e.target.value)}
                      style={{ width: 80, background: T.surface, border: `1px solid ${T.border}`, borderRadius: 4, padding: '5px 8px', color: T.text, fontSize: 12, textAlign: 'right', outline: 'none' }} />
                  </Td>
                  <Td style={{ textAlign: 'right', color: T.accent, fontWeight: 700 }}>{fmt(qty * (l.unit_cost || 0), currency)}</Td>
                  <Td>
                    <button onClick={() => setLines(lines.filter((_, j) => j !== i))} style={{ background: 'none', border: 'none', color: T.red, cursor: 'pointer', fontSize: 16 }}>×</button>
                  </Td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <BtnGhost onClick={addLine}>+ Add Line</BtnGhost>
        <div style={{ fontFamily: 'Barlow Condensed', fontSize: 20, fontWeight: 800, color: T.accent }}>Total: {fmt(grandTotal, currency)}</div>
      </div>

      <Input label="Notes" value={notes} onChange={setNotes} placeholder="Any instructions for this PO..." style={{ marginBottom: 20 }} />

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
        <BtnGhost onClick={onClose}>Cancel</BtnGhost>
        <BtnPrimary onClick={save} disabled={saving}>{saving ? 'Creating…' : 'Create PO'}</BtnPrimary>
      </div>
    </Modal>
  )
}

// ─── EXCEL IMPORT MODAL ───────────────────────────────────────────────────────
function ImportModal({ suppliers, products, onClose, onSaved }) {
  const [rows, setRows] = useState(null)
  const [error, setError] = useState('')
  const [mapping, setMapping] = useState({})
  const [supplier, setSupplier] = useState(suppliers[0]?.name || '')
  const [warehouse, setWarehouse] = useState(WAREHOUSES[0])
  const [currency, setCurrency] = useState('GBP')
  const [saving, setSaving] = useState(false)
  const fileRef = useRef()

  const handleFile = (e) => {
    const file = e.target.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (evt) => {
      try {
        const wb = XLSX.read(evt.target.result, { type: 'binary' })
        const ws = wb.Sheets[wb.SheetNames[0]]
        const data = XLSX.utils.sheet_to_json(ws, { header: 1 })
        if (data.length < 2) { setError('Sheet appears to be empty.'); return }
        const headers = data[0].map(String)
        setMapping({
          sku: headers.find(h => /sku|code|item/i.test(h)) || headers[0],
          product: headers.find(h => /name|product|desc/i.test(h)) || headers[1] || headers[0],
          cost: headers.find(h => /cost|price|unit/i.test(h)) || '',
          xs: headers.find(h => /^xs$/i.test(h)) || '',
          s: headers.find(h => /^s$/i.test(h)) || '',
          m: headers.find(h => /^m$/i.test(h)) || '',
          l: headers.find(h => /^l$/i.test(h)) || '',
          xl: headers.find(h => /^xl$/i.test(h)) || '',
          xxl: headers.find(h => /^xxl$/i.test(h)) || '',
        })
        setRows(data)
        setError('')
      } catch { setError('Could not read file. Please use .xlsx or .xls format.') }
    }
    reader.readAsBinaryString(file)
  }

  const doImport = async () => {
    setSaving(true)
    const headers = rows[0].map(String)
    const idx = (key) => headers.indexOf(mapping[key])
    const lines = rows.slice(1).filter(r => r.length > 0 && r[idx('sku')]).map(r => ({
      sku: String(r[idx('sku')] || ''),
      product: idx('product') >= 0 ? String(r[idx('product')] || '') : '',
      unit_cost: parseFloat(r[idx('cost')]) || 0,
      sizes: {
        XS: parseInt(r[idx('xs')]) || 0, S: parseInt(r[idx('s')]) || 0,
        M: parseInt(r[idx('m')]) || 0, L: parseInt(r[idx('l')]) || 0,
        XL: parseInt(r[idx('xl')]) || 0, XXL: parseInt(r[idx('xxl')]) || 0,
      }
    }))
    const sup = suppliers.find(s => s.name === supplier)
    await createPurchaseOrder(
      { supplier_id: sup?.id, supplier_name: supplier, warehouse, currency, status: 'Draft', notes: 'Imported from Excel' },
      lines
    )
    onSaved()
    onClose()
  }

  const headers = rows ? rows[0].map(String) : []

  return (
    <Modal title="Import PO from Excel" width={800} onClose={onClose}>
      <div style={{ background: T.surface, border: `2px dashed ${T.border}`, borderRadius: 8, padding: 32, textAlign: 'center', marginBottom: 20, cursor: 'pointer' }}
        onClick={() => fileRef.current.click()}>
        <div style={{ fontSize: 32, marginBottom: 8 }}>📊</div>
        <div style={{ color: T.text, fontWeight: 600, marginBottom: 4 }}>Click to select Excel file</div>
        <div style={{ color: T.muted, fontSize: 12 }}>
          Supports .xlsx and .xls — columns: SKU, Product Name, Unit Cost, XS, S, M, L, XL, XXL
        </div>
        <input ref={fileRef} type="file" accept=".xlsx,.xls" onChange={handleFile} style={{ display: 'none' }} />
      </div>

      {error && <div style={{ color: T.red, background: T.redDim, border: `1px solid ${T.red}40`, borderRadius: 5, padding: '10px 14px', marginBottom: 16, fontSize: 13 }}>{error}</div>}

      {rows && (
        <>
          <div style={{ color: T.green, background: T.greenDim, border: `1px solid ${T.green}40`, borderRadius: 5, padding: '10px 14px', marginBottom: 16, fontSize: 13 }}>
            ✓ Loaded {rows.length - 1} rows. Map the columns below:
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 20 }}>
            {[
              { key: 'sku', label: 'SKU Column' }, { key: 'product', label: 'Product Name' },
              { key: 'cost', label: 'Unit Cost' }, { key: 'xs', label: 'XS' }, { key: 's', label: 'S' },
              { key: 'm', label: 'M' }, { key: 'l', label: 'L' }, { key: 'xl', label: 'XL' }, { key: 'xxl', label: 'XXL' },
            ].map(f => (
              <Input key={f.key} label={f.label} value={mapping[f.key] || ''} onChange={v => setMapping({ ...mapping, [f.key]: v })} options={['(skip)', ...headers]} />
            ))}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 20 }}>
            <Input label="Assign Supplier" value={supplier} onChange={setSupplier} options={suppliers.map(s => s.name)} />
            <Input label="Destination Warehouse" value={warehouse} onChange={setWarehouse} options={WAREHOUSES} />
            <Input label="Currency" value={currency} onChange={setCurrency} options={CURRENCIES} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
            <BtnGhost onClick={onClose}>Cancel</BtnGhost>
            <BtnPrimary onClick={doImport} disabled={saving}>{saving ? 'Importing…' : 'Import as Draft PO'}</BtnPrimary>
          </div>
        </>
      )}
    </Modal>
  )
}

// ─── MAIN PAGE ────────────────────────────────────────────────────────────────
export default function PurchaseOrdersPage() {
  const [pos, setPos] = useState([])
  const [suppliers, setSuppliers] = useState([])
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState('All')
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState(null)
  const [showNew, setShowNew] = useState(false)
  const [showImport, setShowImport] = useState(false)

  const load = () => {
    setLoading(true)
    Promise.all([getPurchaseOrders(), getSuppliers(), getProducts()])
      .then(([p, s, pr]) => { setPos(p); setSuppliers(s); setProducts(pr) })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const filtered = pos.filter(po => {
    const matchStatus = filter === 'All' || po.status === filter
    const matchSearch = !search || po.id.includes(search) || (po.supplier_name || '').toLowerCase().includes(search.toLowerCase())
    return matchStatus && matchSearch
  })

  return (
    <Shell title="Purchase Orders">
      {selected && <PODetail po={selected} onClose={() => setSelected(null)} onSaved={load} />}
      {showNew && <NewPOModal suppliers={suppliers} products={products} onClose={() => setShowNew(false)} onSaved={load} />}
      {showImport && <ImportModal suppliers={suppliers} products={products} onClose={() => setShowImport(false)} onSaved={load} />}

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12, marginBottom: 20 }}>
        <KPI label="Total POs" value={pos.length} />
        <KPI label="Total Value (GBP)" value={fmt(pos.reduce((s, p) => s + totalInGBP(p), 0), 'GBP')} color={T.accent} />
        <KPI label="In Production" value={pos.filter(p => p.status === 'In Production').length} color={T.yellow} />
        <KPI label="Shipped" value={pos.filter(p => p.status === 'Shipped').length} color={T.accent} />
        <KPI label="Received" value={pos.filter(p => p.status === 'Received').length} color={T.green} />
      </div>

      {/* Controls */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {['All', ...PO_STATUSES].map(s => (
            <button key={s} onClick={() => setFilter(s)} style={{
              background: filter === s ? T.accent : T.subtle, color: filter === s ? '#fff' : T.muted,
              border: 'none', borderRadius: 4, padding: '5px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer'
            }}>{s}</button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input placeholder="Search PO / supplier…" value={search} onChange={e => setSearch(e.target.value)}
            style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 5, padding: '7px 12px', color: T.text, fontSize: 13, width: 220, outline: 'none' }} />
          <BtnGhost onClick={() => setShowImport(true)}>⬆ Import Excel</BtnGhost>
          <BtnPrimary onClick={() => setShowNew(true)}>+ New PO</BtnPrimary>
        </div>
      </div>

      {error && <ErrorMsg msg={error} />}
      {loading ? <Loading /> : (
        <Card>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: T.surface }}>
                  <Th>PO Number</Th><Th>Supplier</Th><Th>Warehouse</Th>
                  <Th>Created</Th><Th>Expected Delivery</Th><Th>Lines</Th>
                  <Th>Total Units</Th><Th style={{ textAlign: 'right' }}>Value</Th><Th>Status</Th><Th></Th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(po => {
                  const totalUnits = (po.po_lines || []).reduce((s, l) => s + SIZES.reduce((q, sz) => q + (l.sizes?.[sz] || 0), 0), 0)
                  return (
                    <tr key={po.id} className="row-hover" onClick={() => setSelected(po)}>
                      <Td style={{ fontFamily: 'monospace', fontSize: 12, color: T.accent, fontWeight: 700 }}>{po.id}</Td>
                      <Td style={{ fontWeight: 600 }}>{po.supplier_name}</Td>
                      <Td style={{ color: T.muted, fontSize: 12 }}>{po.warehouse}</Td>
                      <Td style={{ color: T.muted, fontSize: 12 }}>{po.created_at?.split('T')[0]}</Td>
                      <Td style={{ color: T.muted, fontSize: 12 }}>{po.expected_delivery || '—'}</Td>
                      <Td style={{ color: T.muted }}>{(po.po_lines || []).length}</Td>
                      <Td style={{ fontWeight: 600 }}>{totalUnits.toLocaleString()}</Td>
                      <Td style={{ textAlign: 'right', fontWeight: 700, color: T.accent, fontFamily: 'monospace' }}>{fmt(poTotal(po), po.currency)}</Td>
                      <Td><Badge status={po.status} /></Td>
                      <Td style={{ color: T.muted, fontSize: 16 }}>›</Td>
                    </tr>
                  )
                })}
                {filtered.length === 0 && (
                  <tr><td colSpan={10} style={{ padding: 32, textAlign: 'center', color: T.muted }}>No purchase orders found</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </Shell>
  )
}
