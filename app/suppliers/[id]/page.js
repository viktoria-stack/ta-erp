'use client'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Shell from '@/components/Shell'
import { T, Th, Td, BtnPrimary, BtnGhost, Modal, Loading, ErrorMsg, fmt } from '@/components/ui'
import { supabase } from '@/lib/supabase'

const EMPTY = {
  name: '', code: '', product_types: '', payment_terms: '', address: '',
  lead_time_days: '', transit_time: '', country_of_origin: '', nearest_port: '',
  contact: '', phone: '', currency: 'USD', status: 'Active', notes: '', website: '',
}
const FIELDS = [
  { key: 'name',              label: 'Company Name',         required: true, full: true },
  { key: 'code',              label: 'Code / Abbreviation',  placeholder: 'e.g. GWG' },
  { key: 'contact',           label: 'Contact Name' },
  { key: 'phone',             label: 'Phone / WhatsApp' },
  { key: 'website',           label: 'Website' },
  { key: 'product_types',     label: 'Product Types',        full: true },
  { key: 'payment_terms',     label: 'Payment Terms',        full: true, textarea: true },
  { key: 'address',           label: 'Address',              full: true, textarea: true },
  { key: 'country_of_origin', label: 'Country of Origin' },
  { key: 'nearest_port',      label: 'Nearest Port' },
  { key: 'lead_time_days',    label: 'Production Lead Time', placeholder: 'e.g. 45 days' },
  { key: 'transit_time',      label: 'Transit Time',         placeholder: 'e.g. 8 weeks Sea / 2 weeks Air' },
  { key: 'currency',          label: 'Currency',             options: ['USD', 'GBP', 'EUR'] },
  { key: 'status',            label: 'Status',               options: ['Active', 'Inactive'] },
  { key: 'notes',             label: 'Notes',                full: true, textarea: true },
]

const STATUS_COLOR = {
  'In production':                     { color: '#f59e0b' },
  'In transit - awaiting freight info': { color: '#3b82f6' },
  'Receipt in progress':               { color: '#a78bfa' },
  'Delivered':                         { color: '#22c55e' },
  'Booked in & checked':               { color: '#22c55e' },
  'Delivered + booked in':             { color: '#22c55e' },
}

