'use client'
import { useEffect, useState, useMemo } from 'react'
import Shell from '@/components/Shell'
import { T, Th, Td, Loading } from '@/components/ui'

const fmtCcy = n => new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 0 }).format(n || 0)
const fmtNum = n => Number(n || 0).toLocaleString('en-GB')
const fmtPct = (n, total) => total > 0 ? ((n / total) * 100).toFixed(1) + '%' : '—'

const CHANNEL_COLORS = {
  'Organic Search': '#22c55e', 'Direct': '#3b82f6', 'Paid Search': '#f59e0b',
  'Email': '#a78bfa', 'Organic Social': '#ec4899', 'Referral': '#06b6d4',
  'Paid Social': '#f97316', 'Affiliates': '#84cc16', 'Display': '#8b5cf6', 'Unassigned': '#6b7280',
}
const channelColor = ch => CHANNEL_COLORS[ch] || '#6b7280'

const DEVICE_COLORS = { mobile: '#3b82f6', desktop: '#22c55e', tablet: '#f59e0b' }
const deviceColor = d => DEVICE_COLORS[d] || '#6b7280'

const RANGES = [{ label: '7D', days: 7 }, { label: '30D', days: 30 }, { label: '90D', days: 90 }]

const toDate = d => d.toISOString().slice(0, 10)
const today  = () => toDate(new Date())
const daysAgo = n => { const d = new Date(); d.setDate(d.getDate() - n); return toDate(d) }

const NAV_ITEMS = [
  { key: 'products',  label: 'Products'      },
  { key: 'trend',     label: 'Revenue Trend' },
  { key: 'countries', label: 'Countries'     },
  { key: 'channels',  label: 'Channels'      },
  { key: 'devices',   label: 'Devices'       },
  { key: 'customers', label: 'Customers'     },
  { key: 'funnel',    label: 'Funnel'        },
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
      borderRadius: 3, padding: '1px 5px', marginLeft: 5, whiteSpace: 'nowrap',
    }}>
      {up ? '▲' : '▼'} {Math.abs(pct).toFixed(0)}%
    </span>
  )
}

