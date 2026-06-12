'use client'
import { useEffect, useState } from 'react'
import Shell from '@/components/Shell'
import { T, Th, Td, Loading } from '@/components/ui'
import { supabase } from '@/lib/supabase'

const fmtCcy = (n, cur = 'USD') =>
  new Intl.NumberFormat('en-GB', { style: 'currency', currency: cur, maximumFractionDigits: 0 }).format(n || 0)

const monthKey = (d) => d?.slice(0, 7) // 'YYYY-MM'
const monthLabel = (k) => {
  const [y, m] = k.split('-')
  return new Date(y, m - 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
}

export default function CashflowPage() {
  const [invoices, setInvoices] = useState([])
  const [loading, setLoading]   = useState(true)
  const [filter, setFilter]     = useState('upcoming') // 'upcoming' | 'all'

  useEffect(() => {
    supabase
      .from('invoices')
      .select('*')
      .order('deposit_due_date', { ascending: true })
      .then(({ data }) => { setInvoices(data || []); setLoading(false) })
  }, [])

  // Build payment entries
  const today = new Date().toISOString().slice(0, 10)
  const cutoff = new Date(); cutoff.setMonth(cutoff.getMonth() + 6)
  const cutoffStr = cutoff.toISOString().slice(0, 10)

  const payments = []
  for (const inv of invoices) {
    if (inv.deposit_amount > 0 && !inv.deposit_paid_date && inv.deposit_due_date) {
      if (filter === 'all' || inv.deposit_due_date <= cutoffStr) {
        payments.push({
          id: `${inv.id}-dep`,
          supplier: inv.supplier_name,
          invoice: inv.invoice_number,
          type: 'Deposit',
          amount: inv.deposit_amount,
          currency: inv.currency || 'USD',
          due: inv.deposit_due_date,
          overdue: inv.deposit_due_date < today,
        })
      }
    }
    if (inv.balance_amount > 0 && !inv.balance_paid_date && inv.balance_due_date) {
      if (filter === 'all' || inv.balance_due_date <= cutoffStr) {
        payments.push({
          id: `${inv.id}-bal`,
          supplier: inv.supplier_name,
          invoice: inv.invoice_number,
          type: 'Balance',
          amount: inv.balance_amount,
          currency: inv.currency || 'USD',
          due: inv.balance_due_date,
          overdue: inv.balance_due_date < today,
        })
      }
    }
  }
  payments.sort((a, b) => a.due.localeCompare(b.due))

  // Group by month
  const grouped = {}
  for (const p of payments) {
    const k = monthKey(p.due)
    if (!grouped[k]) grouped[k] = []
    grouped[k].push(p)
  }
  const months = Object.keys(grouped).sort()

  // Running total (USD only for simplicity)
  let running = 0
  const monthTotals = {}
  for (const k of months) {
    const total = grouped[k].reduce((s, p) => s + (p.currency === 'USD' ? p.amount : 0), 0)
    running += total
    monthTotals[k] = { total, running }
  }

  const grandTotal = payments.reduce((s, p) => s + (p.currency === 'USD' ? p.amount : 0), 0)
  const overdueTotal = payments.filter(p => p.overdue).reduce((s, p) => s + (p.currency === 'USD' ? p.amount : 0), 0)

  return (
    <Shell title="Cashflow">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ fontFamily: 'Barlow Condensed', fontWeight: 800, fontSize: 26, letterSpacing: '-0.3px', color: T.text }}>Cashflow Forecast</div>
          <div style={{ fontSize: 12, color: T.muted, marginTop: 2 }}>Upcoming supplier payments · unpaid deposits & balances</div>
        </div>
        <div style={{ display: 'flex', gap: 4, background: T.surface, border: `1px solid ${T.border}`, borderRadius: 7, padding: 3 }}>
          {[['upcoming', 'Next 6 months'], ['all', 'All outstanding']].map(([v, l]) => (
            <button key={v} onClick={() => setFilter(v)} style={{
              background: filter === v ? T.accent : 'transparent',
              color: filter === v ? '#fff' : T.muted,
              border: 'none', borderRadius: 5, padding: '5px 14px',
              fontSize: 12, fontWeight: 700, cursor: 'pointer',
            }}>{l}</button>
          ))}
        </div>
      </div>

      {loading ? <Loading /> : (
        <>
          {/* Summary KPIs */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 28 }}>
            {[
              { label: 'Total Outstanding (USD)', value: fmtCcy(grandTotal, 'USD'), color: T.accent },
              { label: '⚠ Overdue', value: fmtCcy(overdueTotal, 'USD'), color: overdueTotal > 0 ? T.red : T.green },
              { label: 'Payments', value: payments.length, color: T.muted },
            ].map(k => (
              <div key={k.label} style={{ background: T.card, border: `1px solid ${T.border}`, borderTop: `2px solid ${k.color}`, borderRadius: 8, padding: '14px 18px' }}>
                <div style={{ fontSize: 10, color: T.muted, textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 700, marginBottom: 6 }}>{k.label}</div>
                <div style={{ fontSize: 22, fontFamily: 'Barlow Condensed', fontWeight: 800, color: k.color }}>{k.value}</div>
              </div>
            ))}
          </div>

          {/* Monthly sections */}
          {months.length === 0 ? (
            <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 10, padding: 40, textAlign: 'center', color: T.muted, fontSize: 13 }}>
              No outstanding payments found
            </div>
          ) : months.map(k => (
            <div key={k} style={{ marginBottom: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <div style={{ fontFamily: 'Barlow Condensed', fontWeight: 800, fontSize: 18, color: T.text }}>{monthLabel(k)}</div>
                <div style={{ display: 'flex', gap: 16, fontSize: 12 }}>
                  <span style={{ color: T.muted }}>Month total: <strong style={{ color: T.accent }}>{fmtCcy(monthTotals[k].total, 'USD')}</strong></span>
                  <span style={{ color: T.muted }}>Running: <strong style={{ color: T.text }}>{fmtCcy(monthTotals[k].running, 'USD')}</strong></span>
                </div>
              </div>
              <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 10, overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: T.surface }}>
                      <Th>Supplier</Th>
                      <Th>Invoice</Th>
                      <Th style={{ textAlign: 'center' }}>Type</Th>
                      <Th style={{ textAlign: 'right' }}>Due Date</Th>
                      <Th style={{ textAlign: 'right' }}>Amount</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {grouped[k].map(p => (
                      <tr key={p.id} className="row-hover" style={{ borderTop: `1px solid ${T.border}` }}>
                        <Td style={{ fontWeight: 600 }}>{p.supplier || '—'}</Td>
                        <Td style={{ fontFamily: 'monospace', fontSize: 12, color: T.muted }}>{p.invoice || '—'}</Td>
                        <Td style={{ textAlign: 'center' }}>
                          <span style={{
                            background: p.type === 'Deposit' ? '#3b82f620' : '#a78bfa20',
                            color: p.type === 'Deposit' ? '#3b82f6' : '#a78bfa',
                            border: `1px solid ${p.type === 'Deposit' ? '#3b82f640' : '#a78bfa40'}`,
                            borderRadius: 3, padding: '1px 8px', fontSize: 11, fontWeight: 700,
                          }}>{p.type}</span>
                        </Td>
                        <Td style={{ textAlign: 'right', fontSize: 12 }}>
                          <span style={{ color: p.overdue ? T.red : T.text, fontWeight: p.overdue ? 700 : 400 }}>
                            {p.overdue && '⚠ '}{new Date(p.due).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                          </span>
                        </Td>
                        <Td style={{ textAlign: 'right', fontWeight: 700, color: p.overdue ? T.red : T.text, fontVariantNumeric: 'tabular-nums' }}>
                          {fmtCcy(p.amount, p.currency)}
                        </Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </>
      )}
    </Shell>
  )
}
