'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@supabase/supabase-js'
import { useRouter, useSearchParams } from 'next/navigation'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
)

const T = {
  dark: '#111318', card: '#1A1D24', border: '#2A2D35',
  orange: '#E8630A', white: '#FFFFFF', muted: '#8B8FA8',
  red: '#EF4444', green: '#22C55E',
}

export default function SetPasswordPage() {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [verifying, setVerifying] = useState(true)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)
  const router = useRouter()
  const searchParams = useSearchParams()

  useEffect(() => {
    const verifyToken = async () => {
      const token_hash = searchParams.get('token_hash')
      const type = searchParams.get('type')
      const code = searchParams.get('code')

      try {
        if (code) {
          await supabase.auth.exchangeCodeForSession(code)
        } else if (token_hash && type) {
          await supabase.auth.verifyOtp({ token_hash, type })
        }
      } catch (e) {
        setError('Invalid or expired invite link. Please request a new invite.')
      }
      setVerifying(false)
    }
    verifyToken()
  }, [searchParams])

  const save = async (e) => {
    e.preventDefault()
    if (password.length < 8) { setError('Password must be at least 8 characters'); return }
    if (password !== confirm) { setError('Passwords do not match'); return }
    setLoading(true); setError('')
    const { error } = await supabase.auth.updateUser({ password })
    if (error) { setError(error.message); setLoading(false) }
    else { setDone(true); setTimeout(() => router.push('/dashboard'), 2000) }
  }

  const inp = {
    width: '100%', boxSizing: 'border-box',
    background: '#0D1017', border: `1px solid ${T.border}`,
    borderRadius: 8, padding: '11px 14px',
    color: T.white, fontSize: 14, outline: 'none',
  }

  return (
    <div style={{ minHeight: '100vh', background: T.dark, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Arial, sans-serif', padding: 20 }}>
      <div style={{ width: '100%', maxWidth: 420 }}>
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: T.orange, letterSpacing: '0.15em', marginBottom: 6 }}>TA OPERATIONS</div>
          <div style={{ fontSize: 28, fontWeight: 900, color: T.white }}>Set Your Password</div>
        </div>
        <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 12, padding: '32px 28px', boxShadow: '0 20px 60px rgba(0,0,0,0.4)' }}>
          {verifying ? (
            <div style={{ textAlign: 'center', color: T.muted }}>Verifying invite link…</div>
          ) : done ? (
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 40, marginBottom: 16 }}>✓</div>
              <div style={{ color: T.green, fontWeight: 700, fontSize: 16, marginBottom: 8 }}>Password set successfully!</div>
              <div style={{ color: T.muted, fontSize: 13 }}>Redirecting to dashboard…</div>
            </div>
          ) : (
            <>
              <div style={{ fontSize: 14, color: T.muted, marginBottom: 24 }}>Choose a password to complete your account setup.</div>
              {error && <div style={{ background: '#ef444420', border: '1px solid #ef444440', color: T.red, padding: '10px 14px', borderRadius: 8, fontSize: 13, marginBottom: 20 }}>{error}</div>}
              <form onSubmit={save}>
                <div style={{ marginBottom: 16 }}>
                  <label style={{ display: 'block', fontSize: 11, color: T.muted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>New Password</label>
                  <input type="password" value={password} onChange={e => setPassword(e.target.value)} required placeholder="Min. 8 characters" style={inp} />
                </div>
                <div style={{ marginBottom: 24 }}>
                  <label style={{ display: 'block', fontSize: 11, color: T.muted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Confirm Password</label>
                  <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)} required placeholder="Repeat password" style={inp} />
                </div>
                <button type="submit" disabled={loading} style={{ width: '100%', padding: '12px', background: loading ? '#6b3a08' : T.orange, border: 'none', borderRadius: 8, color: T.white, fontSize: 15, fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer' }}>
                  {loading ? 'Saving…' : 'Set Password & Continue'}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
