'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import { T, ToastProvider } from '@/components/ui'
import { supabase } from '@/lib/supabase'

// ─── SVG ICONS ────────────────────────────────────────────────
const Icon = ({ d, size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    {d}
  </svg>
)

const ICONS = {
  dashboard:  <><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></>,
  pos:        <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="12" y2="17"/></>,
  inventory:  <><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></>,
  suppliers:  <><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></>,
  invoices:   <><rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/></>,
  sales:      <><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></>,
  search:     <><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></>,
  chevronL:   <><polyline points="15 18 9 12 15 6"/></>,
  chevronR:   <><polyline points="9 18 15 12 9 6"/></>,
  logout:     <><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></>,
}

const NAV = [
  { href: '/dashboard',       label: 'Dashboard',       icon: 'dashboard' },
  { href: '/purchase-orders', label: 'Purchase Orders', icon: 'pos'       },
  { href: '/inventory',       label: 'Inventory',       icon: 'inventory' },
  { href: '/suppliers',       label: 'Suppliers',       icon: 'suppliers' },
  { href: '/invoices',        label: 'Invoices',        icon: 'invoices'  },
  { href: '/sales',           label: 'Sales',           icon: 'sales'     },
]

// ─── GLOBAL SEARCH ────────────────────────────────────────────
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
    try { const r = await globalSearch(q); setResults(r) } catch {}
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
      <div style={{ display: 'flex', alignItems: 'center', background: T.subtle, border: `1px solid ${open ? T.accent : T.border}`, borderRadius: 7, padding: '7px 12px', gap: 8, width: 240, transition: 'border-color 0.15s' }}>
        <span style={{ color: T.muted, display: 'flex', flexShrink: 0 }}>
          <Icon d={ICONS.search} size={14} />
        </span>
        <input
          ref={inputRef}
          value={query}
          onChange={e => handleChange(e.target.value)}
          onFocus={() => setOpen(true)}
          placeholder="Search…"
          style={{ background: 'none', border: 'none', outline: 'none', color: T.text, fontSize: 13, flex: 1, minWidth: 0 }}
        />
        <kbd style={{ fontSize: 10, color: T.muted, background: T.surface, border: `1px solid ${T.border}`, borderRadius: 3, padding: '1px 5px', flexShrink: 0 }}>⌘K</kbd>
        {loading && <div style={{ width: 11, height: 11, border: `2px solid ${T.border}`, borderTopColor: T.accent, borderRadius: '50%', animation: 'spin 0.6s linear infinite', flexShrink: 0 }} />}
      </div>

      {open && query.length >= 2 && (
        <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: 6, background: T.card, border: `1px solid ${T.border}`, borderRadius: 10, boxShadow: '0 12px 40px #00000070', zIndex: 500, overflow: 'hidden', minWidth: 360, animation: 'fadeIn 0.1s ease' }}>
          {total === 0 && !loading && <div style={{ padding: '18px 16px', color: T.muted, fontSize: 13 }}>No results for "<strong>{query}</strong>"</div>}
          {[
            { key: 'suppliers', label: 'Suppliers', render: s => (
              <div key={s.id} onClick={() => go(`/suppliers/${s.id}`)} style={{ padding: '9px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10 }}
                onMouseEnter={e => e.currentTarget.style.background = T.surface}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                {s.code && <span style={{ background: T.accent + '20', color: T.accent, borderRadius: 3, padding: '1px 7px', fontSize: 10, fontWeight: 800, fontFamily: 'monospace' }}>{s.code}</span>}
                <span style={{ fontSize: 13, fontWeight: 600 }}>{s.name}</span>
                <span style={{ fontSize: 11, color: s.status === 'Active' ? T.green : T.muted, marginLeft: 'auto' }}>{s.status}</span>
              </div>
            )},
            { key: 'pos', label: 'Purchase Orders', render: p => (
              <div key={p.id} onClick={() => go('/purchase-orders')} style={{ padding: '9px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10 }}
                onMouseEnter={e => e.currentTarget.style.background = T.surface}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                <span style={{ fontFamily: 'monospace', fontSize: 12, color: T.accent, fontWeight: 700 }}>{p.id}</span>
                <span style={{ fontSize: 12, color: T.muted }}>{p.supplier_name}</span>
              </div>
            )},
            { key: 'shipments', label: 'Shipments', render: s => (
              <div key={s.id} onClick={() => go('/purchase-orders')} style={{ padding: '9px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10 }}
                onMouseEnter={e => e.currentTarget.style.background = T.surface}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                <span style={{ fontFamily: 'monospace', fontSize: 12, color: T.accent, fontWeight: 700 }}>{s.shipment_ref}</span>
                <span style={{ background: s.dc === 'UK' ? '#3b82f620' : '#8b5cf620', color: s.dc === 'UK' ? '#3b82f6' : '#8b5cf6', borderRadius: 3, padding: '1px 6px', fontSize: 10, fontWeight: 800 }}>{s.dc}</span>
                <span style={{ fontSize: 11, color: T.muted }}>{s.status}</span>
              </div>
            )},
          ].map(({ key, label, render }) => results?.[key]?.length > 0 && (
            <div key={key} style={{ borderTop: `1px solid ${T.border}` }}>
              <div style={{ padding: '8px 16px 4px', fontSize: 10, color: T.muted, textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 700 }}>{label}</div>
              {results[key].map(render)}
            </div>
          ))}
        </div>
      )}
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}

// ─── SIDEBAR NAV ITEM ─────────────────────────────────────────
function NavItem({ href, label, icon, active, collapsed }) {
  const [hover, setHover] = useState(false)
  const on = active || hover
  return (
    <Link href={href} style={{ textDecoration: 'none' }}>
      <div
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        title={collapsed ? label : undefined}
        style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: collapsed ? '10px 0' : '9px 14px',
          justifyContent: collapsed ? 'center' : 'flex-start',
          borderRadius: 7, margin: '1px 8px',
          background: active ? T.accentDim : hover ? T.subtle : 'transparent',
          color: active ? T.accent : hover ? T.text : T.muted,
          transition: 'background 0.12s, color 0.12s',
          position: 'relative',
        }}
      >
        {active && (
          <div style={{ position: 'absolute', left: -8, top: '50%', transform: 'translateY(-50%)', width: 3, height: 20, background: T.accent, borderRadius: '0 2px 2px 0' }} />
        )}
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? '2.2' : '1.75'} strokeLinecap="round" strokeLinejoin="round">
          {ICONS[icon]}
        </svg>
        {!collapsed && (
          <span style={{ fontSize: 13, fontWeight: active ? 700 : 500, whiteSpace: 'nowrap', letterSpacing: active ? '0.01em' : 0 }}>
            {label}
          </span>
        )}
      </div>
    </Link>
  )
}

// ─── SHELL ────────────────────────────────────────────────────
export default function Shell({ title, children }) {
  const path = usePathname()
  const router = useRouter()
  const [collapsed, setCollapsed] = useState(false)

  useEffect(() => {
    const stored = localStorage.getItem('ta_sidebar_collapsed')
    if (stored === 'true') setCollapsed(true)
  }, [])

  const toggleCollapse = () => {
    setCollapsed(c => {
      localStorage.setItem('ta_sidebar_collapsed', !c)
      return !c
    })
  }

  const logout = async () => {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  const sidebarW = collapsed ? 56 : 220

  return (
    <ToastProvider>
      <div style={{ display: 'flex', minHeight: '100vh', background: T.bg }}>

        {/* ── SIDEBAR ── */}
        <aside style={{
          width: sidebarW, flexShrink: 0,
          background: T.surface, borderRight: `1px solid ${T.border}`,
          display: 'flex', flexDirection: 'column',
          transition: 'width 0.2s ease',
          position: 'sticky', top: 0, height: '100vh', overflow: 'hidden',
        }}>
          {/* Logo */}
          <div style={{ height: 56, display: 'flex', alignItems: 'center', justifyContent: collapsed ? 'center' : 'flex-start', padding: collapsed ? 0 : '0 18px', borderBottom: `1px solid ${T.border}`, flexShrink: 0 }}>
            {collapsed ? (
              <span style={{ fontFamily: 'Barlow Condensed', fontWeight: 800, fontSize: 18, color: T.accent, letterSpacing: '0.04em' }}>TA</span>
            ) : (
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                <span style={{ fontFamily: 'Barlow Condensed', fontWeight: 800, fontSize: 18, color: T.accent, letterSpacing: '0.04em' }}>TA</span>
                <span style={{ fontFamily: 'Barlow Condensed', fontWeight: 600, fontSize: 14, color: T.muted, letterSpacing: '0.02em' }}>Operations</span>
              </div>
            )}
          </div>

          {/* Nav */}
          <nav style={{ flex: 1, paddingTop: 8, overflowY: 'auto' }}>
            {NAV.map(n => (
              <NavItem key={n.href} {...n} active={path.startsWith(n.href)} collapsed={collapsed} />
            ))}
          </nav>

          {/* Bottom: collapse + sign out */}
          <div style={{ borderTop: `1px solid ${T.border}`, paddingBottom: 8, flexShrink: 0 }}>
            {/* Sign out */}
            <div
              onClick={logout}
              title={collapsed ? 'Sign Out' : undefined}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: collapsed ? '10px 0' : '9px 14px',
                justifyContent: collapsed ? 'center' : 'flex-start',
                borderRadius: 7, margin: '4px 8px',
                color: T.muted, cursor: 'pointer', transition: 'background 0.12s, color 0.12s',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = '#ef444415'; e.currentTarget.style.color = T.red }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = T.muted }}
            >
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                {ICONS.logout}
              </svg>
              {!collapsed && <span style={{ fontSize: 13, fontWeight: 500 }}>Sign Out</span>}
            </div>

            {/* Collapse toggle */}
            <div
              onClick={toggleCollapse}
              title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                padding: '8px', margin: '0 8px',
                borderRadius: 7, color: T.muted, cursor: 'pointer',
                transition: 'background 0.12s, color 0.12s',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = T.subtle; e.currentTarget.style.color = T.text }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = T.muted }}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                {collapsed ? ICONS.chevronR : ICONS.chevronL}
              </svg>
              {!collapsed && <span style={{ fontSize: 11, color: T.muted, marginLeft: 6 }}>Collapse</span>}
            </div>
          </div>
        </aside>

        {/* ── MAIN AREA ── */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>

          {/* Topbar */}
          <header style={{
            height: 56, flexShrink: 0,
            background: T.surface, borderBottom: `1px solid ${T.border}`,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '0 28px', position: 'sticky', top: 0, zIndex: 100,
          }}>
            <h1 style={{ fontFamily: 'Barlow Condensed', fontWeight: 800, fontSize: 20, textTransform: 'uppercase', letterSpacing: '0.06em', margin: 0 }}>
              {title}
            </h1>
            <GlobalSearch />
          </header>

          {/* Content */}
          <main style={{ flex: 1, overflowY: 'auto', padding: 28 }}>
            {children}
          </main>
        </div>
      </div>
    </ToastProvider>
  )
}
