import { getAuth } from '@/lib/auth'
export const runtime = 'edge'
async function handler(request: Request) { return (await getAuth()).handler(request) }
export const GET = handler
export const POST = handler
