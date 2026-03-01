'use client'
import { useEffect, useState, useRef } from 'react'
import * as XLSX from 'xlsx'
import Shell from '@/components/Shell'
import { T, KPI, Card, Badge, Th, Td, Input, BtnPrimary, BtnGhost, Modal, CURRENCIES, fmt, Loading, ErrorMsg } from '@/components/ui'
import { getPurchaseOrders, getSuppliers, createPurchaseOrder, updatePurchaseOrder, updateShipment, addShipment } from '@/lib/supabase'

// ─── CONSTANTS ────────────────────────────────────────────────
const SHIPMENT_STATUSES = [
  'In production',
  'In transit - awaiting freight info',
  'Receipt in progress',
  'Delivered',
  'Booked in & checked',
  'Delivered + booked in',
]
const FREIGHT_FORWARDERS = ['HuianExpress','JET','KTL','ACS logistics','ICL Logistics','Evergreen logistics','Vina Happy Shipping','Turkmen logistics','Supplier']
const SIZES = ['XS','S','M','L','XL','XXL']
const EMPTY_LINE = { product_name:'', size:'M', cost_price:'', design_ref:'', colour_code:'', sku:'', qty_uk:0, qty_usa:0, confirmed_xf:0 }

const lineTotal = (l) => ((l.qty_uk||0)+(l.qty_usa||0))*(l.cost_price||0)
const poLineTotal = (po) => (po.po_lines||[]).reduce((s,l)=>s+lineTotal(l),0)
const shipUnits = (sh) => sh.units||0

// ─── PARSE PO REF ─────────────────────────────────────────────
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

function cleanNum(val) {
  return parseFloat(String(val||'0').replace(/[$£,\s]/g,''))||0
}

// ─── COLORS ───────────────────────────────────────────────────
const shipStatusColor = (s) => ({
  'In production': T.yellow,
  'In transit - awaiting freight info': T.blue,
  'Receipt in progress': T.accent,
  'Delivered': T.green,
  'Booked in & checked': T.green,
  'Delivered + booked in': T.green,
}[s] || T.muted)

const DCBadge = ({ dc }) => (
  <span style={{
    background: dc==='UK' ? '#3b82f620' : '#8b5cf620',
    color: dc==='UK' ? '#3b82f6' : '#8b5cf6',
    border: `1px solid ${dc==='UK' ? '#3b82f640' : '#8b5cf640'}`,
    borderRadius: 3, padding: '1px 8px', fontSize: 11, fontWeight: 800, letterSpacing: '0.05em'
  }}>{dc}</span>
)

const CheckDot = ({ val }) => (
  <span style={{ color: val ? T.green : T.border, fontSize: 14 }}>{val ? '●' : '○'}</span>
)

// ─── SPLIT MODAL ──────────────────────────────────────────────
function SplitModal({ po, onClose, onSaved }) {
  const [ukUnits, setUkUnits] = useState(0)
  const [usaUnits, setUsaUnits] = useState(0)
  const [ukType, setUkType] = useState('SEA')
  const [usaType, setUsaType] = useState('SEA')
  const [includeUK, setIncludeUK] = useState(true)
  const [includeUSA, setIncludeUSA] = useState(true)
  const [saving, setSaving] = useState(false)

  const totalLineUnits = (po.po_lines||[]).reduce((s,l)=>(s+(l.qty_uk||0)+(l.qty_usa||0)),0)
  const lineUK = (po.po_lines||[]).reduce((s,l)=>s+(l.qty_uk||0),0)
  const lineUSA = (po.po_lines||[]).reduce((s,l)=>s+(l.qty_usa||0),0)

  // Pre-fill from line items if available
  useEffect(()=>{ if(lineUK>0) setUkUnits(lineUK); if(lineUSA>0) setUsaUnits(lineUSA) },[])

  const doSplit = async () => {
    setSaving(true)
    const shipments = []
    if (includeUK) shipments.push({
      po_id: po.id, shipment_ref: `${po.id}UK${ukType}`,
      dc: 'UK', shipment_type: ukType, units: +ukUnits, cartons: 0,
      status: 'In production', added_to_warehouse:false, delivery_booked:false,
      quantities_verified:false, stock_on_shopify:false,
    })
    if (includeUSA) shipments.push({
      po_id: po.id, shipment_ref: `${po.id}USA${usaType}`,
      dc: 'US', shipment_type: usaType, units: +usaUnits, cartons: 0,
      status: 'In production', added_to_warehouse:false, delivery_booked:false,
      quantities_verified:false, stock_on_shopify:false,
    })
    for (const s of shipments) await addShipment(s)
    await updatePurchaseOrder(po.id, { po_splits_confirmed: true })
    onSaved(); onClose()
  }

  const inp = { background:T.surface, border:`1px solid ${T.border}`, borderRadius:5, padding:'8px 10px', color:T.text, fontSize:14, outline:'none', width:'100%' }

  return (
    <Modal title={`Split PO — ${po.id}`} width={600} onClose={onClose}>
      <div style={{ background:T.surface, border:`1px solid ${T.border}`, borderRadius:8, padding:16, marginBottom:20 }}>
        <div style={{ fontSize:11, color:T.muted, textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:8 }}>PO Summary</div>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:10 }}>
          {[
            { label:'Supplier', value: po.supplier_name || po.supplier_ref },
            { label:'Ex-Factory', value: po.ex_factory_date || '—' },
            { label:'Total Cost', value: fmt(po.total_cost_value, po.currency||'USD') },
          ].map(f=>(
            <div key={f.label}>
              <div style={{ fontSize:10, color:T.muted, marginBottom:2 }}>{f.label}</div>
              <div style={{ fontSize:13, fontWeight:600, color:T.text }}>{f.value}</div>
            </div>
          ))}
        </div>
        {totalLineUnits > 0 && (
          <div style={{ marginTop:10, fontSize:12, color:T.muted, borderTop:`1px solid ${T.border}`, paddingTop:8 }}>
            From line items: <span style={{ color:T.blue, fontWeight:600 }}>{lineUK} UK</span> · <span style={{ color:'#8b5cf6', fontWeight:600 }}>{lineUSA} USA</span> units (pre-filled below)
          </div>
        )}
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16, marginBottom:24 }}>
        {/* UK Shipment */}
        <div style={{ background: includeUK ? '#3b82f610' : T.surface, border:`1px solid ${includeUK ? '#3b82f640' : T.border}`, borderRadius:8, padding:16 }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
            <span style={{ fontWeight:700, color:'#3b82f6', fontSize:14 }}>🇬🇧 UK Shipment</span>
            <button onClick={()=>setIncludeUK(!includeUK)} style={{ background: includeUK ? '#3b82f6' : T.subtle, color: includeUK ? '#fff' : T.muted, border:'none', borderRadius:4, padding:'3px 10px', fontSize:11, fontWeight:700, cursor:'pointer' }}>
              {includeUK ? 'Included ✓' : 'Excluded'}
            </button>
          </div>
          {includeUK && <>
            <div style={{ marginBottom:10 }}>
              <div style={{ fontSize:11, color:T.muted, marginBottom:4 }}>Shipment Ref</div>
              <div style={{ fontFamily:'monospace', fontSize:12, color:T.accent, fontWeight:700 }}>{po.id}UK{ukType}</div>
            </div>
            <div style={{ marginBottom:10 }}>
              <div style={{ fontSize:11, color:T.muted, marginBottom:4 }}>Units</div>
              <input type="number" min="0" value={ukUnits} onChange={e=>setUkUnits(e.target.value)} style={inp} />
            </div>
            <div>
              <div style={{ fontSize:11, color:T.muted, marginBottom:4 }}>Type</div>
              <select value={ukType} onChange={e=>setUkType(e.target.value)} style={inp}>
                <option>SEA</option><option>AIR</option><option>TRUCK</option>
              </select>
            </div>
          </>}
        </div>

        {/* USA Shipment */}
        <div style={{ background: includeUSA ? '#8b5cf610' : T.surface, border:`1px solid ${includeUSA ? '#8b5cf640' : T.border}`, borderRadius:8, padding:16 }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
            <span style={{ fontWeight:700, color:'#8b5cf6', fontSize:14 }}>🇺🇸 USA Shipment</span>
            <button onClick={()=>setIncludeUSA(!includeUSA)} style={{ background: includeUSA ? '#8b5cf6' : T.subtle, color: includeUSA ? '#fff' : T.muted, border:'none', borderRadius:4, padding:'3px 10px', fontSize:11, fontWeight:700, cursor:'pointer' }}>
              {includeUSA ? 'Included ✓' : 'Excluded'}
            </button>
          </div>
          {includeUSA && <>
            <div style={{ marginBottom:10 }}>
              <div style={{ fontSize:11, color:T.muted, marginBottom:4 }}>Shipment Ref</div>
              <div style={{ fontFamily:'monospace', fontSize:12, color:T.accent, fontWeight:700 }}>{po.id}USA{usaType}</div>
            </div>
            <div style={{ marginBottom:10 }}>
              <div style={{ fontSize:11, color:T.muted, marginBottom:4 }}>Units</div>
              <input type="number" min="0" value={usaUnits} onChange={e=>setUsaUnits(e.target.value)} style={inp} />
            </div>
            <div>
              <div style={{ fontSize:11, color:T.muted, marginBottom:4 }}>Type</div>
              <select value={usaType} onChange={e=>setUsaType(e.target.value)} style={inp}>
                <option>SEA</option><option>AIR</option><option>TRUCK</option>
              </select>
            </div>
          </>}
        </div>
      </div>

      <div style={{ background:T.surface, border:`1px solid ${T.border}`, borderRadius:6, padding:'10px 14px', marginBottom:20, fontSize:12, color:T.muted }}>
        💡 After splitting, you can add tracking numbers, ETAs and freight costs in the shipment detail.
      </div>

      <div style={{ display:'flex', justifyContent:'flex-end', gap:10 }}>
        <BtnGhost onClick={onClose}>Cancel</BtnGhost>
        <BtnPrimary onClick={doSplit} disabled={saving || (!includeUK && !includeUSA)}>
          {saving ? 'Creating shipments…' : 'Confirm Split'}
        </BtnPrimary>
      </div>
    </Modal>
  )
}

