'use client'
import { useEffect, useState, useCallback } from 'react'
import Shell from '@/components/Shell'
import { T, Th, Td, Loading } from '@/components/ui'
import { supabase } from '@/lib/supabase'

const fmt = (n, cur = 'USD') => new Intl.NumberFormat('en-GB', { style: 'currency', currency: cur, maximumFractionDigits: 0 }).format(n || 0)
const CURRENCIES = ['USD', 'GBP', 'EUR']
const inp = { width: '100%', background: T.subtle, border: `1px solid ${T.border}`, borderRadius: 6, padding: '8px 10px', color: T.text, fontSize: 13, boxSizing: 'border-box' }
const sel = { ...inp, cursor: 'pointer' }
const today = () => new Date().toISOString().slice(0, 10)

const STATUS_CFG = {
  unpaid:  { bg: '#ef444420', color: '#ef4444', label: 'Unpaid' },
  partial: { bg: '#f59e0b20', color: '#f59e0b', label: 'Deposit Paid' },
  paid:    { bg: '#22c55e20', color: '#22c55e', label: 'Paid' },
}
const CF_CFG = {
  paid:     { bg: '#22c55e20', color: '#22c55e', label: 'Paid' },
  overdue:  { bg: '#ef444420', color: '#ef4444', label: 'Overdue' },
  upcoming: { bg: '#3b82f620', color: '#3b82f6', label: 'Upcoming' },
}

