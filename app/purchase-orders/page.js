'use client'
import { useEffect, useState, useRef } from 'react'
import * as XLSX from 'xlsx'
import Shell from '@/components/Shell'
import {
  T, KPI, Card, Badge, Th, Td, Input, BtnPrimary, BtnGhost, Modal,
  SIZES, WAREHOUSES, CURRENCIES, PO_STATUSES, fmt, Loading, ErrorMsg
} from '@/components/ui'
import {
  getPurchaseOrders, getSuppliers,
  createPurchaseOrder, updatePurchaseOrder
} from '@/lib/supabase'

const lineTotal = (l) => ((l.qty_uk || 0) + (l.qty_usa || 0)) * (l.cost_price || 0)
const poGrandTotal = (po) => (po.po_lines || []).reduce((s, l) => s + lineTotal(l), 0)
const poTotalUnits = (po) => (po.po_lines || []).reduce((s, l) => s + (l.qty_uk || 0) + (l.qty_usa || 0), 0)
const EMPTY_LINE = { product_name: '', size: 'M', cost_price: '', design_ref: '', colour_code: '', sku: '', qty_uk: 0, qty_usa: 0, confirmed_xf: 0 }

function PODetail({ po, onClose, onSaved }) {
  const [status, setStatus] = useState(po.status)
  const [notes, setNotes] = useState(po.notes || '')
  const [saving, setSaving] = useState(false)
  const lines = po.po_lines || []
  const totalUK = lines.reduce((s, l) => s + (l.qty_uk || 0), 0)
  const totalUSA = lines.reduce((s, l) => s + (l.qty_usa || 0), 0)
  const totalXF = lines.reduce((s, l) => s + (l.confirmed_xf || 0), 0)
  const total = poGrandTotal(po)

  return (
    <Modal title={`Purchase Order — ${po.id}`} width={1200} onClose={onClose}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12, marginBottom: 24 }}>
        {[
          { label: 'Supplier', value: po.supplier_name },
          { label: 'Warehouse', value: po.warehouse },
          { label: 'Currency', value: po.currency },
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
        <div style={{ fontFamily: 'Barlow Condensed', fontWeight: 700, fontSize: 14, color: T.muted, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>Line Items</div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 1000 }}>
            <thead>
              <tr style={{ background: T.surface }}>
                <Th>Product Name</Th>
                <Th>Size</Th>
                <Th>Design Ref.</Th>
                <Th>Colour Code</Th>
                <Th>SKU</Th>
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
                  <Td>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      {l.colour_code && <span style={{ width: 12, height: 12, borderRadius: 2, background: l.colour_code.startsWith('#') ? l.colour_code : T.subtle, border: `1px solid ${T.border}`, flexShrink: 0 }} />}
                      <span style={{ color: T.muted, fontSize: 12 }}>{l.colour_code || '—'}</span>
                    </span>
                  </Td>
                  <Td style={{ color: T.muted, fontFamily: 'monospace', fontSize: 11 }}>{l.sku || '—'}</Td>
                  <Td style={{ textAlign: 'right', color: T.muted }}>{fmt(l.cost_price, po.currency)}</Td>
                  <Td style={{ textAlign: 'right', fontWeight: 600 }}>{(l.qty_uk || 0).toLocaleString()}</Td>
                  <Td style={{ textAlign: 'right', fontWeight: 600 }}>{(l.qty_usa || 0).toLocaleString()}</Td>
                  <Td style={{ textAlign: 'right', color: T.green, fontWeight: 700 }}>{(l.confirmed_xf || 0).toLocaleString()}</Td>
                  <Td style={{ textAlign: 'right', color: T.accent, fontWeight: 700 }}>{fmt(lineTotal(l), po.currency)}</Td>
                </tr>
              ))}
              <tr style={{ background: T.surface, borderTop: `2px solid ${T.border}` }}>
                <Td colSpan={6} style={{ fontWeight: 700 }}>TOTALS</Td>
                <Td style={{ textAlign: 'right', fontWeight: 800, fontSize: 14 }}>{totalUK.toLocaleString()}</Td>
                <Td style={{ textAlign: 'right', fontWeight: 800, fontSize: 14 }}>{totalUSA.toLocaleString()}</Td>
                <Td style={{ textAlign: 'right', fontWeight: 800, fontSize: 14, color: T.green }}>{totalXF.toLocaleString()}</Td>
                <Td style={{ textAlign: 'right', fontWeight: 800, fontSize: 16, color: T.accent }}>{fmt(total, po.currency)}</Td>
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
        <BtnPrimary onClick={async () => { setSaving(true); await updatePurchaseOrder(po.id, { status, notes }); onSaved(); onClose(); }} disabled={saving}>{saving ? 'Saving…' : 'Save Changes'}</BtnPrimary>
      </div>
    </Modal>
  )
}

