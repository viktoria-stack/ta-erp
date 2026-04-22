import { NextResponse } from 'next/server'

export async function middleware(request) {
  const { pathname } = request.nextUrl

  // Allow these pages always
  if (pathname.startsWith('/login') || pathname.startsWith('/set-password') || pathname.startsWith('/auth')) {
    return NextResponse.next()
  }

  // Check for any supabase auth cookie
  const hasCookie = [...request.cookies.getAll()].some(c =>
    c.name.includes('auth-token') || c.name.includes('supabase')
  )

  if (!hasCookie) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
}