// ─── SHIPMENT PANEL (inside PO detail) ───────────────────────
function ShipmentPanel({ shipment, currency, onSave }) {
  const [s, setS] = useState({ ...shipment })
  const [saving, setSaving] = useState(false)
  const upd = (f,v) => setS(p=>({...p,[f]:v}))
  const inp = { background:T.bg, border:`1px solid ${T.border}`, borderRadius:4, padding:'6px 8px', color:T.text, fontSize:12, outline:'none', width:'100%' }

  return (
    <div style={{ background:T.bg, border:`1px solid ${T.border}`, borderRadius:8, padding:16, marginBottom:12 }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <DCBadge dc={s.dc} />
          <span style={{ fontFamily:'monospace', fontSize:12, color:T.muted }}>{s.shipment_ref}</span>
          <span style={{ fontSize:10, color:T.muted, background:T.subtle, borderRadius:3, padding:'1px 6px', fontWeight:700 }}>{s.shipment_type}</span>
        </div>
        <BtnPrimary onClick={async()=>{setSaving(true);await onSave(s.id,s);setSaving(false)}} style={{ padding:'5px 12px', fontSize:12 }} disabled={saving}>
          {saving?'Saving…':'Save'}
        </BtnPrimary>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:10, marginBottom:10 }}>
        <div>
          <div style={{ fontSize:10, color:T.muted, textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:4 }}>Status</div>
          <select value={s.status||''} onChange={e=>upd('status',e.target.value)} style={inp}>
            {SHIPMENT_STATUSES.map(st=><option key={st}>{st}</option>)}
          </select>
        </div>
        <div>
          <div style={{ fontSize:10, color:T.muted, textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:4 }}>Freight Forwarder</div>
          <select value={s.freight_forwarder||''} onChange={e=>upd('freight_forwarder',e.target.value)} style={inp}>
            <option value="">— select —</option>
            {FREIGHT_FORWARDERS.map(f=><option key={f}>{f}</option>)}
          </select>
        </div>
        <div>
          <div style={{ fontSize:10, color:T.muted, textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:4 }}>Units</div>
          <input type="number" value={s.units||0} onChange={e=>upd('units',+e.target.value)} style={inp} />
        </div>
        <div>
          <div style={{ fontSize:10, color:T.muted, textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:4 }}>Cartons</div>
          <input type="number" value={s.cartons||0} onChange={e=>upd('cartons',+e.target.value)} style={inp} />
        </div>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:10, marginBottom:10 }}>
        <div>
          <div style={{ fontSize:10, color:T.muted, textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:4 }}>Shipment Date</div>
          <input value={s.shipment_date||''} onChange={e=>upd('shipment_date',e.target.value)} style={inp} placeholder="e.g. 7-Jan-2025" />
        </div>
        <div>
          <div style={{ fontSize:10, color:T.muted, textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:4 }}>ETA</div>
          <input value={s.eta||''} onChange={e=>upd('eta',e.target.value)} style={inp} placeholder="e.g. 03/03/2025" />
        </div>
        <div>
          <div style={{ fontSize:10, color:T.muted, textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:4 }}>Delivery Date</div>
          <input value={s.delivery_date||''} onChange={e=>upd('delivery_date',e.target.value)} style={inp} />
        </div>
        <div>
          <div style={{ fontSize:10, color:T.muted, textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:4 }}>Booked In Date</div>
          <input value={s.booked_in_date||''} onChange={e=>upd('booked_in_date',e.target.value)} style={inp} />
        </div>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:10, marginBottom:12 }}>
        <div>
          <div style={{ fontSize:10, color:T.muted, textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:4 }}>Tracking # / AWB</div>
          <input value={s.tracking_number||''} onChange={e=>upd('tracking_number',e.target.value)} style={inp} />
        </div>
        <div>
          <div style={{ fontSize:10, color:T.muted, textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:4 }}>Total Freight Cost</div>
          <input type="number" value={s.total_freight_cost||0} onChange={e=>upd('total_freight_cost',+e.target.value)} style={inp} />
        </div>
        <div>
          <div style={{ fontSize:10, color:T.muted, textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:4 }}>Unit Freight ($USD)</div>
          <input type="number" step="0.001" value={s.unit_freight_cost_usd||0} onChange={e=>upd('unit_freight_cost_usd',+e.target.value)} style={inp} />
        </div>
        <div>
          <div style={{ fontSize:10, color:T.muted, textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:4 }}>Unit Freight (£GBP)</div>
          <input type="number" step="0.001" value={s.unit_freight_cost_gbp||0} onChange={e=>upd('unit_freight_cost_gbp',+e.target.value)} style={inp} />
        </div>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:12 }}>
        <div>
          <div style={{ fontSize:10, color:T.muted, textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:4 }}>Import Tax Status</div>
          <select value={s.import_tax_status||''} onChange={e=>upd('import_tax_status',e.target.value)} style={inp}>
            <option value="">— select —</option>
            <option>DDP - No taxes</option>
            <option>Taxes paid</option>
            <option>DAP - Buyer pays taxes</option>
          </select>
        </div>
      </div>

      {/* Checklist toggles */}
      <div style={{ display:'flex', flexWrap:'wrap', gap:8 }}>
        {[
          { key:'added_to_warehouse', label:'Added to Warehouse' },
          { key:'delivery_booked', label:'Delivery Booked' },
          { key:'quantities_verified', label:'Quantities Verified' },
          { key:'stock_on_shopify', label:'Stock on Shopify' },
        ].map(c=>(
          <button key={c.key} onClick={()=>upd(c.key,!s[c.key])} style={{ background:s[c.key]?T.greenDim:T.subtle, color:s[c.key]?T.green:T.muted, border:`1px solid ${s[c.key]?T.green+'40':T.border}`, borderRadius:4, padding:'4px 10px', fontSize:11, fontWeight:600, cursor:'pointer' }}>
            {s[c.key]?'✓':'○'} {c.label}
          </button>
        ))}
      </div>
    </div>
  )
}

