import { NextRequest, NextResponse } from 'next/server'
import { withAuth, AuthUser } from '@/lib/middleware/auth'

async function handleMe(request: NextRequest, user: AuthUser): Promise<NextResponse> {
  return NextResponse.json({
    success: true,
    user: {
      id: user.id,
      email: user.email,
      role: user.role
    }
  })
}

export const GET = withAuth(handleMe)
