'use client'
import { useEffect, useState, useCallback } from 'react'
import Shell from '@/components/Shell'
import { T, Th, Td, Loading } from '@/components/ui'
import { supabase } from '@/lib/supabase' 

const fmt = (n, cur = 'USD') => new Intl.NumberFormat('en-GB', { style: 'currency', currency: cur, maximumFractionDigits: 0 }).format(n || 0)
const fmtFull = (n, cur = 'USD') => new Intl.NumberFormat('en-GB', { style: 'currency', currency: cur }).format(n || 0)

const STATUS_COLORS = {
  unpaid: { bg: '#ef444420', color: '#ef4444', label: 'Unpaid' },
  partial: { bg: '#f59e0b20', color: '#f59e0b', label: 'Partial' },
  paid: { bg: '#22c55e20', color: '#22c55e', label: 'Paid' },
}

const TYPE_COLORS = {
  supplier: { bg: '#3b82f620', color: '#3b82f6', label: 'Supplier' },
  freight: { bg: '#8b5cf620', color: '#8b5cf6', label: 'Freight' },
}

function StatusBadge({ status }) {
  const s = STATUS_COLORS[status] || STATUS_COLORS.unpaid
  return <span style={{ background: s.bg, color: s.color, border: `1px solid ${s.color}40`, borderRadius: 4, padding: '2px 8px', fontSize: 11, fontWeight: 700 }}>{s.label}</span>
}

function TypeBadge({ type }) {
  const t = TYPE_COLORS[type] || TYPE_COLORS.supplier
  return <span style={{ background: t.bg, color: t.color, border: `1px solid ${t.color}40`, borderRadius: 4, padding: '2px 8px', fontSize: 11, fontWeight: 700 }}>{t.label}</span>
}

function KPIBox({ label, value, color }) {
  return (
    <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 8, padding: '16px 20px' }}>
      <div style={{ fontSize: 10, color: T.muted, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 22, fontFamily: 'Barlow Condensed', fontWeight: 800, color: color || T.text }}>{value}</div>
    </div>
  )
}

function Modal({ title, onClose, children }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: '#00000080', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 12, width: '100%', maxWidth: 600, maxHeight: '90vh', overflow: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '18px 24px', borderBottom: `1px solid ${T.border}` }}>
          <span style={{ fontFamily: 'Barlow Condensed', fontWeight: 800, fontSize: 16, color: T.text }}>{title}</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: T.muted, fontSize: 20, cursor: 'pointer', lineHeight: 1 }}>✕</button>
        </div>
        <div style={{ padding: '20px 24px' }}>{children}</div>
      </div>
    </div>
  )
}

const Field = ({ label, children }) => (
  <div style={{ marginBottom: 14 }}>
    <div style={{ fontSize: 11, color: T.muted, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</div>
    {children}
  </div>
)

const Input = (props) => (
  <input {...props} style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 5, padding: '8px 12px', color: T.text, fontSize: 13, width: '100%', outline: 'none', boxSizing: 'border-box', ...props.style }} />
)

const Select = ({ children, ...props }) => (
  <select {...props} style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 5, padding: '8px 12px', color: T.text, fontSize: 13, width: '100%', outline: 'none', boxSizing: 'border-box' }}>
    {children}
  </select>
)

const Btn = ({ onClick, children, color, disabled }) => (
  <button onClick={onClick} disabled={disabled} style={{ background: color || T.accent, color: '#fff', border: 'none', borderRadius: 6, padding: '9px 18px', fontSize: 13, fontWeight: 700, cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.5 : 1 }}>{children}</button>
)