const fmtDate = (d) => {
  if (!d) return '—'
  const dt = new Date(d)
  return dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

function EditModal({ supplier, onClose, onSaved }) {
  const [form, setForm] = useState({ ...EMPTY, ...supplier })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const upd = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const inp = (extra = {}) => ({ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 5, padding: '8px 10px', color: T.text, fontSize: 13, outline: 'none', width: '100%', ...extra })

  const save = async () => {
    if (!form.name.trim()) { setError('Company name is required'); return }
    setSaving(true)
    try {
      const { id, created_at, ...updates } = form
      await supabase.from('suppliers').update(updates).eq('id', id)
      onSaved()
      onClose()
    } catch (e) { setError(e.message); setSaving(false) }
  }

  return (
    <Modal title={`Edit — ${supplier.name}`} width={900} onClose={onClose}>
      {error && <div style={{ color: T.red, background: '#ef444415', border: `1px solid #ef444440`, borderRadius: 5, padding: '10px 14px', marginBottom: 16, fontSize: 13 }}>⚠ {error}</div>}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 24 }}>
        {FIELDS.map(f => (
          <div key={f.key} style={{ gridColumn: f.full ? '1 / -1' : 'auto' }}>
            <div style={{ fontSize: 11, color: T.muted, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 5 }}>
              {f.label} {f.required && <span style={{ color: T.red }}>*</span>}
            </div>
            {f.options ? (
              <select value={form[f.key] || ''} onChange={e => upd(f.key, e.target.value)} style={inp()}>{f.options.map(o => <option key={o}>{o}</option>)}</select>
            ) : f.textarea ? (
              <textarea value={form[f.key] || ''} onChange={e => upd(f.key, e.target.value)} placeholder={f.placeholder || ''} rows={3} style={{ ...inp(), resize: 'vertical', fontFamily: 'inherit' }} />
            ) : (
              <input value={form[f.key] || ''} onChange={e => upd(f.key, e.target.value)} placeholder={f.placeholder || ''} style={inp()} />
            )}
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
        <BtnGhost onClick={onClose}>Cancel</BtnGhost>
        <BtnPrimary onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save Supplier'}</BtnPrimary>
      </div>
    </Modal>
  )
}

const KPI = ({ label, value, color, sub }) => (
  <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 8, padding: '16px 20px' }}>
    <div style={{ fontSize: 10, color: T.muted, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>{label}</div>
    <div style={{ fontSize: 26, fontFamily: 'Barlow Condensed', fontWeight: 800, color: color || T.text, lineHeight: 1 }}>{value ?? '—'}</div>
    {sub && <div style={{ fontSize: 11, color: T.muted, marginTop: 3 }}>{sub}</div>}
  </div>
)

const SectionHead = ({ title }) => (
  <div style={{ fontFamily: 'Barlow Condensed', fontWeight: 700, fontSize: 14, color: T.muted, textTransform: 'uppercase', letterSpacing: '0.08em', margin: '28px 0 10px' }}>{title}</div>
)

const InfoRow = ({ label, value }) => (
  <div style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
    <span style={{ fontSize: 12, color: T.muted, minWidth: 140 }}>{label}</span>
    <span style={{ fontSize: 13, color: T.text }}>{value || '—'}</span>
  </div>
)

export default function SupplierDetailPage() {
  const { id } = useParams()
  const router = useRouter()

  const [supplier, setSupplier] = useState(null)
  const [pos, setPos] = useState([])
  const [invoices, setInvoices] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [editing, setEditing] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const [{ data: sup }, { data: poData }, { data: invData }] = await Promise.all([
        supabase.from('suppliers').select('*').eq('id', id).single(),
        supabase.from('purchase_orders').select('*, shipments(*)').order('id'),
        supabase.from('invoices').select('*').order('invoice_date', { ascending: false }),
      ])
      if (!sup) { setError('Supplier not found'); return }
      setSupplier(sup)

      const supplierPos = (poData || []).filter(p =>
        (p.supplier_name || '').toLowerCase() === sup.name.toLowerCase() ||
        (p.supplier_ref || '').toLowerCase() === sup.name.toLowerCase()
      )
      setPos(supplierPos)

      const supplierInvoices = (invData || []).filter(inv =>
        (inv.supplier_name || '').toLowerCase() === sup.name.toLowerCase()
      )
      setInvoices(supplierInvoices)
    } catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [id])

  if (loading) return <Shell title="Supplier"><Loading /></Shell>
  if (error) return <Shell title="Supplier"><ErrorMsg msg={error} /></Shell>
  if (!supplier) return null

  const allShipments = pos.flatMap(p => p.shipments || [])
  const inTransit = allShipments.filter(s => s.status?.includes('transit')).length
  const totalPOValue = pos.reduce((s, p) => s + (p.total_cost_value || 0), 0)
  const totalInvoiced = invoices.reduce((s, i) => s + (i.deposit_amount || 0) + (i.balance_amount || 0), 0)
  const unpaidInvoices = invoices.filter(i => {
    const depPaid = !i.deposit_amount || !!i.deposit_paid_date
    const balPaid = !i.balance_amount || !!i.balance_paid_date
    return !(depPaid && balPaid)
  })

  return (
    <Shell title={supplier.name}>
      {editing && <EditModal supplier={supplier} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); load() }} />}

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={() => router.push('/suppliers')} style={{ background: T.subtle, border: 'none', color: T.muted, borderRadius: 5, padding: '6px 12px', fontSize: 12, cursor: 'pointer' }}>← Back</button>
          {supplier.code && (
            <span style={{ background: T.accent + '20', color: T.accent, border: `1px solid ${T.accent}40`, borderRadius: 4, padding: '3px 12px', fontSize: 13, fontWeight: 800, fontFamily: 'monospace' }}>{supplier.code}</span>
          )}
          <span style={{ background: supplier.status === 'Active' ? '#22c55e20' : T.subtle, color: supplier.status === 'Active' ? '#22c55e' : T.muted, border: `1px solid ${supplier.status === 'Active' ? '#22c55e40' : T.border}`, borderRadius: 4, padding: '3px 10px', fontSize: 12, fontWeight: 600 }}>{supplier.status || 'Active'}</span>
        </div>
        <BtnPrimary onClick={() => setEditing(true)}>Edit Supplier</BtnPrimary>
      </div>

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10, marginBottom: 24 }}>
        <KPI label="Purchase Orders" value={pos.length} />
        <KPI label="Total PO Value" value={`$${(totalPOValue / 1000).toFixed(0)}k`} color={T.accent} />
        <KPI label="Shipments" value={allShipments.length} />
        <KPI label="In Transit" value={inTransit} color={inTransit > 0 ? '#3b82f6' : T.muted} />
        <KPI label="Unpaid Invoices" value={unpaidInvoices.length} color={unpaidInvoices.length > 0 ? T.yellow : T.muted} />
      </div>

      {/* Info */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
        <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 10, padding: '18px 20px' }}>
          <div style={{ fontFamily: 'Barlow Condensed', fontWeight: 700, fontSize: 13, color: T.muted, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 14 }}>Contact & Info</div>
          <InfoRow label="Contact" value={supplier.contact} />
          <InfoRow label="Phone / WhatsApp" value={supplier.phone} />
          <InfoRow label="Website" value={supplier.website} />
          <InfoRow label="Country of Origin" value={supplier.country_of_origin} />
          <InfoRow label="Nearest Port" value={supplier.nearest_port} />
          <InfoRow label="Currency" value={supplier.currency} />
        </div>
        <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 10, padding: '18px 20px' }}>
          <div style={{ fontFamily: 'Barlow Condensed', fontWeight: 700, fontSize: 13, color: T.muted, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 14 }}>Production & Shipping</div>
          <InfoRow label="Products" value={supplier.product_types} />
          <InfoRow label="Lead Time" value={supplier.lead_time_days} />
          <InfoRow label="Transit Time" value={supplier.transit_time} />
          <InfoRow label="Payment Terms" value={supplier.payment_terms} />
          {supplier.address && <InfoRow label="Address" value={supplier.address} />}
          {supplier.notes && <InfoRow label="Notes" value={supplier.notes} />}
        </div>
      </div>

      {/* Purchase Orders */}
      <SectionHead title={`Purchase Orders (${pos.length})`} />
      <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 10, overflow: 'hidden' }}>
        {pos.length === 0 ? (
          <div style={{ padding: '24px 20px', color: T.muted, fontSize: 13 }}>No purchase orders found for this supplier</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: T.surface }}>
                <Th>PO Ref</Th><Th>Season</Th><Th>Ex-Factory</Th>
                <Th style={{ textAlign: 'right' }}>Total Cost</Th>
                <Th style={{ textAlign: 'center' }}>Splits</Th>
                <Th style={{ textAlign: 'right' }}>Shipments</Th>
              </tr>
            </thead>
            <tbody>
              {pos.map(po => {
                const shipCount = po.shipments?.length || 0
                return (
                  <tr key={po.id} className="row-hover">
                    <Td style={{ fontFamily: 'monospace', fontSize: 12, color: T.accent, fontWeight: 700 }}>{po.id}</Td>
                    <Td style={{ color: T.muted, fontSize: 12 }}>{po.seasonality || '—'}</Td>
                    <Td style={{ color: T.muted, fontSize: 12 }}>{fmtDate(po.ex_factory_date)}</Td>
                    <Td style={{ textAlign: 'right', fontWeight: 700 }}>{po.total_cost_value ? fmt(po.total_cost_value, po.currency || 'USD') : '—'}</Td>
                    <Td style={{ textAlign: 'center' }}>
                      <span style={{ color: po.po_splits_confirmed ? '#22c55e' : T.yellow, fontSize: 12, fontWeight: 600 }}>
                        {po.po_splits_confirmed ? '✓' : '⚠ Pending'}
                      </span>
                    </Td>
                    <Td style={{ textAlign: 'right' }}>
                      {shipCount > 0 ? (
                        <span style={{ fontWeight: 700, color: T.text }}>{shipCount}</span>
                      ) : (
                        <span style={{ color: T.muted }}>—</span>
                      )}
                    </Td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr style={{ background: T.surface }}>
                <Td colSpan={3} style={{ fontWeight: 700, fontSize: 12, color: T.muted }}>Total</Td>
                <Td style={{ textAlign: 'right', fontWeight: 800, color: T.accent }}>{fmt(totalPOValue, 'USD')}</Td>
                <Td />
                <Td style={{ textAlign: 'right', fontWeight: 700 }}>{allShipments.length}</Td>
              </tr>
            </tfoot>
          </table>
        )}
      </div>

      {/* Shipments */}
      {allShipments.length > 0 && (
        <>
          <SectionHead title={`Shipments (${allShipments.length})`} />
          <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 10, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: T.surface }}>
                  <Th>Ref</Th><Th>PO</Th><Th>DC</Th><Th>Status</Th><Th>ETA</Th>
                  <Th style={{ textAlign: 'right' }}>Units</Th>
                </tr>
              </thead>
              <tbody>
                {allShipments.map(sh => (
                  <tr key={sh.id} className="row-hover">
                    <Td style={{ fontFamily: 'monospace', fontSize: 11, color: T.accent, fontWeight: 700 }}>{sh.shipment_ref}</Td>
                    <Td style={{ fontFamily: 'monospace', fontSize: 11, color: T.muted }}>{sh.po_id}</Td>
                    <Td>
                      <span style={{ background: sh.dc === 'UK' ? '#3b82f620' : '#8b5cf620', color: sh.dc === 'UK' ? '#3b82f6' : '#8b5cf6', border: `1px solid ${sh.dc === 'UK' ? '#3b82f640' : '#8b5cf640'}`, borderRadius: 3, padding: '1px 7px', fontSize: 11, fontWeight: 800 }}>{sh.dc}</span>
                    </Td>
                    <Td style={{ fontSize: 12, color: STATUS_COLOR[sh.status]?.color || T.muted, fontWeight: 600 }}>{sh.status || '—'}</Td>
                    <Td style={{ fontSize: 12, color: T.muted }}>{fmtDate(sh.eta)}</Td>
                    <Td style={{ textAlign: 'right', fontWeight: 700 }}>{(sh.units || 0).toLocaleString()}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Invoices */}
      <SectionHead title={`Invoices (${invoices.length})`} />
      <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 10, overflow: 'hidden', marginBottom: 32 }}>
        {invoices.length === 0 ? (
          <div style={{ padding: '24px 20px', color: T.muted, fontSize: 13 }}>No invoices found for this supplier</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: T.surface }}>
                <Th>Invoice #</Th><Th>Type</Th><Th>Date</Th>
                <Th style={{ textAlign: 'right' }}>Deposit</Th><Th>Dep. Status</Th>
                <Th style={{ textAlign: 'right' }}>Balance</Th><Th>Bal. Status</Th>
                <Th style={{ textAlign: 'right' }}>Total</Th>
              </tr>
            </thead>
            <tbody>
              {invoices.map(inv => {
                const depStatus = !inv.deposit_amount ? null : inv.deposit_paid_date ? 'paid' : inv.deposit_due_date < new Date().toISOString().slice(0,10) ? 'overdue' : 'upcoming'
                const balStatus = !inv.balance_amount ? null : inv.balance_paid_date ? 'paid' : inv.balance_due_date < new Date().toISOString().slice(0,10) ? 'overdue' : 'upcoming'
                const statusCfg = { paid: { color: '#22c55e', label: 'Paid' }, overdue: { color: '#ef4444', label: 'Overdue' }, upcoming: { color: '#3b82f6', label: 'Upcoming' } }
                const StatusBadge = ({ s }) => s ? <span style={{ color: statusCfg[s].color, fontSize: 11, fontWeight: 600 }}>{statusCfg[s].label}</span> : <span style={{ color: T.muted }}>—</span>
                const total = (inv.deposit_amount || 0) + (inv.balance_amount || 0)
                return (
                  <tr key={inv.id} className="row-hover">
                    <Td style={{ fontFamily: 'monospace', fontSize: 12, color: T.accent, fontWeight: 700 }}>{inv.invoice_number || '—'}</Td>
                    <Td style={{ fontSize: 12, color: T.muted, textTransform: 'capitalize' }}>{inv.invoice_type || '—'}</Td>
                    <Td style={{ fontSize: 12, color: T.muted }}>{fmtDate(inv.invoice_date)}</Td>
                    <Td style={{ textAlign: 'right', fontSize: 12 }}>{inv.deposit_amount ? fmt(inv.deposit_amount, inv.currency) : '—'}</Td>
                    <Td><StatusBadge s={depStatus} /></Td>
                    <Td style={{ textAlign: 'right', fontSize: 12 }}>{inv.balance_amount ? fmt(inv.balance_amount, inv.currency) : '—'}</Td>
                    <Td><StatusBadge s={balStatus} /></Td>
                    <Td style={{ textAlign: 'right', fontWeight: 700 }}>{total > 0 ? fmt(total, inv.currency) : '—'}</Td>
                  </tr>
                )
              })}
            </tbody>
            {totalInvoiced > 0 && (
              <tfoot>
                <tr style={{ background: T.surface }}>
                  <Td colSpan={7} style={{ fontWeight: 700, fontSize: 12, color: T.muted }}>Total invoiced</Td>
                  <Td style={{ textAlign: 'right', fontWeight: 800, color: T.accent }}>{fmt(totalInvoiced, invoices[0]?.currency || 'USD')}</Td>
                </tr>
              </tfoot>
            )}
          </table>
        )}
      </div>
    </Shell>
  )
}
