'use client'
import { useEffect, useState, useCallback } from 'react'
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
  ] = await Promise.all([
    supabase.from('purchase_orders').select('id, supplier_name, total_cost_value, currency, ex_factory_date, po_splits_confirmed, created_at'),
    supabase.from('shipments').select('id, po_id, dc, status, units, eta, freight_forwarder, shipment_ref, tracking_number'),
    supabase.from('suppliers').select('id, name, code, status'),
    supabase.from('inventory').select('qty_uk, qty_us').limit(5000),
  ])

  return { pos: pos || [], shipments: shipments || [], suppliers: suppliers || [], invStats: invStats || [] }
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
  const router = useRouter()
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

  const { pos, shipments, suppliers, invStats } = data

  // ── PO stats
  const unsplitPOs = pos.filter(p => !p.po_splits_confirmed)
  const totalPOValue = pos.reduce((s, p) => s + (p.total_cost_value || 0), 0)

  // ── Shipment stats
  const inProduction = shipments.filter(s => s.status === 'In production')
  const inTransit = shipments.filter(s => s.status?.includes('transit'))
  const receipt = shipments.filter(s => s.status === 'Receipt in progress')
  const bookedIn = shipments.filter(s => s.status?.includes('Booked in') || s.status?.includes('booked in'))

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

  // ── Inventory stats
  const totalUK = invStats.reduce((s, r) => s + (r.qty_uk || 0), 0)
  const totalUS = invStats.reduce((s, r) => s + (r.qty_us || 0), 0)
  const outOfStock = invStats.filter(r => !r.qty_uk && !r.qty_us).length
  const lowStock = invStats.filter(r => (r.qty_uk > 0 && r.qty_uk < 10) || (r.qty_us > 0 && r.qty_us < 10)).length

  // ── Supplier stats
  const activeSuppliers = suppliers.filter(s => s.status === 'Active')

  // ── Shipments per supplier (from PO data)
  const supplierShipments = {}
  for (const sh of shipments) {
    const po = pos.find(p => p.id === sh.po_id)
    const name = po?.supplier_name || 'Unknown'
    if (!supplierShipments[name]) supplierShipments[name] = { name, count: 0, inTransit: 0, inProduction: 0 }
    supplierShipments[name].count++
    if (sh.status?.includes('transit')) supplierShipments[name].inTransit++
    if (sh.status === 'In production') supplierShipments[name].inProduction++
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

      {/* ── TOP KPIs ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 10, marginBottom: 20 }}>
        <KPIBox label="Total POs" value={pos.length} onClick={() => router.push('/purchase-orders')} />
        <KPIBox label="⚠ Unsplit" value={unsplitPOs.length} color={unsplitPOs.length > 0 ? T.yellow : T.muted} onClick={() => router.push('/purchase-orders')} />
        <KPIBox label="In Production" value={inProduction.length} color={T.yellow} onClick={() => router.push('/purchase-orders')} />
        <KPIBox label="In Transit" value={inTransit.length} color={T.blue} onClick={() => router.push('/purchase-orders')} />
        <KPIBox label="Booked In" value={bookedIn.length} color={T.green} onClick={() => router.push('/purchase-orders')} />
        <KPIBox label="🇬🇧 UK Stock" value={totalUK.toLocaleString()} color="#3b82f6" onClick={() => router.push('/inventory')} />
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
      {unsplitPOs.length > 0 && (
        <div onClick={() => router.push('/purchase-orders')} style={{ background: '#f59e0b10', border: '1px solid #f59e0b30', borderRadius: 8, padding: '12px 16px', marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}>
          <span style={{ fontSize: 13, color: T.yellow, fontWeight: 600 }}>⚠ {unsplitPOs.length} PO{unsplitPOs.length > 1 ? 's' : ''} waiting to be split into shipments</span>
          <span style={{ fontSize: 12, color: T.yellow }}>Go to Purchase Orders →</span>
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
                { label: '🇬🇧 UK Total Units', value: totalUK.toLocaleString(), color: '#3b82f6' },
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
              <span><span style={{ color: '#3b82f6' }}>■</span> UK {totalUK > 0 ? Math.round(totalUK / (totalUK + totalUS) * 100) : 0}%</span>
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
                <Th>Code</Th><Th>Supplier</Th><Th style={{ textAlign: 'right' }}>Shipments</Th><Th style={{ textAlign: 'right' }}>In Transit</Th>
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
                </tr>
              ))}
              {topSuppliers.length === 0 && (
                <tr><td colSpan={4} style={{ padding: '20px 18px', color: T.muted, fontSize: 13 }}>No supplier data</td></tr>
              )}
            </tbody>
          </table>
        </Section>
      </div>

      {/* Sales placeholder */}
      <div style={{ marginTop: 16, background: T.card, border: `1px dashed ${T.border}`, borderRadius: 10, padding: '20px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontFamily: 'Barlow Condensed', fontWeight: 700, fontSize: 14, color: T.muted, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>📈 Sales Dashboard</div>
          <div style={{ fontSize: 12, color: T.muted }}>Connect Shopify API to see live revenue, orders and top products here</div>
        </div>
        <button onClick={() => router.push('/sales')} style={{ background: T.accent, color: '#fff', border: 'none', borderRadius: 5, padding: '8px 16px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
          Set up Sales →
        </button>
      </div>
    <style>{\`@keyframes pulse { 0%, 100% { opacity: 1 } 50% { opacity: 0.3 } }\`}</style>
    </Shell>
  )
}
