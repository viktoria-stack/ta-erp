import { NextResponse } from 'next/server'

export function middleware(request) {
  const password = process.env.BASIC_AUTH_PASSWORD
  if (!password) return NextResponse.next() // skip in local dev if not set

  const auth = request.headers.get('authorization')
  if (auth?.startsWith('Basic ')) {
    try {
      const decoded = atob(auth.slice(6))
      const colon = decoded.indexOf(':')
      const user = decoded.slice(0, colon)
      const pass = decoded.slice(colon + 1)
      const expectedUser = process.env.BASIC_AUTH_USER || 'admin'
      if (user === expectedUser && pass === password) return NextResponse.next()
    } catch {}
  }

  return new NextResponse('Authentication required', {
    status: 401,
    headers: { 'WWW-Authenticate': 'Basic realm="TA ERP"' },
  })
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
