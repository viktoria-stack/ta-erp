'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import { T } from '@/components/ui'
import { supabase } from '@/lib/supabase'

const NAV = [
  { href: '/dashboard',       label: 'Dashboard',        icon: '▤' },
  { href: '/purchase-orders', label: 'Purchase Orders',  icon: '📋' },
  { href: '/inventory',       label: 'Inventory',        icon: '📦' },
  { href: '/suppliers',       label: 'Suppliers',        icon: '🏭' },
  { href: '/invoices',        label: 'Invoices',         icon: '🧾' },
  { href: '/sales',           label: 'Sales',            icon: '📈' },
]

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
    try { const r = await globalSearch(q); setResults(r) } catch (e) {}
    setLoading(false)
  }, [])

  const handleChange = (val) => {
    setQuery(val); setOpen(true)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => search(val), 300)
  }

  useEffect(() => {
    const handler = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); inputRef.current?.focus(); setOpen(true) }
      if (e.key === 'Escape') { setOpen(false); inputRef.current?.blur() }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  useEffect(() => {
    const handler = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const go = (path) => { setOpen(false); setQuery(''); setResults(null); router.push(path) }
  const total = results ? results.suppliers.length + results.pos.length + results.shipments.length : 0

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <div style={{ display: 'flex', alignItems: 'center', background: T.subtle, border: `1px solid ${open ? T.accent : T.border}`, borderRadius: 6, padding: '6px 12px', gap: 8, width: 220, transition: 'border-color 0.15s' }}>
        <span style={{ color: T.muted, fontSize: 13 }}>🔍</span>
        <input
          ref={inputRef}
          value={query}
          onChange={e => handleChange(e.target.value)}
          onFocus={() => setOpen(true)}
          placeholder="Search… (⌘K)"
          style={{ background: 'none', border: 'none', outline: 'none', color: T.text, fontSize: 12, flex: 1, minWidth: 0 }}
        />
        {loading && <div style={{ width: 11, height: 11, border: `2px solid ${T.border}`, borderTopColor: T.accent, borderRadius: '50%', animation: 'spin 0.6s linear infinite', flexShrink: 0 }} />}
      </div>

      {open && query.length >= 2 && (
        <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: 6, background: T.card, border: `1px solid ${T.border}`, borderRadius: 8, boxShadow: '0 8px 32px #00000050', zIndex: 500, overflow: 'hidden', minWidth: 340 }}>
          {total === 0 && !loading && <div style={{ padding: '16px 14px', color: T.muted, fontSize: 13 }}>No results for "{query}"</div>}
          {results?.suppliers.length > 0 && (
            <div>
              <div style={{ padding: '8px 14px 4px', fontSize: 10, color: T.muted, textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 700 }}>Suppliers</div>
              {results.suppliers.map(s => (
                <div key={s.id} onClick={() => go(`/suppliers/${s.id}`)} style={{ padding: '8px 14px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10 }}
                  onMouseEnter={e => e.currentTarget.style.background = T.surface}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                  {s.code && <span style={{ background: T.accent + '20', color: T.accent, borderRadius: 3, padding: '1px 7px', fontSize: 11, fontWeight: 800, fontFamily: 'monospace' }}>{s.code}</span>}
                  <span style={{ fontSize: 13, fontWeight: 600 }}>{s.name}</span>
                  <span style={{ fontSize: 11, color: s.status === 'Active' ? '#22c55e' : T.muted, marginLeft: 'auto' }}>{s.status}</span>
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
  const path = usePathname()
  const router = useRouter()

  const logout = async () => {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <div style={{ minHeight: '100vh', background: T.bg, display: 'flex', flexDirection: 'column' }}>
      {/* ── TOP NAV ── */}
      <div style={{ background: T.surface, borderBottom: `1px solid ${T.border}`, flexShrink: 0, position: 'sticky', top: 0, zIndex: 100 }}>
        {/* Logo + nav row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 0, padding: '0 24px', height: 50 }}>
          {/* Logo */}
          <div style={{ fontFamily: 'Barlow Condensed', fontWeight: 800, fontSize: 17, letterSpacing: '0.04em', textTransform: 'uppercase', marginRight: 32, flexShrink: 0 }}>
            <span style={{ color: T.accent }}>TA</span>
            <span style={{ color: T.muted, fontWeight: 500, fontSize: 14, marginLeft: 6 }}>Operations</span>
          </div>

          {/* Nav links */}
          <nav style={{ display: 'flex', alignItems: 'center', flex: 1, gap: 2 }}>
            {NAV.map(n => {
              const active = path.startsWith(n.href)
              return (
                <Link key={n.href} href={n.href} style={{ textDecoration: 'none' }}>
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '6px 12px', borderRadius: 6,
                    background: active ? T.accentDim : 'transparent',
                    color: active ? T.accent : T.muted,
                    fontWeight: active ? 700 : 500,
                    fontSize: 13,
                    borderBottom: active ? `2px solid ${T.accent}` : '2px solid transparent',
                    transition: 'all 0.1s',
                    whiteSpace: 'nowrap',
                  }}
                  onMouseEnter={e => { if (!active) { e.currentTarget.style.color = T.text; e.currentTarget.style.background = T.subtle } }}
                  onMouseLeave={e => { if (!active) { e.currentTarget.style.color = T.muted; e.currentTarget.style.background = 'transparent' } }}
                  >
                    <span style={{ fontSize: 14 }}>{n.icon}</span>
                    {n.label}
                  </div>
                </Link>
              )
            })}
          </nav>

          {/* Right side: search + sign out */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
            <GlobalSearch />
            <button
              onClick={logout}
              style={{ background: 'transparent', border: `1px solid ${T.border}`, borderRadius: 6, color: T.muted, fontSize: 12, padding: '6px 12px', cursor: 'pointer', whiteSpace: 'nowrap' }}
              onMouseOver={e => { e.currentTarget.style.borderColor = '#ef4444'; e.currentTarget.style.color = '#ef4444' }}
              onMouseOut={e => { e.currentTarget.style.borderColor = T.border; e.currentTarget.style.color = T.muted }}
            >
              ⎋ Sign Out
            </button>
          </div>
        </div>

        {/* Page title sub-row */}
        <div style={{ padding: '6px 24px 8px', borderTop: `1px solid ${T.border}` }}>
          <h1 style={{ fontFamily: 'Barlow Condensed', fontWeight: 800, fontSize: 20, textTransform: 'uppercase', letterSpacing: '0.04em', margin: 0 }}>
            {title}
          </h1>
        </div>
      </div>

      {/* ── CONTENT ── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 24 }}>
        {children}
      </div>
    </div>
  )
}