function NewPOModal({ suppliers, onClose, onSaved }) {
  const [supplier, setSupplier] = useState(suppliers[0]?.name || '')
  const [warehouse, setWarehouse] = useState(WAREHOUSES[0])
  const [currency, setCurrency] = useState('GBP')
  const [delivery, setDelivery] = useState('')
  const [notes, setNotes] = useState('')
  const [lines, setLines] = useState([{ ...EMPTY_LINE }])
  const [saving, setSaving] = useState(false)
  const s = { background: T.surface, border: `1px solid ${T.border}`, borderRadius: 4, padding: '5px 7px', color: T.text, fontSize: 12, outline: 'none', width: '100%' }

  const upd = (i, f, v) => { const l = [...lines]; l[i] = { ...l[i], [f]: v }; setLines(l) }

  return (
    <Modal title="New Purchase Order" width={1300} onClose={onClose}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 12, marginBottom: 20 }}>
        <Input label="Supplier" value={supplier} onChange={setSupplier} options={suppliers.filter(s => s.status === 'Active').map(s => s.name)} />
        <Input label="Warehouse" value={warehouse} onChange={setWarehouse} options={WAREHOUSES} />
        <Input label="Currency" value={currency} onChange={setCurrency} options={CURRENCIES} />
        <Input label="Expected Delivery" value={delivery} onChange={setDelivery} type="date" />
      </div>
      <div style={{ overflowX: 'auto', marginBottom: 16 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 1100 }}>
          <thead>
            <tr style={{ background: T.surface }}>
              <Th style={{ minWidth: 150 }}>Product Name</Th>
              <Th style={{ minWidth: 70 }}>Size</Th>
              <Th style={{ minWidth: 110 }}>Design Ref.</Th>
              <Th style={{ minWidth: 100 }}>Colour Code</Th>
              <Th style={{ minWidth: 140 }}>SKU</Th>
              <Th style={{ minWidth: 90, textAlign: 'right' }}>Cost Price</Th>
              <Th style={{ minWidth: 75, textAlign: 'right' }}>UK Qty</Th>
              <Th style={{ minWidth: 75, textAlign: 'right' }}>USA Qty</Th>
              <Th style={{ minWidth: 100, textAlign: 'right' }}>Confirmed XF</Th>
              <Th style={{ textAlign: 'right' }}>Total</Th>
              <Th></Th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l, i) => (
              <tr key={i} style={{ borderBottom: `1px solid ${T.border}` }}>
                <Td><input value={l.product_name} onChange={e => upd(i,'product_name',e.target.value)} placeholder="Product name" style={s} /></Td>
                <Td><select value={l.size} onChange={e => upd(i,'size',e.target.value)} style={s}>{SIZES.map(sz => <option key={sz}>{sz}</option>)}</select></Td>
                <Td><input value={l.design_ref} onChange={e => upd(i,'design_ref',e.target.value)} placeholder="TA-SS24-001" style={s} /></Td>
                <Td><input value={l.colour_code} onChange={e => upd(i,'colour_code',e.target.value)} placeholder="BLK / #000000" style={s} /></Td>
                <Td><input value={l.sku} onChange={e => upd(i,'sku',e.target.value)} placeholder="TA-COMP-001-M" style={s} /></Td>
                <Td><input type="number" min="0" step="0.01" value={l.cost_price} onChange={e => upd(i,'cost_price',e.target.value)} style={{...s,textAlign:'right'}} /></Td>
                <Td><input type="number" min="0" value={l.qty_uk} onChange={e => upd(i,'qty_uk',+e.target.value)} style={{...s,textAlign:'right'}} /></Td>
                <Td><input type="number" min="0" value={l.qty_usa} onChange={e => upd(i,'qty_usa',+e.target.value)} style={{...s,textAlign:'right'}} /></Td>
                <Td><input type="number" min="0" value={l.confirmed_xf} onChange={e => upd(i,'confirmed_xf',+e.target.value)} style={{...s,textAlign:'right'}} /></Td>
                <Td style={{ textAlign:'right', color:T.accent, fontWeight:700, fontSize:13 }}>{fmt(lineTotal(l),currency)}</Td>
                <Td><button onClick={() => setLines(lines.filter((_,j)=>j!==i))} style={{background:'none',border:'none',color:T.red,cursor:'pointer',fontSize:16}}>×</button></Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
        <BtnGhost onClick={() => setLines([...lines,{...EMPTY_LINE}])}>+ Add Line</BtnGhost>
        <div style={{ fontFamily:'Barlow Condensed', fontSize:20, fontWeight:800, color:T.accent }}>Total: {fmt(lines.reduce((s,l)=>s+lineTotal(l),0),currency)}</div>
      </div>
      <Input label="Notes" value={notes} onChange={setNotes} placeholder="Any instructions..." style={{ marginBottom:20 }} />
      <div style={{ display:'flex', justifyContent:'flex-end', gap:10 }}>
        <BtnGhost onClick={onClose}>Cancel</BtnGhost>
        <BtnPrimary disabled={saving} onClick={async()=>{setSaving(true);const sup=suppliers.find(s=>s.name===supplier);await createPurchaseOrder({supplier_id:sup?.id,supplier_name:supplier,warehouse,currency,expected_delivery:delivery||null,notes,status:'Draft'},lines.map(l=>({...l,cost_price:parseFloat(l.cost_price)||0})));onSaved();onClose();}}>{saving?'Creating…':'Create PO'}</BtnPrimary>
      </div>
    </Modal>
  )
}