// ─── PO DETAIL MODAL ──────────────────────────────────────────
function PODetail({ po, onClose, onSaved, onSplit }) {
  const [tab, setTab] = useState(po.shipments?.length > 0 ? 'shipments' : 'lines')
  const lines = po.po_lines || []
  const shipments = (po.shipments || []).sort((a,b)=>a.dc.localeCompare(b.dc))
  const isUnsplit = shipments.length === 0 && !po.po_splits_confirmed
  const totalUK = lines.reduce((s,l)=>s+(l.qty_uk||0),0)
  const totalUSA = lines.reduce((s,l)=>s+(l.qty_usa||0),0)
  const grandTotal = lines.reduce((s,l)=>s+lineTotal(l),0)

  const TabBtn = ({id,label}) => (
    <button onClick={()=>setTab(id)} style={{ background:tab===id?T.accent:'transparent', color:tab===id?'#fff':T.muted, border:`1px solid ${tab===id?T.accent:T.border}`, borderRadius:5, padding:'6px 14px', fontSize:12, fontWeight:600, cursor:'pointer' }}>
      {label}
    </button>
  )

  return (
    <Modal title={`PO — ${po.id}`} width={1200} onClose={onClose}>
      {/* Header */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(5,1fr)', gap:10, marginBottom:16 }}>
        {[
          { label:'Supplier', value: po.supplier_name||po.supplier_ref },
          { label:'Supplier Ref', value: po.supplier_ref },
          { label:'Season', value: po.seasonality||'—' },
          { label:'Ex-Factory', value: po.ex_factory_date||'—' },
          { label:'Total Cost', value: fmt(po.total_cost_value, po.currency||'USD') },
        ].map(f=>(
          <div key={f.label} style={{ background:T.surface, borderRadius:6, padding:'10px 12px', border:`1px solid ${T.border}` }}>
            <div style={{ fontSize:10, color:T.muted, textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:3 }}>{f.label}</div>
            <div style={{ fontSize:13, color:T.text, fontWeight:600 }}>{f.value}</div>
          </div>
        ))}
      </div>

      {/* PO checklist + deposit */}
      <div style={{ display:'flex', gap:8, marginBottom:16, flexWrap:'wrap', alignItems:'center' }}>
        {[
          { val:po.skus_created, label:'SKUs Created' },
          { val:po.barcodes_sent, label:'Barcodes Sent' },
          { val:po.polybags_sent, label:'Polybags Sent' },
          { val:po.po_splits_confirmed, label:'PO Splits Confirmed' },
        ].map(c=>(
          <span key={c.label} style={{ background:c.val?T.greenDim:T.subtle, color:c.val?T.green:T.muted, border:`1px solid ${c.val?T.green+'40':T.border}`, borderRadius:4, padding:'3px 10px', fontSize:11, fontWeight:600 }}>
            {c.val?'✓':'○'} {c.label}
          </span>
        ))}
        <div style={{ marginLeft:'auto', fontSize:12, color:T.muted }}>
          Deposit: <strong style={{ color:T.text }}>{fmt(po.deposit_cost_value, po.currency||'USD')}</strong>
          {po.deposit_payment_date && <span style={{ marginLeft:6 }}>({po.deposit_payment_date})</span>}
        </div>
      </div>

      {/* UNSPLIT BANNER */}
      {isUnsplit && (
        <div style={{ background:'#f59e0b12', border:'1px solid #f59e0b40', borderRadius:8, padding:'14px 18px', marginBottom:16, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <div>
            <div style={{ fontWeight:700, color:T.yellow, marginBottom:2 }}>⚠ This PO has not been split into shipments yet</div>
            <div style={{ fontSize:12, color:T.muted }}>Split it to create UK and/or USA shipments and start tracking delivery.</div>
          </div>
          <BtnPrimary onClick={()=>{ onClose(); onSplit(po) }} style={{ background:T.yellow, flexShrink:0 }}>
            ✂ Split into Shipments
          </BtnPrimary>
        </div>
      )}

      {/* Tabs */}
      <div style={{ display:'flex', gap:8, marginBottom:16 }}>
        <TabBtn id="shipments" label={`Shipments (${shipments.length})`} />
        <TabBtn id="lines" label={`Line Items (${lines.length})`} />
      </div>

      {tab === 'shipments' && (
        <div>
          {shipments.length === 0 ? (
            <div style={{ padding:32, textAlign:'center', color:T.muted, fontSize:13 }}>No shipments yet — use "Split into Shipments" above</div>
          ) : (
            shipments.map(sh=>(
              <ShipmentPanel key={sh.id} shipment={sh} currency={po.currency} onSave={async(id,updates)=>{ await updateShipment(id,updates); onSaved() }} />
            ))
          )}
        </div>
      )}

      {tab === 'lines' && (
        <div style={{ overflowX:'auto' }}>
          {lines.length === 0 ? (
            <div style={{ padding:32, textAlign:'center', color:T.muted, fontSize:13 }}>No line items recorded for this PO</div>
          ) : (
            <table style={{ width:'100%', borderCollapse:'collapse', minWidth:900 }}>
              <thead>
                <tr style={{ background:T.surface }}>
                  <Th>Product Name</Th><Th>Size</Th><Th>Design Ref.</Th><Th>Colour</Th><Th>SKU</Th>
                  <Th style={{ textAlign:'right' }}>Cost</Th>
                  <Th style={{ textAlign:'right' }}>UK Qty</Th>
                  <Th style={{ textAlign:'right' }}>USA Qty</Th>
                  <Th style={{ textAlign:'right' }}>Conf. XF</Th>
                  <Th style={{ textAlign:'right' }}>Line Total</Th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l,i)=>(
                  <tr key={i}>
                    <Td style={{ fontWeight:600 }}>{l.product_name}</Td>
                    <Td><span style={{ background:T.subtle, color:T.text, borderRadius:4, padding:'2px 8px', fontSize:12, fontWeight:700 }}>{l.size}</span></Td>
                    <Td style={{ color:T.muted, fontFamily:'monospace', fontSize:12 }}>{l.design_ref||'—'}</Td>
                    <Td style={{ color:T.muted, fontSize:12 }}>{l.colour_code||'—'}</Td>
                    <Td style={{ color:T.muted, fontFamily:'monospace', fontSize:11 }}>{l.sku||'—'}</Td>
                    <Td style={{ textAlign:'right', color:T.muted }}>{fmt(l.cost_price, po.currency||'USD')}</Td>
                    <Td style={{ textAlign:'right', fontWeight:600 }}>{(l.qty_uk||0).toLocaleString()}</Td>
                    <Td style={{ textAlign:'right', fontWeight:600 }}>{(l.qty_usa||0).toLocaleString()}</Td>
                    <Td style={{ textAlign:'right', color:T.green, fontWeight:700 }}>{(l.confirmed_xf||0).toLocaleString()}</Td>
                    <Td style={{ textAlign:'right', color:T.accent, fontWeight:700 }}>{fmt(lineTotal(l), po.currency||'USD')}</Td>
                  </tr>
                ))}
                <tr style={{ background:T.surface, borderTop:`2px solid ${T.border}` }}>
                  <Td colSpan={6} style={{ fontWeight:700 }}>TOTALS</Td>
                  <Td style={{ textAlign:'right', fontWeight:800 }}>{totalUK.toLocaleString()}</Td>
                  <Td style={{ textAlign:'right', fontWeight:800 }}>{totalUSA.toLocaleString()}</Td>
                  <Td></Td>
                  <Td style={{ textAlign:'right', fontWeight:800, color:T.accent, fontSize:15 }}>{fmt(grandTotal, po.currency||'USD')}</Td>
                </tr>
              </tbody>
            </table>
          )}
        </div>
      )}

      <div style={{ display:'flex', justifyContent:'flex-end', marginTop:20 }}>
        <BtnGhost onClick={onClose}>Close</BtnGhost>
      </div>
    </Modal>
  )
}