function TrendChart({ trend }) {
  const [hov, setHov] = useState(null)
  if (!trend.length) return <div style={{ color: T.muted, fontSize: 13, padding: 20 }}>No trend data available</div>

  const maxRev = Math.max(...trend.map(d => d.revenue), 1)
  const BAR_W  = Math.max(10, Math.min(44, Math.floor(700 / trend.length) - 4))
  const GAP    = Math.max(3, Math.floor(BAR_W * 0.15))
  const H      = 130
  const totalW = trend.length * (BAR_W + GAP)

  const fmtDay = s => {
    const y = s.slice(0, 4), m = s.slice(4, 6), d = s.slice(6, 8)
    return new Date(`${y}-${m}-${d}`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
  }
  const showEvery = trend.length > 14 ? Math.ceil(trend.length / 10) : 1

  return (
    <div style={{ overflowX: 'auto' }}>
      <svg width={Math.max(totalW + 4, 400)} height={H + 32} style={{ display: 'block' }}>
        {trend.map((d, i) => {
          const barH = Math.max(2, (d.revenue / maxRev) * H)
          const x    = i * (BAR_W + GAP)
          const y    = H - barH
          const isHov = hov === i
          return (
            <g key={d.date} onMouseEnter={() => setHov(i)} onMouseLeave={() => setHov(null)} style={{ cursor: 'default' }}>
              <rect x={x} y={y} width={BAR_W} height={barH} rx={2}
                fill={isHov ? T.accent : '#3b82f650'} style={{ transition: 'fill 0.1s' }} />
              {isHov && (
                <text x={x + BAR_W / 2} y={Math.max(y - 5, 12)} textAnchor="middle" fontSize={9} fill={T.accent} fontWeight="bold">
                  {fmtCcy(d.revenue)}
                </text>
              )}
              {i % showEvery === 0 && (
                <text x={x + BAR_W / 2} y={H + 16} textAnchor="middle" fontSize={8} fill={T.muted}>
                  {fmtDay(d.date)}
                </text>
              )}
            </g>
          )
        })}
      </svg>
    </div>
  )
}

function BarList({ items, keyProp, colorFn, totalKey = 'sessions', valueKey = 'revenue', label2Fn }) {
  const maxVal = Math.max(...items.map(r => r[totalKey]), 1)
  return (
    <div>
      {items.map((r, i) => (
        <div key={r[keyProp]} style={{ padding: '10px 20px', borderTop: i > 0 ? `1px solid ${T.border}` : 'none', display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 11, color: T.border, width: 20, textAlign: 'right', flexShrink: 0 }}>{i + 1}</span>
          {colorFn && <div style={{ width: 8, height: 8, borderRadius: '50%', background: colorFn(r[keyProp]), flexShrink: 0 }} />}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: T.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', textTransform: 'capitalize' }}>
              {r[keyProp]}
            </div>
            <div style={{ marginTop: 4, height: 3, borderRadius: 2, background: T.border, overflow: 'hidden' }}>
              <div style={{ width: `${(r[totalKey] / maxVal) * 100}%`, height: '100%', background: colorFn ? colorFn(r[keyProp]) : T.accent, borderRadius: 2, opacity: 0.75 }} />
            </div>
          </div>
          <div style={{ textAlign: 'right', flexShrink: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: T.green, fontVariantNumeric: 'tabular-nums' }}>{fmtCcy(r[valueKey])}</div>
            <div style={{ fontSize: 11, color: T.muted }}>{label2Fn ? label2Fn(r) : fmtNum(r[totalKey]) + ' sess.'}</div>
          </div>
        </div>
      ))}
    </div>
  )
}

function SectionCard({ title, children }) {
  return (
    <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 10, overflow: 'hidden' }}>
      <div style={{ padding: '14px 20px', borderBottom: `1px solid ${T.border}`, fontSize: 11, color: T.muted, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700 }}>
        {title}
      </div>
      {children}
    </div>
  )
}

const PAGE_SIZE = 50

