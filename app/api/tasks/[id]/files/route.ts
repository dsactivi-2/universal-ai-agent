import { NextRequest, NextResponse } from 'next/server'
import { getTaskById, getStepsByTaskId } from '@/lib/database'
import fs from 'fs'
import path from 'path'
import { requireAuth } from '@/lib/auth'

const WORKSPACE_ROOT = process.env.WORKSPACE_PATH || '/app/workspace'

// Helper to get file stats
function getFileInfo(filePath: string) {
  try {
    const stats = fs.statSync(filePath)
    return {
      name: path.basename(filePath),
      path: filePath.replace(WORKSPACE_ROOT, ''),
      size: stats.size,
      isDirectory: stats.isDirectory(),
      modified: stats.mtime.toISOString(),
      created: stats.birthtime.toISOString()
    }
  } catch {
    return null
  }
}

// Recursively list all files
function listFilesRecursive(dir: string, files: string[] = []): string[] {
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true })
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        // Skip node_modules and hidden directories
        if (!entry.name.startsWith('.') && entry.name !== 'node_modules') {
          listFilesRecursive(fullPath, files)
        }
      } else {
        files.push(fullPath)
      }
    }
  } catch {
    // Directory doesn't exist or can't be read
  }
  return files
}

// GET /api/tasks/[id]/files - List files created by task
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Auth prüfen
    const authResult = requireAuth(request)
    if ('error' in authResult) return authResult.error

    const { id: taskId } = await params

    // Check if task exists
    const task = getTaskById(taskId)
    if (!task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 })
    }

    // Get steps to find which files were created/modified
    const steps = getStepsByTaskId(taskId)

    // Extract file paths from write_file and create_directory steps
    const taskFiles: Set<string> = new Set()

    for (const step of steps) {
      try {
        const input = typeof step.input === 'string' ? JSON.parse(step.input) : step.input

        if (step.tool === 'write_file' && input.path) {
          taskFiles.add(input.path)
        } else if (step.tool === 'create_directory' && input.path) {
          // List files in created directory
          const dirPath = path.join(WORKSPACE_ROOT, input.path)
          const filesInDir = listFilesRecursive(dirPath)
          filesInDir.forEach(f => taskFiles.add(f.replace(WORKSPACE_ROOT, '')))
        }
      } catch {
        // Skip invalid input
      }
    }

    // Get file info for each file
    const files = Array.from(taskFiles)
      .map(filePath => {
        const fullPath = filePath.startsWith('/')
          ? path.join(WORKSPACE_ROOT, filePath)
          : path.join(WORKSPACE_ROOT, filePath)
        return getFileInfo(fullPath)
      })
      .filter(Boolean)

    // Also list all workspace files if requested
    const { searchParams } = new URL(request.url)
    const listAll = searchParams.get('all') === 'true'

    let allFiles: ReturnType<typeof getFileInfo>[] = []
    if (listAll) {
      const allPaths = listFilesRecursive(WORKSPACE_ROOT)
      allFiles = allPaths.map(getFileInfo).filter(Boolean) as ReturnType<typeof getFileInfo>[]
    }

    return NextResponse.json({
      taskId,
      taskPhase: task.status.phase,
      taskFiles: files,
      allWorkspaceFiles: listAll ? allFiles : undefined,
      workspacePath: WORKSPACE_ROOT
    })
  } catch (error) {
    console.error('Failed to list files:', error)
    return NextResponse.json({ error: 'Failed to list files' }, { status: 500 })
  }
}
