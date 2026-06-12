'use client'
import { useEffect, useState, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Shell from '@/components/Shell'
import { T, Th, Td, Loading, fmt } from '@/components/ui'
import { supabase } from '@/lib/supabase'

async function loadDashboard() {
  const [
    { data: pos },
    { data: shipments },
    { data: suppliers },
    { data: invStats },
    { data: invoices },
  ] = await Promise.all([
    supabase.from('purchase_orders').select('id, supplier_name, total_cost_value, currency, ex_factory_date, po_splits_confirmed, sheet_status, created_at'),
    supabase.from('shipments').select('id, po_id, dc, status, units, eta, freight_forwarder, shipment_ref, tracking_number'),
    supabase.from('suppliers').select('id, name, code, status'),
    supabase.from('inventory').select('qty_uk, qty_us').limit(5000),
    supabase.from('invoices').select('id, invoice_number, supplier_name, currency, deposit_amount, deposit_due_date, deposit_paid_date, balance_amount, balance_due_date, balance_paid_date'),
  ])

  return { pos: pos || [], shipments: shipments || [], suppliers: suppliers || [], invStats: invStats || [], invoices: invoices || [] }
}

const sheetStatusToPoStatus = (ss) => {
  if (!ss) return null
  const s = ss.toLowerCase()
  if (s.includes('delivered') || s.includes('booked in') || s.includes('booked-in')) return 'Completed'
  if (s.includes('receipt')) return 'Receipt in progress'
  if (s.includes('transit') || s.includes('shipped')) return 'In transit'
  if (s.includes('production')) return 'In production'
  return null
}

const getPoStatus = (po, poShipments) => {
  const s = poShipments || []
  if (s.length === 0) return sheetStatusToPoStatus(po.sheet_status) || 'In production'
  if (s.every(x => !x.status || x.status === 'In production')) return 'In production'
  if (s.every(x => x.status && (x.status.includes('Booked in') || x.status.includes('Delivered')))) return 'Completed'
  if (s.some(x => x.status && x.status.includes('Receipt'))) return 'Receipt in progress'
  return 'In transit'
}

const statusColor = (s) => ({
  'In production': T.yellow,
  'In transit - awaiting freight info': T.blue,
  'Receipt in progress': T.accent,
  'Delivered': T.green,
  'Booked in & checked': T.green,
  'Delivered + booked in': T.green,
}[s] || T.muted)

const DCBadge = ({ dc }) => (
  <span style={{ background: dc === 'UK' ? '#3b82f620' : '#8b5cf620', color: dc === 'UK' ? '#3b82f6' : '#8b5cf6', border: `1px solid ${dc === 'UK' ? '#3b82f640' : '#8b5cf640'}`, borderRadius: 3, padding: '1px 7px', fontSize: 11, fontWeight: 800 }}>{dc}</span>
)

const fmtGBP = n => new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 0 }).format(n || 0)

function Sparkline({ values, dates, color, width = 200, height = 40 }) {
  const [hoverIdx, setHoverIdx] = useState(null)
  const svgRef = useRef(null)
  if (!values || values.length < 2) return null
  const max = Math.max(...values), min = Math.min(...values)
  const range = max - min || 1
  const xOf = i => (i / (values.length - 1)) * width
  const yOf = v => height - ((v - min) / range) * (height - 4) - 2
  const pts = values.map((v, i) => `${xOf(i)},${yOf(v)}`).join(' ')
  const areaBot = `${width},${height} 0,${height}`
  const gradId = `sg${color.replace('#', '')}`

  const handleMouseMove = (e) => {
    const rect = svgRef.current?.getBoundingClientRect()
    if (!rect) return
    const x = e.clientX - rect.left
    const idx = Math.round((x / width) * (values.length - 1))
    setHoverIdx(Math.max(0, Math.min(values.length - 1, idx)))
  }

  const hx = hoverIdx !== null ? xOf(hoverIdx) : null
  const hy = hoverIdx !== null ? yOf(values[hoverIdx]) : null
  const tooltipLeft = hoverIdx !== null && hx > width * 0.7

  const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) : ''

  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <svg ref={svgRef} width={width} height={height}
        style={{ overflow: 'visible', display: 'block', cursor: 'crosshair' }}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setHoverIdx(null)}>
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.25" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        <polygon points={`0,${yOf(values[0])} ${pts} ${areaBot}`} fill={`url(#${gradId})`} />
        <polyline points={pts} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" />
        {hoverIdx !== null && <>
          <line x1={hx} y1={0} x2={hx} y2={height} stroke={color} strokeWidth="1" strokeDasharray="3,2" opacity="0.6" />
          <circle cx={hx} cy={hy} r="4" fill={color} stroke="#1a1a2e" strokeWidth="2" />
        </>}
      </svg>
      {hoverIdx !== null && (
        <div style={{
          position: 'absolute', top: -8,
          left: tooltipLeft ? hx - 110 : hx + 10,
          background: T.card, border: `1px solid ${color}60`,
          borderRadius: 6, padding: '5px 10px',
          pointerEvents: 'none', whiteSpace: 'nowrap', zIndex: 10,
          boxShadow: '0 4px 12px #0006',
        }}>
          <div style={{ fontSize: 10, color: T.muted, marginBottom: 2 }}>{fmtDate(dates?.[hoverIdx])}</div>
          <div style={{ fontSize: 13, fontWeight: 800, color, fontFamily: 'Barlow Condensed' }}>{fmtGBP(values[hoverIdx])}</div>
        </div>
      )}
    </div>
  )
}

