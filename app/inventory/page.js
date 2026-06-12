'use client'
import { useEffect, useState, useCallback, useRef } from 'react'
import * as XLSX from 'xlsx'
import Shell from '@/components/Shell'
import { T, KPI, Card, Th, Td, BtnPrimary, BtnGhost, Loading, ErrorMsg, fmt } from '@/components/ui'
import { supabase } from '@/lib/supabase'

const PAGE_SIZE = 100
const MOV_SIZE = 50

async function fetchAllInventory({ search, store }) {
  let query = supabase.from('inventory_restock').select('*')
  if (store === 'UK') query = query.gt('qty_uk', 0)
  else if (store === 'US') query = query.gt('qty_us', 0)
  else if (store === 'Out of stock') query = query.eq('qty_uk', 0).eq('qty_us', 0)
  else if (store === 'Low stock') query = query.or('qty_uk.lt.10,qty_us.lt.10').or('qty_uk.gt.0,qty_us.gt.0')
  if (search && search.length >= 2)
    query = query.or(`product_name.ilike.%${search}%,sku.ilike.%${search}%,barcode.ilike.%${search}%,size.ilike.%${search}%`)
  const { data, error } = await query.order('product_name').order('size')
  if (error) throw error
  return data || []
}

async function fetchInventory({ search, store, page }) {
  let query = supabase.from('inventory_restock').select('*', { count: 'exact' })
  if (store === 'UK') query = query.gt('qty_uk', 0)
  else if (store === 'US') query = query.gt('qty_us', 0)
  else if (store === 'Out of stock') query = query.eq('qty_uk', 0).eq('qty_us', 0)
  else if (store === 'Low stock') query = query.or('qty_uk.lt.10,qty_us.lt.10').or('qty_uk.gt.0,qty_us.gt.0')
  if (search && search.length >= 2)
    query = query.or(`product_name.ilike.%${search}%,sku.ilike.%${search}%,barcode.ilike.%${search}%,size.ilike.%${search}%`)
  const from = page * PAGE_SIZE
  const { data, error, count } = await query.order('product_name').order('size').range(from, from + PAGE_SIZE - 1)
  if (error) throw error
  return { data: data || [], total: count || 0 }
}

async function fetchKPIs() {
  const { data, error } = await supabase.rpc('inventory_kpis').single()
  if (error) {
    const { data: d2 } = await supabase.from('inventory').select('qty_uk, qty_us').limit(5000)
    const rows = d2 || []
    return {
      total_skus: rows.length,
      total_uk: rows.reduce((s, r) => s + (r.qty_uk || 0), 0),
      total_us: rows.reduce((s, r) => s + (r.qty_us || 0), 0),
      out_of_stock: rows.filter(r => !r.qty_uk && !r.qty_us).length,
      low_stock: rows.filter(r => (r.qty_uk > 0 && r.qty_uk < 10) || (r.qty_us > 0 && r.qty_us < 10)).length,
    }
  }
  return data
}

async function fetchMovements({ search, page }) {
  let query = supabase.from('inventory_movements').select('*', { count: 'exact' })
  if (search && search.length >= 2)
    query = query.or(`sku.ilike.%${search}%,product_name.ilike.%${search}%`)
  const from = page * MOV_SIZE
  const { data, error, count } = await query
    .order('changed_at', { ascending: false })
    .range(from, from + MOV_SIZE - 1)
  if (error) throw error
  return { data: data || [], total: count || 0 }
}

async function fetchSnapshot(date) {
  const { data, error } = await supabase
    .from('inventory_snapshots')
    .select('*')
    .eq('snapshot_date', date)
    .order('product_name')
  if (error) throw error
  return data || []
}

const Delta = ({ val }) => {
  if (!val) return <span style={{ color: T.muted }}>—</span>
  const color = val > 0 ? '#22c55e' : '#ef4444'
  return <span style={{ color, fontWeight: 700 }}>{val > 0 ? `+${val}` : val}</span>
}

const fmtDateTime = (ts) => {
  if (!ts) return '—'
  const d = new Date(ts)
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' }) +
    ' ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
}

