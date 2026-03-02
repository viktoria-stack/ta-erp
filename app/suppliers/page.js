'use client'
import { useEffect, useState } from 'react'
import Shell from '@/components/Shell'
import { T, Card, Th, Td, BtnPrimary, BtnGhost, Modal, Loading, ErrorMsg } from '@/components/ui'
import { supabase } from '@/lib/supabase'

const EMPTY = {
  name: '', code: '', product_types: '', payment_terms: '', address: '',
  lead_time_days: '', transit_time: '', country_of_origin: '', nearest_port: '',
  contact: '', phone: '', currency: 'USD', status: 'Active', notes: '',
  website: '',
}

const FIELDS = [
  { key: 'name',              label: 'Company Name',         required: true, full: true },
  { key: 'code',              label: 'Code / Abbreviation',  placeholder: 'e.g. GWG' },
  { key: 'contact',           label: 'Contact Name',         placeholder: 'e.g. Abby' },
  { key: 'phone',             label: 'Phone / WhatsApp' },
  { key: 'website',           label: 'Website' },
  { key: 'product_types',     label: 'Product Types',        placeholder: 'e.g. Jeans, Jackets', full: true },
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

async function getSuppliers() {
  const { data, error } = await supabase.from('suppliers').select('*').order('name')
  if (error) throw error
  return data || []
}

async function saveSupplier(supplier) {
  if (supplier.id) {
    const { id, created_at, ...updates } = supplier
    const { error } = await supabase.from('suppliers').update(updates).eq('id', id)
    if (error) throw error
  } else {
    const { error } = await supabase.from('suppliers').insert(supplier)
    if (error) throw error
  }
}

async function deleteSupplier(id) {
  const { error } = await supabase.from('suppliers').delete().eq('id', id)
  if (error) throw error
}

// ─── EDIT MODAL ───────────────────────────────────────────────
function SupplierModal({ supplier, onClose, onSaved }) {
  const [form, setForm] = useState({ ...EMPTY, ...supplier })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)

  const upd = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const save = async () => {
    if (!form.name.trim()) { setError('Company name is required'); return }
    setSaving(true)
    try {
      await saveSupplier(form)
      onSaved()
      onClose()
    } catch (e) {
      setError(e.message)
      setSaving(false)
    }
  }

  const doDelete = async () => {
    setSaving(true)
    try {
      await deleteSupplier(form.id)
      onSaved()
      onClose()
    } catch (e) {
      setError(e.message)
      setSaving(false)
    }
  }

  const inp = (extra = {}) => ({
    background: T.surface, border: `1px solid ${T.border}`, borderRadius: 5,
    padding: '8px 10px', color: T.text, fontSize: 13, outline: 'none', width: '100%',
    ...extra
  })

  return (
    <Modal title={supplier?.id ? `Edit — ${supplier.name}` : 'New Supplier'} width={900} onClose={onClose}>
      {error && (
        <div style={{ color: T.red, background: T.redDim, border: `1px solid ${T.red}40`, borderRadius: 5, padding: '10px 14px', marginBottom: 16, fontSize: 13 }}>
          ⚠ {error}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 24 }}>
        {FIELDS.map(f => (
          <div key={f.key} style={{ gridColumn: f.full ? '1 / -1' : 'auto' }}>
            <div style={{ fontSize: 11, color: T.muted, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 5 }}>
              {f.label} {f.required && <span style={{ color: T.red }}>*</span>}
            </div>
            {f.options ? (
              <select value={form[f.key] || ''} onChange={e => upd(f.key, e.target.value)} style={inp()}>
                {f.options.map(o => <option key={o}>{o}</option>)}
              </select>
            ) : f.textarea ? (
              <textarea
                value={form[f.key] || ''}
                onChange={e => upd(f.key, e.target.value)}
                placeholder={f.placeholder || ''}
                rows={3}
                style={{ ...inp(), resize: 'vertical', fontFamily: 'inherit' }}
              />
            ) : (
              <input
                value={form[f.key] || ''}
                onChange={e => upd(f.key, e.target.value)}
                placeholder={f.placeholder || ''}
                style={inp()}
              />
            )}
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          {supplier?.id && !confirmDelete && (
            <button onClick={() => setConfirmDelete(true)} style={{ background: 'none', border: `1px solid ${T.red}40`, color: T.red, borderRadius: 5, padding: '7px 14px', fontSize: 12, cursor: 'pointer' }}>
              Delete supplier
            </button>
          )}
          {confirmDelete && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span style={{ fontSize: 12, color: T.red }}>Are you sure?</span>
              <button onClick={doDelete} style={{ background: T.red, border: 'none', color: '#fff', borderRadius: 5, padding: '7px 14px', fontSize: 12, cursor: 'pointer' }}>Yes, delete</button>
              <button onClick={() => setConfirmDelete(false)} style={{ background: T.subtle, border: 'none', color: T.muted, borderRadius: 5, padding: '7px 14px', fontSize: 12, cursor: 'pointer' }}>Cancel</button>
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <BtnGhost onClick={onClose}>Cancel</BtnGhost>
          <BtnPrimary onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save Supplier'}</BtnPrimary>
        </div>
      </div>
    </Modal>
  )
}

// ─── MAIN PAGE ────────────────────────────────────────────────
export default function SuppliersPage() {
  const [suppliers, setSuppliers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [editing, setEditing] = useState(null)
  const [showNew, setShowNew] = useState(false)
  const [search, setSearch] = useState('')

  const load = () => {
    setLoading(true)
    getSuppliers().then(setSuppliers).catch(e => setError(e.message)).finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const filtered = suppliers.filter(s =>
    !search ||
    s.name?.toLowerCase().includes(search.toLowerCase()) ||
    s.code?.toLowerCase().includes(search.toLowerCase()) ||
    s.product_types?.toLowerCase().includes(search.toLowerCase()) ||
    s.country_of_origin?.toLowerCase().includes(search.toLowerCase())
  )

  const active = suppliers.filter(s => s.status === 'Active').length

  return (
    <Shell title="Suppliers">
      {(editing || showNew) && (
        <SupplierModal
          supplier={editing || {}}
          onClose={() => { setEditing(null); setShowNew(false) }}
          onSaved={load}
        />
      )}

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 20 }}>
        {[
          { label: 'Total Suppliers', value: suppliers.length },
          { label: 'Active', value: active, color: T.green },
          { label: 'Inactive', value: suppliers.length - active, color: T.muted },
        ].map(k => (
          <div key={k.label} style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 8, padding: '16px 20px' }}>
            <div style={{ fontSize: 11, color: T.muted, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>{k.label}</div>
            <div style={{ fontSize: 28, fontFamily: 'Barlow Condensed', fontWeight: 800, color: k.color || T.text }}>{k.value}</div>
          </div>
        ))}
      </div>

      {/* Controls */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, gap: 10 }}>
        <input
          placeholder="Search supplier, code, product type…"
          value={search} onChange={e => setSearch(e.target.value)}
          style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 5, padding: '7px 12px', color: T.text, fontSize: 13, width: 300, outline: 'none' }}
        />
        <BtnPrimary onClick={() => setShowNew(true)}>+ New Supplier</BtnPrimary>
      </div>

      {error && <ErrorMsg msg={error} />}
      {loading ? <Loading /> : (
        <Card>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: T.surface }}>
                <Th>Code</Th>
                <Th>Company Name</Th>
                <Th>Products</Th>
                <Th>Contact</Th>
                <Th>Country</Th>
                <Th>Lead Time</Th>
                <Th>Payment Terms</Th>
                <Th>Status</Th>
                <Th></Th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(s => (
                <tr key={s.id} className="row-hover" onClick={() => setEditing(s)} style={{ cursor: 'pointer' }}>
                  <Td>
                    <span style={{ background: T.accent + '20', color: T.accent, border: `1px solid ${T.accent}40`, borderRadius: 4, padding: '2px 10px', fontSize: 12, fontWeight: 800, fontFamily: 'monospace' }}>
                      {s.code || '—'}
                    </span>
                  </Td>
                  <Td style={{ fontWeight: 600, maxWidth: 200 }}>{s.name}</Td>
                  <Td style={{ color: T.muted, fontSize: 12, maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.product_types || '—'}</Td>
                  <Td style={{ color: T.muted, fontSize: 12 }}>{s.contact || '—'}</Td>
                  <Td style={{ color: T.muted, fontSize: 12 }}>{s.country_of_origin || '—'}</Td>
                  <Td style={{ color: T.muted, fontSize: 12, whiteSpace: 'nowrap' }}>{s.lead_time_days || '—'}</Td>
                  <Td style={{ color: T.muted, fontSize: 11, maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.payment_terms || '—'}</Td>
                  <Td>
                    <span style={{ background: s.status === 'Active' ? T.greenDim : T.subtle, color: s.status === 'Active' ? T.green : T.muted, border: `1px solid ${s.status === 'Active' ? T.green + '40' : T.border}`, borderRadius: 4, padding: '2px 8px', fontSize: 11, fontWeight: 600 }}>
                      {s.status || 'Active'}
                    </span>
                  </Td>
                  <Td style={{ color: T.muted, fontSize: 16 }}>›</Td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={9} style={{ padding: 40, textAlign: 'center', color: T.muted }}>No suppliers found</td></tr>
              )}
            </tbody>
          </table>
        </Card>
      )}
    </Shell>
  )
}
