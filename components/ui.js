'use client'

// ─── THEME ────────────────────────────────────────────────────────────────────
export const T = {
  bg: '#0a0a0b', surface: '#111114', card: '#16161a', border: '#222228',
  accent: '#ff6b00', accentDim: '#ff6b0018', text: '#f0f0f2', muted: '#6b6b7a',
  subtle: '#2a2a32', green: '#22c55e', greenDim: '#22c55e15',
  yellow: '#f59e0b', yellowDim: '#f59e0b15', red: '#ef4444', redDim: '#ef444415',
  blue: '#3b82f6', blueDim: '#3b82f615',
}

export const SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL']
export const WAREHOUSES = ['UK - London', 'EU - Amsterdam', 'US - New York']
export const CURRENCIES = ['GBP', 'EUR', 'USD']
export const FX = { GBP: 1, EUR: 1.17, USD: 1.27 }
export const PO_STATUSES = ['Draft', 'Sent', 'Confirmed', 'In Production', 'Shipped', 'Received', 'Cancelled']

export const fmt = (n, cur = 'GBP') => {
  const sym = { GBP: '£', EUR: '€', USD: '$' }[cur] || ''
  return `${sym}${Number(n).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export const poTotal = (po) => (po.po_lines || []).reduce((sum, l) => {
  const qty = SIZES.reduce((s, sz) => s + (l.sizes?.[sz] || 0), 0)
  return sum + qty * (l.unit_cost || 0)
}, 0)

export const totalInGBP = (po) => poTotal(po) / (FX[po.currency] || 1)

export const statusColor = (s) => ({
  Draft: T.muted, Sent: T.blue, Confirmed: T.blue,
  'In Production': T.yellow, Shipped: T.accent, Received: T.green, Cancelled: T.red
}[s] || T.muted)

// ─── BADGE ────────────────────────────────────────────────────────────────────
export const Badge = ({ status }) => {
  const c = statusColor(status)
  return (
    <span style={{
      background: c + '20', color: c, border: `1px solid ${c}40`,
      padding: '2px 9px', borderRadius: 3, fontSize: 11, fontWeight: 700,
      letterSpacing: '0.05em', textTransform: 'uppercase', whiteSpace: 'nowrap'
    }}>{status}</span>
  )
}

// ─── TABLE CELLS ──────────────────────────────────────────────────────────────
export const Th = ({ children, style }) => (
  <th style={{
    textAlign: 'left', padding: '10px 14px', fontSize: 10, color: T.muted,
    textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 700,
    borderBottom: `1px solid ${T.border}`, whiteSpace: 'nowrap', ...style
  }}>{children}</th>
)

export const Td = ({ children, style }) => (
  <td style={{ padding: '13px 14px', borderBottom: `1px solid ${T.border}`, fontSize: 13, color: T.text, ...style }}>
    {children}
  </td>
)

// ─── CARD ─────────────────────────────────────────────────────────────────────
export const Card = ({ children, style }) => (
  <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 8, ...style }}>
    {children}
  </div>
)

// ─── KPI CARD ─────────────────────────────────────────────────────────────────
export const KPI = ({ label, value, sub, color }) => (
  <Card style={{ padding: '18px 20px' }}>
    <div style={{ fontSize: 10, color: T.muted, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>{label}</div>
    <div style={{ fontSize: 26, fontWeight: 800, color: color || T.text, fontFamily: 'Barlow Condensed', letterSpacing: '-0.02em' }}>{value}</div>
    {sub && <div style={{ fontSize: 11, color: T.muted, marginTop: 4 }}>{sub}</div>}
  </Card>
)

// ─── INPUT ────────────────────────────────────────────────────────────────────
export const Input = ({ label, value, onChange, type = 'text', options, placeholder, style }) => (
  <div style={style}>
    {label && <div style={{ fontSize: 10, color: T.muted, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 5, fontWeight: 600 }}>{label}</div>}
    {options ? (
      <select value={value} onChange={e => onChange(e.target.value)} style={{
        width: '100%', background: T.surface, border: `1px solid ${T.border}`, borderRadius: 5,
        padding: '8px 10px', color: T.text, fontSize: 13, outline: 'none'
      }}>
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    ) : (
      <input type={type} value={value} placeholder={placeholder} onChange={e => onChange(e.target.value)} style={{
        width: '100%', background: T.surface, border: `1px solid ${T.border}`, borderRadius: 5,
        padding: '8px 10px', color: T.text, fontSize: 13, outline: 'none'
      }} />
    )}
  </div>
)

// ─── BUTTONS ──────────────────────────────────────────────────────────────────
export const BtnPrimary = ({ children, onClick, disabled, style }) => (
  <button onClick={onClick} disabled={disabled} style={{
    background: T.accent, color: '#fff', border: 'none', borderRadius: 5, padding: '8px 16px',
    fontWeight: 700, fontSize: 13, cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.5 : 1,
    fontFamily: 'Barlow', letterSpacing: '0.02em', whiteSpace: 'nowrap', ...style
  }}>{children}</button>
)

export const BtnGhost = ({ children, onClick, style }) => (
  <button onClick={onClick} style={{
    background: 'transparent', color: T.muted, border: `1px solid ${T.border}`, borderRadius: 5,
    padding: '8px 14px', fontWeight: 600, fontSize: 13, cursor: 'pointer',
    fontFamily: 'Barlow', whiteSpace: 'nowrap', ...style
  }}>{children}</button>
)

// ─── MODAL ────────────────────────────────────────────────────────────────────
export const Modal = ({ title, width = 900, onClose, children }) => (
  <div style={{ position: 'fixed', inset: 0, background: '#000000bb', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
    <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 10, width, maxWidth: '95vw', maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 30px 80px #000' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '18px 24px', borderBottom: `1px solid ${T.border}`, flexShrink: 0 }}>
        <span style={{ fontFamily: 'Barlow Condensed', fontWeight: 700, fontSize: 18, color: T.text, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{title}</span>
        <button onClick={onClose} style={{ background: 'none', border: `1px solid ${T.border}`, color: T.muted, cursor: 'pointer', width: 30, height: 30, borderRadius: 5, fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: 24 }}>{children}</div>
    </div>
  </div>
)

// ─── LOADING ──────────────────────────────────────────────────────────────────
export const Loading = () => (
  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 60, color: T.muted, fontSize: 14 }}>
    Loading…
  </div>
)

export const ErrorMsg = ({ msg }) => (
  <div style={{ background: '#ef444415', border: '1px solid #ef444440', borderRadius: 6, padding: '12px 16px', color: '#ef4444', fontSize: 13 }}>
    ⚠ {msg}
  </div>
)
