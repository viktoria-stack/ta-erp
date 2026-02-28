'use client'
import Sidebar from '@/components/Sidebar'
import { T } from '@/components/ui'

export default function Shell({ title, children }) {
  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: T.bg }}>
      <Sidebar />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Topbar */}
        <div style={{
          padding: '16px 28px', borderBottom: `1px solid ${T.border}`,
          background: T.surface, display: 'flex', justifyContent: 'space-between',
          alignItems: 'center', flexShrink: 0
        }}>
          <h1 style={{ fontFamily: 'Barlow Condensed', fontWeight: 800, fontSize: 22, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            {title}
          </h1>
          <div style={{ fontSize: 12, color: T.muted }}>
            {new Date().toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' })}
          </div>
        </div>
        {/* Content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 24 }}>
          {children}
        </div>
      </div>
    </div>
  )
}