// ─── NEW PO MODAL ─────────────────────────────────────────────
function NewPOModal({ suppliers, onClose, onSaved }) {
  const [id, setId] = useState('')
  const [supplierRef, setSupplierRef] = useState('')
  const [supplierName, setSupplierName] = useState(suppliers[0]?.name||'')
  const [season, setSeason] = useState('AW25')
  const [currency, setCurrency] = useState('USD')
  const [exFactory, setExFactory] = useState('')
  const [totalCost, setTotalCost] = useState('')
  const [deposit, setDeposit] = useState('')
  const [depositDate, setDepositDate] = useState('')
  const [lines, setLines] = useState([{...EMPTY_LINE}])
  const [saving, setSaving] = useState(false)
  const s = { background:T.surface, border:`1px solid ${T.border}`, borderRadius:4, padding:'5px 7px', color:T.text, fontSize:12, outline:'none', width:'100%' }
  const upd = (i,f,v) => { const l=[...lines]; l[i]={...l[i],[f]:v}; setLines(l) }

  const save = async () => {
    setSaving(true)
    await createPurchaseOrder(
      { id:id.toUpperCase().trim(), supplier_ref:supplierRef, supplier_name:supplierName, seasonality:season, currency, ex_factory_date:exFactory, total_cost_value:parseFloat(totalCost)||0, deposit_cost_value:parseFloat(deposit)||0, deposit_payment_date:depositDate, skus_created:false, barcodes_sent:false, polybags_sent:false, po_splits_confirmed:false },
      lines.map(l=>({...l, cost_price:parseFloat(l.cost_price)||0})),
      [] // no shipments yet — user splits later
    )
    onSaved(); onClose()
  }

  return (
    <Modal title="New Purchase Order" width={1200} onClose={onClose}>
      <div style={{ background:'#f59e0b12', border:'1px solid #f59e0b30', borderRadius:6, padding:'10px 14px', marginBottom:16, fontSize:12, color:T.yellow }}>
        💡 Creating a PO without shipments. After saving, use <strong>"Split into Shipments"</strong> to create UK and USA shipments.
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12, marginBottom:16 }}>
        <Input label="PO Reference" value={id} onChange={setId} placeholder="e.g. GWG049" />
        <Input label="Supplier Ref" value={supplierRef} onChange={setSupplierRef} placeholder="e.g. GWG" />
        <Input label="Supplier Name" value={supplierName} onChange={setSupplierName} options={suppliers.map(s=>s.name)} />
        <Input label="Season" value={season} onChange={setSeason} placeholder="AW25, SS25..." />
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12, marginBottom:16 }}>
        <Input label="Currency" value={currency} onChange={setCurrency} options={CURRENCIES} />
        <Input label="Ex-Factory Date" value={exFactory} onChange={setExFactory} placeholder="15-Mar-2025" />
        <Input label="Total Cost Value" value={totalCost} onChange={setTotalCost} placeholder="0.00" />
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
          <Input label="Deposit" value={deposit} onChange={setDeposit} placeholder="0.00" />
          <Input label="Deposit Date" value={depositDate} onChange={setDepositDate} placeholder="dd-Mon-yy" />
        </div>
      </div>

      <div style={{ fontSize:11, color:T.muted, textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:8 }}>Line Items (optional)</div>
      <div style={{ overflowX:'auto', marginBottom:12 }}>
        <table style={{ width:'100%', borderCollapse:'collapse', minWidth:1000 }}>
          <thead>
            <tr style={{ background:T.surface }}>
              <Th style={{ minWidth:140 }}>Product Name</Th>
              <Th style={{ minWidth:65 }}>Size</Th>
              <Th style={{ minWidth:100 }}>Design Ref.</Th>
              <Th style={{ minWidth:90 }}>Colour</Th>
              <Th style={{ minWidth:130 }}>SKU</Th>
              <Th style={{ minWidth:85, textAlign:'right' }}>Cost Price</Th>
              <Th style={{ minWidth:70, textAlign:'right' }}>UK Qty</Th>
              <Th style={{ minWidth:70, textAlign:'right' }}>USA Qty</Th>
              <Th style={{ minWidth:90, textAlign:'right' }}>Conf. XF</Th>
              <Th style={{ textAlign:'right' }}>Total</Th>
              <Th></Th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l,i)=>(
              <tr key={i} style={{ borderBottom:`1px solid ${T.border}` }}>
                <Td><input value={l.product_name} onChange={e=>upd(i,'product_name',e.target.value)} placeholder="Product name" style={s} /></Td>
                <Td><select value={l.size} onChange={e=>upd(i,'size',e.target.value)} style={s}>{SIZES.map(sz=><option key={sz}>{sz}</option>)}</select></Td>
                <Td><input value={l.design_ref} onChange={e=>upd(i,'design_ref',e.target.value)} placeholder="TA-SS25-001" style={s} /></Td>
                <Td><input value={l.colour_code} onChange={e=>upd(i,'colour_code',e.target.value)} placeholder="BLK" style={s} /></Td>
                <Td><input value={l.sku} onChange={e=>upd(i,'sku',e.target.value)} placeholder="TA-COMP-M-BLK" style={s} /></Td>
                <Td><input type="number" min="0" step="0.01" value={l.cost_price} onChange={e=>upd(i,'cost_price',e.target.value)} style={{...s,textAlign:'right'}} /></Td>
                <Td><input type="number" min="0" value={l.qty_uk} onChange={e=>upd(i,'qty_uk',+e.target.value)} style={{...s,textAlign:'right'}} /></Td>
                <Td><input type="number" min="0" value={l.qty_usa} onChange={e=>upd(i,'qty_usa',+e.target.value)} style={{...s,textAlign:'right'}} /></Td>
                <Td><input type="number" min="0" value={l.confirmed_xf} onChange={e=>upd(i,'confirmed_xf',+e.target.value)} style={{...s,textAlign:'right'}} /></Td>
                <Td style={{ textAlign:'right', color:T.accent, fontWeight:700, fontSize:13 }}>{fmt(lineTotal(l),currency)}</Td>
                <Td><button onClick={()=>setLines(lines.filter((_,j)=>j!==i))} style={{ background:'none',border:'none',color:T.red,cursor:'pointer',fontSize:16 }}>×</button></Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
        <BtnGhost onClick={()=>setLines([...lines,{...EMPTY_LINE}])}>+ Add Line</BtnGhost>
        <div style={{ fontFamily:'Barlow Condensed', fontSize:20, fontWeight:800, color:T.accent }}>
          Total: {fmt(lines.reduce((s,l)=>s+lineTotal(l),0),currency)}
        </div>
      </div>
      <div style={{ display:'flex', justifyContent:'flex-end', gap:10 }}>
        <BtnGhost onClick={onClose}>Cancel</BtnGhost>
        <BtnPrimary onClick={save} disabled={saving||!id}>{saving?'Creating…':'Create PO'}</BtnPrimary>
      </div>
    </Modal>
  )
}