function Section({ title, link, children, router }) {
  return (
    <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 10, overflow: 'hidden' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 18px', borderBottom: `1px solid ${T.border}` }}>
        <span style={{ fontFamily: 'Barlow Condensed', fontWeight: 700, fontSize: 14, color: T.muted, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{title}</span>
        {link && <button onClick={() => router.push(link)} style={{ background: 'none', border: 'none', color: T.accent, fontSize: 12, cursor: 'pointer', fontWeight: 600 }}>View all →</button>}
      </div>
      <div>{children}</div>
    </div>
  )
}

function KPIBox({ label, value, sub, color, onClick }) {
  return (
    <div onClick={onClick} style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 8, padding: '16px 20px', cursor: onClick ? 'pointer' : 'default', transition: 'border-color 0.15s' }}
      onMouseEnter={e => onClick && (e.currentTarget.style.borderColor = T.accent)}
      onMouseLeave={e => onClick && (e.currentTarget.style.borderColor = T.border)}>
      <div style={{ fontSize: 10, color: T.muted, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 26, fontFamily: 'Barlow Condensed', fontWeight: 800, color: color || T.text, lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: T.muted, marginTop: 4 }}>{sub}</div>}
    </div>
  )
}

export default function DashboardPage() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [lastUpdated, setLastUpdated] = useState(null)
  const [countdown, setCountdown] = useState(30)
  const [sheetTotals, setSheetTotals] = useState(null)
  const [topSales, setTopSales] = useState({ row: [], us: [] })
  const [trend, setTrend] = useState(null)
  const router = useRouter()

  useEffect(() => {
    fetch('/api/inventory-data')
      .then(r => r.json())
      .then(d => {
        if (d.items) {
          const totalRow = d.items.reduce((s, i) => s + (i.qty_row || 0), 0)
          const totalUs  = d.items.reduce((s, i) => s + (i.qty_us  || 0), 0)
          setSheetTotals({ totalRow, totalUs })
        }
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    Promise.all([
      fetch('/api/sales-data?days=7&store=row').then(r => r.json()),
      fetch('/api/sales-data?days=7&store=us').then(r => r.json()),
    ]).then(([rowData, usData]) => {
      setTopSales({
        row: (rowData.rows || []).slice(0, 5),
        us:  (usData.rows  || []).slice(0, 5),
      })
    }).catch(() => {})
  }, [])

  useEffect(() => {
    fetch('/api/sales-trend?days=30&store=both')
      .then(r => r.json())
      .then(d => { if (d.dates) setTrend(d) })
      .catch(() => {})
  }, [])
  const today = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

  const refresh = useCallback((showLoading = false) => {
    if (showLoading) setLoading(true)
    loadDashboard()
      .then(d => { setData(d); setLastUpdated(new Date()); setCountdown(30) })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { refresh(true) }, [])

  // Auto-refresh every 30s
  useEffect(() => {
    const interval = setInterval(() => refresh(false), 30000)
    return () => clearInterval(interval)
  }, [refresh])

  // Countdown ticker
  useEffect(() => {
    const tick = setInterval(() => setCountdown(c => c <= 1 ? 30 : c - 1), 1000)
    return () => clearInterval(tick)
  }, [lastUpdated])

  if (loading) return <Shell title="Dashboard"><Loading /></Shell>
  if (!data) return null

  const { pos, shipments, suppliers, invStats, invoices } = data

  // ── Payment alerts
  const todayStr = new Date().toISOString().slice(0, 10)
  const in14Str = new Date(Date.now() + 14 * 864e5).toISOString().slice(0, 10)
  const overduePayments = []
  const upcomingPayments = []
  for (const inv of invoices) {
    if (inv.deposit_amount > 0 && !inv.deposit_paid_date) {
      const entry = { id: inv.id, supplier: inv.supplier_name, invoice: inv.invoice_number, type: 'Deposit', amount: inv.deposit_amount, currency: inv.currency, due: inv.deposit_due_date }
      if (inv.deposit_due_date && inv.deposit_due_date < todayStr) overduePayments.push(entry)
      else if (inv.deposit_due_date && inv.deposit_due_date <= in14Str) upcomingPayments.push(entry)
    }
    if (inv.balance_amount > 0 && !inv.balance_paid_date) {
      const entry = { id: inv.id, supplier: inv.supplier_name, invoice: inv.invoice_number, type: 'Balance', amount: inv.balance_amount, currency: inv.currency, due: inv.balance_due_date }
      if (inv.balance_due_date && inv.balance_due_date < todayStr) overduePayments.push(entry)
      else if (inv.balance_due_date && inv.balance_due_date <= in14Str) upcomingPayments.push(entry)
    }
  }

  // ── PO stats
  const unsplitPOs = pos.filter(p => !p.po_splits_confirmed)
  const totalPOValue = pos.reduce((s, p) => s + (p.total_cost_value || 0), 0)

  // ── Shipment stats
  const shipmentsByPO = {}
  for (const sh of shipments) {
    if (!shipmentsByPO[sh.po_id]) shipmentsByPO[sh.po_id] = []
    shipmentsByPO[sh.po_id].push(sh)
  }
  const inProductionPOs = pos.filter(po => getPoStatus(po, shipmentsByPO[po.id]) === 'In production')
  const inProduction = shipments.filter(s => s.status === 'In production')
  const inTransit = shipments.filter(s => s.status?.includes('transit'))
  const receipt = shipments.filter(s => s.status === 'Receipt in progress')
  const bookedIn = shipments.filter(s => s.status?.includes('Booked in') || s.status?.includes('booked in'))
  const missingETA = inTransit.filter(s => !s.eta)

  // ── Incoming shipments — ETA in next 60 days
  const now = new Date()
  const in60 = new Date(); in60.setDate(now.getDate() + 60)
  const incoming = shipments
    .filter(s => {
      if (!s.eta) return false
      const eta = new Date(s.eta)
      return eta >= now && eta <= in60 && !s.status?.includes('Booked') && !s.status?.includes('Delivered')
    })
    .sort((a, b) => new Date(a.eta) - new Date(b.eta))
    .slice(0, 8)

  // ── Recently booked in
  const recentlyBooked = shipments
    .filter(s => s.status?.includes('Booked in') || s.status?.includes('booked in'))
    .slice(0, 5)

  // ── Inventory stats — qty from Maxtrify sheet, counts from Supabase
  const totalUK = sheetTotals?.totalRow ?? invStats.reduce((s, r) => s + (r.qty_uk || 0), 0)
  const totalUS = sheetTotals?.totalUs  ?? invStats.reduce((s, r) => s + (r.qty_us  || 0), 0)
  const outOfStock = invStats.filter(r => !r.qty_uk && !r.qty_us).length
  const lowStock = invStats.filter(r => (r.qty_uk > 0 && r.qty_uk < 10) || (r.qty_us > 0 && r.qty_us < 10)).length

  // ── Supplier stats
  const activeSuppliers = suppliers.filter(s => s.status === 'Active')

  // ── Shipments per supplier (from PO data) + on-time %
  const supplierShipments = {}
  for (const sh of shipments) {
    const po = pos.find(p => p.id === sh.po_id)
    const name = po?.supplier_name || 'Unknown'
    if (!supplierShipments[name]) supplierShipments[name] = { name, count: 0, inTransit: 0, inProduction: 0, onTimeCount: 0, deliveredCount: 0 }
    supplierShipments[name].count++
    if (sh.status?.includes('transit')) supplierShipments[name].inTransit++
    if (sh.status === 'In production') supplierShipments[name].inProduction++
    const actual = sh.booked_in_date || sh.delivery_date
    if (sh.eta && actual) {
      supplierShipments[name].deliveredCount++
      if (actual <= sh.eta) supplierShipments[name].onTimeCount++
    }
  }
  const topSuppliers = Object.values(supplierShipments).sort((a, b) => b.count - a.count).slice(0, 5)

  return (
    <Shell title="Dashboard">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div style={{ fontSize: 12, color: T.muted }}>{today}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {lastUpdated && <span style={{ fontSize: 11, color: T.muted }}>Updated {lastUpdated.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: T.surface, border: `1px solid ${T.border}`, borderRadius: 6, padding: '5px 12px' }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: T.green, animation: 'pulse 2s infinite' }} />
            <span style={{ fontSize: 11, color: T.muted }}>Refresh in {countdown}s</span>
            <button onClick={() => refresh(false)} style={{ background: T.accent, border: 'none', color: '#fff', borderRadius: 4, padding: '2px 8px', fontSize: 11, fontWeight: 700, cursor: 'pointer', marginLeft: 4 }}>↻ Now</button>
          </div>
        </div>
      </div>

      {/* ── Revenue trend sparkline ── */}
      {trend && (
        <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 10, padding: '16px 20px', marginBottom: 16, display: 'flex', gap: 32, alignItems: 'center' }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 10, color: T.muted, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700, marginBottom: 6 }}>🇬🇧 ROW Revenue — last 30 days</div>
            <Sparkline values={trend.row} dates={trend.dates} color="#3b82f6" width={300} height={44} />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: T.border, marginTop: 2 }}>
              <span>{trend.dates[0]?.slice(5)}</span><span>{trend.dates[trend.dates.length-1]?.slice(5)}</span>
            </div>
          </div>
          <div style={{ width: 1, height: 60, background: T.border }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 10, color: T.muted, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700, marginBottom: 6 }}>🇺🇸 US Revenue — last 30 days</div>
            <Sparkline values={trend.us} dates={trend.dates} color="#8b5cf6" width={300} height={44} />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: T.border, marginTop: 2 }}>
              <span>{trend.dates[0]?.slice(5)}</span><span>{trend.dates[trend.dates.length-1]?.slice(5)}</span>
            </div>
          </div>
        </div>
      )}

      {/* ── TOP KPIs ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 10, marginBottom: 20 }}>
        <KPIBox label="Total POs" value={pos.length} onClick={() => router.push('/purchase-orders')} />
        <KPIBox label="⚠ Unsplit" value={unsplitPOs.length} color={unsplitPOs.length > 0 ? T.yellow : T.muted} onClick={() => router.push('/purchase-orders')} />
        <KPIBox label="In Production" value={inProductionPOs.length} color={T.yellow} onClick={() => router.push('/purchase-orders?view=pos')} />
        <KPIBox label="In Transit" value={inTransit.length} color={T.blue} onClick={() => router.push('/purchase-orders')} />
        <KPIBox label="Booked In" value={bookedIn.length} color={T.green} onClick={() => router.push('/purchase-orders')} />
        <KPIBox label="🇬🇧 ROW Stock" value={totalUK.toLocaleString()} color="#3b82f6" onClick={() => router.push('/inventory')} />
        <KPIBox label="🇺🇸 US Stock" value={totalUS.toLocaleString()} color="#8b5cf6" onClick={() => router.push('/inventory')} />
      </div>

      {/* ── ROW 2 ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 20 }}>
        <KPIBox label="Total PO Value" value={`$${(totalPOValue / 1000).toFixed(0)}k`} color={T.accent} />
        <KPIBox label="Receipt in Progress" value={receipt.length} color={T.accent} onClick={() => router.push('/purchase-orders')} />
        <KPIBox label="⚠ Low Stock" value={lowStock} color={lowStock > 0 ? T.yellow : T.muted} onClick={() => router.push('/inventory')} />
        <KPIBox label="✕ Out of Stock" value={outOfStock} color={outOfStock > 0 ? T.red : T.muted} onClick={() => router.push('/inventory')} />
      </div>

      {/* ── ALERT banners ── */}
      {overduePayments.length > 0 && (
        <div onClick={() => router.push('/invoices')} style={{ background: '#ef444410', border: '1px solid #ef444430', borderRadius: 8, padding: '12px 16px', marginBottom: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span style={{ fontSize: 13, color: '#ef4444', fontWeight: 700 }}>🔴 {overduePayments.length} payment{overduePayments.length > 1 ? 's' : ''} overdue</span>
            <span style={{ fontSize: 11, color: '#ef444499' }}>
              {overduePayments.slice(0, 3).map(p => `${p.supplier} — ${p.type} ${fmt(p.amount, p.currency)} (due ${p.due})`).join('  ·  ')}{overduePayments.length > 3 ? `  · +${overduePayments.length - 3} more` : ''}
            </span>
          </div>
          <span style={{ fontSize: 12, color: '#ef4444', whiteSpace: 'nowrap', marginLeft: 16 }}>Go to Invoices →</span>
        </div>
      )}

      {upcomingPayments.length > 0 && (
        <div onClick={() => router.push('/invoices')} style={{ background: '#f59e0b10', border: '1px solid #f59e0b30', borderRadius: 8, padding: '12px 16px', marginBottom: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span style={{ fontSize: 13, color: T.yellow, fontWeight: 700 }}>⚠ {upcomingPayments.length} payment{upcomingPayments.length > 1 ? 's' : ''} due in the next 14 days</span>
            <span style={{ fontSize: 11, color: '#f59e0b99' }}>
              {upcomingPayments.slice(0, 3).map(p => `${p.supplier} — ${p.type} ${fmt(p.amount, p.currency)} (due ${p.due})`).join('  ·  ')}{upcomingPayments.length > 3 ? `  · +${upcomingPayments.length - 3} more` : ''}
            </span>
          </div>
          <span style={{ fontSize: 12, color: T.yellow, whiteSpace: 'nowrap', marginLeft: 16 }}>Go to Invoices →</span>
        </div>
      )}

      {unsplitPOs.length > 0 && (
        <div onClick={() => router.push('/purchase-orders')} style={{ background: '#f59e0b10', border: '1px solid #f59e0b30', borderRadius: 8, padding: '12px 16px', marginBottom: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}>
          <span style={{ fontSize: 13, color: T.yellow, fontWeight: 600 }}>⚠ {unsplitPOs.length} PO{unsplitPOs.length > 1 ? 's' : ''} waiting to be split into shipments</span>
          <span style={{ fontSize: 12, color: T.yellow }}>Go to Purchase Orders →</span>
        </div>
      )}

      {missingETA.length > 0 && (
        <div onClick={() => router.push('/purchase-orders')} style={{ background: '#3b82f610', border: '1px solid #3b82f630', borderRadius: 8, padding: '12px 16px', marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span style={{ fontSize: 13, color: '#3b82f6', fontWeight: 700 }}>📋 {missingETA.length} shipment{missingETA.length > 1 ? 's' : ''} in transit with no ETA</span>
            <span style={{ fontSize: 11, color: '#3b82f699' }}>{missingETA.slice(0, 3).map(s => s.shipment_ref).join('  ·  ')}{missingETA.length > 3 ? `  · +${missingETA.length - 3} more` : ''}</span>
          </div>
          <span style={{ fontSize: 12, color: '#3b82f6', whiteSpace: 'nowrap', marginLeft: 16 }}>Go to Purchase Orders →</span>
        </div>
      )}

      {/* ── MAIN GRID ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>

        {/* Incoming shipments */}
        <Section title={`📦 Incoming Shipments — next 60 days (${incoming.length})`} link="/purchase-orders" router={router}>
          {incoming.length === 0 ? (
            <div style={{ padding: '24px 18px', color: T.muted, fontSize: 13 }}>No shipments arriving in next 60 days</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: T.surface }}>
                  <Th>Shipment</Th><Th>DC</Th><Th>ETA</Th><Th>Status</Th><Th style={{ textAlign: 'right' }}>Units</Th>
                </tr>
              </thead>
              <tbody>
                {incoming.map(sh => {
                  const daysUntil = Math.ceil((new Date(sh.eta) - now) / (1000 * 60 * 60 * 24))
                  return (
                    <tr key={sh.id} className="row-hover">
                      <Td style={{ fontFamily: 'monospace', fontSize: 11, color: T.accent, fontWeight: 700 }}>{sh.shipment_ref}</Td>
                      <Td><DCBadge dc={sh.dc} /></Td>
                      <Td>
                        <div style={{ fontSize: 12, color: T.text }}>{sh.eta}</div>
                        <div style={{ fontSize: 10, color: daysUntil <= 7 ? T.yellow : T.muted }}>{daysUntil}d away</div>
                      </Td>
                      <Td><span style={{ color: statusColor(sh.status), fontSize: 11, fontWeight: 600 }}>{sh.status}</span></Td>
                      <Td style={{ textAlign: 'right', fontWeight: 700 }}>{(sh.units || 0).toLocaleString()}</Td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </Section>

        {/* Shipment pipeline */}
        <Section title="🚢 Shipment Pipeline" link="/purchase-orders" router={router}>
          <div style={{ padding: '16px 18px' }}>
            {[
              { label: 'In Production', items: inProduction, color: T.yellow },
              { label: 'In Transit', items: inTransit, color: T.blue },
              { label: 'Receipt in Progress', items: receipt, color: T.accent },
              { label: 'Booked In', items: bookedIn, color: T.green },
            ].map(stage => (
              <div key={stage.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: `1px solid ${T.border}` }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: stage.color, flexShrink: 0 }} />
                  <span style={{ fontSize: 13, color: T.text }}>{stage.label}</span>
                </div>
                <div style={{ display: 'flex', align: 'center', gap: 12 }}>
                  <span style={{ fontSize: 11, color: T.muted }}>
                    {stage.items.reduce((s, sh) => s + (sh.units || 0), 0).toLocaleString()} units
                  </span>
                  <span style={{ fontWeight: 800, color: stage.color, fontSize: 18, fontFamily: 'Barlow Condensed', minWidth: 28, textAlign: 'right' }}>{stage.items.length}</span>
                </div>
              </div>
            ))}
            <div style={{ marginTop: 14 }}>
              <div style={{ display: 'flex', height: 8, borderRadius: 4, overflow: 'hidden', gap: 1 }}>
                {[
                  { items: inProduction, color: T.yellow },
                  { items: inTransit, color: T.blue },
                  { items: receipt, color: T.accent },
                  { items: bookedIn, color: T.green },
                ].map((s, i) => {
                  const pct = shipments.length > 0 ? (s.items.length / shipments.length) * 100 : 0
                  return <div key={i} style={{ width: `${pct}%`, background: s.color, minWidth: s.items.length > 0 ? 4 : 0 }} />
                })}
              </div>
              <div style={{ fontSize: 10, color: T.muted, marginTop: 4, textAlign: 'right' }}>{shipments.length} total shipments</div>
            </div>
          </div>
        </Section>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>

        {/* Inventory snapshot */}
        <Section title="📦 Inventory Snapshot" link="/inventory" router={router}>
          <div style={{ padding: '16px 18px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
              {[
                { label: '🇬🇧 ROW Total Units', value: totalUK.toLocaleString(), color: '#3b82f6' },
                { label: '🇺🇸 US Total Units', value: totalUS.toLocaleString(), color: '#8b5cf6' },
                { label: '⚠ Low Stock SKUs', value: lowStock.toLocaleString(), color: lowStock > 0 ? T.yellow : T.green },
                { label: '✕ Out of Stock', value: outOfStock.toLocaleString(), color: outOfStock > 0 ? T.red : T.green },
              ].map(s => (
                <div key={s.label} style={{ background: T.surface, borderRadius: 6, padding: '10px 12px', border: `1px solid ${T.border}` }}>
                  <div style={{ fontSize: 10, color: T.muted, marginBottom: 3 }}>{s.label}</div>
                  <div style={{ fontSize: 20, fontFamily: 'Barlow Condensed', fontWeight: 800, color: s.color }}>{s.value}</div>
                </div>
              ))}
            </div>
            {/* UK vs US bar */}
            <div style={{ fontSize: 11, color: T.muted, marginBottom: 6, display: 'flex', justifyContent: 'space-between' }}>
              <span><span style={{ color: '#3b82f6' }}>■</span> ROW {totalUK > 0 ? Math.round(totalUK / (totalUK + totalUS) * 100) : 0}%</span>
              <span><span style={{ color: '#8b5cf6' }}>■</span> US {totalUS > 0 ? Math.round(totalUS / (totalUK + totalUS) * 100) : 0}%</span>
            </div>
            <div style={{ display: 'flex', height: 8, borderRadius: 4, overflow: 'hidden' }}>
              <div style={{ flex: totalUK, background: '#3b82f6' }} />
              <div style={{ flex: totalUS, background: '#8b5cf6' }} />
            </div>
          </div>
        </Section>

        {/* Suppliers */}
        <Section title={`🏭 Suppliers (${activeSuppliers.length} active)`} link="/suppliers" router={router}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: T.surface }}>
                <Th>Code</Th><Th>Supplier</Th><Th style={{ textAlign: 'right' }}>Shipments</Th><Th style={{ textAlign: 'right' }}>In Transit</Th><Th style={{ textAlign: 'right' }}>On-Time</Th>
              </tr>
            </thead>
            <tbody>
              {topSuppliers.map(s => (
                <tr key={s.name} className="row-hover">
                  <Td>
                    <span style={{ background: T.accent + '20', color: T.accent, borderRadius: 3, padding: '1px 8px', fontSize: 11, fontWeight: 800, fontFamily: 'monospace' }}>
                      {suppliers.find(sup => sup.name === s.name)?.code || s.name.slice(0, 3).toUpperCase()}
                    </span>
                  </Td>
                  <Td style={{ fontWeight: 600, fontSize: 13 }}>{s.name}</Td>
                  <Td style={{ textAlign: 'right', fontWeight: 700 }}>{s.count}</Td>
                  <Td style={{ textAlign: 'right', color: s.inTransit > 0 ? T.blue : T.muted, fontWeight: s.inTransit > 0 ? 700 : 400 }}>{s.inTransit}</Td>
                  <Td style={{ textAlign: 'right' }}>
                    {s.deliveredCount > 0
                      ? (() => { const pct = Math.round(s.onTimeCount / s.deliveredCount * 100); return <span style={{ fontWeight: 700, color: pct >= 80 ? T.green : pct >= 60 ? T.yellow : T.red }}>{pct}%</span> })()
                      : <span style={{ color: T.border, fontSize: 12 }}>—</span>}
                  </Td>
                </tr>
              ))}
              {topSuppliers.length === 0 && (
                <tr><td colSpan={4} style={{ padding: '20px 18px', color: T.muted, fontSize: 13 }}>No supplier data</td></tr>
              )}
            </tbody>
          </table>
        </Section>
      </div>

      {/* Top Products — last 7 days */}
      <div style={{ marginTop: 16, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        {[
          { label: '🇬🇧 Top ROW Products', rows: topSales.row, color: '#3b82f6' },
          { label: '🇺🇸 Top US Products',  rows: topSales.us,  color: '#8b5cf6' },
        ].map(({ label, rows, color }) => (
          <div key={label} style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 10, overflow: 'hidden' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 18px', borderBottom: `1px solid ${T.border}` }}>
              <span style={{ fontFamily: 'Barlow Condensed', fontWeight: 700, fontSize: 14, color: T.muted, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                {label} <span style={{ color: T.border, fontWeight: 400 }}>· last 7 days</span>
              </span>
              <button onClick={() => router.push('/sales')} style={{ background: 'none', border: 'none', color: T.accent, fontSize: 12, cursor: 'pointer', fontWeight: 600 }}>View all →</button>
            </div>
            {rows.length === 0 ? (
              <div style={{ padding: '20px 18px', color: T.muted, fontSize: 13 }}>Loading…</div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: T.surface }}>
                    <Th style={{ width: 28, textAlign: 'center' }}>#</Th>
                    <Th>Product</Th>
                    <Th style={{ textAlign: 'right' }}>Sold</Th>
                    <Th style={{ textAlign: 'right' }}>Revenue</Th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={r.item_id + i} className="row-hover">
                      <Td style={{ textAlign: 'center', color: T.muted, fontSize: 11, fontWeight: 700 }}>
                        {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i + 1}
                      </Td>
                      <Td style={{ fontWeight: 600, fontSize: 13, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {r.item_name || r.item_id || '—'}
                      </Td>
                      <Td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: color, fontWeight: 700 }}>
                        {(r.purchased || 0).toLocaleString('en-GB')}
                      </Td>
                      <Td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 700, color: T.green }}>
                        {new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 0 }).format(r.revenue || 0)}
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        ))}
      </div>
    <style>{`@keyframes pulse { 0%, 100% { opacity: 1 } 50% { opacity: 0.3 } }`}</style>
    </Shell>
  )
}
