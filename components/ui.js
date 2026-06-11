'use client'
import { createContext, useContext, useState } from 'react'

// ─── THEME ────────────────────────────────────────────────────────────────────
export const T = {
  bg: '#0a0a0b', surface: '#111114', card: '#16161a', border: '#222228',
  accent: '#ff6b00', accentDim: '#ff6b0018', text: '#f0f0f2', muted: '#6b6b7a',
  subtle: '#2a2a32', green: '#22c55e', greenDim: '#22c55e15',
  yellow: '#f59e0b', yellowDim: '#f59e0b15', red: '#ef4444', redDim: '#ef444415',
  blue: '#3b82f6', blueDim: '#3b82f615',
}

export const SIZES      = ['XS', 'S', 'M', 'L', 'XL', 'XXL']
export const WAREHOUSES = ['UK - London', 'EU - Amsterdam', 'US - New York']
export const CURRENCIES = ['GBP', 'EUR', 'USD']
export const FX         = { GBP: 1, EUR: 1.17, USD: 1.27 }
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

// ─── TOAST ────────────────────────────────────────────────────────────────────
const ToastCtx = createContext(null)

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])

  const add = (msg, type = 'info') => {
    const id = Date.now() + Math.random()
    setToasts(t => [...t, { id, msg, type }])
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 4000)
  }

  const ctx = {
    success: m => add(m, 'success'),
    error:   m => add(m, 'error'),
    info:    m => add(m, 'info'),
  }

  const palette = { success: T.green, error: T.red, info: T.blue }
  const icons   = { success: '✓', error: '✕', info: 'i' }

  return (
    <ToastCtx.Provider value={ctx}>
      {children}
      <div style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 9999, display: 'flex', flexDirection: 'column', gap: 8, pointerEvents: 'none' }}>
        {toasts.map(t => {
          const c = palette[t.type]
          return (
            <div key={t.id} style={{
              display: 'flex', alignItems: 'center', gap: 10,
              background: T.card, border: `1px solid ${c}30`,
              borderLeft: `3px solid ${c}`,
              borderRadius: 8, padding: '11px 16px',
              color: T.text, fontSize: 13, fontWeight: 500,
              boxShadow: '0 8px 32px #00000070',
              animation: 'toastIn 0.2s ease',
              minWidth: 240, maxWidth: 380,
              pointerEvents: 'all',
            }}>
              <span style={{ color: c, fontWeight: 800, fontSize: 12, width: 16, textAlign: 'center', flexShrink: 0 }}>{icons[t.type]}</span>
              {t.msg}
            </div>
          )
        })}
      </div>
    </ToastCtx.Provider>
  )
}

export const useToast = () => useContext(ToastCtx)

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
export const Th = ({ children, style, ...props }) => (
  <th style={{
    textAlign: 'left', padding: '10px 14px', fontSize: 10, color: T.muted,
    textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 700,
    borderBottom: `1px solid ${T.border}`, whiteSpace: 'nowrap', ...style
  }} {...props}>{children}</th>
)

export const Td = ({ children, style }) => (
  <td style={{ padding: '12px 14px', borderBottom: `1px solid ${T.border}`, fontSize: 13, color: T.text, ...style }}>
    {children}
  </td>
)

// ─── CARD ─────────────────────────────────────────────────────────────────────
export const Card = ({ children, style }) => (
  <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 10, ...style }}>
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
        width: '100%', background: T.surface, border: `1px solid ${T.border}`, borderRadius: 6,
        padding: '8px 10px', color: T.text, fontSize: 13, outline: 'none', transition: 'border-color 0.15s'
      }}>
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    ) : (
      <input type={type} value={value} placeholder={placeholder} onChange={e => onChange(e.target.value)} style={{
        width: '100%', background: T.surface, border: `1px solid ${T.border}`, borderRadius: 6,
        padding: '8px 10px', color: T.text, fontSize: 13, outline: 'none', transition: 'border-color 0.15s'
      }} />
    )}
  </div>
)

