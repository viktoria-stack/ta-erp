'use client'
import { useEffect, useState, useCallback, useRef } from 'react'
import Shell from '@/components/Shell'
import { T, KPI, Card, Th, Td, BtnPrimary, BtnGhost, Loading, ErrorMsg, fmt } from '@/components/ui'
import { supabase } from '@/lib/supabase'

const PAGE_SIZE = 100

async function fetchInventory({ search, store, page }) {
  let query = supabase.from('inventory_restock').select('*', { count: 'exact' })

  // Store filter
  if (store === 'UK') query = query.gt('qty_uk', 0)
  else if (store === 'US') query = query.gt('qty_us', 0)
  else if (store === 'Out of stock') query = query.eq('qty_uk', 0).eq('qty_us', 0)
  else if (store === 'Low stock') query = query.or('qty_uk.lt.10,qty_us.lt.10').or('qty_uk.gt.0,qty_us.gt.0')

  // Search — done server-side via ilike
  if (search && search.length >= 2) {
    query = query.or(`product_name.ilike.%${search}%,sku.ilike.%${search}%,barcode.ilike.%${search}%,size.ilike.%${search}%`)
  }

  const from = page * PAGE_SIZE
  const { data, error, count } = await query
    .order('product_name')
    .order('size')
    .range(from, from + PAGE_SIZE - 1)

  if (error) throw error
  return { data: data || [], total: count || 0 }
}