const Badge = ({ cfg }) => <span style={{ background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.color}40`, borderRadius: 4, padding: '2px 8px', fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap' }}>{cfg.label}</span>

const KPI = ({ label, value, color, sub }) => (
  <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 8, padding: '16px 20px', minWidth: 130 }}>
    <div style={{ fontSize: 10, color: T.muted, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>{label}</div>
    <div style={{ fontSize: 22, fontFamily: 'Barlow Condensed', fontWeight: 800, color: color || T.text }}>{value}</div>
    {sub && <div style={{ fontSize: 11, color: T.muted, marginTop: 2 }}>{sub}</div>}
  </div>
)

const Modal = ({ title, onClose, children, wide }) => (
  <div style={{ position: 'fixed', inset: 0, background: '#00000080', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
    <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 12, width: '100%', maxWidth: wide ? 860 : 620, maxHeight: '92vh', overflow: 'auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '18px 24px', borderBottom: `1px solid ${T.border}`, position: 'sticky', top: 0, background: T.card, zIndex: 1 }}>
        <span style={{ fontFamily: 'Barlow Condensed', fontWeight: 800, fontSize: 18, color: T.text }}>{title}</span>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: T.muted, fontSize: 20, cursor: 'pointer' }}>✕</button>
      </div>
      <div style={{ padding: '20px 24px' }}>{children}</div>
    </div>
  </div>
)

const Field = ({ label, children, half }) => (
  <div style={{ marginBottom: 14, flex: half ? '1 1 45%' : '1 1 100%', minWidth: half ? 160 : 'auto' }}>
    <div style={{ fontSize: 11, color: T.muted, marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</div>
    {children}
  </div>
)
const Row = ({ children }) => <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>{children}</div>
const Section = ({ title }) => <div style={{ fontSize: 11, fontWeight: 700, color: T.muted, textTransform: 'uppercase', letterSpacing: '0.1em', margin: '20px 0 12px', paddingBottom: 6, borderBottom: `1px solid ${T.border}` }}>{title}</div>

const milestoneStatus = (amount, due_date, paid_date) => {
  if (!amount || amount <= 0) return null
  if (paid_date) return 'paid'
  if (due_date && due_date < today()) return 'overdue'
  return 'upcoming'
}

// ─── INVOICE FORM (shared by Add + Edit) ──────────────────────
function InvoiceForm({ form, set, pos, pdf, setPdf, isEdit }) {
  return (
    <>
      <Section title="Invoice Details" />
      <Row>
        <Field label="Invoice Number" half><input style={inp} value={form.invoice_number || ''} onChange={e => set('invoice_number', e.target.value)} /></Field>
        <Field label="Type" half>
          <select style={sel} value={form.invoice_type || 'supplier'} onChange={e => set('invoice_type', e.target.value)}>
            <option value="supplier">Supplier (tovar)</option>
            <option value="freight">Freight</option>
          </select>
        </Field>
      </Row>
      <Row>
        <Field label="Supplier Name" half><input style={inp} value={form.supplier_name || ''} onChange={e => set('supplier_name', e.target.value)} /></Field>
        <Field label="PO (optional)" half>
          <select style={sel} value={form.po_id || ''} onChange={e => set('po_id', e.target.value)}>
            <option value="">— select —</option>
            {pos.map(p => <option key={p.id} value={p.id}>{p.id} — {p.supplier_name}</option>)}
          </select>
        </Field>
      </Row>
      <Row>
        <Field label="Currency" half>
          <select style={sel} value={form.currency || 'USD'} onChange={e => set('currency', e.target.value)}>
            {CURRENCIES.map(c => <option key={c}>{c}</option>)}
          </select>
        </Field>
        <Field label="Invoice Date" half><input type="date" style={inp} value={form.invoice_date || ''} onChange={e => set('invoice_date', e.target.value)} /></Field>
      </Row>
      <Field label="Payment Terms"><input style={inp} placeholder="e.g. 30% deposit, 70% balance before shipment" value={form.payment_terms || ''} onChange={e => set('payment_terms', e.target.value)} /></Field>

      <Section title="💰 Deposit" />
      <Row>
        <Field label="Amount" half><input type="number" style={inp} value={form.deposit_amount || ''} onChange={e => set('deposit_amount', e.target.value)} placeholder="0.00" /></Field>
        <Field label="Due Date" half><input type="date" style={inp} value={form.deposit_due_date || ''} onChange={e => set('deposit_due_date', e.target.value)} /></Field>
      </Row>
      <Row>
        <Field label="Paid Date (blank = unpaid)" half><input type="date" style={inp} value={form.deposit_paid_date || ''} onChange={e => set('deposit_paid_date', e.target.value)} /></Field>
        {form.deposit_amount > 0 && (
          <Field label="Status" half>
            <div style={{ paddingTop: 8 }}>
              {(() => { const s = milestoneStatus(form.deposit_amount, form.deposit_due_date, form.deposit_paid_date); return s ? <Badge cfg={CF_CFG[s]} /> : null })()}
            </div>
          </Field>
        )}
      </Row>

      <Section title="💳 Balance" />
      <Row>
        <Field label="Amount" half><input type="number" style={inp} value={form.balance_amount || ''} onChange={e => set('balance_amount', e.target.value)} placeholder="0.00" /></Field>
        <Field label="Due Date (ex-factory date)" half><input type="date" style={inp} value={form.balance_due_date || ''} onChange={e => set('balance_due_date', e.target.value)} /></Field>
      </Row>
      <Row>
        <Field label="Paid Date (blank = unpaid)" half><input type="date" style={inp} value={form.balance_paid_date || ''} onChange={e => set('balance_paid_date', e.target.value)} /></Field>
        {form.balance_amount > 0 && (
          <Field label="Status" half>
            <div style={{ paddingTop: 8 }}>
              {(() => { const s = milestoneStatus(form.balance_amount, form.balance_due_date, form.balance_paid_date); return s ? <Badge cfg={CF_CFG[s]} /> : null })()}
            </div>
          </Field>
        )}
      </Row>

      {/* Total summary */}
      {((parseFloat(form.deposit_amount) || 0) + (parseFloat(form.balance_amount) || 0)) > 0 && (
        <div style={{ background: T.subtle, borderRadius: 8, padding: '12px 16px', marginTop: 8, display: 'flex', gap: 24, flexWrap: 'wrap' }}>
          <div><span style={{ color: T.muted, fontSize: 12 }}>Deposit: </span><span style={{ color: '#f59e0b', fontWeight: 700 }}>{fmt(parseFloat(form.deposit_amount) || 0, form.currency)}</span></div>
          <div><span style={{ color: T.muted, fontSize: 12 }}>Balance: </span><span style={{ color: '#3b82f6', fontWeight: 700 }}>{fmt(parseFloat(form.balance_amount) || 0, form.currency)}</span></div>
          <div><span style={{ color: T.muted, fontSize: 12 }}>Total: </span><span style={{ fontWeight: 800 }}>{fmt((parseFloat(form.deposit_amount) || 0) + (parseFloat(form.balance_amount) || 0), form.currency)}</span></div>
        </div>
      )}

      {!isEdit && (
        <>
          <Section title="PDF Faktúra" />
          <div
            onDragOver={e => e.preventDefault()}
            onDrop={e => { e.preventDefault(); setPdf(e.dataTransfer.files[0]) }}
            onClick={() => document.getElementById('pdfInp').click()}
            style={{ border: `2px dashed ${T.border}`, borderRadius: 8, padding: '18px', textAlign: 'center', cursor: 'pointer', color: T.muted, fontSize: 13 }}
          >
            {pdf ? <span style={{ color: T.accent }}>📄 {pdf.name}</span> : '↑ Drag & drop PDF or click'}
            <input id="pdfInp" type="file" accept=".pdf" style={{ display: 'none' }} onChange={e => setPdf(e.target.files[0])} />
          </div>
        </>
      )}

      <Field label="Notes"><textarea style={{ ...inp, height: 56, resize: 'vertical', marginTop: 16 }} value={form.notes || ''} onChange={e => set('notes', e.target.value)} /></Field>
    </>
  )
}

// ─── ADD MODAL ─────────────────────────────────────────────────
function AddModal({ pos, onClose, onSaved }) {
  const [form, setForm] = useState({ invoice_type: 'supplier', currency: 'USD', invoice_date: today() })
  const [pdf, setPdf] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const save = async () => {
    if (!form.invoice_number || !form.supplier_name) { setError('Invoice number and supplier required'); return }
    setSaving(true); setError('')
    try {
      let pdf_url = null
      if (pdf) {
        const path = `invoices/${Date.now()}_${pdf.name}`
        const { error: upErr } = await supabase.storage.from('invoices').upload(path, pdf)
        if (upErr) throw new Error('PDF upload failed: ' + upErr.message)
        const { data: { publicUrl } } = supabase.storage.from('invoices').getPublicUrl(path)
        pdf_url = publicUrl
      }
      const dep = parseFloat(form.deposit_amount) || 0
      const bal = parseFloat(form.balance_amount) || 0
      const { error: dbErr } = await supabase.from('invoices').insert({
        ...form,
        deposit_amount: dep, balance_amount: bal, amount: dep + bal,
        deposit_due_date: form.deposit_due_date || null,
        deposit_paid_date: form.deposit_paid_date || null,
        balance_due_date: form.balance_due_date || null,
        balance_paid_date: form.balance_paid_date || null,
        po_id: form.po_id || null, pdf_url,
      })
      if (dbErr) throw new Error(dbErr.message)
      onSaved(); onClose()
    } catch (e) { setError(e.message) } finally { setSaving(false) }
  }

  return (
    <Modal title="Add Invoice" onClose={onClose} wide>
      {error && <div style={{ background: '#ef444420', color: '#ef4444', padding: '8px 12px', borderRadius: 6, marginBottom: 12, fontSize: 13 }}>{error}</div>}
      <InvoiceForm form={form} set={set} pos={pos} pdf={pdf} setPdf={setPdf} />
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
        <button onClick={onClose} style={{ background: T.subtle, border: `1px solid ${T.border}`, color: T.muted, borderRadius: 6, padding: '8px 20px', cursor: 'pointer' }}>Cancel</button>
        <button onClick={save} disabled={saving} style={{ background: T.accent, border: 'none', color: '#fff', borderRadius: 6, padding: '8px 20px', cursor: 'pointer', fontWeight: 700 }}>{saving ? 'Saving…' : 'Save Invoice'}</button>
      </div>
    </Modal>
  )
}

// ─── EDIT MODAL ────────────────────────────────────────────────
function EditModal({ invoice, pos, onClose, onSaved }) {
  const [form, setForm] = useState({ ...invoice })
  const [saving, setSaving] = useState(false)
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const save = async () => {
    setSaving(true)
    const dep = parseFloat(form.deposit_amount) || 0
    const bal = parseFloat(form.balance_amount) || 0
    await supabase.from('invoices').update({
      ...form,
      deposit_amount: dep, balance_amount: bal, amount: dep + bal,
      deposit_due_date: form.deposit_due_date || null,
      deposit_paid_date: form.deposit_paid_date || null,
      balance_due_date: form.balance_due_date || null,
      balance_paid_date: form.balance_paid_date || null,
      po_id: form.po_id || null,
    }).eq('id', invoice.id)
    setSaving(false); onSaved(); onClose()
  }

  return (
    <Modal title={`Invoice — ${invoice.invoice_number}`} onClose={onClose} wide>
      <InvoiceForm form={form} set={set} pos={pos} isEdit />
      {invoice.pdf_url && <div style={{ marginTop: 8 }}><a href={invoice.pdf_url} target="_blank" rel="noopener" style={{ color: T.accent, fontSize: 13 }}>📄 View PDF</a></div>}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
        <button onClick={onClose} style={{ background: T.subtle, border: `1px solid ${T.border}`, color: T.muted, borderRadius: 6, padding: '8px 20px', cursor: 'pointer' }}>Cancel</button>
        <button onClick={save} disabled={saving} style={{ background: T.accent, border: 'none', color: '#fff', borderRadius: 6, padding: '8px 20px', cursor: 'pointer', fontWeight: 700 }}>{saving ? 'Saving…' : 'Save Changes'}</button>
      </div>
    </Modal>
  )
}

// ─── CASH FLOW VIEW ────────────────────────────────────────────
function CashflowView({ invoices }) {
  const t = today()
  const thisMonth = t.slice(0, 7)

  const milestones = []
  invoices.forEach(inv => {
    const push = (type, amount, due_date, paid_date) => {
      if (!amount || amount <= 0) return
      const s = milestoneStatus(amount, due_date, paid_date)
      milestones.push({ invoice_number: inv.invoice_number, supplier: inv.supplier_name, po_id: inv.po_id, currency: inv.currency, type, amount, due_date, paid_date, status: s })
    }
    push('Deposit', inv.deposit_amount, inv.deposit_due_date, inv.deposit_paid_date)
    push('Balance', inv.balance_amount, inv.balance_due_date, inv.balance_paid_date)
  })
  milestones.sort((a, b) => (a.due_date || '9999') > (b.due_date || '9999') ? 1 : -1)

  const months = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(); d.setMonth(d.getMonth() + i)
    const key = d.toISOString().slice(0, 7)
    const label = d.toLocaleString('en-GB', { month: 'short', year: '2-digit' })
    const items = milestones.filter(m => m.due_date?.startsWith(key))
    const paid = items.filter(m => m.status === 'paid').reduce((s, m) => s + m.amount, 0)
    const unpaid = items.filter(m => m.status !== 'paid').reduce((s, m) => s + m.amount, 0)
    return { key, label, items, paid, unpaid }
  })

  const overdue = milestones.filter(m => m.status === 'overdue')
  const overdueTotal = overdue.reduce((s, m) => s + m.amount, 0)
  const maxVal = Math.max(...months.map(m => m.paid + m.unpaid), 1)

  return (
    <div>
      {overdue.length > 0 && (
        <div style={{ background: '#ef444415', border: '1px solid #ef444440', borderRadius: 8, padding: '12px 16px', marginBottom: 20, color: '#ef4444', fontWeight: 600 }}>
          ⚠ {overdue.length} overdue payment{overdue.length > 1 ? 's' : ''} — {fmt(overdueTotal)} past due
        </div>
      )}

      {/* Bar chart */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', height: 130, marginBottom: 8 }}>
        {months.map(m => {
          const totalH = Math.round(((m.paid + m.unpaid) / maxVal) * 100)
          const paidH = Math.round((m.paid / maxVal) * 100)
          const unpaidH = totalH - paidH
          return (
            <div key={m.key} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
              <div style={{ fontSize: 10, color: T.muted, height: 16, display: 'flex', alignItems: 'center' }}>
                {m.paid + m.unpaid > 0 ? fmt(m.paid + m.unpaid) : ''}
              </div>
              <div style={{ width: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', height: 100 }}>
                {unpaidH > 0 && <div style={{ height: unpaidH, background: '#3b82f650', borderRadius: paidH === 0 ? '4px 4px 0 0' : 0 }} />}
                {paidH > 0 && <div style={{ height: paidH, background: '#22c55e', borderRadius: unpaidH === 0 ? '4px 4px 0 0' : 0 }} />}
              </div>
              <div style={{ fontSize: 11, color: m.key === thisMonth ? T.accent : T.muted, fontWeight: m.key === thisMonth ? 700 : 400 }}>{m.label}</div>
            </div>
          )
        })}
      </div>
      <div style={{ display: 'flex', gap: 16, marginBottom: 24, fontSize: 11, color: T.muted }}>
        <span><span style={{ display: 'inline-block', width: 10, height: 10, background: '#22c55e', borderRadius: 2, marginRight: 5 }} />Paid</span>
        <span><span style={{ display: 'inline-block', width: 10, height: 10, background: '#3b82f650', borderRadius: 2, marginRight: 5 }} />Upcoming / Overdue</span>
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead><tr style={{ background: T.surface }}>
          <Th>Due Date</Th><Th>Invoice</Th><Th>Supplier</Th><Th>PO</Th><Th>Type</Th><Th>Amount</Th><Th>Status</Th><Th>Paid Date</Th>
        </tr></thead>
        <tbody>
          {milestones.map((m, i) => (
            <tr key={i} style={{ borderBottom: `1px solid ${T.border}` }}>
              <Td style={{ fontSize: 12, color: m.status === 'overdue' ? '#ef4444' : T.muted, fontWeight: m.status === 'overdue' ? 700 : 400 }}>{m.due_date || '—'}</Td>
              <Td style={{ fontFamily: 'monospace', fontSize: 12 }}>{m.invoice_number}</Td>
              <Td style={{ fontSize: 13 }}>{m.supplier}</Td>
              <Td style={{ fontSize: 12, color: T.muted }}>{m.po_id || '—'}</Td>
              <Td><span style={{ fontSize: 11, color: m.type === 'Deposit' ? '#f59e0b' : '#3b82f6', fontWeight: 700 }}>{m.type}</span></Td>
              <Td style={{ fontWeight: 700 }}>{fmt(m.amount, m.currency)}</Td>
              <Td><Badge cfg={CF_CFG[m.status]} /></Td>
              <Td style={{ fontSize: 12, color: T.muted }}>{m.paid_date || '—'}</Td>
            </tr>
          ))}
          {milestones.length === 0 && <tr><td colSpan={8} style={{ padding: 32, textAlign: 'center', color: T.muted }}>No payment milestones yet — add invoices with deposit/balance amounts</td></tr>}
        </tbody>
      </table>
    </div>
  )
}

// ─── MAIN PAGE ─────────────────────────────────────────────────
export default function InvoicesPage() {
  const [invoices, setInvoices] = useState([])
  const [pos, setPos] = useState([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('invoices')
  const [showAdd, setShowAdd] = useState(false)
  const [selected, setSelected] = useState(null)
  const [statusFilter, setStatusFilter] = useState('All')
  const [search, setSearch] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const [{ data: inv }, { data: poData }] = await Promise.all([
      supabase.from('invoices').select('*').order('invoice_date', { ascending: false }),
      supabase.from('purchase_orders').select('id, supplier_name').order('id'),
    ])
    setInvoices(inv || [])
    setPos(poData || [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const t = today()
  const filtered = invoices.filter(inv => {
    const matchStatus = statusFilter === 'All' || inv.status === statusFilter
    const matchSearch = !search || inv.invoice_number?.toLowerCase().includes(search.toLowerCase()) || inv.supplier_name?.toLowerCase().includes(search.toLowerCase())
    return matchStatus && matchSearch
  })

  const outstanding = invoices.reduce((s, i) => s + Math.max(0, ((i.deposit_amount || 0) + (i.balance_amount || 0)) - (i.amount_paid || 0)), 0)
  const depositDue = invoices.filter(i => i.deposit_amount > 0 && !i.deposit_paid_date).reduce((s, i) => s + i.deposit_amount, 0)
  const balanceDue = invoices.filter(i => i.balance_amount > 0 && !i.balance_paid_date).reduce((s, i) => s + i.balance_amount, 0)
  const overdueCount = invoices.filter(i =>
    (i.deposit_amount > 0 && !i.deposit_paid_date && i.deposit_due_date && i.deposit_due_date < t) ||
    (i.balance_amount > 0 && !i.balance_paid_date && i.balance_due_date && i.balance_due_date < t)
  ).length

  return (
    <Shell title="Invoices">
      {showAdd && <AddModal pos={pos} onClose={() => setShowAdd(false)} onSaved={load} />}
      {selected && <EditModal invoice={selected} pos={pos} onClose={() => setSelected(null)} onSaved={load} />}

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 24 }}>
        <KPI label="Outstanding" value={fmt(outstanding)} color={outstanding > 0 ? '#ef4444' : T.text} />
        <KPI label="Deposits Due" value={fmt(depositDue)} color="#f59e0b" />
        <KPI label="Balances Due" value={fmt(balanceDue)} color="#3b82f6" />
        <KPI label="⚠ Overdue" value={overdueCount} color={overdueCount > 0 ? '#ef4444' : T.muted} />
        <KPI label="Total Invoices" value={invoices.length} />
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', gap: 6 }}>
          {[['invoices', '🧾 Invoices'], ['cashflow', '📊 Cash Flow']].map(([k, label]) => (
            <button key={k} onClick={() => setTab(k)} style={{ background: tab === k ? T.accent : T.subtle, color: tab === k ? '#fff' : T.muted, border: 'none', borderRadius: 6, padding: '7px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>{label}</button>
          ))}
        </div>
        <button onClick={() => setShowAdd(true)} style={{ background: T.accent, color: '#fff', border: 'none', borderRadius: 6, padding: '8px 18px', fontWeight: 700, cursor: 'pointer', fontSize: 13 }}>+ Add Invoice</button>
      </div>

      {tab === 'cashflow' ? <CashflowView invoices={invoices} /> : (
        <>
          <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
            {['All', 'unpaid', 'partial', 'paid'].map(s => (
              <button key={s} onClick={() => setStatusFilter(s)} style={{ background: statusFilter === s ? T.accent : T.subtle, color: statusFilter === s ? '#fff' : T.muted, border: 'none', borderRadius: 4, padding: '5px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                {s === 'partial' ? 'Deposit Paid' : s.charAt(0).toUpperCase() + s.slice(1)}
              </button>
            ))}
            <input style={{ ...inp, maxWidth: 220 }} placeholder="Search invoice # or supplier…" value={search} onChange={e => setSearch(e.target.value)} />
          </div>

          {loading ? <Loading /> : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr style={{ background: T.surface }}>
                <Th>Invoice #</Th><Th>Supplier</Th><Th>PO</Th><Th>Date</Th>
                <Th>Deposit</Th><Th>Dep. Due</Th>
                <Th>Balance</Th><Th>Bal. Due</Th>
                <Th>Total</Th><Th>Status</Th>
              </tr></thead>
              <tbody>
                {filtered.map(inv => {
                  const sc = STATUS_CFG[inv.status] || STATUS_CFG.unpaid
                  const depOD = inv.deposit_amount > 0 && !inv.deposit_paid_date && inv.deposit_due_date && inv.deposit_due_date < t
                  const balOD = inv.balance_amount > 0 && !inv.balance_paid_date && inv.balance_due_date && inv.balance_due_date < t
                  return (
                    <tr key={inv.id} onClick={() => setSelected(inv)} className="row-hover" style={{ borderBottom: `1px solid ${T.border}`, cursor: 'pointer' }}>
                      <Td style={{ fontFamily: 'monospace', fontWeight: 700, color: T.accent }}>{inv.invoice_number}</Td>
                      <Td style={{ fontWeight: 600 }}>{inv.supplier_name}</Td>
                      <Td style={{ fontSize: 12, color: T.muted }}>{inv.po_id || '—'}</Td>
                      <Td style={{ fontSize: 12, color: T.muted }}>{inv.invoice_date || '—'}</Td>
                      <Td style={{ color: inv.deposit_paid_date ? '#22c55e' : depOD ? '#ef4444' : T.text }}>
                        {inv.deposit_amount > 0 ? <>{fmt(inv.deposit_amount, inv.currency)}{inv.deposit_paid_date && <span style={{ fontSize: 10, marginLeft: 4 }}>✓</span>}</> : '—'}
                      </Td>
                      <Td style={{ fontSize: 12, color: depOD ? '#ef4444' : T.muted }}>{inv.deposit_due_date || '—'}</Td>
                      <Td style={{ color: inv.balance_paid_date ? '#22c55e' : balOD ? '#ef4444' : T.text }}>
                        {inv.balance_amount > 0 ? <>{fmt(inv.balance_amount, inv.currency)}{inv.balance_paid_date && <span style={{ fontSize: 10, marginLeft: 4 }}>✓</span>}</> : '—'}
                      </Td>
                      <Td style={{ fontSize: 12, color: balOD ? '#ef4444' : T.muted }}>{inv.balance_due_date || '—'}</Td>
                      <Td style={{ fontWeight: 700 }}>{fmt((inv.deposit_amount || 0) + (inv.balance_amount || 0), inv.currency)}</Td>
                      <Td><span style={{ background: sc.bg, color: sc.color, border: `1px solid ${sc.color}40`, borderRadius: 4, padding: '2px 8px', fontSize: 11, fontWeight: 700 }}>{sc.label}</span></Td>
                    </tr>
                  )
                })}
                {filtered.length === 0 && <tr><td colSpan={10} style={{ padding: 32, textAlign: 'center', color: T.muted }}>No invoices found</td></tr>}
              </tbody>
            </table>
          )}
        </>
      )}
    </Shell>
  )
}