// ─── IMPORT MODAL ─────────────────────────────────────────────
function ImportModal({ onClose, onSaved }) {
  const [rows, setRows] = useState(null)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [preview, setPreview] = useState(null)
  const fileRef = useRef()

  const colIdx = (headers, pattern) => headers.findIndex(h=>new RegExp(pattern,'i').test(h))

  const processFile = (data) => {
    const headers = data[0].map(String)
    const validRows = data.slice(1).filter(r=>r[0]?.toString().trim())
    const poMap = {}

    for (const row of validRows) {
      const rawRef = String(row[0]).trim()
      const { base, dc, shipmentType, hasSuffix } = parsePORef(rawRef)
      const dcColVal = String(row[colIdx(headers,'^dc$')]||'').trim()
      const resolvedDC = dc || (dcColVal||null)

      if (!poMap[base]) {
        const get = (pat) => { const i=colIdx(headers,pat); return i>=0?row[i]:'' }
        poMap[base] = {
          po: {
            id: base,
            supplier_ref: String(get('supplier.?ref')||'').trim(),
            supplier_name: String(get('supplier.?ref')||'').trim(),
            seasonality: String(get('season')||'').trim(),
            total_cost_value: cleanNum(get('total.?cost')),
            deposit_cost_value: cleanNum(get('deposit.?cost')),
            deposit_payment_date: String(get('deposit.?pay')||'').trim(),
            ex_factory_date: String(get('ex.?factory')||'').trim(),
            currency: 'USD',
            skus_created: String(get('^skus?')||'').toUpperCase()==='TRUE',
            barcodes_sent: String(get('barcode')||'').toUpperCase()==='TRUE',
            polybags_sent: String(get('poly')||'').toUpperCase()==='TRUE',
            po_splits_confirmed: hasSuffix,
          },
          shipments: [],
          hasSuffix,
        }
      }

      if (hasSuffix && resolvedDC) {
        const get = (pat) => { const i=colIdx(headers,pat); return i>=0?row[i]:'' }
        poMap[base].shipments.push({
          shipment_ref: rawRef,
          dc: resolvedDC,
          shipment_type: shipmentType,
          status: String(get('po.?status|^status$')||'In production').trim(),
          units: parseInt(String(get('^units$')||'0').replace(/,/g,''))||0,
          cartons: parseInt(String(get('carton')||'0').replace(/,/g,''))||0,
          freight_forwarder: String(get('freight.?forward')||'').trim(),
          shipment_date: String(get('shipment.?date')||'').trim(),
          eta: String(get('^eta$')||'').trim(),
          total_freight_cost: cleanNum(get('total.?freight')),
          unit_freight_cost_usd: cleanNum(get('\\$usd|unit.?freight.*usd')),
          unit_freight_cost_gbp: cleanNum(get('new.?exchange|gbp.?new|unit.?freight.*gbp')),
          import_tax_status: String(get('import.?tax')||'').trim(),
          tracking_number: String(get('tracking')||'').trim(),
          delivery_date: String(get('delivery.?date')||'').trim(),
          booked_in_date: String(get('booked.?in')||'').trim(),
          added_to_warehouse: String(get('added.?to.?warehouse')||'').toUpperCase()==='TRUE',
          delivery_booked: String(get('delivery.?book')||'').toUpperCase()==='TRUE',
          quantities_verified: String(get('quantities.?ver')||'').toUpperCase()==='TRUE',
          stock_on_shopify: String(get('shopify')||'').toUpperCase()==='TRUE',
        })
      }
    }

    const allShipments = Object.values(poMap).flatMap(p=>p.shipments)
    return {
      poMap,
      totalRows: validRows.length,
      uniquePOs: Object.keys(poMap).length,
      withShipments: Object.values(poMap).filter(p=>p.shipments.length>0).length,
      pendingSplit: Object.values(poMap).filter(p=>p.shipments.length===0).length,
      ukShipments: allShipments.filter(s=>s.dc==='UK').length,
      usShipments: allShipments.filter(s=>s.dc==='US').length,
    }
  }

  const handleFile = (e) => {
    const file = e.target.files[0]; if(!file) return
    const reader = new FileReader()
    reader.onload = (evt) => {
      try {
        const wb = XLSX.read(evt.target.result,{type:'binary'})
        const data = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{header:1})
        if(data.length<2){setError('Sheet is empty');return}
        const result = processFile(data)
        setRows(data)
        setPreview(result)
        setError('')
      } catch(err){ setError('Could not read file: '+err.message) }
    }
    reader.readAsBinaryString(file)
  }

  const doImport = async () => {
    setSaving(true)
    const { poMap } = preview
    for (const [, { po, shipments }] of Object.entries(poMap)) {
      try { await createPurchaseOrder(po, [], shipments) } catch { /* skip dupes */ }
    }
    onSaved(); onClose()
  }

  return (
    <Modal title="Import PO Management File" width={700} onClose={onClose}>
      <div onClick={()=>fileRef.current.click()} style={{ background:T.surface, border:`2px dashed ${T.border}`, borderRadius:8, padding:32, textAlign:'center', marginBottom:20, cursor:'pointer' }}>
        <div style={{ fontSize:32, marginBottom:8 }}>📊</div>
        <div style={{ color:T.text, fontWeight:600, marginBottom:6 }}>
          {rows ? '✓ File loaded' : 'Click to upload your PO Management file'}
        </div>
        <div style={{ color:T.muted, fontSize:12, lineHeight:1.7 }}>
          Supports .xlsx, .xls, .csv<br/>
          <strong style={{ color:T.text }}>POs without suffix</strong> (TSH096) → imported as unsplit POs<br/>
          <strong style={{ color:T.text }}>POs with suffix</strong> (GWG048UKSEA) → imported with UK/US shipments
        </div>
        <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" onChange={handleFile} style={{ display:'none' }} />
      </div>

      {error && <div style={{ color:T.red, background:T.redDim, border:`1px solid ${T.red}40`, borderRadius:5, padding:'10px 14px', marginBottom:16, fontSize:13 }}>⚠ {error}</div>}

      {preview && (
        <div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:10, marginBottom:16 }}>
            {[
              { label:'Total Rows', value:preview.totalRows },
              { label:'Unique POs', value:preview.uniquePOs },
              { label:'⚠ Pending Split', value:preview.pendingSplit, color:T.yellow },
              { label:'POs with Shipments', value:preview.withShipments, color:T.green },
              { label:'🇬🇧 UK Shipments', value:preview.ukShipments, color:'#3b82f6' },
              { label:'🇺🇸 US Shipments', value:preview.usShipments, color:'#8b5cf6' },
            ].map(s=>(
              <div key={s.label} style={{ background:T.surface, borderRadius:6, padding:'12px 14px', border:`1px solid ${T.border}` }}>
                <div style={{ fontSize:10, color:T.muted, textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:4 }}>{s.label}</div>
                <div style={{ fontWeight:800, fontSize:22, color:s.color||T.text }}>{s.value}</div>
              </div>
            ))}
          </div>
          <div style={{ display:'flex', justifyContent:'flex-end', gap:10 }}>
            <BtnGhost onClick={onClose}>Cancel</BtnGhost>
            <BtnPrimary onClick={doImport} disabled={saving}>
              {saving ? 'Importing…' : `Import ${preview.uniquePOs} POs`}
            </BtnPrimary>
          </div>
        </div>
      )}

      {!rows && !error && <div style={{ display:'flex', justifyContent:'flex-end' }}><BtnGhost onClick={onClose}>Cancel</BtnGhost></div>}
    </Modal>
  )
}

