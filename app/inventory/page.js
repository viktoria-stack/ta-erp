'use client'
import { useEffect, useState } from 'react'
import Shell from '@/components/Shell'
import { T, KPI, Card, Th, Td, SIZES, WAREHOUSES, fmt, Loading, ErrorMsg } from '@/components/ui'
import { getProducts } from '@/lib/supabase'

export default function InventoryPage() {
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [warehouse, setWarehouse] = useState('All')
  const [search, setSearch] = useState('')

  useEffect(() => {
    getProducts()
      .then(setProducts)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  const filtered = products.filter(p => {
    const matchWH = warehouse === 'All' || p.warehouse === warehouse
    const matchSearch = !search || p.name.toLowerCase().includes(search.toLowerCase()) || p.id.toLowerCase().includes(search.toLowerCase())
    return matchWH && matchSearch
  })

  const totalUnits = products.reduce((s, p) => s + SIZES.reduce((q, sz) => q + (p.sizes?.[sz] || 0), 0), 0)
  const lowStock = products.filter(p => SIZES.some(sz => (p.sizes?.[sz] || 0) < 50)).length

  return (
    <Shell title="Inventory & Stock">
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
        <KPI label="SKUs" value={products.length} />
        <KPI label="Total Units" value={totalUnits.toLocaleString()} />
        <KPI label="Low Stock (<50 any size)" value={lowStock} color={T.yellow} />
        <KPI label="Warehouses" value={WAREHOUSES.length} />
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', gap: 6 }}>
          {['All', ...WAREHOUSES].map(w => (
            <button key={w} onClick={() => setWarehouse(w)} style={{
              background: warehouse === w ? T.accent : T.subtle, color: warehouse === w ? '#fff' : T.muted,
              border: 'none', borderRadius: 4, padding: '5px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer'
            }}>{w}</button>
          ))}
        </div>
        <input placeholder="Search SKU or product…" value={search} onChange={e => setSearch(e.target.value)}
          style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 5, padding: '7px 12px', color: T.text, fontSize: 13, width: 240, outline: 'none' }} />
      </div>

      {error && <ErrorMsg msg={error} />}
      {loading ? <Loading /> : (
        <Card>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: T.surface }}>
                  <Th>SKU</Th>
                  <Th>Product</Th>
                  <Th>Category</Th>
                  <Th>Warehouse</Th>
                  {SIZES.map(s => <Th key={s} style={{ textAlign: 'center' }}>{s}</Th>)}
                  <Th style={{ textAlign: 'right' }}>Total</Th>
                  <Th style={{ textAlign: 'right' }}>Unit Cost</Th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(p => {
                  const total = SIZES.reduce((s, sz) => s + (p.sizes?.[sz] || 0), 0)
                  return (
                    <tr key={p.id} className="row-hover">
                      <Td style={{ fontFamily: 'monospace', fontSize: 11, color: T.muted }}>{p.id}</Td>
                      <Td style={{ fontWeight: 600 }}>{p.name}</Td>
                      <Td style={{ color: T.muted, fontSize: 12 }}>{p.category}</Td>
                      <Td style={{ color: T.muted, fontSize: 12 }}>{p.warehouse}</Td>
                      {SIZES.map(sz => {
                        const qty = p.sizes?.[sz] || 0
                        return (
                          <Td key={sz} style={{ textAlign: 'center', color: qty < 50 ? T.yellow : T.muted, fontWeight: qty < 50 ? 700 : 400 }}>
                            {qty}
                          </Td>
                        )
                      })}
                      <Td style={{ textAlign: 'right', fontWeight: 700 }}>{total.toLocaleString()}</Td>
                      <Td style={{ textAlign: 'right', color: T.accent }}>{fmt(p.cost, p.currency)}</Td>
                    </tr>
                  )
                })}
                {filtered.length === 0 && (
                  <tr><td colSpan={4 + SIZES.length + 2} style={{ padding: 32, textAlign: 'center', color: T.muted }}>No products found</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </Shell>
  )
}