export default function InvoicesPage() {
  const [invoices, setInvoices] = useState([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('all')
  const [typeFilter, setTypeFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const [showDetail, setShowDetail] = useState(null) // invoice object
  const [showPayment, setShowPayment] = useState(null) // invoice object
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [pos, setPos] = useState([])

  // Form state
  const emptyForm = { po_id: '', supplier_name: '', invoice_number: '', invoice_type: 'supplier', amount: '', currency: 'USD', invoice_date: '', due_date: '', notes: '', pdf_file: null }
  const [form, setForm] = useState(emptyForm)
  const [paymentForm, setPaymentForm] = useState({ amount: '', payment_date: new Date().toISOString().slice(0,10), reference: '', notes: '' })

  const load = useCallback(async () => {
    const { data } = await supabase.from('invoices').select('*, payments(*)').order('invoice_date', { ascending: false })
    setInvoices(data || [])
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
    supabase.from('purchase_orders').select('id, supplier_name').order('id').then(({ data }) => setPos(data || []))
  }, [load])

  const filtered = invoices.filter(inv => {
    if (statusFilter !== 'all' && inv.status !== statusFilter) return false
    if (typeFilter !== 'all' && inv.invoice_type !== typeFilter) return false
    if (search && !inv.invoice_number?.toLowerCase().includes(search.toLowerCase()) && !inv.supplier_name?.toLowerCase().includes(search.toLowerCase()) && !inv.po_id?.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  // KPIs
  const totalOutstanding = invoices.filter(i => i.status !== 'paid').reduce((s, i) => s + ((i.amount || 0) - (i.amount_paid || 0)), 0)
  const totalPaid = invoices.filter(i => i.status === 'paid').reduce((s, i) => s + (i.amount || 0), 0)
  const unpaidCount = invoices.filter(i => i.status === 'unpaid').length
  const overdueCount = invoices.filter(i => i.status !== 'paid' && i.due_date && i.due_date < new Date().toISOString().slice(0,10)).length

  async function handleSubmit() {
    setSaving(true)
    let pdf_url = null

    // Upload PDF if provided
    if (form.pdf_file) {
      setUploading(true)
      const ext = form.pdf_file.name.split('.').pop()
      const path = `${Date.now()}_${form.invoice_number || 'invoice'}.${ext}`
      const { data: uploadData, error: uploadError } = await supabase.storage.from('invoices').upload(path, form.pdf_file)
      setUploading(false)
      if (uploadError) { alert('PDF upload failed: ' + uploadError.message); setSaving(false); return }
      const { data: urlData } = supabase.storage.from('invoices').getPublicUrl(path)
      pdf_url = urlData.publicUrl
    }

    const { error } = await supabase.from('invoices').insert({
      po_id: form.po_id || null,
      supplier_name: form.supplier_name,
      invoice_number: form.invoice_number,
      invoice_type: form.invoice_type,
      amount: parseFloat(form.amount) || 0,
      currency: form.currency,
      invoice_date: form.invoice_date || null,
      due_date: form.due_date || null,
      notes: form.notes,
      pdf_url,
    })

    setSaving(false)
    if (error) { alert('Error: ' + error.message); return }
    setShowAdd(false)
    setForm(emptyForm)
    load()
  }

  async function handlePayment() {
    setSaving(true)
    const { error } = await supabase.from('payments').insert({
      invoice_id: showPayment.id,
      amount: parseFloat(paymentForm.amount),
      currency: showPayment.currency,
      payment_date: paymentForm.payment_date,
      reference: paymentForm.reference,
      notes: paymentForm.notes,
    })
    setSaving(false)
    if (error) { alert('Error: ' + error.message); return }
    setShowPayment(null)
    setPaymentForm({ amount: '', payment_date: new Date().toISOString().slice(0,10), reference: '', notes: '' })
    load()
  }

  async function handleDelete(id) {
    if (!confirm('Delete this invoice?')) return
    await supabase.from('invoices').delete().eq('id', id)
    setShowDetail(null)
    load()
  }

  const fld = (key, val) => setForm(f => ({ ...f, [key]: val }))

  if (loading) return <Shell title="Invoices"><Loading /></Shell>

  return (
    <Shell title="Invoices">
      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
        <KPIBox label="Outstanding" value={fmt(totalOutstanding)} color={T.red} />
        <KPIBox label="Total Paid" value={fmt(totalPaid)} color={T.green} />
        <KPIBox label="Unpaid Invoices" value={unpaidCount} color={unpaidCount > 0 ? T.yellow : T.muted} />
        <KPIBox label="⚠ Overdue" value={overdueCount} color={overdueCount > 0 ? T.red : T.muted} />
      </div>

      {/* Filters + Add */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, alignItems: 'center', flexWrap: 'wrap' }}>
        {['all','unpaid','partial','paid'].map(s => (
          <button key={s} onClick={() => setStatusFilter(s)} style={{ background: statusFilter === s ? T.accent : T.subtle, color: statusFilter === s ? '#fff' : T.muted, border: 'none', borderRadius: 4, padding: '6px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer', textTransform: 'capitalize' }}>{s === 'all' ? 'All' : STATUS_COLORS[s]?.label}</button>
        ))}
        <div style={{ width: 1, height: 24, background: T.border }} />
        {['all','supplier','freight'].map(t => (
          <button key={t} onClick={() => setTypeFilter(t)} style={{ background: typeFilter === t ? (t === 'freight' ? '#8b5cf6' : T.accent) : T.subtle, color: typeFilter === t ? '#fff' : T.muted, border: 'none', borderRadius: 4, padding: '6px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer', textTransform: 'capitalize' }}>{t === 'all' ? 'All types' : TYPE_COLORS[t]?.label}</button>
        ))}
        <input placeholder="Search invoice # or supplier…" value={search} onChange={e => setSearch(e.target.value)}
          style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 5, padding: '7px 12px', color: T.text, fontSize: 13, width: 220, outline: 'none', marginLeft: 'auto' }} />
        <button onClick={() => setShowAdd(true)} style={{ background: T.accent, color: '#fff', border: 'none', borderRadius: 6, padding: '8px 16px', fontSize: 13, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>+ Add Invoice</button>
      </div>

      {/* Table */}
      <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 10, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: T.surface }}>
                <Th>Invoice #</Th>
                <Th>Supplier</Th>
                <Th>PO</Th>
                <Th>Type</Th>
                <Th>Date</Th>
                <Th>Due</Th>
                <Th style={{ textAlign: 'right' }}>Amount</Th>
                <Th style={{ textAlign: 'right' }}>Paid</Th>
                <Th style={{ textAlign: 'right' }}>Outstanding</Th>
                <Th>Status</Th>
                <Th>PDF</Th>
                <Th></Th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={12} style={{ padding: 40, textAlign: 'center', color: T.muted }}>No invoices found</td></tr>
              ) : filtered.map(inv => {
                const outstanding = (inv.amount || 0) - (inv.amount_paid || 0)
                const isOverdue = inv.status !== 'paid' && inv.due_date && inv.due_date < new Date().toISOString().slice(0,10)
                return (
                  <tr key={inv.id} className="row-hover" onClick={() => setShowDetail(inv)} style={{ cursor: 'pointer' }}>
                    <Td style={{ fontFamily: 'monospace', fontSize: 12, color: T.accent, fontWeight: 700 }}>{inv.invoice_number || '—'}</Td>
                    <Td style={{ fontWeight: 600 }}>{inv.supplier_name || '—'}</Td>
                    <Td style={{ fontFamily: 'monospace', fontSize: 11, color: T.muted }}>{inv.po_id || '—'}</Td>
                    <Td><TypeBadge type={inv.invoice_type} /></Td>
                    <Td style={{ fontSize: 12, color: T.muted, whiteSpace: 'nowrap' }}>{inv.invoice_date || '—'}</Td>
                    <Td style={{ fontSize: 12, color: isOverdue ? T.red : T.muted, fontWeight: isOverdue ? 700 : 400, whiteSpace: 'nowrap' }}>
                      {inv.due_date || '—'}{isOverdue ? ' ⚠' : ''}
                    </Td>
                    <Td style={{ textAlign: 'right', fontWeight: 700 }}>{fmtFull(inv.amount, inv.currency)}</Td>
                    <Td style={{ textAlign: 'right', color: T.green }}>{inv.amount_paid > 0 ? fmtFull(inv.amount_paid, inv.currency) : '—'}</Td>
                    <Td style={{ textAlign: 'right', color: outstanding > 0 ? T.red : T.muted, fontWeight: outstanding > 0 ? 700 : 400 }}>
                      {outstanding > 0 ? fmtFull(outstanding, inv.currency) : '—'}
                    </Td>
                    <Td><StatusBadge status={inv.status} /></Td>
                    <Td>
                      {inv.pdf_url
                        ? <a href={inv.pdf_url} target="_blank" rel="noopener" onClick={e => e.stopPropagation()} style={{ color: T.accent, fontSize: 12, textDecoration: 'none', fontWeight: 600 }}>📄 View</a>
                        : <span style={{ color: T.border, fontSize: 12 }}>—</span>}
                    </Td>
                    <Td>
                      <button onClick={e => { e.stopPropagation(); setShowPayment(inv) }} style={{ background: T.green + '20', color: T.green, border: `1px solid ${T.green}40`, borderRadius: 4, padding: '3px 10px', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                        + Pay
                      </button>
                    </Td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <div style={{ padding: '10px 16px', borderTop: `1px solid ${T.border}`, fontSize: 12, color: T.muted }}>
          {filtered.length} invoice{filtered.length !== 1 ? 's' : ''} · Total outstanding: <strong style={{ color: T.red }}>{fmt(filtered.filter(i => i.status !== 'paid').reduce((s, i) => s + ((i.amount||0)-(i.amount_paid||0)), 0))}</strong>
        </div>
      </div>

      {/* ADD INVOICE MODAL */}
      {showAdd && (
        <Modal title="Add Invoice" onClose={() => setShowAdd(false)}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="Invoice Number">
              <Input value={form.invoice_number} onChange={e => fld('invoice_number', e.target.value)} placeholder="INV-001" />
            </Field>
            <Field label="Type">
              <Select value={form.invoice_type} onChange={e => fld('invoice_type', e.target.value)}>
                <option value="supplier">Supplier (tovar)</option>
                <option value="freight">Freight (doprava)</option>
              </Select>
            </Field>
            <Field label="Supplier Name">
              <Input value={form.supplier_name} onChange={e => fld('supplier_name', e.target.value)} placeholder="Dongguan Salati..." />
            </Field>
            <Field label="PO (optional)">
              <Select value={form.po_id} onChange={e => fld('po_id', e.target.value)}>
                <option value="">— Select PO —</option>
                {pos.map(p => <option key={p.id} value={p.id}>{p.id} — {p.supplier_name}</option>)}
              </Select>
            </Field>
            <Field label="Amount">
              <Input type="number" value={form.amount} onChange={e => fld('amount', e.target.value)} placeholder="0.00" />
            </Field>
            <Field label="Currency">
              <Select value={form.currency} onChange={e => fld('currency', e.target.value)}>
                <option value="USD">USD</option>
                <option value="GBP">GBP</option>
                <option value="EUR">EUR</option>
              </Select>
            </Field>
            <Field label="Invoice Date">
              <Input type="date" value={form.invoice_date} onChange={e => fld('invoice_date', e.target.value)} />
            </Field>
            <Field label="Due Date">
              <Input type="date" value={form.due_date} onChange={e => fld('due_date', e.target.value)} />
            </Field>
          </div>
          <Field label="Notes">
            <Input value={form.notes} onChange={e => fld('notes', e.target.value)} placeholder="Optional notes..." />
          </Field>
          <Field label="PDF Faktúra">
            <div style={{ border: `2px dashed ${T.border}`, borderRadius: 8, padding: '20px', textAlign: 'center', cursor: 'pointer', background: T.surface }}
              onClick={() => document.getElementById('pdf-upload').click()}>
              <input id="pdf-upload" type="file" accept=".pdf,.jpg,.jpeg,.png" style={{ display: 'none' }} onChange={e => fld('pdf_file', e.target.files[0])} />
              {form.pdf_file
                ? <span style={{ color: T.green, fontWeight: 600 }}>📄 {form.pdf_file.name}</span>
                : <span style={{ color: T.muted, fontSize: 13 }}>Kliknite pre nahratie PDF / obrázka faktúry</span>}
            </div>
          </Field>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 8 }}>
            <button onClick={() => setShowAdd(false)} style={{ background: T.subtle, color: T.muted, border: 'none', borderRadius: 6, padding: '9px 18px', fontSize: 13, cursor: 'pointer' }}>Cancel</button>
            <Btn onClick={handleSubmit} disabled={saving || uploading}>{uploading ? 'Uploading PDF...' : saving ? 'Saving...' : '+ Add Invoice'}</Btn>
          </div>
        </Modal>
      )}

      {/* PAYMENT MODAL */}
      {showPayment && (
        <Modal title={`Record Payment — ${showPayment.invoice_number}`} onClose={() => setShowPayment(null)}>
          <div style={{ background: T.surface, borderRadius: 8, padding: '12px 16px', marginBottom: 16, fontSize: 13 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: T.muted }}>Total amount</span>
              <span style={{ fontWeight: 700 }}>{fmtFull(showPayment.amount, showPayment.currency)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
              <span style={{ color: T.muted }}>Already paid</span>
              <span style={{ color: T.green, fontWeight: 700 }}>{fmtFull(showPayment.amount_paid, showPayment.currency)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4, borderTop: `1px solid ${T.border}`, paddingTop: 8 }}>
              <span style={{ color: T.muted }}>Outstanding</span>
              <span style={{ color: T.red, fontWeight: 800, fontSize: 15 }}>{fmtFull((showPayment.amount || 0) - (showPayment.amount_paid || 0), showPayment.currency)}</span>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="Amount Paid">
              <Input type="number" value={paymentForm.amount} onChange={e => setPaymentForm(f => ({...f, amount: e.target.value}))}
                placeholder={(showPayment.amount - showPayment.amount_paid).toFixed(2)} />
            </Field>
            <Field label="Payment Date">
              <Input type="date" value={paymentForm.payment_date} onChange={e => setPaymentForm(f => ({...f, payment_date: e.target.value}))} />
            </Field>
          </div>
          <Field label="Reference / Bank ref">
            <Input value={paymentForm.reference} onChange={e => setPaymentForm(f => ({...f, reference: e.target.value}))} placeholder="Wire transfer ref..." />
          </Field>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 8 }}>
            <button onClick={() => setShowPayment(null)} style={{ background: T.subtle, color: T.muted, border: 'none', borderRadius: 6, padding: '9px 18px', fontSize: 13, cursor: 'pointer' }}>Cancel</button>
            <Btn onClick={handlePayment} disabled={saving || !paymentForm.amount} color={T.green}>{saving ? 'Saving...' : '✓ Record Payment'}</Btn>
          </div>
        </Modal>
      )}

      {/* DETAIL MODAL */}
      {showDetail && (
        <Modal title={`Invoice — ${showDetail.invoice_number}`} onClose={() => setShowDetail(null)}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
            {[
              ['Supplier', showDetail.supplier_name],
              ['PO', showDetail.po_id || '—'],
              ['Type', <TypeBadge type={showDetail.invoice_type} />],
              ['Status', <StatusBadge status={showDetail.status} />],
              ['Invoice Date', showDetail.invoice_date || '—'],
              ['Due Date', showDetail.due_date || '—'],
              ['Amount', fmtFull(showDetail.amount, showDetail.currency)],
              ['Paid', fmtFull(showDetail.amount_paid, showDetail.currency)],
            ].map(([label, val]) => (
              <div key={label} style={{ background: T.surface, borderRadius: 6, padding: '10px 14px' }}>
                <div style={{ fontSize: 10, color: T.muted, textTransform: 'uppercase', marginBottom: 3 }}>{label}</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: T.text }}>{val}</div>
              </div>
            ))}
          </div>
          {showDetail.notes && <div style={{ fontSize: 13, color: T.muted, marginBottom: 16, padding: '10px 14px', background: T.surface, borderRadius: 6 }}>{showDetail.notes}</div>}
          {showDetail.pdf_url && (
            <a href={showDetail.pdf_url} target="_blank" rel="noopener" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: T.accent + '20', color: T.accent, border: `1px solid ${T.accent}40`, borderRadius: 6, padding: '8px 14px', fontSize: 13, fontWeight: 600, textDecoration: 'none', marginBottom: 16 }}>
              📄 View PDF Faktúra
            </a>
          )}
          {/* Payment history */}
          {showDetail.payments?.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 11, color: T.muted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Payment History</div>
              {showDetail.payments.map(p => (
                <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', background: T.surface, borderRadius: 6, marginBottom: 4, fontSize: 13 }}>
                  <span style={{ color: T.muted }}>{p.payment_date} {p.reference ? `· ${p.reference}` : ''}</span>
                  <span style={{ color: T.green, fontWeight: 700 }}>{fmtFull(p.amount, showDetail.currency)}</span>
                </div>
              ))}
            </div>
          )}
          <div style={{ display: 'flex', gap: 10, justifyContent: 'space-between' }}>
            <button onClick={() => handleDelete(showDetail.id)} style={{ background: T.red + '20', color: T.red, border: `1px solid ${T.red}40`, borderRadius: 6, padding: '8px 14px', fontSize: 13, cursor: 'pointer' }}>Delete</button>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => { setShowPayment(showDetail); setShowDetail(null) }} style={{ background: T.green + '20', color: T.green, border: `1px solid ${T.green}40`, borderRadius: 6, padding: '8px 14px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>+ Record Payment</button>
              <button onClick={() => setShowDetail(null)} style={{ background: T.subtle, color: T.muted, border: 'none', borderRadius: 6, padding: '8px 14px', fontSize: 13, cursor: 'pointer' }}>Close</button>
            </div>
          </div>
        </Modal>
      )}
    </Shell>
  )
}
