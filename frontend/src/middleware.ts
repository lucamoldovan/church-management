import { type NextRequest, NextResponse } from 'next/server'

/**
 * Cloudflare-native request middleware.
 *
 * Authentication is handled by Better Auth at /api/auth/[...all].
 * Keep middleware free of Supabase initialization so the app can boot
 * without legacy Supabase environment variables.
 */
export async function middleware(_request: NextRequest) {
  return NextResponse.next()
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
