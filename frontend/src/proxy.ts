import { NextRequest, NextResponse } from 'next/server'
import { getSessionCookie } from 'better-auth/cookies'

export function proxy(request: NextRequest) {
  const sessionCookie = getSessionCookie(request)
  const { pathname } = request.nextUrl

  if (!sessionCookie && (pathname.startsWith('/dashboard') || pathname.startsWith('/admin') || pathname.startsWith('/profile'))) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  if (sessionCookie && (pathname === '/login' || pathname === '/signup')) {
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/dashboard/:path*', '/admin/:path*', '/profile/:path*', '/login', '/signup'],
}