// ─── MAIN PAGE ────────────────────────────────────────────────
export default function PurchaseOrdersPage() {
  const [pos, setPos] = useState([])
  const [suppliers, setSuppliers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [view, setView] = useState('shipments') // 'shipments' | 'pos'
  const [dcFilter, setDcFilter] = useState('All')
  const [statusFilter, setStatusFilter] = useState('All')
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState(null)
  const [splitting, setSplitting] = useState(null)
  const [showNew, setShowNew] = useState(false)
  const [showImport, setShowImport] = useState(false)

  const load = () => {
    setLoading(true)
    Promise.all([getPurchaseOrders(), getSuppliers()])
      .then(([p,s])=>{ setPos(p); setSuppliers(s) })
      .catch(e=>setError(e.message))
      .finally(()=>setLoading(false))
  }

  useEffect(()=>{ load() },[])

  const allShipments = pos.flatMap(po=>(po.shipments||[]).map(sh=>({...sh,po})))
  const unsplitPOs = pos.filter(po=>!(po.shipments?.length>0) && !po.po_splits_confirmed)

  const filteredShipments = allShipments.filter(sh=>{
    const matchDC = dcFilter==='All' || sh.dc===dcFilter
    const matchStatus = statusFilter==='All' || sh.status===statusFilter
    const matchSearch = !search || sh.shipment_ref?.toLowerCase().includes(search.toLowerCase()) || sh.po?.supplier_name?.toLowerCase().includes(search.toLowerCase()) || sh.po?.id?.toLowerCase().includes(search.toLowerCase())
    return matchDC && matchStatus && matchSearch
  })

  const filteredPOs = pos.filter(po=>{
    const matchSearch = !search || po.id.toLowerCase().includes(search.toLowerCase()) || (po.supplier_name||'').toLowerCase().includes(search.toLowerCase())
    return matchSearch
  })

  const inProduction = allShipments.filter(s=>s.status==='In production').length
  const inTransit = allShipments.filter(s=>s.status?.includes('transit')).length
  const bookedIn = allShipments.filter(s=>s.status?.includes('Booked in')).length

  return (
    <Shell title="Purchase Orders">
      {selected && <PODetail po={selected} onClose={()=>setSelected(null)} onSaved={load} onSplit={po=>{ setSelected(null); setSplitting(po) }} />}
      {splitting && <SplitModal po={splitting} onClose={()=>setSplitting(null)} onSaved={load} />}
      {showNew && <NewPOModal suppliers={suppliers} onClose={()=>setShowNew(false)} onSaved={load} />}
      {showImport && <ImportModal onClose={()=>setShowImport(false)} onSaved={load} />}

      {/* KPIs */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(5,1fr)', gap:12, marginBottom:20 }}>
        <KPI label="Total POs" value={pos.length} />
        <KPI label="⚠ Pending Split" value={unsplitPOs.length} color={unsplitPOs.length>0?T.yellow:T.muted} />
        <KPI label="In Production" value={inProduction} color={T.yellow} />
        <KPI label="In Transit" value={inTransit} color={T.blue} />
        <KPI label="Booked In" value={bookedIn} color={T.green} />
      </div>

      {/* Pending split alert */}
      {unsplitPOs.length > 0 && (
        <div style={{ background:'#f59e0b10', border:'1px solid #f59e0b30', borderRadius:8, padding:'12px 16px', marginBottom:16, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <span style={{ fontSize:13, color:T.yellow, fontWeight:600 }}>
            ⚠ {unsplitPOs.length} PO{unsplitPOs.length>1?'s':''} waiting to be split into shipments
          </span>
          <button onClick={()=>setView('pos')} style={{ background:'#f59e0b', color:'#000', border:'none', borderRadius:4, padding:'5px 12px', fontWeight:700, fontSize:12, cursor:'pointer' }}>
            View unsplit POs →
          </button>
        </div>
      )}

      {/* Controls */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16, flexWrap:'wrap', gap:10 }}>
        <div style={{ display:'flex', gap:6, flexWrap:'wrap', alignItems:'center' }}>
          {/* View toggle */}
          <div style={{ display:'flex', border:`1px solid ${T.border}`, borderRadius:5, overflow:'hidden', marginRight:8 }}>
            {[{id:'shipments',label:'Shipments'},{id:'pos',label:'All POs'}].map(v=>(
              <button key={v.id} onClick={()=>setView(v.id)} style={{ background:view===v.id?T.accent:'transparent', color:view===v.id?'#fff':T.muted, border:'none', padding:'5px 14px', fontSize:12, fontWeight:600, cursor:'pointer' }}>{v.label}</button>
            ))}
          </div>

          {view==='shipments' && <>
            {['All','UK','US'].map(d=>(
              <button key={d} onClick={()=>setDcFilter(d)} style={{ background:dcFilter===d?(d==='UK'?'#3b82f6':d==='US'?'#8b5cf6':T.accent):T.subtle, color:dcFilter===d?'#fff':T.muted, border:'none', borderRadius:4, padding:'5px 12px', fontSize:12, fontWeight:700, cursor:'pointer' }}>{d}</button>
            ))}
            <div style={{ width:1, height:20, background:T.border }} />
            {['All',...SHIPMENT_STATUSES].map(s=>(
              <button key={s} onClick={()=>setStatusFilter(s)} style={{ background:statusFilter===s?T.accent:T.subtle, color:statusFilter===s?'#fff':T.muted, border:'none', borderRadius:4, padding:'5px 10px', fontSize:11, fontWeight:600, cursor:'pointer', whiteSpace:'nowrap' }}>{s}</button>
            ))}
          </>}
        </div>

        <div style={{ display:'flex', gap:8, alignItems:'center' }}>
          <input placeholder="Search PO / supplier…" value={search} onChange={e=>setSearch(e.target.value)} style={{ background:T.surface, border:`1px solid ${T.border}`, borderRadius:5, padding:'7px 12px', color:T.text, fontSize:13, width:220, outline:'none' }} />
          <BtnGhost onClick={()=>setShowImport(true)}>⬆ Import Excel</BtnGhost>
          <BtnPrimary onClick={()=>setShowNew(true)}>+ New PO</BtnPrimary>
        </div>
      </div>

      {error && <ErrorMsg msg={error} />}
      {loading ? <Loading /> : view === 'shipments' ? (
        // ── SHIPMENTS TABLE ──
        <Card>
          <div style={{ overflowX:'auto' }}>
            <table style={{ width:'100%', borderCollapse:'collapse' }}>
              <thead>
                <tr style={{ background:T.surface }}>
                  <Th>Shipment Ref</Th><Th>Supplier</Th><Th>DC</Th><Th>Type</Th>
                  <Th>Status</Th><Th>Ex-Factory</Th><Th>ETA</Th>
                  <Th>Freight Forwarder</Th>
                  <Th style={{ textAlign:'right' }}>Units</Th>
                  <Th>Tracking #</Th>
                  <Th>Checklist</Th><Th></Th>
                </tr>
              </thead>
              <tbody>
                {filteredShipments.map((sh,i)=>(
                  <tr key={sh.id||i} className="row-hover" onClick={()=>setSelected(sh.po)}>
                    <Td style={{ fontFamily:'monospace', fontSize:11, color:T.accent, fontWeight:700 }}>{sh.shipment_ref}</Td>
                    <Td style={{ fontWeight:600, fontSize:13 }}>{sh.po?.supplier_name||sh.po?.supplier_ref}</Td>
                    <Td><DCBadge dc={sh.dc} /></Td>
                    <Td><span style={{ fontSize:10, color:T.muted, background:T.subtle, borderRadius:3, padding:'1px 6px', fontWeight:700 }}>{sh.shipment_type}</span></Td>
                    <Td><span style={{ color:shipStatusColor(sh.status), fontSize:12, fontWeight:600 }}>{sh.status}</span></Td>
                    <Td style={{ color:T.muted, fontSize:12 }}>{sh.po?.ex_factory_date||'—'}</Td>
                    <Td style={{ color:T.muted, fontSize:12 }}>{sh.eta||'—'}</Td>
                    <Td style={{ color:T.muted, fontSize:12 }}>{sh.freight_forwarder||'—'}</Td>
                    <Td style={{ textAlign:'right', fontWeight:700 }}>{(sh.units||0).toLocaleString()}</Td>
                    <Td style={{ fontFamily:'monospace', fontSize:11, color:T.muted, maxWidth:120, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{sh.tracking_number||'—'}</Td>
                    <Td>
                      <div style={{ display:'flex', gap:4 }}>
                        {[
                          {val:sh.po?.skus_created,label:'SKU'},
                          {val:sh.added_to_warehouse,label:'WH'},
                          {val:sh.quantities_verified,label:'QTY'},
                          {val:sh.stock_on_shopify,label:'SHP'},
                        ].map(c=>(
                          <span key={c.label} title={c.label} style={{ width:28, height:18, display:'flex', alignItems:'center', justifyContent:'center', background:c.val?T.greenDim:T.subtle, color:c.val?T.green:T.muted, borderRadius:3, fontSize:9, fontWeight:800, border:`1px solid ${c.val?T.green+'30':T.border}` }}>
                            {c.label}
                          </span>
                        ))}
                      </div>
                    </Td>
                    <Td style={{ color:T.muted, fontSize:16 }}>›</Td>
                  </tr>
                ))}
                {filteredShipments.length===0 && <tr><td colSpan={12} style={{ padding:32, textAlign:'center', color:T.muted }}>No shipments found</td></tr>}
              </tbody>
            </table>
          </div>
        </Card>
      ) : (
        // ── ALL POs TABLE ──
        <Card>
          <div style={{ overflowX:'auto' }}>
            <table style={{ width:'100%', borderCollapse:'collapse' }}>
              <thead>
                <tr style={{ background:T.surface }}>
                  <Th>PO Reference</Th><Th>Supplier</Th><Th>Season</Th>
                  <Th>Ex-Factory</Th><Th>Total Cost</Th><Th>Deposit</Th>
                  <Th>Shipments</Th><Th>Split Status</Th>
                  <Th>PO Checklist</Th><Th></Th>
                </tr>
              </thead>
              <tbody>
                {filteredPOs.map(po=>{
                  const isUnsplit = !(po.shipments?.length>0) && !po.po_splits_confirmed
                  const ukSh = (po.shipments||[]).filter(s=>s.dc==='UK')
                  const usSh = (po.shipments||[]).filter(s=>s.dc==='US')
                  return (
                    <tr key={po.id} className="row-hover" onClick={()=>setSelected(po)}>
                      <Td style={{ fontFamily:'monospace', fontSize:12, color:T.accent, fontWeight:700 }}>{po.id}</Td>
                      <Td style={{ fontWeight:600 }}>{po.supplier_name||po.supplier_ref}</Td>
                      <Td style={{ color:T.muted, fontSize:12 }}>{po.seasonality||'—'}</Td>
                      <Td style={{ color:T.muted, fontSize:12 }}>{po.ex_factory_date||'—'}</Td>
                      <Td style={{ fontFamily:'monospace', fontWeight:700, color:T.accent }}>{fmt(po.total_cost_value, po.currency||'USD')}</Td>
                      <Td style={{ color:T.muted, fontSize:12 }}>{fmt(po.deposit_cost_value, po.currency||'USD')}</Td>
                      <Td>
                        <div style={{ display:'flex', gap:4 }}>
                          {ukSh.length>0 && <DCBadge dc="UK" />}
                          {usSh.length>0 && <DCBadge dc="US" />}
                          {isUnsplit && <span style={{ color:T.muted, fontSize:12 }}>—</span>}
                        </div>
                      </Td>
                      <Td>
                        {isUnsplit ? (
                          <button onClick={e=>{ e.stopPropagation(); setSplitting(po) }} style={{ background:'#f59e0b20', color:T.yellow, border:'1px solid #f59e0b40', borderRadius:4, padding:'3px 10px', fontSize:11, fontWeight:700, cursor:'pointer' }}>
                            ✂ Split
                          </button>
                        ) : (
                          <span style={{ color:T.green, fontSize:12, fontWeight:600 }}>✓ Split</span>
                        )}
                      </Td>
                      <Td>
                        <div style={{ display:'flex', gap:4 }}>
                          {[
                            {val:po.skus_created,label:'SKU'},
                            {val:po.barcodes_sent,label:'BAR'},
                            {val:po.polybags_sent,label:'POL'},
                          ].map(c=>(
                            <span key={c.label} title={c.label} style={{ width:28, height:18, display:'flex', alignItems:'center', justifyContent:'center', background:c.val?T.greenDim:T.subtle, color:c.val?T.green:T.muted, borderRadius:3, fontSize:9, fontWeight:800, border:`1px solid ${c.val?T.green+'30':T.border}` }}>
                              {c.label}
                            </span>
                          ))}
                        </div>
                      </Td>
                      <Td style={{ color:T.muted, fontSize:16 }}>›</Td>
                    </tr>
                  )
                })}
                {filteredPOs.length===0 && <tr><td colSpan={10} style={{ padding:32, textAlign:'center', color:T.muted }}>No purchase orders found</td></tr>}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </Shell>
  )
}
