'use client'
import { useEffect, useState, useRef } from 'react'
import * as XLSX from 'xlsx'
import Shell from '@/components/Shell'
import { T, KPI, Card, Badge, Th, Td, Input, BtnPrimary, BtnGhost, Modal, WAREHOUSES, CURRENCIES, fmt, Loading, ErrorMsg } from '@/components/ui'
import { getPurchaseOrders, getSuppliers, createPurchaseOrder, updatePurchaseOrder, updateShipment, addShipment } from '@/lib/supabase'

// ─── CONSTANTS ────────────────────────────────────────────────
const PO_STATUSES = ['In production', 'In transit - awaiting freight info', 'Receipt in progress', 'Delivered', 'Booked in & checked', 'Delivered + booked in']
const FREIGHT_FORWARDERS = ['HuianExpress', 'JET', 'KTL', 'ACS logistics', 'ICL Logistics', 'Evergreen logistics', 'Vina Happy Shipping', 'Turkmen logistics', 'Supplier']
const SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL']
const EMPTY_LINE = { product_name: '', size: 'M', cost_price: '', design_ref: '', colour_code: '', sku: '', qty_uk: 0, qty_usa: 0, confirmed_xf: 0 }
const EMPTY_SHIPMENT = { dc: 'UK', shipment_type: 'SEA', status: 'In production', units: 0, cartons: 0, freight_forwarder: '', shipment_date: '', eta: '', total_freight_cost: 0, unit_freight_cost_usd: 0, unit_freight_cost_gbp: 0, import_tax_status: '', tracking_number: '', delivery_date: '', booked_in_date: '', added_to_warehouse: false, delivery_booked: false, quantities_verified: false, stock_on_shopify: false }

const lineTotal = (l) => ((l.qty_uk || 0) + (l.qty_usa || 0)) * (l.cost_price || 0)
const poTotalUnits = (po) => (po.shipments || []).reduce((s, sh) => s + (sh.units || 0), 0)

const statusColor = (s) => ({
  'In production': T.yellow,
  'In transit - awaiting freight info': T.blue,
  'Receipt in progress': T.accent,
  'Delivered': T.green,
  'Booked in & checked': T.green,
  'Delivered + booked in': T.green,
}[s] || T.muted)

const CheckBadge = ({ val, label }) => (
  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: val ? T.greenDim : T.subtle, color: val ? T.green : T.muted, border: `1px solid ${val ? T.green + '40' : T.border}`, borderRadius: 4, padding: '2px 8px', fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap' }}>
    {val ? '✓' : '○'} {label}
  </span>
)

const ShipBadge = ({ dc }) => (
  <span style={{ background: dc === 'UK' ? '#3b82f620' : '#8b5cf620', color: dc === 'UK' ? '#3b82f6' : '#8b5cf6', border: `1px solid ${dc === 'UK' ? '#3b82f640' : '#8b5cf640'}`, borderRadius: 3, padding: '1px 7px', fontSize: 11, fontWeight: 800, letterSpacing: '0.05em' }}>{dc}</span>
)

