import { NextResponse } from 'next/server'

/**
 * Better Auth completes OAuth callbacks through /api/auth/*.
 * This route remains as a compatibility redirect for old callback URLs.
 */
export async function GET(request: Request) {
  const { origin } = new URL(request.url)
  return NextResponse.redirect(new URL('/dashboard', origin))
}
