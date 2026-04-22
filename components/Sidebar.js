'use client'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { T } from './ui'
import { createClient } from '@supabase/supabase-js'

const NAV = [
  { href: '/dashboard',        label: 'Dashboard',        icon: '▤' },
  { href: '/purchase-orders',  label: 'Purchase Orders',  icon: '📋' },
  { href: '/inventory',        label: 'Inventory',        icon: '📦' },
  { href: '/suppliers',        label: 'Suppliers',        icon: '🏭' },
  { href: '/invoices',         label: 'Invoices',         icon: '🧾' },
  { href: '/sales',            label: 'Sales',            icon: '📈' },
]

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
)

export default function Sidebar() {
  const path = usePathname()
  const router = useRouter()

  const logout = async () => {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <div style={{ width: 210, background: T.surface, borderRight: `1px solid ${T.border}`, display: 'flex', flexDirection: 'column', flexShrink: 0, minHeight: '100vh' }}>
      <div style={{ padding: '22px 18px 16px', borderBottom: `1px solid ${T.border}` }}>
        <div style={{ fontFamily: 'Barlow Condensed', fontWeight: 800, fontSize: 18, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
          <span style={{ color: T.accent }}>TA</span> Operations
        </div>
        <div style={{ fontSize: 10, color: T.muted, marginTop: 2, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          Tailored Athlete
        </div>
      </div>

      <nav style={{ flex: 1, padding: '12px 8px' }}>
        {NAV.map(n => {
          const active = path.startsWith(n.href)
          return (
            <Link key={n.href} href={n.href} style={{ textDecoration: 'none' }}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '9px 12px', borderRadius: 6, marginBottom: 2,
                background: active ? T.accentDim : 'transparent',
                color: active ? T.accent : T.muted,
                fontWeight: active ? 700 : 500, fontSize: 13,
                borderLeft: active ? `2px solid ${T.accent}` : '2px solid transparent',
                transition: 'all 0.1s',
              }}>
                <span>{n.icon}</span>
                {n.label}
              </div>
            </Link>
          )
        })}
      </nav>

      <div style={{ padding: '14px 10px', borderTop: `1px solid ${T.border}` }}>
        <button
          onClick={logout}
          style={{
            width: '100%', padding: '8px 12px',
            background: 'transparent', border: `1px solid ${T.border}`,
            borderRadius: 6, color: T.muted, fontSize: 12,
            cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8,
            transition: 'all 0.1s',
          }}
          onMouseOver={e => { e.currentTarget.style.borderColor = '#ef4444'; e.currentTarget.style.color = '#ef4444' }}
          onMouseOut={e => { e.currentTarget.style.borderColor = T.border; e.currentTarget.style.color = T.muted }}
        >
          <span>⎋</span> Sign Out
        </button>
        <div style={{ fontSize: 10, color: T.muted, marginTop: 8, paddingLeft: 4 }}>
          © {new Date().getFullYear()} Tailored Athlete
        </div>
      </div>
    </div>
  )
}
