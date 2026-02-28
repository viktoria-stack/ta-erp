'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { T } from './ui'

const NAV = [
  { href: '/dashboard',        label: 'Dashboard',        icon: '▤' },
  { href: '/purchase-orders',  label: 'Purchase Orders',  icon: '📋' },
  { href: '/inventory',        label: 'Inventory',        icon: '📦' },
  { href: '/suppliers',        label: 'Suppliers',        icon: '🏭' },
]

export default function Sidebar() {
  const path = usePathname()

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

      <div style={{ padding: '14px 18px', borderTop: `1px solid ${T.border}`, fontSize: 11, color: T.muted }}>
        © {new Date().getFullYear()} Tailored Athlete
      </div>
    </div>
  )
}
