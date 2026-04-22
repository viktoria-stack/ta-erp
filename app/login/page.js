'use client'
import { useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import { useRouter } from 'next/navigation'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
)

const T = {
  dark:   '#111318',
  card:   '#1A1D24',
  border: '#2A2D35',
  orange: '#E8630A',
  white:  '#FFFFFF',
  muted:  '#8B8FA8',
  red:    '#EF4444',
}

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const router = useRouter()

  const login = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    const { error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      setError(error.message === 'Invalid login credentials'
        ? 'Incorrect email or password'
        : error.message)
      setLoading(false)
    } else {
      router.push('/dashboard')
      router.refresh()
    }
  }

  return (
    <div style={{
      minHeight: '100vh', background: T.dark,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: 'Arial, sans-serif', padding: 20,
    }}>
      <div style={{ width: '100%', maxWidth: 420 }}>

        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: T.orange, letterSpacing: '0.15em', marginBottom: 6 }}>
            TA OPERATIONS
          </div>
          <div style={{ fontSize: 28, fontWeight: 900, color: T.white, letterSpacing: '-0.02em' }}>
            ERP System
          </div>
        </div>

        {/* Card */}
        <div style={{
          background: T.card, border: `1px solid ${T.border}`,
          borderRadius: 12, padding: '32px 28px',
          boxShadow: '0 20px 60px rgba(0,0,0,0.4)',
        }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: T.white, marginBottom: 24 }}>
            Sign in to your account
          </div>

          {error && (
            <div style={{
              background: '#ef444420', border: '1px solid #ef444440',
              color: T.red, padding: '10px 14px', borderRadius: 8,
              fontSize: 13, marginBottom: 20,
            }}>
              {error}
            </div>
          )}

          <form onSubmit={login}>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 11, color: T.muted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                autoComplete="email"
                placeholder="your@email.com"
                style={{
                  width: '100%', boxSizing: 'border-box',
                  background: '#0D1017', border: `1px solid ${T.border}`,
                  borderRadius: 8, padding: '11px 14px',
                  color: T.white, fontSize: 14, outline: 'none',
                }}
              />
            </div>

            <div style={{ marginBottom: 24 }}>
              <label style={{ display: 'block', fontSize: 11, color: T.muted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                placeholder="••••••••"
                style={{
                  width: '100%', boxSizing: 'border-box',
                  background: '#0D1017', border: `1px solid ${T.border}`,
                  borderRadius: 8, padding: '11px 14px',
                  color: T.white, fontSize: 14, outline: 'none',
                }}
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              style={{
                width: '100%', padding: '12px',
                background: loading ? '#6b3a08' : T.orange,
                border: 'none', borderRadius: 8,
                color: T.white, fontSize: 15, fontWeight: 700,
                cursor: loading ? 'not-allowed' : 'pointer',
                transition: 'background 0.2s',
              }}
            >
              {loading ? 'Signing in…' : 'Sign In'}
            </button>
          </form>
        </div>

        <div style={{ textAlign: 'center', marginTop: 20, fontSize: 12, color: T.muted }}>
          Don't have access? Contact your administrator.
        </div>
      </div>
    </div>
  )
}
