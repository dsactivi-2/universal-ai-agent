import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'

export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = requireAuth(request)
  if ('error' in auth) return auth.error

  return NextResponse.json({
    success: true,
    user: {
      id: auth.user.userId,
      email: auth.user.email,
      role: auth.user.role
    }
  })
}