function ImportModal({ suppliers, onClose, onSaved }) {
  const [rows, setRows] = useState(null)
  const [mapping, setMapping] = useState({})
  const [error, setError] = useState('')
  const [supplier, setSupplier] = useState(suppliers[0]?.name || '')
  const [warehouse, setWarehouse] = useState(WAREHOUSES[0])
  const [currency, setCurrency] = useState('GBP')
  const [saving, setSaving] = useState(false)
  const fileRef = useRef()

  const FIELDS = [
    { key:'product_name', label:'Product Name' }, { key:'size', label:'Size' },
    { key:'cost_price', label:'Cost Price' }, { key:'design_ref', label:'Design Ref.' },
    { key:'colour_code', label:'Colour Code' }, { key:'sku', label:'SKU' },
    { key:'qty_uk', label:'UK Quantity' }, { key:'qty_usa', label:'USA Quantity' },
    { key:'confirmed_xf', label:'Confirmed XF @ Booking' },
  ]

  const handleFile = e => {
    const file = e.target.files[0]; if (!file) return
    const reader = new FileReader()
    reader.onload = evt => {
      try {
        const wb = XLSX.read(evt.target.result,{type:'binary'})
        const data = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{header:1})
        if (data.length < 2) { setError('Sheet is empty'); return }
        const h = data[0].map(String)
        setMapping({
          product_name: h.find(x=>/product|name/i.test(x))||'',
          size:         h.find(x=>/^size$/i.test(x))||'',
          cost_price:   h.find(x=>/cost|price/i.test(x))||'',
          design_ref:   h.find(x=>/design|ref/i.test(x))||'',
          colour_code:  h.find(x=>/colou?r|code/i.test(x))||'',
          sku:          h.find(x=>/^sku$/i.test(x))||'',
          qty_uk:       h.find(x=>/uk.?qty|uk.?quant/i.test(x))||'',
          qty_usa:      h.find(x=>/us[a]?.?qty|us[a]?.?quant/i.test(x))||'',
          confirmed_xf: h.find(x=>/confirm|xf|booking/i.test(x))||'',
        })
        setRows(data); setError('')
      } catch { setError('Could not read file. Use .xlsx or .xls') }
    }
    reader.readAsBinaryString(file)
  }

  const doImport = async () => {
    setSaving(true)
    const h = rows[0].map(String)
    const idx = k => h.indexOf(mapping[k])
    const lines = rows.slice(1).filter(r=>r.length>1&&r[idx('product_name')]).map(r=>({
      product_name: String(r[idx('product_name')]||''),
      size:         String(r[idx('size')]||'M'),
      cost_price:   parseFloat(r[idx('cost_price')])||0,
      design_ref:   String(r[idx('design_ref')]||''),
      colour_code:  String(r[idx('colour_code')]||''),
      sku:          String(r[idx('sku')]||''),
      qty_uk:       parseInt(r[idx('qty_uk')])||0,
      qty_usa:      parseInt(r[idx('qty_usa')])||0,
      confirmed_xf: parseInt(r[idx('confirmed_xf')])||0,
    }))
    const sup = suppliers.find(s=>s.name===supplier)
    await createPurchaseOrder({supplier_id:sup?.id,supplier_name:supplier,warehouse,currency,status:'Draft',notes:'Imported from Excel'},lines)
    onSaved(); onClose()
  }

  const headers = rows ? rows[0].map(String) : []

  return (
    <Modal title="Import PO from Excel" width={800} onClose={onClose}>
      <div onClick={()=>fileRef.current.click()} style={{ background:T.surface, border:`2px dashed ${T.border}`, borderRadius:8, padding:28, textAlign:'center', marginBottom:20, cursor:'pointer' }}>
        <div style={{ fontSize:32, marginBottom:8 }}>📊</div>
        <div style={{ color:T.text, fontWeight:600, marginBottom:4 }}>Click to select Excel file</div>
        <div style={{ color:T.muted, fontSize:12 }}>Columns: Product Name · Size · Cost Price · Design Ref. · Colour Code · SKU · UK Quantity · USA Quantity · Confirmed XF @ Booking</div>
        <input ref={fileRef} type="file" accept=".xlsx,.xls" onChange={handleFile} style={{ display:'none' }} />
      </div>
      {error && <div style={{ color:T.red, background:T.redDim, border:`1px solid ${T.red}40`, borderRadius:5, padding:'10px 14px', marginBottom:16, fontSize:13 }}>{error}</div>}
      {rows && (
        <>
          <div style={{ color:T.green, background:T.greenDim, border:`1px solid ${T.green}40`, borderRadius:5, padding:'10px 14px', marginBottom:16, fontSize:13 }}>✓ Loaded {rows.length-1} rows — check mapping below:</div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:12, marginBottom:20 }}>
            {FIELDS.map(f=><Input key={f.key} label={f.label} value={mapping[f.key]||''} onChange={v=>setMapping({...mapping,[f.key]:v})} options={['(skip)',...headers]} />)}
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:12, marginBottom:20 }}>
            <Input label="Supplier" value={supplier} onChange={setSupplier} options={suppliers.map(s=>s.name)} />
            <Input label="Warehouse" value={warehouse} onChange={setWarehouse} options={WAREHOUSES} />
            <Input label="Currency" value={currency} onChange={setCurrency} options={CURRENCIES} />
          </div>
          <div style={{ display:'flex', justifyContent:'flex-end', gap:10 }}>
            <BtnGhost onClick={onClose}>Cancel</BtnGhost>
            <BtnPrimary onClick={doImport} disabled={saving}>{saving?'Importing…':'Import as Draft PO'}</BtnPrimary>
          </div>
        </>
      )}
    </Modal>
  )
}

