'use client'
import { useEffect, useState, useMemo } from 'react'
import Shell from '@/components/Shell'
import { T, Th, Td, Loading } from '@/components/ui'

const DATE_PRESETS = [
  { label: 'Last 7 days',  start: '7daysAgo',   end: 'today' },
  { label: 'Last 30 days', start: '30daysAgo',  end: 'today' },
  { label: 'Last 90 days', start: '90daysAgo',  end: 'today' },
  { label: 'This year',    start: '2025-01-01', end: 'today' },
  { label: 'All time',     start: '2020-01-01', end: 'today' },
]

const fmt = (n, currency = 'GBP') =>
  new Intl.NumberFormat('en-GB', { style: 'currency', currency, maximumFractionDigits: 0 }).format(n)

export default function SalesPage() {
  const [rows, setRows]       = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState('')
  const [search, setSearch]   = useState('')
  const [onlyWithSales, setOnlyWithSales] = useState(true)
  const [sortCol, setSortCol] = useState('units_sold')
  const [sortAsc, setSortAsc] = useState(false)
  const [preset, setPreset]   = useState(1) // 30 days default
  const [dateRange, setDateRange] = useState(null)

  const load = async (p = preset) => {
    setLoading(true); setError('')
    try {
      const { start, end } = DATE_PRESETS[p]
      const res = await fetch(`/api/sales-data?start=${start}&end=${end}`)
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setRows(data.rows || [])
      setDateRange(data.dateRange)
    } catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  const filtered = useMemo(() => {
    let r = rows
    if (onlyWithSales) r = r.filter(x => x.units_sold > 0)
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      r = r.filter(x => x.product_name.toLowerCase().includes(q) || x.sku.toLowerCase().includes(q))
    }
    return [...r].sort((a, b) => {
      const av = a[sortCol] ?? '', bv = b[sortCol] ?? ''
      const cmp = typeof av === 'number' ? av - bv : String(av).localeCompare(String(bv))
      return sortAsc ? cmp : -cmp
    })
  }, [rows, search, onlyWithSales, sortCol, sortAsc])

  const totalUnits   = rows.reduce((s, r) => s + r.units_sold, 0)
  const totalRevenue = rows.reduce((s, r) => s + r.revenue,    0)
  const skusSelling  = rows.filter(r => r.units_sold > 0).length
  const topProduct   = rows[0]

  const sort = col => {
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
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 24px 40px' }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
          <div>
            <div style={{ fontFamily: 'Barlow Condensed', fontWeight: 800, fontSize: 28, letterSpacing: '-0.5px' }}>Sales</div>
            <div style={{ color: T.muted, fontSize: 13, marginTop: 2 }}>Google Analytics 4 — e-commerce data</div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            {DATE_PRESETS.map((p, i) => (
              <button key={i} onClick={() => { setPreset(i); load(i) }}
                style={{ background: preset === i ? T.accent : T.surface, color: preset === i ? '#fff' : T.muted, border: `1px solid ${preset === i ? T.accent : T.border}`, borderRadius: 6, padding: '6px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {error && (
          <div style={{ background: '#ef444415', border: '1px solid #ef444440', borderRadius: 6, padding: '10px 14px', color: '#ef4444', fontSize: 13, marginBottom: 20 }}>⚠ {error}</div>
        )}

        {/* KPI cards */}
        {!loading && rows.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 24 }}>
            {[
              { label: 'Total Units Sold', value: totalUnits.toLocaleString(),  color: T.accent },
              { label: 'Total Revenue',    value: fmt(totalRevenue),             color: T.green },
              { label: 'SKUs Selling',     value: skusSelling.toLocaleString(), color: '#3b82f6' },
              { label: 'Top Seller',       value: topProduct?.product_name?.slice(0,32) + (topProduct?.product_name?.length > 32 ? '…' : '') || '—',
                                           sub:   topProduct ? `${topProduct.units_sold} units · ${fmt(topProduct.revenue)}` : '', color: '#a78bfa' },
            ].map(k => (
              <div key={k.label} style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 10, padding: '16px 18px' }}>
                <div style={{ fontSize: 11, color: T.muted, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>{k.label}</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: k.color, lineHeight: 1.2 }}>{k.value}</div>
                {k.sub && <div style={{ fontSize: 12, color: T.muted, marginTop: 4 }}>{k.sub}</div>}
              </div>
            ))}
          </div>
        )}

        {/* Filters */}
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 16, flexWrap: 'wrap' }}>
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search product or SKU…"
            style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 6, padding: '8px 12px', color: T.text, fontSize: 13, outline: 'none', width: 260 }}
          />
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: T.muted, cursor: 'pointer', userSelect: 'none' }}>
            <input type="checkbox" checked={onlyWithSales} onChange={e => setOnlyWithSales(e.target.checked)} />
            Only show SKUs with sales
          </label>
          {!loading && (
            <div style={{ marginLeft: 'auto', fontSize: 12, color: T.muted }}>{filtered.length.toLocaleString()} SKUs</div>
          )}
        </div>

        {/* Table */}
        {loading ? <Loading /> : (
          <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 10, overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 500 }}>
                <thead>
                  <tr style={{ background: T.surface }}>
                    <SortTh col="product_name">Product</SortTh>
                    <SortTh col="sku">SKU</SortTh>
                    <SortTh col="units_sold" right>Units Sold</SortTh>
                    <SortTh col="revenue" right>Revenue</SortTh>
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <tr><td colSpan={4} style={{ padding: 32, textAlign: 'center', color: T.muted, fontSize: 13 }}>No results</td></tr>
                  ) : filtered.map((r, i) => (
                    <tr key={i} style={{ borderTop: `1px solid ${T.border}` }}>
                      <Td style={{ fontWeight: 600 }}>{r.product_name || '—'}</Td>
                      <Td style={{ fontFamily: 'monospace', fontSize: 12, color: T.muted }}>{r.sku || '—'}</Td>
                      <Td style={{ textAlign: 'right', fontWeight: 700, color: T.accent }}>{r.units_sold.toLocaleString()}</Td>
                      <Td style={{ textAlign: 'right', color: T.green, fontWeight: 600 }}>{fmt(r.revenue)}</Td>
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
