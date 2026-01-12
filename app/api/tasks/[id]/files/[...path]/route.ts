import { NextRequest, NextResponse } from 'next/server'
import { getTaskById } from '@/lib/database'
import fs from 'fs'
import path from 'path'

const WORKSPACE_ROOT = process.env.WORKSPACE_PATH || '/app/workspace'

// GET /api/tasks/[id]/files/[...path] - Download a specific file
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; path: string[] }> }
) {
  try {
    const { id: taskId, path: pathSegments } = await params

    // Check if task exists
    const task = getTaskById(taskId)
    if (!task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 })
    }

    // Build file path
    const filePath = pathSegments.join('/')
    const fullPath = path.join(WORKSPACE_ROOT, filePath)

    // Security check - prevent path traversal
    const resolvedPath = path.resolve(fullPath)
    if (!resolvedPath.startsWith(path.resolve(WORKSPACE_ROOT))) {
      return NextResponse.json({ error: 'Access denied - invalid path' }, { status: 403 })
    }

    // Check if file exists
    if (!fs.existsSync(resolvedPath)) {
      return NextResponse.json({ error: 'File not found' }, { status: 404 })
    }

    // Check if it's a directory
    const stats = fs.statSync(resolvedPath)
    if (stats.isDirectory()) {
      // List directory contents
      const entries = fs.readdirSync(resolvedPath, { withFileTypes: true })
      const contents = entries.map(entry => ({
        name: entry.name,
        isDirectory: entry.isDirectory(),
        path: path.join(filePath, entry.name)
      }))
      return NextResponse.json({
        type: 'directory',
        path: filePath,
        contents
      })
    }

    // Read file content
    const content = fs.readFileSync(resolvedPath)
    const fileName = path.basename(resolvedPath)
    const ext = path.extname(fileName).toLowerCase()

    // Determine content type
    const contentTypes: Record<string, string> = {
      '.json': 'application/json',
      '.js': 'application/javascript',
      '.ts': 'application/typescript',
      '.jsx': 'application/javascript',
      '.tsx': 'application/typescript',
      '.html': 'text/html',
      '.css': 'text/css',
      '.md': 'text/markdown',
      '.txt': 'text/plain',
      '.py': 'text/x-python',
      '.sh': 'text/x-shellscript',
      '.yaml': 'text/yaml',
      '.yml': 'text/yaml',
      '.xml': 'application/xml',
      '.svg': 'image/svg+xml',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.gif': 'image/gif',
      '.pdf': 'application/pdf',
      '.zip': 'application/zip'
    }

    const contentType = contentTypes[ext] || 'application/octet-stream'
    const isText = contentType.startsWith('text/') ||
                   contentType === 'application/json' ||
                   contentType.includes('javascript') ||
                   contentType.includes('typescript')

    // Check if download is requested
    const { searchParams } = new URL(request.url)
    const download = searchParams.get('download') === 'true'

    if (download) {
      return new NextResponse(content, {
        headers: {
          'Content-Type': contentType,
          'Content-Disposition': `attachment; filename="${fileName}"`,
          'Content-Length': stats.size.toString()
        }
      })
    }

    // Return file info and content for text files
    if (isText) {
      return NextResponse.json({
        type: 'file',
        path: filePath,
        name: fileName,
        size: stats.size,
        contentType,
        content: content.toString('utf-8'),
        modified: stats.mtime.toISOString()
      })
    }

    // For binary files, return info only (use ?download=true for actual content)
    return NextResponse.json({
      type: 'file',
      path: filePath,
      name: fileName,
      size: stats.size,
      contentType,
      modified: stats.mtime.toISOString(),
      downloadUrl: `?download=true`
    })
  } catch (error) {
    console.error('Failed to get file:', error)
    return NextResponse.json({ error: 'Failed to get file' }, { status: 500 })
  }
}
