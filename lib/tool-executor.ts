import { exec } from 'child_process'
import { promisify } from 'util'
import fs from 'fs/promises'
import path from 'path'
import { glob } from 'glob'
import {
  ReadFileInput,
  WriteFileInput,
  ListFilesInput,
  ExecuteBashInput,
  GitCommandInput,
  CreateDirectoryInput,
  DeleteFileInput,
  SearchFilesInput,
  TaskCompleteInput
} from './tools'

const execAsync = promisify(exec)

// Workspace directory for agent operations
const WORKSPACE_ROOT = process.env.AGENT_WORKSPACE || '/app/workspace'

// Security: Ensure path is within workspace
function securePath(inputPath: string): string {
  const resolved = path.resolve(WORKSPACE_ROOT, inputPath)
  if (!resolved.startsWith(WORKSPACE_ROOT)) {
    throw new Error(`Access denied: Path outside workspace: ${inputPath}`)
  }
  return resolved
}

// Blocked commands for security
const BLOCKED_COMMANDS = [
  'rm -rf /',
  'rm -rf /*',
  'mkfs',
  'dd if=',
  ':(){',
  'fork bomb',
  '> /dev/sda',
  'chmod -R 777 /',
  'curl | bash',
  'wget | bash',
]

function isCommandSafe(command: string): boolean {
  const lowerCmd = command.toLowerCase()
  return !BLOCKED_COMMANDS.some(blocked => lowerCmd.includes(blocked.toLowerCase()))
}

export interface ToolResult {
  success: boolean
  output: string
  error?: string
}

export class ToolExecutor {
  private workspaceRoot: string

  constructor(workspaceRoot?: string) {
    this.workspaceRoot = workspaceRoot || WORKSPACE_ROOT
  }

  async ensureWorkspace(): Promise<void> {
    try {
      await fs.access(this.workspaceRoot)
    } catch {
      await fs.mkdir(this.workspaceRoot, { recursive: true })
    }
  }

  async execute(toolName: string, input: unknown): Promise<ToolResult> {
    await this.ensureWorkspace()

    try {
      switch (toolName) {
        case 'read_file':
          return await this.readFile(input as ReadFileInput)
        case 'write_file':
          return await this.writeFile(input as WriteFileInput)
        case 'list_files':
          return await this.listFiles(input as ListFilesInput)
        case 'execute_bash':
          return await this.executeBash(input as ExecuteBashInput)
        case 'git_command':
          return await this.gitCommand(input as GitCommandInput)
        case 'create_directory':
          return await this.createDirectory(input as CreateDirectoryInput)
        case 'delete_file':
          return await this.deleteFile(input as DeleteFileInput)
        case 'search_files':
          return await this.searchFiles(input as SearchFilesInput)
        case 'task_complete':
          return await this.taskComplete(input as TaskCompleteInput)
        default:
          return { success: false, output: '', error: `Unknown tool: ${toolName}` }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      return { success: false, output: '', error: errorMessage }
    }
  }

  private async readFile(input: ReadFileInput): Promise<ToolResult> {
    const filePath = securePath(input.path)
    const content = await fs.readFile(filePath, 'utf-8')
    return { success: true, output: content }
  }

  private async writeFile(input: WriteFileInput): Promise<ToolResult> {
    const filePath = securePath(input.path)
    const dir = path.dirname(filePath)
    await fs.mkdir(dir, { recursive: true })
    await fs.writeFile(filePath, input.content, 'utf-8')
    return { success: true, output: `File written: ${input.path}` }
  }

  private async listFiles(input: ListFilesInput): Promise<ToolResult> {
    const dirPath = securePath(input.path)
    const entries = await fs.readdir(dirPath, { withFileTypes: true })
    const list = entries.map(entry => {
      const type = entry.isDirectory() ? '[DIR]' : '[FILE]'
      return `${type} ${entry.name}`
    }).join('\n')
    return { success: true, output: list || '(empty directory)' }
  }

  private async executeBash(input: ExecuteBashInput): Promise<ToolResult> {
    if (!isCommandSafe(input.command)) {
      return { success: false, output: '', error: 'Command blocked for security reasons' }
    }

    const cwd = input.working_dir
      ? securePath(input.working_dir)
      : this.workspaceRoot

    try {
      const { stdout, stderr } = await execAsync(input.command, {
        cwd,
        timeout: 120000, // 2 minute timeout
        maxBuffer: 10 * 1024 * 1024, // 10MB buffer
        env: {
          ...process.env,
          HOME: this.workspaceRoot,
          PATH: process.env.PATH
        }
      })

      const output = stdout + (stderr ? `\nSTDERR:\n${stderr}` : '')
      return { success: true, output: output || '(no output)' }
    } catch (error: unknown) {
      const execError = error as { stdout?: string; stderr?: string; message?: string }
      const output = (execError.stdout || '') + (execError.stderr || '')
      return {
        success: false,
        output: output || '',
        error: execError.message || 'Command failed'
      }
    }
  }

  private async gitCommand(input: GitCommandInput): Promise<ToolResult> {
    // Prepend 'git' to the command
    const command = `git ${input.command}`
    return this.executeBash({ command })
  }

  private async createDirectory(input: CreateDirectoryInput): Promise<ToolResult> {
    const dirPath = securePath(input.path)
    await fs.mkdir(dirPath, { recursive: true })
    return { success: true, output: `Directory created: ${input.path}` }
  }

  private async deleteFile(input: DeleteFileInput): Promise<ToolResult> {
    const filePath = securePath(input.path)
    const stat = await fs.stat(filePath)

    if (stat.isDirectory()) {
      await fs.rm(filePath, { recursive: true })
      return { success: true, output: `Directory deleted: ${input.path}` }
    } else {
      await fs.unlink(filePath)
      return { success: true, output: `File deleted: ${input.path}` }
    }
  }

  private async searchFiles(input: SearchFilesInput): Promise<ToolResult> {
    const pattern = path.join(this.workspaceRoot, input.pattern)
    const files = await glob(pattern, { nodir: true })

    const relativePaths = files.map(f => path.relative(this.workspaceRoot, f))

    if (input.content) {
      // Search within files for content
      const matches: string[] = []
      for (const file of files) {
        try {
          const content = await fs.readFile(file, 'utf-8')
          if (content.includes(input.content)) {
            const relPath = path.relative(this.workspaceRoot, file)
            // Find line numbers
            const lines = content.split('\n')
            const matchingLines = lines
              .map((line, i) => ({ line, num: i + 1 }))
              .filter(({ line }) => line.includes(input.content))
              .slice(0, 5) // Limit to 5 matches per file
              .map(({ line, num }) => `  ${num}: ${line.slice(0, 100)}`)

            matches.push(`${relPath}:\n${matchingLines.join('\n')}`)
          }
        } catch {
          // Skip files that can't be read
        }
      }
      return { success: true, output: matches.join('\n\n') || 'No matches found' }
    }

    return { success: true, output: relativePaths.join('\n') || 'No files found' }
  }

  private async taskComplete(input: TaskCompleteInput): Promise<ToolResult> {
    return {
      success: true,
      output: `TASK_COMPLETE: ${input.summary}`,
    }
  }
}
