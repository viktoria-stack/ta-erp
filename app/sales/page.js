'use client'
import { useEffect, useState, useMemo } from 'react'
import Shell from '@/components/Shell'
import { T, Th, Td, Loading } from '@/components/ui'

export default function SalesPage() {
  const [rows, setRows]       = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState('')
  const [search, setSearch]   = useState('')
  const [onlyWithSales, setOnlyWithSales] = useState(false)
  const [sortCol, setSortCol] = useState('total_sold')
  const [sortAsc, setSortAsc] = useState(false)

  const load = async () => {
    setLoading(true); setError('')
    try {
      const res = await fetch('/api/sales-data')
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setRows(data.rows || [])
    } catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  const filtered = useMemo(() => {
    let r = rows
    if (onlyWithSales) r = r.filter(x => x.total_sold > 0)
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      r = r.filter(x =>
        x.product_name.toLowerCase().includes(q) ||
        x.sku.toLowerCase().includes(q) ||
        x.season.toLowerCase().includes(q)
      )
    }
    return [...r].sort((a, b) => {
      const av = a[sortCol] ?? '', bv = b[sortCol] ?? ''
      const cmp = typeof av === 'number' ? av - bv : String(av).localeCompare(String(bv))
      return sortAsc ? cmp : -cmp
    })
  }, [rows, search, onlyWithSales, sortCol, sortAsc])

  const totalSold    = rows.reduce((s, r) => s + r.total_sold, 0)
  const totalUK      = rows.reduce((s, r) => s + r.uk_sold, 0)
  const totalUS      = rows.reduce((s, r) => s + r.us_sold, 0)
  const skusWithSales = rows.filter(r => r.total_sold > 0).length
  const topProduct   = [...rows].sort((a, b) => b.total_sold - a.total_sold)[0]

  const sort = (col) => {
    if (sortCol === col) setSortAsc(a => !a)
    else { setSortCol(col); setSortAsc(false) }
  }

  const SortTh = ({ col, children, right }) => (
    <Th onClick={() => sort(col)} style={{ cursor: 'pointer', textAlign: right ? 'right' : 'left', userSelect: 'none', whiteSpace: 'nowrap' }}>
      {children} {sortCol === col ? (sortAsc ? '↑' : '↓') : <span style={{ opacity: 0.3 }}>↕</span>}
    </Th>
  )

  return (
    <Shell title="Sales">
      <div style={{ maxWidth: 1300, margin: '0 auto', padding: '0 24px 40px' }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <div>
            <div style={{ fontFamily: 'Barlow Condensed', fontWeight: 800, fontSize: 28, letterSpacing: '-0.5px' }}>Sales</div>
            <div style={{ color: T.muted, fontSize: 13, marginTop: 2 }}>Core | Live Stock & Commitment — live from Google Sheets</div>
          </div>
          <button onClick={load} disabled={loading} style={{ background: T.accent, color: '#fff', border: 'none', borderRadius: 6, padding: '8px 18px', fontSize: 13, fontWeight: 700, cursor: 'pointer', opacity: loading ? 0.6 : 1 }}>
            {loading ? 'Loading…' : '↻ Refresh'}
          </button>
        </div>

        {error && (
          <div style={{ background: '#ef444415', border: '1px solid #ef444440', borderRadius: 6, padding: '10px 14px', color: '#ef4444', fontSize: 13, marginBottom: 20 }}>⚠ {error}</div>
        )}

        {/* KPI cards */}
        {!loading && rows.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 14, marginBottom: 24 }}>
            {[
              { label: 'Total Sold',    value: totalSold.toLocaleString(),    color: T.accent },
              { label: 'UK Sold',       value: totalUK.toLocaleString(),      color: '#3b82f6' },
              { label: 'US Sold',       value: totalUS.toLocaleString(),      color: '#f59e0b' },
              { label: 'SKUs Selling',  value: skusWithSales.toLocaleString(), color: T.green },
              { label: 'Top Seller',    value: topProduct?.product_name?.slice(0,35) + (topProduct?.product_name?.length > 35 ? '…' : '') || '—', sub: topProduct?.total_sold ? `${topProduct.total_sold} units` : '', color: '#a78bfa' },
            ].map(k => (
              <div key={k.label} style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 10, padding: '14px 16px' }}>
                <div style={{ fontSize: 11, color: T.muted, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>{k.label}</div>
                <div style={{ fontSize: 20, fontWeight: 800, color: k.color, lineHeight: 1.2 }}>{k.value}</div>
                {k.sub && <div style={{ fontSize: 12, color: T.muted, marginTop: 3 }}>{k.sub}</div>}
              </div>
            ))}
          </div>
        )}

        {/* Filters */}
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 16, flexWrap: 'wrap' }}>
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search product, SKU or season…"
            style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 6, padding: '8px 12px', color: T.text, fontSize: 13, outline: 'none', width: 280 }}
          />
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: T.muted, cursor: 'pointer', userSelect: 'none' }}>
            <input type="checkbox" checked={onlyWithSales} onChange={e => setOnlyWithSales(e.target.checked)} />
            Only show SKUs with sales
          </label>
          {!loading && (
            <div style={{ marginLeft: 'auto', fontSize: 12, color: T.muted }}>{filtered.length.toLocaleString()} of {rows.length.toLocaleString()} SKUs</div>
          )}
        </div>

        {/* Table */}
        {loading ? <Loading /> : (
          <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 10, overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 700 }}>
                <thead>
                  <tr style={{ background: T.surface }}>
                    <SortTh col="season">Season</SortTh>
                    <SortTh col="product_name">Product</SortTh>
                    <SortTh col="sku">SKU</SortTh>
                    <SortTh col="uk_sold" right>UK Sold</SortTh>
                    <SortTh col="us_sold" right>US Sold</SortTh>
                    <SortTh col="total_sold" right>Total Sold</SortTh>
                    <SortTh col="uk_commit" right>UK Commit</SortTh>
                    <SortTh col="us_commit" right>US Commit</SortTh>
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <tr><td colSpan={8} style={{ padding: 32, textAlign: 'center', color: T.muted, fontSize: 13 }}>No results</td></tr>
                  ) : filtered.map((r, i) => (
                    <tr key={i} style={{ borderTop: `1px solid ${T.border}`, background: r.total_sold > 0 ? 'transparent' : `${T.surface}80` }}>
                      <Td style={{ fontSize: 11, color: T.muted }}>{r.season || '—'}</Td>
                      <Td style={{ fontWeight: r.total_sold > 0 ? 600 : 400, color: r.total_sold > 0 ? T.text : T.muted, maxWidth: 320 }}>{r.product_name || '—'}</Td>
                      <Td style={{ fontFamily: 'monospace', fontSize: 12, color: T.muted }}>{r.sku}</Td>
                      <Td style={{ textAlign: 'right', color: r.uk_sold > 0 ? '#3b82f6' : T.muted, fontWeight: r.uk_sold > 0 ? 700 : 400 }}>{r.uk_sold > 0 ? r.uk_sold : '—'}</Td>
                      <Td style={{ textAlign: 'right', color: r.us_sold > 0 ? '#f59e0b' : T.muted, fontWeight: r.us_sold > 0 ? 700 : 400 }}>{r.us_sold > 0 ? r.us_sold : '—'}</Td>
                      <Td style={{ textAlign: 'right', fontWeight: 700, color: r.total_sold > 0 ? T.accent : T.muted }}>{r.total_sold > 0 ? r.total_sold : '—'}</Td>
                      <Td style={{ textAlign: 'right', color: T.muted, fontSize: 12 }}>{r.uk_commit > 0 ? r.uk_commit : '—'}</Td>
                      <Td style={{ textAlign: 'right', color: T.muted, fontSize: 12 }}>{r.us_commit > 0 ? r.us_commit : '—'}</Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </Shell>
  )
}
