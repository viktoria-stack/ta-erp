'use client'
import { useEffect, useState, useMemo } from 'react'
import Shell from '@/components/Shell'
import { T, Th, Td, Loading } from '@/components/ui'

const fmt = (n, currency = 'GBP') =>
  new Intl.NumberFormat('en-GB', { style: 'currency', currency, maximumFractionDigits: 0 }).format(n)

const num = v => Number(v) || 0

export default function SalesPage() {
  const [rows, setRows]       = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState('')
  const [search, setSearch]   = useState('')
  const [onlyWithSales, setOnlyWithSales] = useState(true)
  const [sortCol, setSortCol] = useState('sold_total')
  const [sortAsc, setSortAsc] = useState(false)

  useEffect(() => {
    setLoading(true)
    fetch('/api/sales-data')
      .then(r => r.json())
      .then(data => {
        if (data.error) throw new Error(data.error)
        setRows(data.rows || [])
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  const filtered = useMemo(() => {
    let r = rows
    if (onlyWithSales) r = r.filter(x => num(x.sold_total) > 0 || num(x.sold_row) > 0 || num(x.sold_us) > 0)
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      r = r.filter(x =>
        (x.product_name || '').toLowerCase().includes(q) ||
        (x.sku || '').toLowerCase().includes(q) ||
        (x.season || '').toLowerCase().includes(q)
      )
    }
    return [...r].sort((a, b) => {
      const av = a[sortCol] ?? '', bv = b[sortCol] ?? ''
      const cmp = typeof av === 'number' ? av - bv : String(av).localeCompare(String(bv))
      return sortAsc ? cmp : -cmp
    })
  }, [rows, search, onlyWithSales, sortCol, sortAsc])

  const totalStockRow   = rows.reduce((s, r) => s + num(r.stock_row), 0)
  const totalStockUs    = rows.reduce((s, r) => s + num(r.stock_us), 0)
  const totalSoldLW     = rows.reduce((s, r) => s + num(r.sold_total), 0)
  const totalCostValue  = rows.reduce((s, r) => s + num(r.cost_row) + num(r.cost_us), 0)
  const avgWeeksCover   = rows.filter(r => num(r.weeks_total) > 0).length > 0
    ? rows.reduce((s, r) => s + num(r.weeks_total), 0) / rows.filter(r => num(r.weeks_total) > 0).length
    : 0

  const sort = col => {
    if (sortCol === col) setSortAsc(a => !a)
    else { setSortCol(col); setSortAsc(false) }
  }

  const SortTh = ({ col, children, right }) => (
    <Th onClick={() => sort(col)} style={{ cursor: 'pointer', textAlign: right ? 'right' : 'left', userSelect: 'none', whiteSpace: 'nowrap' }}>
      {children} {sortCol === col ? (sortAsc ? '↑' : '↓') : <span style={{ opacity: 0.3 }}>↕</span>}
    </Th>
  )

  const NumTd = ({ v, color }) => (
    <Td style={{ textAlign: 'right', color: color || T.text, fontVariantNumeric: 'tabular-nums' }}>
      {num(v) === 0 ? <span style={{ color: T.muted }}>—</span> : num(v).toLocaleString()}
    </Td>
  )

  return (
    <Shell title="Sales">
      <div style={{ maxWidth: 1400, margin: '0 auto', padding: '0 24px 40px' }}>

        {/* Header */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontFamily: 'Barlow Condensed', fontWeight: 800, fontSize: 28, letterSpacing: '-0.5px' }}>Live Stock & Sales</div>
          <div style={{ color: T.muted, fontSize: 13, marginTop: 2 }}>Core | Live Stock & Commitment — Google Sheets</div>
        </div>

        {error && (
          <div style={{ background: '#ef444415', border: '1px solid #ef444440', borderRadius: 6, padding: '10px 14px', color: '#ef4444', fontSize: 13, marginBottom: 20 }}>⚠ {error}</div>
        )}

        {/* KPI cards */}
        {!loading && rows.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 24 }}>
            {[
              { label: 'Stock ROW',         value: totalStockRow.toLocaleString(),  color: T.accent },
              { label: 'Stock US',           value: totalStockUs.toLocaleString(),   color: '#3b82f6' },
              { label: 'Sold Last Week',     value: totalSoldLW.toLocaleString(),    color: T.green },
              { label: 'Total Cost Value',   value: fmt(totalCostValue),             color: '#a78bfa' },
            ].map(k => (
              <div key={k.label} style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 10, padding: '16px 18px' }}>
                <div style={{ fontSize: 11, color: T.muted, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>{k.label}</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: k.color, lineHeight: 1.2 }}>{k.value}</div>
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
            <div style={{ marginLeft: 'auto', fontSize: 12, color: T.muted }}>{filtered.length.toLocaleString()} SKUs</div>
          )}
        </div>

        {/* Table */}
        {loading ? <Loading /> : (
          <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 10, overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 900 }}>
                <thead>
                  <tr style={{ background: T.surface }}>
                    <SortTh col="season">Season</SortTh>
                    <SortTh col="product_name">Product</SortTh>
                    <SortTh col="sku">SKU</SortTh>
                    <Th style={{ textAlign: 'center', color: T.muted, fontSize: 11, whiteSpace: 'nowrap' }} colSpan={3}>Stock (ROW / US / Total)</Th>
                    <Th style={{ textAlign: 'center', color: T.muted, fontSize: 11, whiteSpace: 'nowrap' }} colSpan={3}>Sold Last Week (ROW / US / Total)</Th>
                    <SortTh col="weeks_total" right>Wks Cover</SortTh>
                    <SortTh col="cost_row" right>Cost ROW</SortTh>
                    <SortTh col="cost_us" right>Cost US</SortTh>
                    <SortTh col="sell_row" right>Sell ROW</SortTh>
                    <SortTh col="sell_us" right>Sell US</SortTh>
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <tr><td colSpan={14} style={{ padding: 32, textAlign: 'center', color: T.muted, fontSize: 13 }}>No results</td></tr>
                  ) : filtered.map((r, i) => (
                    <tr key={i} style={{ borderTop: `1px solid ${T.border}` }}>
                      <Td style={{ fontSize: 12, color: T.muted, whiteSpace: 'nowrap' }}>{r.season || '—'}</Td>
                      <Td style={{ fontWeight: 600, whiteSpace: 'nowrap', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.product_name || '—'}</Td>
                      <Td style={{ fontFamily: 'monospace', fontSize: 12, color: T.muted, whiteSpace: 'nowrap' }}>{r.sku || '—'}</Td>
                      <NumTd v={r.stock_row} />
                      <NumTd v={r.stock_us} />
                      <NumTd v={r.stock_total} color={T.accent} />
                      <NumTd v={r.sold_row} />
                      <NumTd v={r.sold_us} />
                      <NumTd v={r.sold_total} color={T.green} />
                      <Td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: num(r.weeks_total) < 4 && num(r.weeks_total) > 0 ? '#ef4444' : num(r.weeks_total) < 8 ? '#f59e0b' : T.text }}>
                        {num(r.weeks_total) === 0 ? <span style={{ color: T.muted }}>—</span> : num(r.weeks_total).toFixed(1)}
                      </Td>
                      <Td style={{ textAlign: 'right', color: T.muted, fontVariantNumeric: 'tabular-nums', fontSize: 12 }}>{num(r.cost_row) ? fmt(r.cost_row) : '—'}</Td>
                      <Td style={{ textAlign: 'right', color: T.muted, fontVariantNumeric: 'tabular-nums', fontSize: 12 }}>{num(r.cost_us) ? fmt(r.cost_us) : '—'}</Td>
                      <Td style={{ textAlign: 'right', color: T.muted, fontVariantNumeric: 'tabular-nums', fontSize: 12 }}>{num(r.sell_row) ? fmt(r.sell_row) : '—'}</Td>
                      <Td style={{ textAlign: 'right', color: T.muted, fontVariantNumeric: 'tabular-nums', fontSize: 12 }}>{num(r.sell_us) ? fmt(r.sell_us) : '—'}</Td>
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
