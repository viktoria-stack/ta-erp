'use client'
import { useEffect, useState } from 'react'
import Shell from '@/components/Shell'
import { T, KPI, Card, Badge, fmt, SIZES, totalInGBP, Loading, ErrorMsg } from '@/components/ui'
import { getSuppliers, getPurchaseOrders } from '@/lib/supabase'

export default function SuppliersPage() {
  const [suppliers, setSuppliers] = useState([])
  const [pos, setPos] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    Promise.all([getSuppliers(), getPurchaseOrders()])
      .then(([s, p]) => { setSuppliers(s); setPos(p) })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  const active = suppliers.filter(s => s.status === 'Active')
  const avgLead = active.length ? Math.round(active.reduce((s, x) => s + (x.lead_days || 0), 0) / active.length) : 0

  return (
    <Shell title="Suppliers">
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
        <KPI label="Total Suppliers" value={suppliers.length} />
        <KPI label="Active" value={active.length} color={T.green} />
        <KPI label="Avg Lead Time" value={`${avgLead} days`} />
        <KPI label="Countries" value={[...new Set(suppliers.map(s => s.country))].length} />
      </div>

      {error && <ErrorMsg msg={error} />}
      {loading ? <Loading /> : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16 }}>
          {suppliers.map(s => {
            const supplierPOs = pos.filter(p => p.supplier_id === s.id)
            const totalSpend = supplierPOs.reduce((sum, p) => sum + totalInGBP(p), 0)
            const activePOs = supplierPOs.filter(p => !['Received', 'Cancelled'].includes(p.status)).length

            return (
              <Card key={s.id} style={{ padding: 20 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 15, color: T.text, marginBottom: 2 }}>{s.name}</div>
                    <div style={{ fontSize: 12, color: T.muted }}>{s.country} · {s.currency}</div>
                  </div>
                  <Badge status={s.status} />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 14 }}>
                  {[
                    { label: 'Lead Time', value: `${s.lead_days || '—'} days` },
                    { label: 'Total POs', value: supplierPOs.length },
                    { label: 'Active POs', value: activePOs },
                    { label: 'Total Spend', value: fmt(totalSpend, 'GBP') },
                  ].map(f => (
                    <div key={f.label} style={{ background: T.surface, borderRadius: 5, padding: '10px 12px', border: `1px solid ${T.border}` }}>
                      <div style={{ fontSize: 10, color: T.muted, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 3 }}>{f.label}</div>
                      <div style={{ fontWeight: 700, fontSize: 14, color: T.text }}>{f.value}</div>
                    </div>
                  ))}
                </div>

                <div style={{ fontSize: 12, color: T.muted }}>
                  <span style={{ marginRight: 16 }}>✉ {s.contact || '—'}</span>
                  <span>📞 {s.phone || '—'}</span>
                </div>

                {s.notes && (
                  <div style={{ marginTop: 10, fontSize: 12, color: T.muted, background: T.surface, borderRadius: 5, padding: '8px 12px', border: `1px solid ${T.border}` }}>
                    {s.notes}
                  </div>
                )}
              </Card>
            )
          })}
        </div>
      )}
    </Shell>
  )
}
