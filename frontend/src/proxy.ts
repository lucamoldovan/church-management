import { NextRequest, NextResponse } from 'next/server'
import { getSessionCookie } from 'better-auth/cookies'

export function proxy(request:NextRequest){
  const response=NextResponse.next()
  // Middleware only performs an optimistic cookie check. Every protected API
  // route validates the session server-side with Better Auth.
  const hasSession=!!getSessionCookie(request)
  response.headers.set('x-authenticated',hasSession?'1':'0')
  return response
}
export const config={matcher:['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)']}
