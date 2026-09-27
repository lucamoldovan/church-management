import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const { origin } = new URL(request.url)
  return NextResponse.redirect(new URL('/dashboard', origin))
}