async function fetchKPIs() {
  const { data, error } = await supabase.rpc('inventory_kpis').single()
  if (error) {
    // fallback if RPC doesn't exist
    const { data: d2 } = await supabase
      .from('inventory')
      .select('qty_uk, qty_us')
      .limit(5000)
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

export default function InventoryPage() {
  const [items, setItems] = useState([])
  const [total, setTotal] = useState(0)
  const [kpis, setKpis] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [store, setStore] = useState('All')
  const [search, setSearch] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [page, setPage] = useState(0)
  const searchTimer = useRef(null)

  const load = useCallback(async (s, st, p) => {
    setLoading(true)
    setError('')
    try {
      const { data, total } = await fetchInventory({ search: s, store: st, page: p })
      setItems(data)
      setTotal(total)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  // Load KPIs once
  useEffect(() => {
    fetchKPIs().then(setKpis).catch(() => {})
  }, [])

  // Load data when filters change
  useEffect(() => {
    load(search, store, page)
  }, [search, store, page])

  // Debounce search input
  const handleSearch = (val) => {
    setSearchInput(val)
    clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => {
      setPage(0)
      setSearch(val)
    }, 400)
  }

  const handleStore = (s) => {
    setStore(s)
    setPage(0)
  }

  const totalPages = Math.ceil(total / PAGE_SIZE)
  const qtyStyle = (qty) => ({
    textAlign: 'right',
    fontWeight: qty === 0 ? 400 : 700,
    color: qty === 0 ? T.border : qty < 10 ? T.yellow : T.text,
  })

  return (
    <Shell title="Inventory">
      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12, marginBottom: 20 }}>
        <KPI label="Total SKUs" value={kpis ? kpis.total_skus?.toLocaleString() : '…'} />
        <KPI label="🇬🇧 UK Units" value={kpis ? kpis.total_uk?.toLocaleString() : '…'} color="#3b82f6" />
        <KPI label="🇺🇸 US Units" value={kpis ? kpis.total_us?.toLocaleString() : '…'} color="#8b5cf6" />
        <KPI label="Low Stock" value={kpis ? kpis.low_stock?.toLocaleString() : '…'} color={T.yellow} />
        <KPI label="Out of Stock" value={kpis ? kpis.out_of_stock?.toLocaleString() : '…'} color={T.red} />
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {[
            { id: 'All', label: 'All' },
            { id: 'UK', label: '🇬🇧 UK in stock' },
            { id: 'US', label: '🇺🇸 US in stock' },
            { id: 'Low stock', label: '⚠ Low stock' },
            { id: 'Out of stock', label: '✕ Out of stock' },
          ].map(f => (
            <button key={f.id} onClick={() => handleStore(f.id)} style={{
              background: store === f.id ? T.accent : T.subtle,
              color: store === f.id ? '#fff' : T.muted,
              border: 'none', borderRadius: 4, padding: '5px 12px',
              fontSize: 12, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap'
            }}>{f.label}</button>
          ))}
        </div>
        <input
          placeholder="Search product, SKU, barcode…"
          value={searchInput}
          onChange={e => handleSearch(e.target.value)}
          style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 5, padding: '7px 12px', color: T.text, fontSize: 13, width: 260, outline: 'none' }}
        />
      </div>

      {error && <div style={{ color: T.red, padding: 12, marginBottom: 12, fontSize: 13 }}>⚠ {error}</div>}

      {/* Table */}
      <Card>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: T.surface }}>
                <Th>Product Name</Th>
                <Th>Size</Th>
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
              {loading ? (
                <tr><td colSpan={13} style={{ padding: 40, textAlign: 'center', color: T.muted }}>
                  <div style={{ display: 'inline-block', width: 20, height: 20, border: `2px solid ${T.border}`, borderTopColor: T.accent, borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
                </td></tr>
              ) : items.length === 0 ? (
                <tr><td colSpan={13} style={{ padding: 40, textAlign: 'center', color: T.muted }}>
                  {search ? 'No results for your search' : 'No inventory data'}
                </td></tr>
              ) : items.map((p, i) => {
                const total = (p.qty_uk || 0) + (p.qty_us || 0)
                return (
                  <tr key={p.id || i} className="row-hover">
                    <Td style={{ fontWeight: 600, maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.product_name}</Td>
                    <Td>
                      {p.size
                        ? <span style={{ background: T.subtle, color: T.text, borderRadius: 4, padding: '2px 8px', fontSize: 11, fontWeight: 700 }}>{p.size}</span>
                        : <span style={{ color: T.muted, fontSize: 12 }}>—</span>}
                    </Td>
                    <Td style={{ fontFamily: 'monospace', fontSize: 11, color: T.muted }}>{p.sku || '—'}</Td>
                    <Td style={{ fontFamily: 'monospace', fontSize: 11, color: T.muted }}>{p.barcode || '—'}</Td>
                    <Td style={qtyStyle(p.qty_uk || 0)}>{(p.qty_uk || 0).toLocaleString()}</Td>
                    <Td style={qtyStyle(p.qty_us || 0)}>{(p.qty_us || 0).toLocaleString()}</Td>
                    <Td style={{ textAlign: 'right', fontWeight: 700, color: total === 0 ? T.red : total < 20 ? T.yellow : T.text }}>
                      {total.toLocaleString()}
                    </Td>
                    <Td style={{ textAlign: 'right', color: T.muted, fontSize: 12 }}>{p.cost_price ? fmt(p.cost_price, 'GBP') : '—'}</Td>
                    <Td style={{ textAlign: 'right', color: T.accent, fontSize: 12 }}>{p.retail_price ? fmt(p.retail_price, 'GBP') : '—'}</Td>
                    <Td style={{ textAlign: 'right', color: '#3b82f6', fontWeight: p.incoming_uk > 0 ? 700 : 400 }}>{p.incoming_uk > 0 ? `+${p.incoming_uk}` : '—'}</Td>
                    <Td style={{ textAlign: 'right', fontSize: 12 }}>
                      {p.restock_date_uk
                        ? <span style={{ color: new Date(p.restock_date_uk) < new Date(Date.now() + 30*864e5) ? T.green : T.muted, fontWeight: 600 }}>{new Date(p.restock_date_uk).toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'2-digit' })}</span>
                        : <span style={{ color: p.qty_uk === 0 ? T.red : T.border }}>—</span>}
                    </Td>
                    <Td style={{ textAlign: 'right', color: '#8b5cf6', fontWeight: p.incoming_us > 0 ? 700 : 400 }}>{p.incoming_us > 0 ? `+${p.incoming_us}` : '—'}</Td>
                    <Td style={{ textAlign: 'right', fontSize: 12 }}>
                      {p.restock_date_us
                        ? <span style={{ color: new Date(p.restock_date_us) < new Date(Date.now() + 30*864e5) ? T.green : T.muted, fontWeight: 600 }}>{new Date(p.restock_date_us).toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'2-digit' })}</span>
                        : <span style={{ color: p.qty_us === 0 ? T.red : T.border }}>—</span>}
                    </Td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
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

      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </Shell>
  )
}
