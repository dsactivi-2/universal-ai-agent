import { NextRequest, NextResponse } from 'next/server'
import { readFile } from 'fs/promises'
import { existsSync } from 'fs'
import path from 'path'
import { requireAuth } from '@/lib/auth'

const UPLOAD_DIR = path.join(process.cwd(), 'data', 'uploads')

// GET /api/upload/[filename] - Serve uploaded file
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ filename: string }> }
) {
  try {
    // Auth prüfen
    const authResult = requireAuth(request)
    if ('error' in authResult) return authResult.error

    const { filename } = await params

    // Security: Prevent path traversal
    if (filename.includes('..') || filename.includes('/')) {
      return NextResponse.json({ error: 'Invalid filename' }, { status: 400 })
    }

    const filePath = path.join(UPLOAD_DIR, filename)

    if (!existsSync(filePath)) {
      return NextResponse.json({ error: 'File not found' }, { status: 404 })
    }

    const buffer = await readFile(filePath)

    // Determine content type from extension
    const ext = path.extname(filename).toLowerCase()
    const contentTypes: Record<string, string> = {
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.pdf': 'application/pdf',
      '.json': 'application/json',
      '.txt': 'text/plain',
      '.md': 'text/markdown',
      '.csv': 'text/csv',
      '.html': 'text/html',
      '.css': 'text/css',
      '.js': 'application/javascript',
      '.ts': 'application/typescript',
      '.xml': 'application/xml'
    }

    const contentType = contentTypes[ext] || 'application/octet-stream'

    return new NextResponse(buffer, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=31536000'
      }
    })
  } catch (error) {
    console.error('Failed to serve file:', error)
    return NextResponse.json({ error: 'Failed to serve file' }, { status: 500 })
  }
}