export default function PurchaseOrdersPage() {
  const [pos, setPos] = useState([])
  const [suppliers, setSuppliers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState('All')
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState(null)
  const [showNew, setShowNew] = useState(false)
  const [showImport, setShowImport] = useState(false)

  const load = () => { setLoading(true); Promise.all([getPurchaseOrders(),getSuppliers()]).then(([p,s])=>{setPos(p);setSuppliers(s)}).catch(e=>setError(e.message)).finally(()=>setLoading(false)) }
  useEffect(()=>{ load() },[])

  const filtered = pos.filter(po=>(filter==='All'||po.status===filter)&&(!search||po.id.includes(search)||(po.supplier_name||'').toLowerCase().includes(search.toLowerCase())))

  return (
    <Shell title="Purchase Orders">
      {selected && <PODetail po={selected} onClose={()=>setSelected(null)} onSaved={load} />}
      {showNew && <NewPOModal suppliers={suppliers} onClose={()=>setShowNew(false)} onSaved={load} />}
      {showImport && <ImportModal suppliers={suppliers} onClose={()=>setShowImport(false)} onSaved={load} />}

      <div style={{ display:'grid', gridTemplateColumns:'repeat(5,1fr)', gap:12, marginBottom:20 }}>
        <KPI label="Total POs" value={pos.length} />
        <KPI label="Total Value" value={fmt(pos.reduce((s,p)=>s+poGrandTotal(p),0),'GBP')} color={T.accent} />
        <KPI label="In Production" value={pos.filter(p=>p.status==='In Production').length} color={T.yellow} />
        <KPI label="Shipped" value={pos.filter(p=>p.status==='Shipped').length} color={T.accent} />
        <KPI label="Received" value={pos.filter(p=>p.status==='Received').length} color={T.green} />
      </div>

      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16, flexWrap:'wrap', gap:10 }}>
        <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
          {['All',...PO_STATUSES].map(s=>(
            <button key={s} onClick={()=>setFilter(s)} style={{ background:filter===s?T.accent:T.subtle, color:filter===s?'#fff':T.muted, border:'none', borderRadius:4, padding:'5px 12px', fontSize:12, fontWeight:600, cursor:'pointer' }}>{s}</button>
          ))}
        </div>
        <div style={{ display:'flex', gap:8, alignItems:'center' }}>
          <input placeholder="Search PO / supplier…" value={search} onChange={e=>setSearch(e.target.value)} style={{ background:T.surface, border:`1px solid ${T.border}`, borderRadius:5, padding:'7px 12px', color:T.text, fontSize:13, width:220, outline:'none' }} />
          <BtnGhost onClick={()=>setShowImport(true)}>⬆ Import Excel</BtnGhost>
          <BtnPrimary onClick={()=>setShowNew(true)}>+ New PO</BtnPrimary>
        </div>
      </div>

      {error && <ErrorMsg msg={error} />}
      {loading ? <Loading /> : (
        <Card>
          <div style={{ overflowX:'auto' }}>
            <table style={{ width:'100%', borderCollapse:'collapse' }}>
              <thead>
                <tr style={{ background:T.surface }}>
                  <Th>PO Number</Th><Th>Supplier</Th><Th>Warehouse</Th>
                  <Th>Created</Th><Th>Expected Delivery</Th>
                  <Th style={{ textAlign:'right' }}>Lines</Th>
                  <Th style={{ textAlign:'right' }}>Total Units</Th>
                  <Th style={{ textAlign:'right' }}>Value</Th>
                  <Th>Status</Th><Th></Th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(po=>(
                  <tr key={po.id} className="row-hover" onClick={()=>setSelected(po)}>
                    <Td style={{ fontFamily:'monospace', fontSize:12, color:T.accent, fontWeight:700 }}>{po.id}</Td>
                    <Td style={{ fontWeight:600 }}>{po.supplier_name}</Td>
                    <Td style={{ color:T.muted, fontSize:12 }}>{po.warehouse}</Td>
                    <Td style={{ color:T.muted, fontSize:12 }}>{po.created_at?.split('T')[0]}</Td>
                    <Td style={{ color:T.muted, fontSize:12 }}>{po.expected_delivery||'—'}</Td>
                    <Td style={{ textAlign:'right', color:T.muted }}>{(po.po_lines||[]).length}</Td>
                    <Td style={{ textAlign:'right', fontWeight:600 }}>{poTotalUnits(po).toLocaleString()}</Td>
                    <Td style={{ textAlign:'right', fontWeight:700, color:T.accent, fontFamily:'monospace' }}>{fmt(poGrandTotal(po),po.currency)}</Td>
                    <Td><Badge status={po.status} /></Td>
                    <Td style={{ color:T.muted, fontSize:16 }}>›</Td>
                  </tr>
                ))}
                {filtered.length===0&&<tr><td colSpan={10} style={{ padding:32, textAlign:'center', color:T.muted }}>No purchase orders found</td></tr>}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </Shell>
  )
}
