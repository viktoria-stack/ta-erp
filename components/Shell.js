'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Sidebar from '@/components/Sidebar'
import { T } from '@/components/ui'
import { supabase } from '@/lib/supabase'

async function globalSearch(q) {
  if (!q || q.length < 2) return { suppliers: [], pos: [], shipments: [] }
  const like = `%${q}%`
  const [{ data: suppliers }, { data: pos }, { data: shipments }] = await Promise.all([
    supabase.from('suppliers').select('id, name, code, status').or(`name.ilike.${like},code.ilike.${like}`).limit(5),
    supabase.from('purchase_orders').select('id, supplier_name').or(`id.ilike.${like},supplier_name.ilike.${like}`).limit(5),
    supabase.from('shipments').select('id, shipment_ref, dc, status, po_id').ilike('shipment_ref', like).limit(5),
  ])
  return { suppliers: suppliers || [], pos: pos || [], shipments: shipments || [] }
}

function GlobalSearch() {
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState(null)
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const inputRef = useRef(null)
  const wrapRef = useRef(null)
  const timer = useRef(null)

  const search = useCallback(async (q) => {
    if (!q || q.length < 2) { setResults(null); return }
    setLoading(true)
    try {
      const r = await globalSearch(q)
      setResults(r)
    } catch (e) {}
    setLoading(false)
  }, [])

  const handleChange = (val) => {
    setQuery(val)
    setOpen(true)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => search(val), 300)
  }

  // Cmd/Ctrl+K to focus
  useEffect(() => {
    const handler = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        inputRef.current?.focus()
        setOpen(true)
      }
      if (e.key === 'Escape') { setOpen(false); inputRef.current?.blur() }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  // Close on click outside
  useEffect(() => {
    const handler = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const go = (path) => { setOpen(false); setQuery(''); setResults(null); router.push(path) }

  const total = results ? results.suppliers.length + results.pos.length + results.shipments.length : 0
  const showDropdown = open && query.length >= 2

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <div style={{ display: 'flex', alignItems: 'center', background: T.subtle, border: `1px solid ${open ? T.accent : T.border}`, borderRadius: 6, padding: '6px 12px', gap: 8, width: 240, transition: 'border-color 0.15s' }}>
        <span style={{ color: T.muted, fontSize: 14 }}>🔍</span>
        <input
          ref={inputRef}
          value={query}
          onChange={e => handleChange(e.target.value)}
          onFocus={() => setOpen(true)}
          placeholder="Search… (⌘K)"
          style={{ background: 'none', border: 'none', outline: 'none', color: T.text, fontSize: 13, flex: 1, minWidth: 0 }}
        />
        {loading && <div style={{ width: 12, height: 12, border: `2px solid ${T.border}`, borderTopColor: T.accent, borderRadius: '50%', animation: 'spin 0.6s linear infinite', flexShrink: 0 }} />}
      </div>

      {showDropdown && (
        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 6, background: T.card, border: `1px solid ${T.border}`, borderRadius: 8, boxShadow: '0 8px 32px #00000050', zIndex: 500, overflow: 'hidden', minWidth: 320 }}>
          {total === 0 && !loading && (
            <div style={{ padding: '16px 14px', color: T.muted, fontSize: 13 }}>No results for "{query}"</div>
          )}

          {results?.suppliers.length > 0 && (
            <div>
              <div style={{ padding: '8px 14px 4px', fontSize: 10, color: T.muted, textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 700 }}>Suppliers</div>
              {results.suppliers.map(s => (
                <div key={s.id} onClick={() => go(`/suppliers/${s.id}`)} style={{ padding: '8px 14px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10 }}
                  onMouseEnter={e => e.currentTarget.style.background = T.surface}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                  {s.code && <span style={{ background: T.accent + '20', color: T.accent, borderRadius: 3, padding: '1px 7px', fontSize: 11, fontWeight: 800, fontFamily: 'monospace' }}>{s.code}</span>}
                  <span style={{ fontSize: 13, fontWeight: 600 }}>{s.name}</span>
                  <span style={{ fontSize: 11, color: s.status === 'Active' ? '#22c55e' : T.muted, marginLeft: 'auto' }}>{s.status || 'Active'}</span>
                </div>
              ))}
            </div>
          )}

          {results?.pos.length > 0 && (
            <div style={{ borderTop: results?.suppliers.length > 0 ? `1px solid ${T.border}` : 'none' }}>
              <div style={{ padding: '8px 14px 4px', fontSize: 10, color: T.muted, textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 700 }}>Purchase Orders</div>
              {results.pos.map(p => (
                <div key={p.id} onClick={() => go('/purchase-orders')} style={{ padding: '8px 14px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10 }}
                  onMouseEnter={e => e.currentTarget.style.background = T.surface}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                  <span style={{ fontFamily: 'monospace', fontSize: 12, color: T.accent, fontWeight: 700 }}>{p.id}</span>
                  <span style={{ fontSize: 12, color: T.muted }}>{p.supplier_name}</span>
                </div>
              ))}
            </div>
          )}

          {results?.shipments.length > 0 && (
            <div style={{ borderTop: (results?.suppliers.length + results?.pos.length) > 0 ? `1px solid ${T.border}` : 'none' }}>
              <div style={{ padding: '8px 14px 4px', fontSize: 10, color: T.muted, textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 700 }}>Shipments</div>
              {results.shipments.map(s => (
                <div key={s.id} onClick={() => go('/purchase-orders')} style={{ padding: '8px 14px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10 }}
                  onMouseEnter={e => e.currentTarget.style.background = T.surface}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                  <span style={{ fontFamily: 'monospace', fontSize: 12, color: T.accent, fontWeight: 700 }}>{s.shipment_ref}</span>
                  <span style={{ background: s.dc === 'UK' ? '#3b82f620' : '#8b5cf620', color: s.dc === 'UK' ? '#3b82f6' : '#8b5cf6', borderRadius: 3, padding: '1px 6px', fontSize: 10, fontWeight: 800 }}>{s.dc}</span>
                  <span style={{ fontSize: 11, color: T.muted }}>{s.status}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}

export default function Shell({ title, children }) {
  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: T.bg }}>
      <Sidebar />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Topbar */}
        <div style={{
          padding: '12px 28px', borderBottom: `1px solid ${T.border}`,
          background: T.surface, display: 'flex', justifyContent: 'space-between',
          alignItems: 'center', flexShrink: 0
        }}>
          <h1 style={{ fontFamily: 'Barlow Condensed', fontWeight: 800, fontSize: 22, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            {title}
          </h1>
          <GlobalSearch />
        </div>
        {/* Content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 24 }}>
          {children}
        </div>
      </div>
    </div>
  )
}