export default function SalesPage() {
  const [rows, setRows]           = useState([])
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState('')
  const [days, setDays]           = useState(7)
  const [startDate, setStartDate] = useState(daysAgo(7))
  const [endDate, setEndDate]     = useState(today())
  const [isCustom, setIsCustom]   = useState(false)
  const [store, setStore]         = useState('row')
  const [search, setSearch]       = useState('')
  const [sortCol, setSortCol]     = useState('revenue')
  const [sortAsc, setSortAsc]     = useState(false)
  const [page, setPage]           = useState(0)
  const [trendGrouping, setTrendGrouping] = useState('day')
  const [activeView, setActiveView] = useState('products')
  const [geo, setGeo]             = useState({ countries: [], channels: [] })
  const [geoLoading, setGeoLoading] = useState(false)
  const [insights, setInsights]   = useState({ trend: [], devices: [], newReturning: [], funnel: {} })
  const [insightsLoading, setInsightsLoading] = useState(false)

  useEffect(() => {
    setLoading(true)
    setError('')
    const base = isCustom
      ? `/api/sales-data?startDate=${startDate}&endDate=${endDate}`
      : `/api/sales-data?days=${days}`
    fetch(`${base}&store=${store}`)
      .then(r => r.json())
      .then(data => { if (data.error) throw new Error(data.error); setRows(data.rows || []) })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [days, startDate, endDate, isCustom, store])

  useEffect(() => {
    setGeoLoading(true)
    const base = isCustom
      ? `/api/sales-geo?startDate=${startDate}&endDate=${endDate}`
      : `/api/sales-geo?days=${days}`
    fetch(`${base}&store=${store}`)
      .then(r => r.json())
      .then(data => { if (!data.error) setGeo(data) })
      .catch(() => {})
      .finally(() => setGeoLoading(false))
  }, [days, startDate, endDate, isCustom, store])

  useEffect(() => {
    setInsightsLoading(true)
    const base = isCustom
      ? `/api/sales-insights?startDate=${startDate}&endDate=${endDate}`
      : `/api/sales-insights?days=${days}`
    fetch(`${base}&store=${store}`)
      .then(r => r.json())
      .then(data => { if (!data.error) setInsights(data) })
      .catch(() => {})
      .finally(() => setInsightsLoading(false))
  }, [days, startDate, endDate, isCustom, store])

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
      return sortAsc ? av - bv : bv - av
    })
  }, [rows, search, sortCol, sortAsc])

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE)
  const pageItems  = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  const groupedTrend = useMemo(() => {
    if (trendGrouping === 'day' || !insights.trend.length) return insights.trend
    const map = {}
    for (const d of insights.trend) {
      let key
      if (trendGrouping === 'week') {
        const [y, m, dy] = [d.date.slice(0,4), d.date.slice(4,6), d.date.slice(6,8)]
        const dt = new Date(`${y}-${m}-${dy}`)
        const dow = dt.getDay()
        dt.setDate(dt.getDate() - (dow === 0 ? 6 : dow - 1))
        key = dt.toISOString().slice(0,10).replace(/-/g,'')
      } else {
        key = d.date.slice(0,6) + '01'
      }
      if (!map[key]) map[key] = { date: key, revenue: 0, transactions: 0, sessions: 0 }
      map[key].revenue      += d.revenue
      map[key].transactions += d.transactions
      map[key].sessions     += d.sessions
    }
    return Object.values(map).sort((a,b) => a.date.localeCompare(b.date))
  }, [insights.trend, trendGrouping])

  useEffect(() => { setPage(0) }, [search, sortCol, sortAsc, store, days, startDate, endDate])

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

  const { funnel } = insights

  const exportCSV = () => {
    const headers = ['Rank','Product','SKU','Revenue (GBP)','Items Sold','Views','Conv Rate','vs Prev Period']
    const csvRows = filtered.map((r, i) => [
      i + 1,
      `"${(r.item_name || '').replace(/"/g, '""')}"`,
      r.item_id || '',
      (r.revenue || 0).toFixed(2),
      r.purchased || 0,
      r.viewed || 0,
      r.viewed > 0 ? ((r.purchased / r.viewed) * 100).toFixed(1) + '%' : '',
      r.revenue_prev > 0 ? (((r.revenue - r.revenue_prev) / r.revenue_prev) * 100).toFixed(1) + '%' : '',
    ])
    const csv = [headers.join(','), ...csvRows.map(r => r.join(','))].join('\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `sales-${store}-${isCustom ? startDate + '_' + endDate : days + 'd'}.csv`
    document.body.appendChild(a); a.click(); document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  return (
    <Shell title="Sales">

      {/* Toolbar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ fontFamily: 'Barlow Condensed', fontWeight: 800, fontSize: 26, letterSpacing: '-0.3px', color: T.text }}>Sales Dashboard</div>
          <div style={{ fontSize: 12, color: T.muted, marginTop: 2 }}>Google Analytics 4 · {store === 'row' ? 'ROW' : store === 'us' ? 'US' : 'ROW + US combined'}</div>
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', gap: 4, background: T.surface, border: `1px solid ${T.border}`, borderRadius: 7, padding: 3 }}>
            {[['row', 'ROW'], ['us', 'US'], ['both', 'Both']].map(([val, label]) => (
              <button key={val} onClick={() => setStore(val)} style={{
                background: store === val ? T.accent : 'transparent', color: store === val ? '#fff' : T.muted,
                border: 'none', borderRadius: 5, padding: '5px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer',
              }}>{label}</button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 4, background: T.surface, border: `1px solid ${T.border}`, borderRadius: 7, padding: 3 }}>
            {RANGES.map(r => (
              <button key={r.days} onClick={() => { setDays(r.days); setIsCustom(false) }} style={{
                background: !isCustom && days === r.days ? T.accent : 'transparent', color: !isCustom && days === r.days ? '#fff' : T.muted,
                border: 'none', borderRadius: 5, padding: '5px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
              }}>{r.label}</button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 4, alignItems: 'center', background: T.surface, border: `1px solid ${isCustom ? T.accent : T.border}`, borderRadius: 7, padding: '3px 8px' }}>
            <input type="date" value={startDate} onChange={e => { setStartDate(e.target.value); setIsCustom(true) }}
              style={{ background: 'transparent', border: 'none', color: T.text, fontSize: 12, outline: 'none', cursor: 'pointer' }} />
            <span style={{ color: T.muted, fontSize: 11 }}>→</span>
            <input type="date" value={endDate} onChange={e => { setEndDate(e.target.value); setIsCustom(true) }}
              style={{ background: 'transparent', border: 'none', color: T.text, fontSize: 12, outline: 'none', cursor: 'pointer' }} />
          </div>
        </div>
      </div>

      {error && (
        <div style={{ background: '#ef444415', border: '1px solid #ef444440', borderRadius: 8, padding: '12px 16px', color: T.red, fontSize: 13, marginBottom: 20 }}>
          ⚠ {error}
        </div>
      )}

      {/* KPI Cards */}
      {!loading && !error && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 24 }}>
          {[
            { label: 'Revenue', value: fmtCcy(totalRevenue), prev: totalRevPrev, cur: totalRevenue, accent: T.green },
            { label: 'Items Sold', value: fmtNum(totalPurchased), prev: totalPurPrev, cur: totalPurchased, accent: T.accent },
            { label: 'Active Products', value: activeProducts, accent: T.blue },
            { label: '#1 Product', value: topProduct, small: true, accent: '#a78bfa' },
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

      {/* Main layout */}
      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>

        {/* Left sidebar nav */}
        <div style={{ width: 158, flexShrink: 0, background: T.card, border: `1px solid ${T.border}`, borderRadius: 10, overflow: 'hidden' }}>
          {NAV_ITEMS.map((item, idx) => (
            <button key={item.key} onClick={() => setActiveView(item.key)} style={{
              display: 'block', width: '100%', textAlign: 'left',
              padding: '11px 14px 11px 16px',
              borderTop: idx > 0 ? `1px solid ${T.border}` : 'none',
              borderLeft: `3px solid ${activeView === item.key ? T.accent : 'transparent'}`,
              background: activeView === item.key ? T.accent + '18' : 'transparent',
              color: activeView === item.key ? T.accent : T.muted,
              fontSize: 13, fontWeight: activeView === item.key ? 700 : 500,
              cursor: 'pointer', border: 'none',
              borderLeft: `3px solid ${activeView === item.key ? T.accent : 'transparent'}`,
              borderTop: idx > 0 ? `1px solid ${T.border}` : 'none',
            }}>
              {item.label}
            </button>
          ))}
        </div>

        {/* Content area */}
        <div style={{ flex: 1, minWidth: 0 }}>

          {/* Products view */}
          {activeView === 'products' && (
            <>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 14, flexWrap: 'wrap' }}>
                <input value={search} onChange={e => setSearch(e.target.value)}
                  placeholder="Search product or SKU…"
                  style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 6, padding: '7px 12px', color: T.text, fontSize: 13, outline: 'none', width: 260 }} />
                {search && (
                  <button onClick={() => setSearch('')}
                    style={{ background: 'none', border: `1px solid ${T.border}`, color: T.muted, borderRadius: 4, padding: '5px 10px', fontSize: 11, cursor: 'pointer' }}>
                    Clear
                  </button>
                )}
                {!loading && <span style={{ marginLeft: 'auto', fontSize: 12, color: T.muted }}>{filtered.length} products</span>}
                {!loading && totalPages > 1 && <span style={{ fontSize: 12, color: T.muted }}>Page {page + 1} of {totalPages}</span>}
                <button onClick={exportCSV} style={{ background: T.surface, border: `1px solid ${T.border}`, color: T.muted, borderRadius: 5, padding: '6px 12px', fontSize: 12, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                  ⬇ Export CSV
                </button>
              </div>

              {loading ? <Loading /> : (
                <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 10, overflow: 'hidden' }}>
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 580 }}>
                      <thead>
                        <tr style={{ background: T.surface }}>
                          <Th style={{ width: 36, textAlign: 'center' }}>#</Th>
                          <SortTh col="item_name">Product</SortTh>
                          <SortTh col="item_id">SKU</SortTh>
                          <SortTh col="revenue" right>Revenue</SortTh>
                          <SortTh col="purchased" right>Sold</SortTh>
                          <SortTh col="viewed" right>Views</SortTh>
                          <Th style={{ textAlign: 'right' }}>Conv.</Th>
                          <Th style={{ textAlign: 'center' }}>Trend</Th>
                        </tr>
                      </thead>
                      <tbody>
                        {pageItems.length === 0 ? (
                          <tr><td colSpan={8} style={{ padding: 40, textAlign: 'center', color: T.muted, fontSize: 13 }}>
                            No sales data found for this period
                          </td></tr>
                        ) : pageItems.map((r, i) => {
                          const rank = page * PAGE_SIZE + i
                          return (
                            <tr key={r.item_id + rank} className="row-hover" style={{
                              borderTop: `1px solid ${T.border}`,
                              borderLeft: rank === 0 ? '3px solid #f59e0b' : rank === 1 ? '3px solid #94a3b8' : rank === 2 ? '3px solid #cd7f32' : rank < 10 ? `3px solid ${T.accent}30` : '3px solid transparent',
                            }}>
                              <Td style={{ textAlign: 'center', color: T.muted, fontSize: 12, fontWeight: 700 }}>
                                {rank < 3 ? ['🥇','🥈','🥉'][rank] : rank + 1}
                              </Td>
                              <Td style={{ fontWeight: 600, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.item_name || '—'}</Td>
                              <Td style={{ fontFamily: 'monospace', fontSize: 12, color: T.muted }}>{r.item_id || '—'}</Td>
                              <Td style={{ textAlign: 'right', fontWeight: 700, color: T.green, fontVariantNumeric: 'tabular-nums' }}>
                                {fmtCcy(r.revenue)}<Delta cur={r.revenue} prev={r.revenue_prev} />
                              </Td>
                              <Td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                                {r.purchased > 0 ? fmtNum(r.purchased) : <span style={{ color: T.muted }}>—</span>}
                                {r.purchased > 0 && <Delta cur={r.purchased} prev={r.purchased_prev} />}
                              </Td>
                              <Td style={{ textAlign: 'right', color: T.muted, fontVariantNumeric: 'tabular-nums' }}>
                                {r.viewed > 0 ? fmtNum(r.viewed) : <span style={{ color: T.border }}>—</span>}
                              </Td>
                              <Td style={{ textAlign: 'right', color: T.muted, fontSize: 12 }}>{convRate(r)}</Td>
                              <Td style={{ textAlign: 'center' }}>
                                {(r.revenue > 0 || r.revenue_prev > 0) && (() => {
                                  const maxV = Math.max(r.revenue, r.revenue_prev, 1)
                                  const hP = Math.max(2, Math.round((r.revenue_prev / maxV) * 16))
                                  const hC = Math.max(2, Math.round((r.revenue / maxV) * 16))
                                  const up = r.revenue >= r.revenue_prev
                                  return (
                                    <div style={{ display: 'inline-flex', alignItems: 'flex-end', gap: 2, height: 16 }}>
                                      <div style={{ width: 5, height: hP, background: T.border, borderRadius: 1 }} />
                                      <div style={{ width: 5, height: hC, background: up ? T.green : T.red, borderRadius: 1 }} />
                                    </div>
                                  )
                                })()}
                              </Td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {!loading && totalPages > 1 && (
                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 6, marginTop: 14 }}>
                  <button onClick={() => setPage(0)} disabled={page === 0}
                    style={{ background: T.surface, border: `1px solid ${T.border}`, color: page === 0 ? T.border : T.muted, borderRadius: 5, padding: '5px 10px', fontSize: 12, cursor: page === 0 ? 'default' : 'pointer' }}>«</button>
                  <button onClick={() => setPage(p => p - 1)} disabled={page === 0}
                    style={{ background: T.surface, border: `1px solid ${T.border}`, color: page === 0 ? T.border : T.muted, borderRadius: 5, padding: '5px 10px', fontSize: 12, cursor: page === 0 ? 'default' : 'pointer' }}>‹</button>
                  {Array.from({ length: totalPages }, (_, i) => i).filter(i => Math.abs(i - page) <= 2).map(i => (
                    <button key={i} onClick={() => setPage(i)} style={{
                      background: i === page ? T.accent : T.surface,
                      border: `1px solid ${i === page ? T.accent : T.border}`,
                      color: i === page ? '#fff' : T.muted,
                      borderRadius: 5, padding: '5px 10px', fontSize: 12, cursor: 'pointer', fontWeight: i === page ? 700 : 400,
                    }}>{i + 1}</button>
                  ))}
                  <button onClick={() => setPage(p => p + 1)} disabled={page >= totalPages - 1}
                    style={{ background: T.surface, border: `1px solid ${T.border}`, color: page >= totalPages - 1 ? T.border : T.muted, borderRadius: 5, padding: '5px 10px', fontSize: 12, cursor: page >= totalPages - 1 ? 'default' : 'pointer' }}>›</button>
                  <button onClick={() => setPage(totalPages - 1)} disabled={page >= totalPages - 1}
                    style={{ background: T.surface, border: `1px solid ${T.border}`, color: page >= totalPages - 1 ? T.border : T.muted, borderRadius: 5, padding: '5px 10px', fontSize: 12, cursor: page >= totalPages - 1 ? 'default' : 'pointer' }}>»</button>
                </div>
              )}
            </>
          )}

          {/* Revenue Trend view */}
          {activeView === 'trend' && (
            insightsLoading ? <Loading /> : (
              <>
                <div style={{ display: 'flex', gap: 4, marginBottom: 12, background: T.card, border: `1px solid ${T.border}`, borderRadius: 7, padding: 3, alignSelf: 'flex-start' }}>
                  {[['day','Daily'],['week','Weekly'],['month','Monthly']].map(([v,l]) => (
                    <button key={v} onClick={() => setTrendGrouping(v)} style={{
                      background: trendGrouping === v ? T.accent : 'transparent',
                      color: trendGrouping === v ? '#fff' : T.muted,
                      border: 'none', borderRadius: 5, padding: '5px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer',
                    }}>{l}</button>
                  ))}
                </div>
                <SectionCard title={trendGrouping === 'day' ? 'Daily Revenue' : trendGrouping === 'week' ? 'Weekly Revenue' : 'Monthly Revenue'}>
                <div style={{ padding: '20px 20px 8px' }}>
                  <TrendChart trend={groupedTrend} />
                </div>
                {insights.trend.length > 0 && (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 0, borderTop: `1px solid ${T.border}` }}>
                    {[
                      { label: 'Total Revenue', value: fmtCcy(insights.trend.reduce((s, d) => s + d.revenue, 0)) },
                      { label: 'Total Orders', value: fmtNum(insights.trend.reduce((s, d) => s + d.transactions, 0)) },
                      { label: 'Avg Daily Revenue', value: fmtCcy(insights.trend.reduce((s, d) => s + d.revenue, 0) / (insights.trend.length || 1)) },
                    ].map((k, i) => (
                      <div key={k.label} style={{ padding: '14px 20px', borderLeft: i > 0 ? `1px solid ${T.border}` : 'none' }}>
                        <div style={{ fontSize: 10, color: T.muted, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700, marginBottom: 4 }}>{k.label}</div>
                        <div style={{ fontSize: 18, fontFamily: 'Barlow Condensed', fontWeight: 800, color: T.accent }}>{k.value}</div>
                      </div>
                    ))}
                  </div>
                )}
              </SectionCard>
              </>
            )
          )}

          {/* Countries view */}
          {activeView === 'countries' && (
            geoLoading ? <Loading /> : (
              <SectionCard title={`Top Countries · ${geo.countries.length} markets`}>
                {geo.countries.length === 0
                  ? <div style={{ padding: 40, textAlign: 'center', color: T.muted, fontSize: 13 }}>No country data available</div>
                  : <BarList
                      items={geo.countries}
                      keyProp="country"
                      colorFn={null}
                      totalKey="revenue"
                      valueKey="revenue"
                      label2Fn={r => fmtNum(r.transactions) + ' orders · ' + fmtNum(r.sessions) + ' sess.'}
                    />
                }
              </SectionCard>
            )
          )}

          {/* Channels view */}
          {activeView === 'channels' && (
            geoLoading ? <Loading /> : (
              <SectionCard title="Traffic Channels">
                {geo.channels.length === 0
                  ? <div style={{ padding: 40, textAlign: 'center', color: T.muted, fontSize: 13 }}>No channel data available</div>
                  : <BarList
                      items={geo.channels}
                      keyProp="channel"
                      colorFn={channelColor}
                      totalKey="sessions"
                      valueKey="revenue"
                      label2Fn={r => {
                        const total = geo.channels.reduce((s, c) => s + c.sessions, 0)
                        return fmtNum(r.sessions) + ' sess. · ' + fmtPct(r.sessions, total)
                      }}
                    />
                }
              </SectionCard>
            )
          )}

          {/* Devices view */}
          {activeView === 'devices' && (
            insightsLoading ? <Loading /> : (
              <SectionCard title="Device Breakdown">
                {insights.devices.length === 0
                  ? <div style={{ padding: 40, textAlign: 'center', color: T.muted, fontSize: 13 }}>No device data available</div>
                  : <BarList
                      items={insights.devices}
                      keyProp="device"
                      colorFn={deviceColor}
                      totalKey="sessions"
                      valueKey="revenue"
                      label2Fn={r => {
                        const total = insights.devices.reduce((s, d) => s + d.sessions, 0)
                        return fmtNum(r.sessions) + ' sess. · ' + fmtPct(r.sessions, total)
                      }}
                    />
                }
              </SectionCard>
            )
          )}

          {/* Customers view */}
          {activeView === 'customers' && (
            insightsLoading ? <Loading /> : (
              <SectionCard title="New vs Returning Customers">
                {insights.newReturning.length === 0
                  ? <div style={{ padding: 40, textAlign: 'center', color: T.muted, fontSize: 13 }}>No customer data available</div>
                  : (() => {
                      const totalSess = insights.newReturning.reduce((s, r) => s + r.sessions, 0)
                      const totalRev  = insights.newReturning.reduce((s, r) => s + r.revenue, 0)
                      return (
                        <div>
                          {insights.newReturning.map((r, i) => {
                            const color = r.type === 'new' ? T.accent : '#a78bfa'
                            const pctSess = ((r.sessions / (totalSess || 1)) * 100).toFixed(1)
                            const pctRev  = ((r.revenue / (totalRev || 1)) * 100).toFixed(1)
                            return (
                              <div key={r.type} style={{ padding: '16px 20px', borderTop: i > 0 ? `1px solid ${T.border}` : 'none' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <div style={{ width: 10, height: 10, borderRadius: '50%', background: color }} />
                                    <span style={{ fontSize: 14, fontWeight: 700, color: T.text, textTransform: 'capitalize' }}>{r.type === 'new' ? 'New Customers' : 'Returning Customers'}</span>
                                  </div>
                                  <span style={{ fontSize: 13, fontWeight: 700, color: T.green }}>{fmtCcy(r.revenue)}</span>
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 8 }}>
                                  {[
                                    { label: 'Sessions', value: fmtNum(r.sessions), sub: pctSess + '% of total' },
                                    { label: 'Revenue', value: fmtCcy(r.revenue), sub: pctRev + '% of total' },
                                    { label: 'Orders', value: fmtNum(r.transactions), sub: '' },
                                  ].map(k => (
                                    <div key={k.label} style={{ background: T.surface, borderRadius: 6, padding: '10px 12px' }}>
                                      <div style={{ fontSize: 10, color: T.muted, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700, marginBottom: 3 }}>{k.label}</div>
                                      <div style={{ fontSize: 16, fontFamily: 'Barlow Condensed', fontWeight: 800, color }}>{k.value}</div>
                                      {k.sub && <div style={{ fontSize: 10, color: T.muted, marginTop: 2 }}>{k.sub}</div>}
                                    </div>
                                  ))}
                                </div>
                                <div style={{ height: 6, borderRadius: 3, background: T.border, overflow: 'hidden' }}>
                                  <div style={{ width: pctSess + '%', height: '100%', background: color, borderRadius: 3 }} />
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      )
                    })()
                }
              </SectionCard>
            )
          )}

          {/* Funnel view */}
          {activeView === 'funnel' && (
            insightsLoading ? <Loading /> : (
              <SectionCard title="Conversion Funnel">
                {!funnel.sessions
                  ? <div style={{ padding: 40, textAlign: 'center', color: T.muted, fontSize: 13 }}>No funnel data available</div>
                  : (() => {
                      const steps = [
                        { label: 'Sessions',     value: funnel.sessions,   color: '#3b82f6' },
                        { label: 'Add to Cart',  value: funnel.addToCarts, color: '#f59e0b' },
                        { label: 'Checkout',     value: funnel.checkouts,  color: '#a78bfa' },
                        { label: 'Purchase',     value: funnel.purchases,  color: '#22c55e' },
                      ]
                      const maxVal = steps[0].value || 1
                      return (
                        <div style={{ padding: '20px 24px' }}>
                          {steps.map((step, i) => {
                            const pct = ((step.value / maxVal) * 100).toFixed(1)
                            const dropPct = i > 0 && steps[i - 1].value > 0
                              ? ((step.value / steps[i - 1].value) * 100).toFixed(1)
                              : null
                            return (
                              <div key={step.label} style={{ marginBottom: 20 }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <span style={{ width: 20, height: 20, borderRadius: '50%', background: step.color, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 800, color: '#fff', flexShrink: 0 }}>{i + 1}</span>
                                    <span style={{ fontSize: 14, fontWeight: 600, color: T.text }}>{step.label}</span>
                                    {dropPct && (
                                      <span style={{ fontSize: 11, color: T.muted, background: T.surface, border: `1px solid ${T.border}`, borderRadius: 3, padding: '1px 6px' }}>
                                        {dropPct}% from prev step
                                      </span>
                                    )}
                                  </div>
                                  <div style={{ textAlign: 'right' }}>
                                    <span style={{ fontSize: 15, fontWeight: 800, fontFamily: 'Barlow Condensed', color: step.color }}>{fmtNum(step.value)}</span>
                                    <span style={{ fontSize: 11, color: T.muted, marginLeft: 6 }}>{pct}%</span>
                                  </div>
                                </div>
                                <div style={{ height: 8, borderRadius: 4, background: T.border, overflow: 'hidden' }}>
                                  <div style={{ width: pct + '%', height: '100%', background: step.color, borderRadius: 4, transition: 'width 0.4s ease' }} />
                                </div>
                              </div>
                            )
                          })}
                          <div style={{ marginTop: 12, padding: '14px 16px', background: T.surface, borderRadius: 8, border: `1px solid ${T.border}` }}>
                            <div style={{ fontSize: 10, color: T.muted, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700, marginBottom: 4 }}>Overall Conversion Rate</div>
                            <div style={{ fontSize: 22, fontFamily: 'Barlow Condensed', fontWeight: 800, color: '#22c55e' }}>
                              {funnel.sessions > 0 ? ((funnel.purchases / funnel.sessions) * 100).toFixed(2) + '%' : '—'}
                            </div>
                            <div style={{ fontSize: 11, color: T.muted, marginTop: 2 }}>sessions → purchases · {fmtCcy(funnel.revenue)} total revenue</div>
                          </div>
                        </div>
                      )
                    })()
                }
              </SectionCard>
            )
          )}

        </div>
      </div>
    </Shell>
  )
}
