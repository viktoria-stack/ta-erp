'use client'
import { useEffect, useState } from 'react'
import Shell from '@/components/Shell'
import { T, KPI, Card, Badge, Th, Td, SIZES, fmt, poTotal, totalInGBP, statusColor, Loading, ErrorMsg } from '@/components/ui'
import { getPurchaseOrders, getProducts, getSuppliers } from '@/lib/supabase'

const PO_PIPELINE = ['Sent', 'Confirmed', 'In Production', 'Shipped']

export default function DashboardPage() {
  const [pos, setPos] = useState([])
  const [products, setProducts] = useState([])
  const [suppliers, setSuppliers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    Promise.all([getPurchaseOrders(), getProducts(), getSuppliers()])
      .then(([p, pr, s]) => { setPos(p); setProducts(pr); setSuppliers(s) })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <Shell title="Dashboard"><Loading /></Shell>
  if (error) return <Shell title="Dashboard"><ErrorMsg msg={error} /></Shell>

  const totalSpend = pos.reduce((s, p) => s + totalInGBP(p), 0)
  const outstanding = pos.filter(p => !['Received', 'Cancelled'].includes(p.status)).reduce((s, p) => s + totalInGBP(p), 0)
  const totalUnits = products.reduce((s, p) => s + SIZES.reduce((q, sz) => q + (p.sizes?.[sz] || 0), 0), 0)
  const recentPOs = pos.slice(0, 5)

  const lowStockItems = products.flatMap(p =>
    SIZES.filter(sz => (p.sizes?.[sz] || 0) < 50).map(sz => ({ ...p, sz, qty: p.sizes?.[sz] || 0 }))
  ).sort((a, b) => a.qty - b.qty).slice(0, 8)

  return (
    <Shell title="Dashboard">
      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
        <KPI label="Total PO Spend (GBP)" value={fmt(totalSpend, 'GBP')} color={T.accent} />
        <KPI label="Outstanding Orders" value={fmt(outstanding, 'GBP')} color={T.yellow} sub="Pending receipt" />
        <KPI label="Inventory Units" value={totalUnits.toLocaleString()} />
        <KPI label="Active Suppliers" value={suppliers.filter(s => s.status === 'Active').length} color={T.green} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
        {/* PO Pipeline */}
        <Card style={{ padding: 20 }}>
          <div style={{ fontFamily: 'Barlow Condensed', fontWeight: 700, fontSize: 14, color: T.muted, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 14 }}>
            PO Pipeline
          </div>
          {PO_PIPELINE.map(s => {
            const count = pos.filter(p => p.status === s).length
            const value = pos.filter(p => p.status === s).reduce((sum, p) => sum + totalInGBP(p), 0)
            return (
              <div key={s} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: statusColor(s) }}></div>
                  <span style={{ fontSize: 13, color: T.text }}>{s}</span>
                  <span style={{ fontSize: 11, color: T.muted, background: T.subtle, borderRadius: 3, padding: '1px 6px' }}>{count}</span>
                </div>
                <span style={{ fontSize: 13, fontWeight: 700, color: count > 0 ? T.accent : T.muted, fontFamily: 'monospace' }}>
                  {fmt(value, 'GBP')}
                </span>
              </div>
            )
          })}
        </Card>

        {/* Low Stock */}
        <Card style={{ padding: 20 }}>
          <div style={{ fontFamily: 'Barlow Condensed', fontWeight: 700, fontSize: 14, color: T.muted, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 14 }}>
            ⚠ Low Stock Alerts
          </div>
          {lowStockItems.length === 0 ? (
            <div style={{ color: T.green, fontSize: 13 }}>✓ All sizes sufficiently stocked</div>
          ) : lowStockItems.map((item, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: `1px solid ${T.border}` }}>
              <div>
                <span style={{ fontSize: 13, color: T.text, fontWeight: 600 }}>{item.name}</span>
                <span style={{ fontSize: 11, color: T.muted, marginLeft: 8 }}>{item.sz}</span>
              </div>
              <span style={{ fontSize: 13, fontWeight: 700, color: item.qty < 20 ? T.red : T.yellow }}>{item.qty} units</span>
            </div>
          ))}
        </Card>
      </div>

      {/* Recent POs */}
      <Card>
        <div style={{ padding: '16px 18px', borderBottom: `1px solid ${T.border}`, fontFamily: 'Barlow Condensed', fontWeight: 700, fontSize: 14, color: T.muted, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          Recent Purchase Orders
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: T.surface }}>
                <Th>PO Number</Th><Th>Supplier</Th><Th>Expected Delivery</Th><Th>Warehouse</Th>
                <Th style={{ textAlign: 'right' }}>Value</Th><Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {recentPOs.map(po => (
                <tr key={po.id} className="row-hover">
                  <Td style={{ fontFamily: 'monospace', fontSize: 12, color: T.accent, fontWeight: 700 }}>{po.id}</Td>
                  <Td style={{ fontWeight: 600 }}>{po.supplier_name}</Td>
                  <Td style={{ color: T.muted, fontSize: 12 }}>{po.expected_delivery || '—'}</Td>
                  <Td style={{ color: T.muted, fontSize: 12 }}>{po.warehouse}</Td>
                  <Td style={{ textAlign: 'right', fontWeight: 700, color: T.accent, fontFamily: 'monospace' }}>{fmt(poTotal(po), po.currency)}</Td>
                  <Td><Badge status={po.status} /></Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </Shell>
  )
}
