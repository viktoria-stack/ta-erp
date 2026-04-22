import { NextResponse } from 'next/server'

export async function GET(request) {
  const { searchParams, origin } = new URL(request.url)
  const token_hash = searchParams.get('token_hash')
  const type = searchParams.get('type')
  const code = searchParams.get('code')

  // Redirect to set-password with the token params
  if (token_hash || code) {
    const params = new URLSearchParams()
    if (token_hash) params.set('token_hash', token_hash)
    if (type) params.set('type', type)
    if (code) params.set('code', code)
    return NextResponse.redirect(`${origin}/set-password?${params.toString()}`)
  }

  return NextResponse.redirect(`${origin}/login?error=invalid_link`)
}