// ─── BUTTONS ──────────────────────────────────────────────────────────────────
export const BtnPrimary = ({ children, onClick, disabled, style }) => {
  const [h, setH] = useState(false)
  return (
    <button
      onClick={onClick} disabled={disabled}
      onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)}
      style={{
        background: h && !disabled ? '#e55e00' : T.accent,
        color: '#fff', border: 'none', borderRadius: 6, padding: '8px 16px',
        fontWeight: 700, fontSize: 13,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.45 : 1,
        fontFamily: 'Barlow', letterSpacing: '0.02em', whiteSpace: 'nowrap',
        transition: 'background 0.15s, opacity 0.15s',
        ...style
      }}
    >{children}</button>
  )
}

export const BtnGhost = ({ children, onClick, disabled, style }) => {
  const [h, setH] = useState(false)
  return (
    <button
      onClick={onClick} disabled={disabled}
      onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)}
      style={{
        background: h ? T.subtle : 'transparent',
        color: h ? T.text : T.muted,
        border: `1px solid ${h ? T.muted : T.border}`,
        borderRadius: 6, padding: '8px 14px',
        fontWeight: 600, fontSize: 13,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.45 : 1,
        fontFamily: 'Barlow', whiteSpace: 'nowrap',
        transition: 'background 0.15s, color 0.15s, border-color 0.15s',
        ...style
      }}
    >{children}</button>
  )
}

export const BtnDanger = ({ children, onClick, disabled, style }) => {
  const [h, setH] = useState(false)
  return (
    <button
      onClick={onClick} disabled={disabled}
      onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)}
      style={{
        background: h ? '#ef444425' : 'transparent',
        color: T.red, border: `1px solid ${h ? T.red + '60' : T.border}`,
        borderRadius: 6, padding: '8px 14px',
        fontWeight: 600, fontSize: 13,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.45 : 1,
        fontFamily: 'Barlow', whiteSpace: 'nowrap',
        transition: 'background 0.15s, border-color 0.15s',
        ...style
      }}
    >{children}</button>
  )
}

// ─── MODAL ────────────────────────────────────────────────────────────────────
export const Modal = ({ title, width = 900, onClose, children }) => (
  <div
    style={{ position: 'fixed', inset: 0, background: '#000000cc', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, animation: 'fadeIn 0.15s ease' }}
    onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}
  >
    <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 12, width, maxWidth: '95vw', maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 40px 100px #000000a0' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 24px', borderBottom: `1px solid ${T.border}`, flexShrink: 0 }}>
        <span style={{ fontFamily: 'Barlow Condensed', fontWeight: 700, fontSize: 17, color: T.text, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{title}</span>
        <button onClick={onClose} style={{ background: 'none', border: `1px solid ${T.border}`, color: T.muted, cursor: 'pointer', width: 28, height: 28, borderRadius: 6, fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'border-color 0.15s, color 0.15s' }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = T.red; e.currentTarget.style.color = T.red }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = T.border; e.currentTarget.style.color = T.muted }}
        >×</button>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: 24 }}>{children}</div>
    </div>
  </div>
)

// ─── LOADING ──────────────────────────────────────────────────────────────────
export const Loading = ({ size = 32 }) => (
  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 60 }}>
    <div style={{
      width: size, height: size,
      border: `3px solid ${T.border}`,
      borderTopColor: T.accent,
      borderRadius: '50%',
      animation: 'spin 0.65s linear infinite',
    }} />
    <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
  </div>
)

// ─── SKELETON ─────────────────────────────────────────────────────────────────
export const Skeleton = ({ width = '100%', height = 14, radius = 4, style }) => (
  <div style={{
    width, height,
    borderRadius: radius,
    background: `linear-gradient(90deg, ${T.surface} 0px, ${T.subtle} 200px, ${T.surface} 400px)`,
    backgroundSize: '800px 100%',
    animation: 'shimmer 1.4s infinite linear',
    ...style
  }} />
)

export const SkeletonRow = ({ cols = 4 }) => (
  <tr>
    {Array.from({ length: cols }).map((_, i) => (
      <td key={i} style={{ padding: '13px 14px', borderBottom: `1px solid ${T.border}` }}>
        <Skeleton width={i === 0 ? '70%' : '50%'} />
      </td>
    ))}
  </tr>
)

export const ErrorMsg = ({ msg }) => (
  <div style={{ background: '#ef444415', border: '1px solid #ef444440', borderRadius: 8, padding: '12px 16px', color: '#ef4444', fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}>
    <span style={{ fontWeight: 800 }}>✕</span> {msg}
  </div>
)
