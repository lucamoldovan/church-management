import { NextResponse, type NextRequest } from 'next/server'

// Better Auth owns authentication/session handling. This middleware intentionally
// performs no Supabase work; protected API/page boundaries validate the session
// server-side through getAuthContext().
export async function middleware(request: NextRequest) {
  return NextResponse.next({ request })
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