// ─── SHIPMENT EDIT PANEL ──────────────────────────────────────
function ShipmentPanel({ shipment, currency, onSave }) {
  const [s, setS] = useState(shipment)
  const [saving, setSaving] = useState(false)
  const upd = (f, v) => setS(prev => ({ ...prev, [f]: v }))
  const inp = { background: T.bg, border: `1px solid ${T.border}`, borderRadius: 4, padding: '6px 8px', color: T.text, fontSize: 12, outline: 'none', width: '100%' }

  return (
    <div style={{ background: T.bg, border: `1px solid ${T.border}`, borderRadius: 8, padding: 16, marginBottom: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <ShipBadge dc={s.dc} />
          <span style={{ fontFamily: 'monospace', fontSize: 12, color: T.muted }}>{s.shipment_ref}</span>
          <span style={{ fontSize: 11, color: T.muted, background: T.subtle, borderRadius: 3, padding: '1px 6px' }}>{s.shipment_type}</span>
        </div>
        <BtnPrimary onClick={async () => { setSaving(true); await onSave(s.id, s); setSaving(false) }} style={{ padding: '5px 12px', fontSize: 12 }} disabled={saving}>
          {saving ? 'Saving…' : 'Save'}
        </BtnPrimary>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 10, color: T.muted, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>Status</div>
          <select value={s.status} onChange={e => upd('status', e.target.value)} style={inp}>
            {PO_STATUSES.map(st => <option key={st}>{st}</option>)}
          </select>
        </div>
        <div>
          <div style={{ fontSize: 10, color: T.muted, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>Freight Forwarder</div>
          <select value={s.freight_forwarder || ''} onChange={e => upd('freight_forwarder', e.target.value)} style={inp}>
            <option value="">— select —</option>
            {FREIGHT_FORWARDERS.map(f => <option key={f}>{f}</option>)}
          </select>
        </div>
        <div>
          <div style={{ fontSize: 10, color: T.muted, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>Units</div>
          <input type="number" value={s.units || 0} onChange={e => upd('units', +e.target.value)} style={inp} />
        </div>
        <div>
          <div style={{ fontSize: 10, color: T.muted, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>Cartons</div>
          <input type="number" value={s.cartons || 0} onChange={e => upd('cartons', +e.target.value)} style={inp} />
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 10, color: T.muted, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>Shipment Date</div>
          <input value={s.shipment_date || ''} onChange={e => upd('shipment_date', e.target.value)} style={inp} placeholder="e.g. 7-Jan-2025" />
        </div>
        <div>
          <div style={{ fontSize: 10, color: T.muted, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>ETA</div>
          <input value={s.eta || ''} onChange={e => upd('eta', e.target.value)} style={inp} placeholder="e.g. 03/03/2025" />
        </div>
        <div>
          <div style={{ fontSize: 10, color: T.muted, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>Delivery Date</div>
          <input value={s.delivery_date || ''} onChange={e => upd('delivery_date', e.target.value)} style={inp} />
        </div>
        <div>
          <div style={{ fontSize: 10, color: T.muted, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>Booked In Date</div>
          <input value={s.booked_in_date || ''} onChange={e => upd('booked_in_date', e.target.value)} style={inp} />
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 10, color: T.muted, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>Tracking # / AWB</div>
          <input value={s.tracking_number || ''} onChange={e => upd('tracking_number', e.target.value)} style={inp} placeholder="Tracking number" />
        </div>
        <div>
          <div style={{ fontSize: 10, color: T.muted, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>Total Freight Cost</div>
          <input type="number" value={s.total_freight_cost || 0} onChange={e => upd('total_freight_cost', +e.target.value)} style={inp} />
        </div>
        <div>
          <div style={{ fontSize: 10, color: T.muted, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>Unit Freight ($USD)</div>
          <input type="number" step="0.001" value={s.unit_freight_cost_usd || 0} onChange={e => upd('unit_freight_cost_usd', +e.target.value)} style={inp} />
        </div>
        <div>
          <div style={{ fontSize: 10, color: T.muted, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>Unit Freight (£GBP)</div>
          <input type="number" step="0.001" value={s.unit_freight_cost_gbp || 0} onChange={e => upd('unit_freight_cost_gbp', +e.target.value)} style={inp} />
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 10, color: T.muted, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>Import Tax Status</div>
          <select value={s.import_tax_status || ''} onChange={e => upd('import_tax_status', e.target.value)} style={inp}>
            <option value="">— select —</option>
            <option>DDP - No taxes</option>
            <option>Taxes paid</option>
            <option>DAP - Buyer pays taxes</option>
          </select>
        </div>
      </div>

      {/* Checklist */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {[
          { key: 'added_to_warehouse', label: 'Added to Warehouse' },
          { key: 'delivery_booked', label: 'Delivery Booked' },
          { key: 'quantities_verified', label: 'Quantities Verified' },
          { key: 'stock_on_shopify', label: 'Stock on Shopify' },
        ].map(c => (
          <button key={c.key} onClick={() => upd(c.key, !s[c.key])} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}>
            <CheckBadge val={s[c.key]} label={c.label} />
          </button>
        ))}
      </div>
    </div>
  )
}

// ─── PO DETAIL MODAL ──────────────────────────────────────────
function PODetail({ po, onClose, onSaved }) {
  const [tab, setTab] = useState('shipments')
  const [poData, setPoData] = useState(po)
  const [saving, setSaving] = useState(false)

  const handleShipSave = async (id, updates) => {
    await updateShipment(id, updates)
    onSaved()
  }

  const handleAddShipment = async (dc) => {
    const baseRef = po.id
    const type = 'SEA'
    const ref = `${baseRef}${dc}${type}`
    await addShipment({ ...EMPTY_SHIPMENT, po_id: po.id, dc, shipment_ref: ref, shipment_type: type })
    onSaved()
  }

  const lines = po.po_lines || []
  const totalUK = lines.reduce((s, l) => s + (l.qty_uk || 0), 0)
  const totalUSA = lines.reduce((s, l) => s + (l.qty_usa || 0), 0)
  const grandTotal = lines.reduce((s, l) => s + lineTotal(l), 0)

  const TabBtn = ({ id, label }) => (
    <button onClick={() => setTab(id)} style={{ background: tab === id ? T.accent : 'transparent', color: tab === id ? '#fff' : T.muted, border: `1px solid ${tab === id ? T.accent : T.border}`, borderRadius: 5, padding: '6px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
      {label}
    </button>
  )

  return (
    <Modal title={`PO — ${po.id}`} width={1200} onClose={onClose}>
      {/* Header info */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10, marginBottom: 20 }}>
        {[
          { label: 'Supplier', value: po.supplier_name || po.supplier_ref },
          { label: 'Supplier Ref', value: po.supplier_ref },
          { label: 'Season', value: po.seasonality || '—' },
          { label: 'Ex-Factory Date', value: po.ex_factory_date || '—' },
          { label: 'Total Cost Value', value: fmt(po.total_cost_value, po.currency || 'USD') },
        ].map(f => (
          <div key={f.label} style={{ background: T.surface, borderRadius: 6, padding: '10px 12px', border: `1px solid ${T.border}` }}>
            <div style={{ fontSize: 10, color: T.muted, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 3 }}>{f.label}</div>
            <div style={{ fontSize: 13, color: T.text, fontWeight: 600 }}>{f.value}</div>
          </div>
        ))}
      </div>

      {/* PO level checklist */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        <CheckBadge val={po.skus_created} label="SKUs Created" />
        <CheckBadge val={po.barcodes_sent} label="Barcodes Sent" />
        <CheckBadge val={po.polybags_sent} label="Polybags Sent" />
        <CheckBadge val={po.po_splits_confirmed} label="PO Splits Confirmed" />
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: T.muted }}>
          <span>Deposit:</span>
          <span style={{ color: T.text, fontWeight: 700 }}>{fmt(po.deposit_cost_value, po.currency || 'USD')}</span>
          {po.deposit_payment_date && <span>({po.deposit_payment_date})</span>}
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <TabBtn id="shipments" label={`Shipments (${(po.shipments || []).length})`} />
        <TabBtn id="lines" label={`Line Items (${lines.length})`} />
      </div>

      {tab === 'shipments' && (
        <div>
          {(po.shipments || []).sort((a, b) => a.dc.localeCompare(b.dc)).map(sh => (
            <ShipmentPanel key={sh.id} shipment={sh} currency={po.currency} onSave={handleShipSave} />
          ))}
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            {!po.shipments?.find(s => s.dc === 'UK') && <BtnGhost onClick={() => handleAddShipment('UK')}>+ Add UK Shipment</BtnGhost>}
            {!po.shipments?.find(s => s.dc === 'US') && <BtnGhost onClick={() => handleAddShipment('US')}>+ Add US Shipment</BtnGhost>}
          </div>
        </div>
      )}

      {tab === 'lines' && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 900 }}>
            <thead>
              <tr style={{ background: T.surface }}>
                <Th>Product Name</Th><Th>Size</Th><Th>Design Ref.</Th><Th>Colour Code</Th><Th>SKU</Th>
                <Th style={{ textAlign: 'right' }}>Cost Price</Th>
                <Th style={{ textAlign: 'right' }}>UK Qty</Th>
                <Th style={{ textAlign: 'right' }}>USA Qty</Th>
                <Th style={{ textAlign: 'right' }}>Confirmed XF</Th>
                <Th style={{ textAlign: 'right' }}>Line Total</Th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l, i) => (
                <tr key={i}>
                  <Td style={{ fontWeight: 600 }}>{l.product_name}</Td>
                  <Td><span style={{ background: T.subtle, color: T.text, borderRadius: 4, padding: '2px 8px', fontSize: 12, fontWeight: 700 }}>{l.size}</span></Td>
                  <Td style={{ color: T.muted, fontFamily: 'monospace', fontSize: 12 }}>{l.design_ref || '—'}</Td>
                  <Td style={{ color: T.muted, fontSize: 12 }}>{l.colour_code || '—'}</Td>
                  <Td style={{ color: T.muted, fontFamily: 'monospace', fontSize: 11 }}>{l.sku || '—'}</Td>
                  <Td style={{ textAlign: 'right', color: T.muted }}>{fmt(l.cost_price, po.currency || 'USD')}</Td>
                  <Td style={{ textAlign: 'right', fontWeight: 600 }}>{(l.qty_uk || 0).toLocaleString()}</Td>
                  <Td style={{ textAlign: 'right', fontWeight: 600 }}>{(l.qty_usa || 0).toLocaleString()}</Td>
                  <Td style={{ textAlign: 'right', color: T.green, fontWeight: 700 }}>{(l.confirmed_xf || 0).toLocaleString()}</Td>
                  <Td style={{ textAlign: 'right', color: T.accent, fontWeight: 700 }}>{fmt(lineTotal(l), po.currency || 'USD')}</Td>
                </tr>
              ))}
              <tr style={{ background: T.surface, borderTop: `2px solid ${T.border}` }}>
                <Td colSpan={6} style={{ fontWeight: 700 }}>TOTALS</Td>
                <Td style={{ textAlign: 'right', fontWeight: 800 }}>{totalUK.toLocaleString()}</Td>
                <Td style={{ textAlign: 'right', fontWeight: 800 }}>{totalUSA.toLocaleString()}</Td>
                <Td></Td>
                <Td style={{ textAlign: 'right', fontWeight: 800, color: T.accent, fontSize: 15 }}>{fmt(grandTotal, po.currency || 'USD')}</Td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 20 }}>
        <BtnGhost onClick={onClose}>Close</BtnGhost>
      </div>
    </Modal>
  )
}

// ─── NEW PO MODAL ─────────────────────────────────────────────
function NewPOModal({ suppliers, onClose, onSaved }) {
  const [id, setId] = useState('')
  const [supplierRef, setSupplierRef] = useState('')
  const [supplierName, setSupplierName] = useState(suppliers[0]?.name || '')
  const [season, setSeason] = useState('AW25')
  const [currency, setCurrency] = useState('USD')
  const [exFactory, setExFactory] = useState('')
  const [totalCost, setTotalCost] = useState('')
  const [deposit, setDeposit] = useState('')
  const [depositDate, setDepositDate] = useState('')
  const [lines, setLines] = useState([{ ...EMPTY_LINE }])
  const [ukShipment, setUkShipment] = useState(true)
  const [usaShipment, setUsaShipment] = useState(true)
  const [saving, setSaving] = useState(false)
  const s = { background: T.surface, border: `1px solid ${T.border}`, borderRadius: 4, padding: '5px 7px', color: T.text, fontSize: 12, outline: 'none', width: '100%' }

  const upd = (i, f, v) => { const l = [...lines]; l[i] = { ...l[i], [f]: v }; setLines(l) }

  const save = async () => {
    setSaving(true)
    const poId = id.toUpperCase().trim()
    const shipments = []
    if (ukShipment) shipments.push({ ...EMPTY_SHIPMENT, dc: 'UK', shipment_ref: `${poId}UKSEA`, shipment_type: 'SEA', units: lines.reduce((s, l) => s + (l.qty_uk || 0), 0) })
    if (usaShipment) shipments.push({ ...EMPTY_SHIPMENT, dc: 'US', shipment_ref: `${poId}USASEA`, shipment_type: 'SEA', units: lines.reduce((s, l) => s + (l.qty_usa || 0), 0) })
    await createPurchaseOrder(
      { id: poId, supplier_ref: supplierRef, supplier_name: supplierName, seasonality: season, currency, ex_factory_date: exFactory, total_cost_value: parseFloat(totalCost) || 0, deposit_cost_value: parseFloat(deposit) || 0, deposit_payment_date: depositDate, skus_created: false, barcodes_sent: false, polybags_sent: false, po_splits_confirmed: ukShipment && usaShipment },
      lines.map(l => ({ ...l, cost_price: parseFloat(l.cost_price) || 0 })),
      shipments
    )
    onSaved(); onClose()
  }

  return (
    <Modal title="New Purchase Order" width={1200} onClose={onClose}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 16 }}>
        <Input label="PO Reference (base)" value={id} onChange={setId} placeholder="e.g. GWG049" />
        <Input label="Supplier Ref" value={supplierRef} onChange={setSupplierRef} placeholder="e.g. GWG" />
        <Input label="Supplier Name" value={supplierName} onChange={setSupplierName} options={suppliers.map(s => s.name)} />
        <Input label="Season" value={season} onChange={setSeason} placeholder="AW25, SS25..." />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 16 }}>
        <Input label="Currency" value={currency} onChange={setCurrency} options={CURRENCIES} />
        <Input label="Ex-Factory Date" value={exFactory} onChange={setExFactory} placeholder="e.g. 15-Mar-2025" />
        <Input label="Total Cost Value" value={totalCost} onChange={setTotalCost} placeholder="0.00" />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <Input label="Deposit" value={deposit} onChange={setDeposit} placeholder="0.00" />
          <Input label="Deposit Date" value={depositDate} onChange={setDepositDate} placeholder="dd-Mon-yyyy" />
        </div>
      </div>

      {/* Shipments toggle */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 16, alignItems: 'center' }}>
        <span style={{ fontSize: 11, color: T.muted, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Create Shipments:</span>
        <button onClick={() => setUkShipment(!ukShipment)} style={{ background: ukShipment ? '#3b82f620' : T.subtle, color: ukShipment ? '#3b82f6' : T.muted, border: `1px solid ${ukShipment ? '#3b82f640' : T.border}`, borderRadius: 5, padding: '5px 14px', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>
          {ukShipment ? '✓' : '○'} UK SEA
        </button>
        <button onClick={() => setUsaShipment(!usaShipment)} style={{ background: usaShipment ? '#8b5cf620' : T.subtle, color: usaShipment ? '#8b5cf6' : T.muted, border: `1px solid ${usaShipment ? '#8b5cf640' : T.border}`, borderRadius: 5, padding: '5px 14px', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>
          {usaShipment ? '✓' : '○'} USA SEA
        </button>
      </div>

      {/* Line items */}
      <div style={{ fontSize: 11, color: T.muted, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Line Items</div>
      <div style={{ overflowX: 'auto', marginBottom: 12 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 1000 }}>
          <thead>
            <tr style={{ background: T.surface }}>
              <Th style={{ minWidth: 140 }}>Product Name</Th>
              <Th style={{ minWidth: 65 }}>Size</Th>
              <Th style={{ minWidth: 100 }}>Design Ref.</Th>
              <Th style={{ minWidth: 90 }}>Colour Code</Th>
              <Th style={{ minWidth: 130 }}>SKU</Th>
              <Th style={{ minWidth: 85, textAlign: 'right' }}>Cost Price</Th>
              <Th style={{ minWidth: 70, textAlign: 'right' }}>UK Qty</Th>
              <Th style={{ minWidth: 70, textAlign: 'right' }}>USA Qty</Th>
              <Th style={{ minWidth: 90, textAlign: 'right' }}>Conf. XF</Th>
              <Th style={{ textAlign: 'right' }}>Total</Th>
              <Th></Th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l, i) => (
              <tr key={i} style={{ borderBottom: `1px solid ${T.border}` }}>
                <Td><input value={l.product_name} onChange={e => upd(i,'product_name',e.target.value)} placeholder="Product name" style={s} /></Td>
                <Td><select value={l.size} onChange={e => upd(i,'size',e.target.value)} style={s}>{SIZES.map(sz => <option key={sz}>{sz}</option>)}</select></Td>
                <Td><input value={l.design_ref} onChange={e => upd(i,'design_ref',e.target.value)} placeholder="TA-SS25-001" style={s} /></Td>
                <Td><input value={l.colour_code} onChange={e => upd(i,'colour_code',e.target.value)} placeholder="BLK" style={s} /></Td>
                <Td><input value={l.sku} onChange={e => upd(i,'sku',e.target.value)} placeholder="TA-COMP-M-BLK" style={s} /></Td>
                <Td><input type="number" min="0" step="0.01" value={l.cost_price} onChange={e => upd(i,'cost_price',e.target.value)} style={{ ...s, textAlign: 'right' }} /></Td>
                <Td><input type="number" min="0" value={l.qty_uk} onChange={e => upd(i,'qty_uk',+e.target.value)} style={{ ...s, textAlign: 'right' }} /></Td>
                <Td><input type="number" min="0" value={l.qty_usa} onChange={e => upd(i,'qty_usa',+e.target.value)} style={{ ...s, textAlign: 'right' }} /></Td>
                <Td><input type="number" min="0" value={l.confirmed_xf} onChange={e => upd(i,'confirmed_xf',+e.target.value)} style={{ ...s, textAlign: 'right' }} /></Td>
                <Td style={{ textAlign: 'right', color: T.accent, fontWeight: 700, fontSize: 13 }}>{fmt(lineTotal(l), currency)}</Td>
                <Td><button onClick={() => setLines(lines.filter((_,j)=>j!==i))} style={{ background:'none',border:'none',color:T.red,cursor:'pointer',fontSize:16 }}>×</button></Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <BtnGhost onClick={() => setLines([...lines, { ...EMPTY_LINE }])}>+ Add Line</BtnGhost>
        <div style={{ fontFamily: 'Barlow Condensed', fontSize: 20, fontWeight: 800, color: T.accent }}>
          Total: {fmt(lines.reduce((s, l) => s + lineTotal(l), 0), currency)}
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
        <BtnGhost onClick={onClose}>Cancel</BtnGhost>
        <BtnPrimary onClick={save} disabled={saving || !id}>{saving ? 'Creating…' : 'Create PO'}</BtnPrimary>
      </div>
    </Modal>
  )
}

// ─── EXCEL IMPORT ─────────────────────────────────────────────
function ImportModal({ suppliers, onClose, onSaved }) {
  const [rows, setRows] = useState(null)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const fileRef = useRef()

  const handleFile = (e) => {
    const file = e.target.files[0]; if (!file) return
    const reader = new FileReader()
    reader.onload = (evt) => {
      try {
        const wb = XLSX.read(evt.target.result, { type: 'binary' })
        const ws = wb.Sheets[wb.SheetNames[0]]
        const data = XLSX.utils.sheet_to_json(ws, { header: 1 })
        if (data.length < 2) { setError('Sheet is empty'); return }
        setRows(data); setError('')
      } catch { setError('Could not read file') }
    }
    reader.readAsBinaryString(file)
  }

  const doImport = async () => {
    setSaving(true)
    const headers = rows[0].map(String)
    const col = (name) => headers.findIndex(h => new RegExp(name, 'i').test(h))

    // Group rows by base PO (strip UK/USA/SEA/AIR)
    const poMap = {}
    for (const row of rows.slice(1)) {
      if (!row[0]) continue
      const fullRef = String(row[0])
      const dc = fullRef.includes('USA') ? 'US' : 'UK'
      const type = fullRef.includes('AIR') ? 'AIR' : 'SEA'
      const baseId = fullRef.replace(/UK|USA|SEA|AIR/g, '')

      if (!poMap[baseId]) {
        poMap[baseId] = {
          po: {
            id: baseId,
            supplier_ref: String(row[col('supplier.?ref')] || ''),
            supplier_name: String(row[col('supplier.?ref')] || ''),
            seasonality: String(row[col('season')] || ''),
            total_cost_value: parseFloat(String(row[col('total.?cost')] || '0').replace(/[$,]/g, '')) || 0,
            deposit_cost_value: parseFloat(String(row[col('deposit.?cost')] || '0').replace(/[$,]/g, '')) || 0,
            deposit_payment_date: String(row[col('deposit.?pay')] || ''),
            ex_factory_date: String(row[col('ex.?factory')] || ''),
            currency: 'USD',
            skus_created: false, barcodes_sent: false, polybags_sent: false, po_splits_confirmed: false,
          },
          shipments: []
        }
      }

      poMap[baseId].shipments.push({
        shipment_ref: fullRef, dc, shipment_type: type,
        status: String(row[col('status')] || 'In production'),
        units: parseInt(String(row[col('^units$')] || '0').replace(/,/g, '')) || 0,
        cartons: parseInt(String(row[col('carton')] || '0').replace(/,/g, '')) || 0,
        freight_forwarder: String(row[col('freight.?forward')] || ''),
        shipment_date: String(row[col('shipment.?date')] || ''),
        eta: String(row[col('^eta$')] || ''),
        total_freight_cost: parseFloat(String(row[col('total.?freight')] || '0').replace(/[$,]/g, '')) || 0,
        unit_freight_cost_usd: parseFloat(String(row[col('usd')] || '0').replace(/[$,]/g, '')) || 0,
        unit_freight_cost_gbp: parseFloat(String(row[col('gbp.?new')] || row[col('gbp')] || '0').replace(/[£,]/g, '')) || 0,
        import_tax_status: String(row[col('import.?tax')] || ''),
        tracking_number: String(row[col('tracking')] || ''),
        delivery_date: String(row[col('delivery.?date')] || ''),
        booked_in_date: String(row[col('booked.?in')] || ''),
        added_to_warehouse: false, delivery_booked: false, quantities_verified: false, stock_on_shopify: false,
      })
    }

    let created = 0
    for (const [, { po, shipments }] of Object.entries(poMap)) {
      try { await createPurchaseOrder(po, [], shipments); created++ } catch { /* skip dupes */ }
    }

    onSaved(); onClose()
  }

  return (
    <Modal title="Import from PO Management Excel" width={700} onClose={onClose}>
      <div onClick={() => fileRef.current.click()} style={{ background: T.surface, border: `2px dashed ${T.border}`, borderRadius: 8, padding: 32, textAlign: 'center', marginBottom: 20, cursor: 'pointer' }}>
        <div style={{ fontSize: 32, marginBottom: 8 }}>📊</div>
        <div style={{ color: T.text, fontWeight: 600, marginBottom: 6 }}>Click to upload your PO Management Excel</div>
        <div style={{ color: T.muted, fontSize: 12, lineHeight: 1.6 }}>
          Expected columns match your existing file:<br />
          <strong style={{ color: T.text }}>PO# · Supplier Ref · PO Status · DC · Units · Cartons · Freight Forwarder · Shipment Date · ETA · Total Freight Cost · Tracking # · Delivery Date · Booked in Date</strong>
        </div>
        <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" onChange={handleFile} style={{ display: 'none' }} />
      </div>
      {error && <div style={{ color: T.red, background: T.redDim, border: `1px solid ${T.red}40`, borderRadius: 5, padding: '10px 14px', marginBottom: 16, fontSize: 13 }}>{error}</div>}
      {rows && (
        <div>
          <div style={{ color: T.green, background: T.greenDim, border: `1px solid ${T.green}40`, borderRadius: 5, padding: '10px 14px', marginBottom: 16, fontSize: 13 }}>
            ✓ Loaded {rows.length - 1} rows — ready to import
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
            <BtnGhost onClick={onClose}>Cancel</BtnGhost>
            <BtnPrimary onClick={doImport} disabled={saving}>{saving ? 'Importing…' : `Import ${rows.length - 1} rows`}</BtnPrimary>
          </div>
        </div>
      )}
    </Modal>
  )
}

// ─── MAIN PAGE ────────────────────────────────────────────────
export default function PurchaseOrdersPage() {
  const [pos, setPos] = useState([])
  const [suppliers, setSuppliers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState('All')
  const [dcFilter, setDcFilter] = useState('All')
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState(null)
  const [showNew, setShowNew] = useState(false)
  const [showImport, setShowImport] = useState(false)

  const load = () => {
    setLoading(true)
    Promise.all([getPurchaseOrders(), getSuppliers()])
      .then(([p, s]) => { setPos(p); setSuppliers(s) })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  // Flatten to shipment-level rows for the table (like your Excel)
  const allShipments = pos.flatMap(po =>
    (po.shipments || []).map(sh => ({ ...sh, po }))
  )

  const filtered = allShipments.filter(sh => {
    const matchStatus = filter === 'All' || sh.status === filter
    const matchDC = dcFilter === 'All' || sh.dc === dcFilter
    const matchSearch = !search || sh.shipment_ref?.toLowerCase().includes(search.toLowerCase()) || sh.po?.supplier_name?.toLowerCase().includes(search.toLowerCase()) || sh.po?.supplier_ref?.toLowerCase().includes(search.toLowerCase())
    return matchStatus && matchDC && matchSearch
  })

  const inTransit = allShipments.filter(s => s.status === 'In transit - awaiting freight info').length
  const inProduction = allShipments.filter(s => s.status === 'In production').length
  const bookedIn = allShipments.filter(s => s.status?.includes('Booked in')).length
  const totalUnitsInTransit = allShipments.filter(s => s.status?.includes('transit')).reduce((s, sh) => s + (sh.units || 0), 0)

  return (
    <Shell title="Purchase Orders">
      {selected && <PODetail po={selected} onClose={() => setSelected(null)} onSaved={load} />}
      {showNew && <NewPOModal suppliers={suppliers} onClose={() => setShowNew(false)} onSaved={load} />}
      {showImport && <ImportModal suppliers={suppliers} onClose={() => setShowImport(false)} onSaved={load} />}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12, marginBottom: 20 }}>
        <KPI label="Total POs" value={pos.length} />
        <KPI label="Total Shipments" value={allShipments.length} />
        <KPI label="In Production" value={inProduction} color={T.yellow} />
        <KPI label="In Transit" value={inTransit} color={T.blue} sub={`${totalUnitsInTransit.toLocaleString()} units`} />
        <KPI label="Booked In" value={bookedIn} color={T.green} />
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          {/* DC filter */}
          {['All', 'UK', 'US'].map(d => (
            <button key={d} onClick={() => setDcFilter(d)} style={{ background: dcFilter === d ? (d === 'UK' ? '#3b82f6' : d === 'US' ? '#8b5cf6' : T.accent) : T.subtle, color: dcFilter === d ? '#fff' : T.muted, border: 'none', borderRadius: 4, padding: '5px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>{d}</button>
          ))}
          <div style={{ width: 1, height: 20, background: T.border, margin: '0 4px' }} />
          {/* Status filter */}
          {['All', ...PO_STATUSES].map(s => (
            <button key={s} onClick={() => setFilter(s)} style={{ background: filter === s ? T.accent : T.subtle, color: filter === s ? '#fff' : T.muted, border: 'none', borderRadius: 4, padding: '5px 10px', fontSize: 11, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>{s}</button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input placeholder="Search PO / supplier…" value={search} onChange={e => setSearch(e.target.value)} style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 5, padding: '7px 12px', color: T.text, fontSize: 13, width: 220, outline: 'none' }} />
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
                  <Th>PO Ref</Th>
                  <Th>Supplier</Th>
                  <Th>DC</Th>
                  <Th>Status</Th>
                  <Th>Ex-Factory</Th>
                  <Th>ETA</Th>
                  <Th>Freight Forwarder</Th>
                  <Th style={{ textAlign: 'right' }}>Units</Th>
                  <Th>Tracking #</Th>
                  <Th>Checklist</Th>
                  <Th></Th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((sh, i) => (
                  <tr key={sh.id || i} className="row-hover" onClick={() => setSelected(sh.po)}>
                    <Td style={{ fontFamily: 'monospace', fontSize: 12, color: T.accent, fontWeight: 700 }}>{sh.shipment_ref}</Td>
                    <Td style={{ fontWeight: 600, fontSize: 13 }}>{sh.po?.supplier_name || sh.po?.supplier_ref}</Td>
                    <Td><ShipBadge dc={sh.dc} /></Td>
                    <Td>
                      <span style={{ color: statusColor(sh.status), fontSize: 12, fontWeight: 600 }}>
                        {sh.status}
                      </span>
                    </Td>
                    <Td style={{ color: T.muted, fontSize: 12 }}>{sh.po?.ex_factory_date || '—'}</Td>
                    <Td style={{ color: T.muted, fontSize: 12 }}>{sh.eta || '—'}</Td>
                    <Td style={{ color: T.muted, fontSize: 12 }}>{sh.freight_forwarder || '—'}</Td>
                    <Td style={{ textAlign: 'right', fontWeight: 700 }}>{(sh.units || 0).toLocaleString()}</Td>
                    <Td style={{ fontFamily: 'monospace', fontSize: 11, color: T.muted }}>{sh.tracking_number || '—'}</Td>
                    <Td>
                      <div style={{ display: 'flex', gap: 4 }}>
                        {[
                          { val: sh.po?.skus_created, label: 'SKU' },
                          { val: sh.added_to_warehouse, label: 'WH' },
                          { val: sh.quantities_verified, label: 'QTY' },
                          { val: sh.stock_on_shopify, label: 'SHP' },
                        ].map(c => (
                          <span key={c.label} title={c.label} style={{ width: 28, height: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', background: c.val ? T.greenDim : T.subtle, color: c.val ? T.green : T.muted, borderRadius: 3, fontSize: 9, fontWeight: 800, border: `1px solid ${c.val ? T.green + '30' : T.border}` }}>
                            {c.label}
                          </span>
                        ))}
                      </div>
                    </Td>
                    <Td style={{ color: T.muted, fontSize: 16 }}>›</Td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr><td colSpan={11} style={{ padding: 32, textAlign: 'center', color: T.muted }}>No shipments found</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </Shell>
  )
}
