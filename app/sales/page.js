'use client'
import { useEffect, useState, useMemo } from 'react'
import Shell from '@/components/Shell'
import { T, Th, Td, Loading } from '@/components/ui'

const fmtCcy = n => new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 0 }).format(n || 0)
const fmtNum = n => Number(n || 0).toLocaleString('en-GB')

const RANGES = [
  { label: '7 days',  days: 7 },
  { label: '30 days', days: 30 },
  { label: '90 days', days: 90 },
]

const Delta = ({ cur, prev }) => {
  if (!prev || prev === 0) return null
  const pct = ((cur - prev) / prev) * 100
  const up  = pct >= 0
  return (
    <span style={{
      fontSize: 10, fontWeight: 700,
      color: up ? T.green : T.red,
      background: up ? T.greenDim : T.redDim,
      border: `1px solid ${up ? T.green : T.red}30`,
      borderRadius: 3, padding: '1px 5px', marginLeft: 5, whiteSpace: 'nowrap'
    }}>
      {up ? '▲' : '▼'} {Math.abs(pct).toFixed(0)}%
    </span>
  )
}

export default function SalesPage() {
  const [rows, setRows]     = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError]   = useState('')
  const [days, setDays]     = useState(7)
  const [search, setSearch] = useState('')
  const [sortCol, setSortCol] = useState('revenue')
  const [sortAsc, setSortAsc] = useState(false)

  useEffect(() => {
    setLoading(true)
    setError('')
    fetch(`/api/sales-data?days=${days}`)
      .then(r => r.json())
      .then(data => {
        if (data.error) throw new Error(data.error)
        setRows(data.rows || [])
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [days])

  const filtered = useMemo(() => {
    let r = rows
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      r = r.filter(x =>
        (x.item_name || '').toLowerCase().includes(q) ||
        (x.item_id   || '').toLowerCase().includes(q)
      )
    }
    return [...r].sort((a, b) => {
      const av = a[sortCol] ?? 0, bv = b[sortCol] ?? 0
      const cmp = av - bv
      return sortAsc ? cmp : -cmp
    })
  }, [rows, search, sortCol, sortAsc])

  const totalRevenue   = rows.reduce((s, r) => s + r.revenue, 0)
  const totalRevPrev   = rows.reduce((s, r) => s + r.revenue_prev, 0)
  const totalPurchased = rows.reduce((s, r) => s + r.purchased, 0)
  const totalPurPrev   = rows.reduce((s, r) => s + r.purchased_prev, 0)
  const topProduct     = rows[0]?.item_name || '—'
  const activeProducts = rows.filter(r => r.purchased > 0).length

  const sort = col => {
    if (sortCol === col) setSortAsc(a => !a)
    else { setSortCol(col); setSortAsc(false) }
  }

  const SortTh = ({ col, children, right }) => (
    <Th onClick={() => sort(col)} style={{ cursor: 'pointer', textAlign: right ? 'right' : 'left', userSelect: 'none', whiteSpace: 'nowrap' }}>
      {children} {sortCol === col ? (sortAsc ? '↑' : '↓') : <span style={{ opacity: 0.3 }}>↕</span>}
    </Th>
  )

  const convRate = r => r.viewed > 0 ? ((r.purchased / r.viewed) * 100).toFixed(1) + '%' : '—'

  return (
    <Shell title="Sales">

      {/* Toolbar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ fontFamily: 'Barlow Condensed', fontWeight: 800, fontSize: 26, letterSpacing: '-0.3px', color: T.text }}>Sales Dashboard</div>
          <div style={{ fontSize: 12, color: T.muted, marginTop: 2 }}>Google Analytics 4 · Top products</div>
        </div>
        <div style={{ display: 'flex', gap: 4, background: T.surface, border: `1px solid ${T.border}`, borderRadius: 7, padding: 3 }}>
          {RANGES.map(r => (
            <button key={r.days} onClick={() => setDays(r.days)} style={{
              background: days === r.days ? T.accent : 'transparent',
              color: days === r.days ? '#fff' : T.muted,
              border: 'none', borderRadius: 5, padding: '5px 14px',
              fontSize: 12, fontWeight: 600, cursor: 'pointer',
              transition: 'background 0.15s, color 0.15s',
            }}>{r.label}</button>
          ))}
        </div>
      </div>

      {error && (
        <div style={{ background: '#ef444415', border: '1px solid #ef444440', borderRadius: 8, padding: '12px 16px', color: T.red, fontSize: 13, marginBottom: 20 }}>
          ⚠ {error}
        </div>
      )}

      {/* KPI Cards */}
      {!loading && !error && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 28 }}>
          {[
            { label: 'Revenue', value: fmtCcy(totalRevenue), prev: totalRevPrev, cur: totalRevenue, accent: T.green },
            { label: 'Items Sold', value: fmtNum(totalPurchased), prev: totalPurPrev, cur: totalPurchased, accent: T.accent },
            { label: 'Active Products', value: activeProducts, accent: T.blue },
            { label: `#1 Product`, value: topProduct, small: true, accent: '#a78bfa' },
          ].map(k => (
            <div key={k.label} style={{ background: T.card, border: `1px solid ${T.border}`, borderTop: `2px solid ${k.accent}`, borderRadius: 8, padding: '14px 18px' }}>
              <div style={{ fontSize: 10, color: T.muted, textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 700, marginBottom: 6 }}>{k.label}</div>
              <div style={{ fontSize: k.small ? 14 : 22, fontFamily: 'Barlow Condensed', fontWeight: 800, color: k.accent, letterSpacing: '-0.01em', lineHeight: 1.2 }}>{k.value}</div>
              {k.prev != null && (
                <div style={{ fontSize: 11, color: T.muted, marginTop: 4, display: 'flex', alignItems: 'center' }}>
                  vs prev period <Delta cur={k.cur} prev={k.prev} />
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 14, flexWrap: 'wrap' }}>
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search product or SKU…"
          style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 6, padding: '7px 12px', color: T.text, fontSize: 13, outline: 'none', width: 260 }}
        />
        {search && (
          <button onClick={() => setSearch('')}
            style={{ background: 'none', border: `1px solid ${T.border}`, color: T.muted, borderRadius: 4, padding: '5px 10px', fontSize: 11, cursor: 'pointer' }}>
            Clear
          </button>
        )}
        {!loading && (
          <span style={{ marginLeft: 'auto', fontSize: 12, color: T.muted }}>{filtered.length} product{filtered.length !== 1 ? 's' : ''}</span>
        )}
      </div>

      {/* Table */}
      {loading ? <Loading /> : (
        <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 10, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 700 }}>
              <thead>
                <tr style={{ background: T.surface }}>
                  <Th style={{ width: 36, textAlign: 'center' }}>#</Th>
                  <SortTh col="item_name">Product</SortTh>
                  <SortTh col="item_id">Item ID / SKU</SortTh>
                  <SortTh col="revenue" right>Revenue</SortTh>
                  <SortTh col="purchased" right>Sold</SortTh>
                  <SortTh col="viewed" right>Views</SortTh>
                  <Th style={{ textAlign: 'right' }}>Conv. Rate</Th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={8} style={{ padding: 40, textAlign: 'center', color: T.muted, fontSize: 13 }}>
                    {error ? 'Error loading data' : 'No sales data found for this period'}
                  </td></tr>
                ) : filtered.map((r, i) => (
                  <tr key={r.item_id + i} className="row-hover" style={{ borderTop: `1px solid ${T.border}` }}>
                    <Td style={{ textAlign: 'center', color: T.muted, fontSize: 12, fontWeight: 700 }}>
                      {i + 1 <= 3 ? ['🥇','🥈','🥉'][i] : i + 1}
                    </Td>
                    <Td style={{ fontWeight: 600, maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {r.item_name || '—'}
                    </Td>
                    <Td style={{ fontFamily: 'monospace', fontSize: 12, color: T.muted }}>{r.item_id || '—'}</Td>
                    <Td style={{ textAlign: 'right', fontWeight: 700, color: T.green, fontVariantNumeric: 'tabular-nums' }}>
                      {fmtCcy(r.revenue)}
                      <Delta cur={r.revenue} prev={r.revenue_prev} />
                    </Td>
                    <Td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                      {r.purchased > 0 ? fmtNum(r.purchased) : <span style={{ color: T.muted }}>—</span>}
                      {r.purchased > 0 && <Delta cur={r.purchased} prev={r.purchased_prev} />}
                    </Td>
                    <Td style={{ textAlign: 'right', color: T.muted, fontVariantNumeric: 'tabular-nums' }}>
                      {r.viewed > 0 ? fmtNum(r.viewed) : <span style={{ color: T.border }}>—</span>}
                    </Td>
                    <Td style={{ textAlign: 'right', color: T.muted, fontSize: 12 }}>{convRate(r)}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </Shell>
  )
}