export default function InventoryPage() {
  const [view, setView] = useState('live') // 'live' | 'movements' | 'snapshot'

  // Live
  const [items, setItems] = useState([])
  const [total, setTotal] = useState(0)
  const [kpis, setKpis] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [store, setStore] = useState('All')
  const [search, setSearch] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [page, setPage] = useState(0)
  const [exporting, setExporting] = useState(false)
  const searchTimer = useRef(null)

  // Movements
  const [movements, setMovements] = useState([])
  const [movTotal, setMovTotal] = useState(0)
  const [movPage, setMovPage] = useState(0)
  const [movSearch, setMovSearch] = useState('')
  const [movSearchInput, setMovSearchInput] = useState('')
  const [movLoading, setMovLoading] = useState(false)
  const movTimer = useRef(null)

  // Snapshot
  const [snapDate, setSnapDate] = useState(new Date().toISOString().slice(0, 10))
  const [snapData, setSnapData] = useState([])
  const [snapLoading, setSnapLoading] = useState(false)
  const [snapError, setSnapError] = useState('')
  const [snapping, setSnapping] = useState(false)
  const [snapMsg, setSnapMsg] = useState('')
  const [snapSearchInput, setSnapSearchInput] = useState('')
  const [snapSearch, setSnapSearch] = useState('')
  const snapTimer = useRef(null)

  // ── Live data
  const load = useCallback(async (s, st, p) => {
    setLoading(true); setError('')
    try {
      const { data, total } = await fetchInventory({ search: s, store: st, page: p })
      setItems(data); setTotal(total)
    } catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchKPIs().then(setKpis).catch(() => {}) }, [])
  useEffect(() => { load(search, store, page) }, [search, store, page])

  const handleSearch = (val) => {
    setSearchInput(val)
    clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => { setPage(0); setSearch(val) }, 400)
  }
  const handleStore = (s) => { setStore(s); setPage(0) }

  // ── Movements
  const loadMovements = useCallback(async (s, p) => {
    setMovLoading(true)
    try {
      const { data, total } = await fetchMovements({ search: s, page: p })
      setMovements(data); setMovTotal(total)
    } catch (e) { console.error(e) }
    finally { setMovLoading(false) }
  }, [])

  useEffect(() => {
    if (view === 'movements') loadMovements(movSearch, movPage)
  }, [view, movSearch, movPage])

  const handleMovSearch = (val) => {
    setMovSearchInput(val)
    clearTimeout(movTimer.current)
    movTimer.current = setTimeout(() => { setMovPage(0); setMovSearch(val) }, 400)
  }

  // ── Snapshot
  const loadSnapshot = useCallback(async (date) => {
    setSnapLoading(true); setSnapError('')
    try {
      const data = await fetchSnapshot(date)
      setSnapData(data)
      if (data.length === 0) setSnapError('No snapshot found for this date. Snapshots are taken automatically every night at 2:00 AM.')
    } catch (e) { setSnapError(e.message) }
    finally { setSnapLoading(false) }
  }, [])

  useEffect(() => {
    if (view === 'snapshot') loadSnapshot(snapDate)
  }, [view, snapDate])

  const handleSnapSearch = (val) => {
    setSnapSearchInput(val)
    clearTimeout(snapTimer.current)
    snapTimer.current = setTimeout(() => setSnapSearch(val), 300)
  }

  const takeSnapshotNow = async () => {
    setSnapping(true); setSnapMsg('')
    try {
      const res = await fetch('/api/inventory-snapshot', { method: 'POST' })
      const data = await res.json()
      if (data.error) setSnapMsg(`Error: ${data.error}`)
      else { setSnapMsg(`✓ Snapshot saved: ${data.upserted} SKUs for ${data.date}`); loadSnapshot(snapDate) }
    } catch (e) { setSnapMsg(`Error: ${e.message}`) }
    setSnapping(false)
  }

  // ── Export
  const exportExcel = async () => {
    setExporting(true)
    try {
      const all = await fetchAllInventory({ search, store })
      const rows = all.map(p => ({
        'Product Name': p.product_name || '',
        'Size': p.size || '',
        'SKU': p.sku || '',
        'Barcode': p.barcode || '',
        'UK Qty': p.qty_uk || 0,
        'US Qty': p.qty_us || 0,
        'Total': (p.qty_uk || 0) + (p.qty_us || 0),
        'Cost Price (GBP)': p.cost_price || '',
        'Retail Price (GBP)': p.retail_price || '',
        'UK Incoming': p.incoming_uk || 0,
        'UK Restock Date': p.restock_date_uk || '',
        'US Incoming': p.incoming_us || 0,
        'US Restock Date': p.restock_date_us || '',
      }))
      const ws = XLSX.utils.json_to_sheet(rows)
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'Inventory')
      XLSX.writeFile(wb, `inventory-${store.toLowerCase().replace(/\s+/g, '-')}-${new Date().toISOString().slice(0, 10)}.xlsx`)
    } catch (e) { console.error('Export failed:', e) }
    setExporting(false)
  }

  const totalPages = Math.ceil(total / PAGE_SIZE)
  const movTotalPages = Math.ceil(movTotal / MOV_SIZE)
  const qtyStyle = (qty) => ({ textAlign: 'right', fontWeight: qty === 0 ? 400 : 700, color: qty === 0 ? T.border : qty < 10 ? T.yellow : T.text })

  const filteredSnap = snapSearch.length >= 2
    ? snapData.filter(r => r.product_name?.toLowerCase().includes(snapSearch.toLowerCase()) || r.sku?.toLowerCase().includes(snapSearch.toLowerCase()))
    : snapData

  const Tab = ({ id, label }) => (
    <button onClick={() => setView(id)} style={{
      background: view === id ? T.accent : T.subtle,
      color: view === id ? '#fff' : T.muted,
      border: 'none', borderRadius: 5, padding: '7px 18px',
      fontSize: 13, fontWeight: 600, cursor: 'pointer',
    }}>{label}</button>
  )

  return (
    <Shell title="Inventory">
      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12, marginBottom: 20 }}>
        <KPI label="Total SKUs" value={kpis ? kpis.total_skus?.toLocaleString() : '…'} />
        <KPI label="🇬🇧 ROW Units" value={kpis ? kpis.total_uk?.toLocaleString() : '…'} color="#3b82f6" />
        <KPI label="🇺🇸 US Units" value={kpis ? kpis.total_us?.toLocaleString() : '…'} color="#8b5cf6" />
        <KPI label="Low Stock" value={kpis ? kpis.low_stock?.toLocaleString() : '…'} color={T.yellow} />
        <KPI label="Out of Stock" value={kpis ? kpis.out_of_stock?.toLocaleString() : '…'} color={T.red} />
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <Tab id="live" label="📦 Live" />
        <Tab id="movements" label="🔄 Movements" />
        <Tab id="snapshot" label="📸 Snapshot" />
      </div>

      {/* ── LIVE VIEW ── */}
      {view === 'live' && <>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {[
              { id: 'All', label: 'All' },
              { id: 'UK', label: '🇬🇧 ROW in stock' },
              { id: 'US', label: '🇺🇸 US in stock' },
              { id: 'Low stock', label: '⚠ Low stock' },
              { id: 'Out of stock', label: '✕ Out of stock' },
            ].map(f => (
              <button key={f.id} onClick={() => handleStore(f.id)} style={{
                background: store === f.id ? T.accent : T.subtle,
                color: store === f.id ? '#fff' : T.muted,
                border: 'none', borderRadius: 4, padding: '5px 12px',
                fontSize: 12, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
              }}>{f.label}</button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input placeholder="Search product, SKU, barcode…" value={searchInput} onChange={e => handleSearch(e.target.value)}
              style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 5, padding: '7px 12px', color: T.text, fontSize: 13, width: 260, outline: 'none' }} />
            <BtnGhost onClick={exportExcel} disabled={exporting}>{exporting ? 'Exporting…' : '⬇ Export Excel'}</BtnGhost>
          </div>
        </div>

        {error && <div style={{ color: T.red, padding: 12, marginBottom: 12, fontSize: 13 }}>⚠ {error}</div>}

        <Card>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: T.surface }}>
                  <Th>Product Name</Th><Th>Size</Th><Th>SKU</Th><Th>Barcode</Th>
                  <Th style={{ textAlign: 'right', color: '#3b82f6' }}>🇬🇧 ROW</Th>
                  <Th style={{ textAlign: 'right', color: '#8b5cf6' }}>🇺🇸 US</Th>
                  <Th style={{ textAlign: 'right' }}>Total</Th>
                  <Th style={{ textAlign: 'right' }}>Cost</Th>
                  <Th style={{ textAlign: 'right' }}>Retail</Th>
                  <Th style={{ textAlign: 'right', color: '#3b82f6' }}>🇬🇧 Incoming</Th>
                  <Th style={{ textAlign: 'right', color: '#3b82f6' }}>🇬🇧 Restock</Th>
                  <Th style={{ textAlign: 'right', color: '#8b5cf6' }}>🇺🇸 Incoming</Th>
                  <Th style={{ textAlign: 'right', color: '#8b5cf6' }}>🇺🇸 Restock</Th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={13} style={{ padding: 40, textAlign: 'center', color: T.muted }}>
                    <div style={{ display: 'inline-block', width: 20, height: 20, border: `2px solid ${T.border}`, borderTopColor: T.accent, borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
                  </td></tr>
                ) : items.length === 0 ? (
                  <tr><td colSpan={13} style={{ padding: 40, textAlign: 'center', color: T.muted }}>
                    {search ? 'No results for your search' : 'No inventory data'}
                  </td></tr>
                ) : items.map((p, i) => {
                  const tot = (p.qty_uk || 0) + (p.qty_us || 0)
                  return (
                    <tr key={p.id || i} className="row-hover">
                      <Td style={{ fontWeight: 600, maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.product_name}</Td>
                      <Td>{p.size ? <span style={{ background: T.subtle, color: T.text, borderRadius: 4, padding: '2px 8px', fontSize: 11, fontWeight: 700 }}>{p.size}</span> : <span style={{ color: T.muted, fontSize: 12 }}>—</span>}</Td>
                      <Td style={{ fontFamily: 'monospace', fontSize: 11, color: T.muted }}>{p.sku || '—'}</Td>
                      <Td style={{ fontFamily: 'monospace', fontSize: 11, color: T.muted }}>{p.barcode || '—'}</Td>
                      <Td style={qtyStyle(p.qty_uk || 0)}>{(p.qty_uk || 0).toLocaleString()}</Td>
                      <Td style={qtyStyle(p.qty_us || 0)}>{(p.qty_us || 0).toLocaleString()}</Td>
                      <Td style={{ textAlign: 'right', fontWeight: 700, color: tot === 0 ? T.red : tot < 20 ? T.yellow : T.text }}>{tot.toLocaleString()}</Td>
                      <Td style={{ textAlign: 'right', color: T.muted, fontSize: 12 }}>{p.cost_price ? fmt(p.cost_price, 'GBP') : '—'}</Td>
                      <Td style={{ textAlign: 'right', color: T.accent, fontSize: 12 }}>{p.retail_price ? fmt(p.retail_price, 'GBP') : '—'}</Td>
                      <Td style={{ textAlign: 'right', color: '#3b82f6', fontWeight: p.incoming_uk > 0 ? 700 : 400 }}>{p.incoming_uk > 0 ? `+${p.incoming_uk}` : '—'}</Td>
                      <Td style={{ textAlign: 'right', fontSize: 12 }}>
                        {p.restock_date_uk ? <span style={{ color: new Date(p.restock_date_uk) < new Date(Date.now() + 30*864e5) ? T.green : T.muted, fontWeight: 600 }}>{new Date(p.restock_date_uk).toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'2-digit' })}</span> : <span style={{ color: p.qty_uk === 0 ? T.red : T.border }}>—</span>}
                      </Td>
                      <Td style={{ textAlign: 'right', color: '#8b5cf6', fontWeight: p.incoming_us > 0 ? 700 : 400 }}>{p.incoming_us > 0 ? `+${p.incoming_us}` : '—'}</Td>
                      <Td style={{ textAlign: 'right', fontSize: 12 }}>
                        {p.restock_date_us ? <span style={{ color: new Date(p.restock_date_us) < new Date(Date.now() + 30*864e5) ? T.green : T.muted, fontWeight: 600 }}>{new Date(p.restock_date_us).toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'2-digit' })}</span> : <span style={{ color: p.qty_us === 0 ? T.red : T.border }}>—</span>}
                      </Td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          {total > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderTop: `1px solid ${T.border}` }}>
              <span style={{ fontSize: 12, color: T.muted }}>
                Showing {(page * PAGE_SIZE + 1).toLocaleString()}–{Math.min((page + 1) * PAGE_SIZE, total).toLocaleString()} of <strong style={{ color: T.text }}>{total.toLocaleString()}</strong> variants
              </span>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <button onClick={() => setPage(0)} disabled={page === 0} style={{ background: T.subtle, border: 'none', color: page === 0 ? T.border : T.muted, borderRadius: 4, padding: '5px 10px', cursor: page === 0 ? 'default' : 'pointer', fontSize: 13 }}>«</button>
                <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0} style={{ background: T.subtle, border: 'none', color: page === 0 ? T.border : T.muted, borderRadius: 4, padding: '5px 12px', cursor: page === 0 ? 'default' : 'pointer', fontSize: 13 }}>‹ Prev</button>
                <span style={{ fontSize: 12, color: T.muted, padding: '0 8px' }}>Page {page + 1} / {totalPages}</span>
                <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1} style={{ background: T.subtle, border: 'none', color: page >= totalPages - 1 ? T.border : T.muted, borderRadius: 4, padding: '5px 12px', cursor: page >= totalPages - 1 ? 'default' : 'pointer', fontSize: 13 }}>Next ›</button>
                <button onClick={() => setPage(totalPages - 1)} disabled={page >= totalPages - 1} style={{ background: T.subtle, border: 'none', color: page >= totalPages - 1 ? T.border : T.muted, borderRadius: 4, padding: '5px 10px', cursor: page >= totalPages - 1 ? 'default' : 'pointer', fontSize: 13 }}>»</button>
              </div>
            </div>
          )}
        </Card>
      </>}

      {/* ── MOVEMENTS VIEW ── */}
      {view === 'movements' && <>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <span style={{ fontSize: 13, color: T.muted }}>Automatically logged on every inventory update</span>
          <input placeholder="Search product or SKU…" value={movSearchInput} onChange={e => handleMovSearch(e.target.value)}
            style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 5, padding: '7px 12px', color: T.text, fontSize: 13, width: 260, outline: 'none' }} />
        </div>

        <Card>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: T.surface }}>
                  <Th>Date & Time</Th><Th>Product</Th><Th>SKU</Th>
                  <Th style={{ textAlign: 'right', color: '#3b82f6' }}>🇬🇧 Before</Th>
                  <Th style={{ textAlign: 'right', color: '#3b82f6' }}>🇬🇧 After</Th>
                  <Th style={{ textAlign: 'right', color: '#3b82f6' }}>🇬🇧 Δ</Th>
                  <Th style={{ textAlign: 'right', color: '#8b5cf6' }}>🇺🇸 Before</Th>
                  <Th style={{ textAlign: 'right', color: '#8b5cf6' }}>🇺🇸 After</Th>
                  <Th style={{ textAlign: 'right', color: '#8b5cf6' }}>🇺🇸 Δ</Th>
                </tr>
              </thead>
              <tbody>
                {movLoading ? (
                  <tr><td colSpan={9} style={{ padding: 40, textAlign: 'center', color: T.muted }}>
                    <div style={{ display: 'inline-block', width: 20, height: 20, border: `2px solid ${T.border}`, borderTopColor: T.accent, borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
                  </td></tr>
                ) : movements.length === 0 ? (
                  <tr><td colSpan={9} style={{ padding: 40, textAlign: 'center', color: T.muted }}>
                    No movements yet — changes to inventory will appear here automatically
                  </td></tr>
                ) : movements.map(m => (
                  <tr key={m.id} className="row-hover">
                    <Td style={{ fontSize: 12, color: T.muted, whiteSpace: 'nowrap' }}>{fmtDateTime(m.changed_at)}</Td>
                    <Td style={{ fontWeight: 600, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.product_name || '—'}</Td>
                    <Td style={{ fontFamily: 'monospace', fontSize: 11, color: T.muted }}>{m.sku || '—'}</Td>
                    <Td style={{ textAlign: 'right', color: T.muted }}>{m.qty_uk_before}</Td>
                    <Td style={{ textAlign: 'right', fontWeight: 700 }}>{m.qty_uk_after}</Td>
                    <Td style={{ textAlign: 'right' }}><Delta val={m.qty_uk_after - m.qty_uk_before} /></Td>
                    <Td style={{ textAlign: 'right', color: T.muted }}>{m.qty_us_before}</Td>
                    <Td style={{ textAlign: 'right', fontWeight: 700 }}>{m.qty_us_after}</Td>
                    <Td style={{ textAlign: 'right' }}><Delta val={m.qty_us_after - m.qty_us_before} /></Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {movTotal > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderTop: `1px solid ${T.border}` }}>
              <span style={{ fontSize: 12, color: T.muted }}>{movTotal.toLocaleString()} total movements</span>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <button onClick={() => setMovPage(p => Math.max(0, p - 1))} disabled={movPage === 0} style={{ background: T.subtle, border: 'none', color: movPage === 0 ? T.border : T.muted, borderRadius: 4, padding: '5px 12px', cursor: movPage === 0 ? 'default' : 'pointer', fontSize: 13 }}>‹ Prev</button>
                <span style={{ fontSize: 12, color: T.muted, padding: '0 8px' }}>Page {movPage + 1} / {movTotalPages}</span>
                <button onClick={() => setMovPage(p => Math.min(movTotalPages - 1, p + 1))} disabled={movPage >= movTotalPages - 1} style={{ background: T.subtle, border: 'none', color: movPage >= movTotalPages - 1 ? T.border : T.muted, borderRadius: 4, padding: '5px 12px', cursor: movPage >= movTotalPages - 1 ? 'default' : 'pointer', fontSize: 13 }}>Next ›</button>
              </div>
            </div>
          )}
        </Card>
      </>}

      {/* ── SNAPSHOT VIEW ── */}
      {view === 'snapshot' && <>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <label style={{ fontSize: 13, color: T.muted }}>View snapshot for:</label>
            <input type="date" value={snapDate} onChange={e => setSnapDate(e.target.value)}
              style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 5, padding: '7px 12px', color: T.text, fontSize: 13, outline: 'none' }} />
            {!snapLoading && snapData.length > 0 && (
              <span style={{ fontSize: 12, color: T.muted }}>{snapData.length.toLocaleString()} SKUs</span>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input placeholder="Search product or SKU…" value={snapSearchInput} onChange={e => handleSnapSearch(e.target.value)}
              style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 5, padding: '7px 12px', color: T.text, fontSize: 13, width: 240, outline: 'none' }} />
            <BtnGhost onClick={takeSnapshotNow} disabled={snapping} style={{ fontSize: 12 }}>
              {snapping ? 'Saving…' : '📸 Take snapshot now'}
            </BtnGhost>
          </div>
        </div>

        {snapMsg && (
          <div style={{ background: snapMsg.startsWith('✓') ? '#22c55e15' : '#ef444415', border: `1px solid ${snapMsg.startsWith('✓') ? '#22c55e40' : '#ef444440'}`, borderRadius: 8, padding: '10px 16px', marginBottom: 12, fontSize: 13, color: snapMsg.startsWith('✓') ? '#22c55e' : '#ef4444' }}>
            {snapMsg}
          </div>
        )}

        <Card>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: T.surface }}>
                  <Th>Product Name</Th><Th>SKU</Th>
                  <Th style={{ textAlign: 'right', color: '#3b82f6' }}>🇬🇧 ROW</Th>
                  <Th style={{ textAlign: 'right', color: '#8b5cf6' }}>🇺🇸 US</Th>
                  <Th style={{ textAlign: 'right' }}>Total</Th>
                </tr>
              </thead>
              <tbody>
                {snapLoading ? (
                  <tr><td colSpan={5} style={{ padding: 40, textAlign: 'center', color: T.muted }}>
                    <div style={{ display: 'inline-block', width: 20, height: 20, border: `2px solid ${T.border}`, borderTopColor: T.accent, borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
                  </td></tr>
                ) : snapError ? (
                  <tr><td colSpan={5} style={{ padding: 40, textAlign: 'center', color: T.muted, fontSize: 13 }}>{snapError}</td></tr>
                ) : filteredSnap.length === 0 ? (
                  <tr><td colSpan={5} style={{ padding: 40, textAlign: 'center', color: T.muted }}>No results</td></tr>
                ) : filteredSnap.map(r => {
                  const tot = (r.qty_uk || 0) + (r.qty_us || 0)
                  return (
                    <tr key={r.id} className="row-hover">
                      <Td style={{ fontWeight: 600 }}>{r.product_name || '—'}</Td>
                      <Td style={{ fontFamily: 'monospace', fontSize: 11, color: T.muted }}>{r.sku || '—'}</Td>
                      <Td style={qtyStyle(r.qty_uk || 0)}>{(r.qty_uk || 0).toLocaleString()}</Td>
                      <Td style={qtyStyle(r.qty_us || 0)}>{(r.qty_us || 0).toLocaleString()}</Td>
                      <Td style={{ textAlign: 'right', fontWeight: 700, color: tot === 0 ? T.red : tot < 20 ? T.yellow : T.text }}>{tot.toLocaleString()}</Td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          {!snapLoading && !snapError && snapData.length > 0 && (
            <div style={{ padding: '10px 16px', borderTop: `1px solid ${T.border}`, display: 'flex', gap: 20 }}>
              <span style={{ fontSize: 12, color: T.muted }}>🇬🇧 ROW total: <strong style={{ color: '#3b82f6' }}>{snapData.reduce((s, r) => s + (r.qty_uk || 0), 0).toLocaleString()}</strong></span>
              <span style={{ fontSize: 12, color: T.muted }}>🇺🇸 US total: <strong style={{ color: '#8b5cf6' }}>{snapData.reduce((s, r) => s + (r.qty_us || 0), 0).toLocaleString()}</strong></span>
            </div>
          )}
        </Card>
      </>}

      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </Shell>
  )
}
