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

// ============================================================
// SECURITY: Path Validation (Enhanced)
// ============================================================

async function securePath(inputPath: string): Promise<string> {
  // Normalize and resolve path
  const normalized = path.normalize(inputPath).replace(/^(\.\.[\/\\])+/, '')
  const resolved = path.resolve(WORKSPACE_ROOT, normalized)

  // Check if path is within workspace
  if (!resolved.startsWith(WORKSPACE_ROOT)) {
    throw new Error(`Access denied: Path outside workspace: ${inputPath}`)
  }

  // Check for symlink attacks
  try {
    const realPath = await fs.realpath(resolved)
    if (!realPath.startsWith(WORKSPACE_ROOT)) {
      throw new Error(`Access denied: Symlink points outside workspace: ${inputPath}`)
    }
  } catch (error) {
    // File doesn't exist yet - that's OK for write operations
    // But parent directory must be within workspace
    const parentDir = path.dirname(resolved)
    try {
      const realParent = await fs.realpath(parentDir)
      if (!realParent.startsWith(WORKSPACE_ROOT)) {
        throw new Error(`Access denied: Parent directory outside workspace`)
      }
    } catch {
      // Parent doesn't exist - will be created within workspace
    }
  }

  return resolved
}

// ============================================================
// SECURITY: Command Allowlist (statt Blocklist)
// ============================================================

interface AllowedCommand {
  pattern: RegExp
  description: string
  requiresWorkspaceOnly?: boolean
}

// Erlaubte Befehle - Allowlist statt Blocklist
const ALLOWED_COMMANDS: AllowedCommand[] = [
  // Package Managers
  { pattern: /^npm\s+(install|i|ci|run|test|build|start|init|audit)(\s|$)/, description: 'npm commands' },
  { pattern: /^npx\s+\S+/, description: 'npx commands' },
  { pattern: /^yarn\s+(add|install|run|test|build|start|init)(\s|$)/, description: 'yarn commands' },
  { pattern: /^pnpm\s+(add|install|run|test|build|start|init)(\s|$)/, description: 'pnpm commands' },
  { pattern: /^pip\s+(install|list|show|freeze)(\s|$)/, description: 'pip commands' },
  { pattern: /^pip3\s+(install|list|show|freeze)(\s|$)/, description: 'pip3 commands' },
  { pattern: /^python3?\s+-m\s+(pip|venv|pytest|unittest)(\s|$)/, description: 'python module commands' },

  // Build Tools
  { pattern: /^tsc(\s|$)/, description: 'TypeScript compiler' },
  { pattern: /^node\s+\S+/, description: 'node execution' },
  { pattern: /^python3?\s+\S+\.py/, description: 'python script execution' },
  { pattern: /^go\s+(build|run|test|mod|get)(\s|$)/, description: 'go commands' },
  { pattern: /^cargo\s+(build|run|test|new|init)(\s|$)/, description: 'cargo commands' },
  { pattern: /^make(\s|$)/, description: 'make commands' },

  // Version Control (eingeschränkt)
  { pattern: /^git\s+(init|add|commit|status|log|diff|branch|checkout|merge|pull|push|clone|fetch|stash|tag|remote)(\s|$)/, description: 'git commands' },

  // File Operations (sicher, da Pfade validiert werden)
  { pattern: /^ls(\s|$)/, description: 'list files', requiresWorkspaceOnly: true },
  { pattern: /^cat\s+/, description: 'view file', requiresWorkspaceOnly: true },
  { pattern: /^head(\s|$)/, description: 'view file head', requiresWorkspaceOnly: true },
  { pattern: /^tail(\s|$)/, description: 'view file tail', requiresWorkspaceOnly: true },
  { pattern: /^wc(\s|$)/, description: 'word count', requiresWorkspaceOnly: true },
  { pattern: /^find\s+\./, description: 'find in current dir', requiresWorkspaceOnly: true },
  { pattern: /^grep(\s|$)/, description: 'search in files', requiresWorkspaceOnly: true },

  // Directory Operations
  { pattern: /^mkdir(\s|$)/, description: 'create directory', requiresWorkspaceOnly: true },
  { pattern: /^pwd$/, description: 'print working directory' },
  { pattern: /^tree(\s|$)/, description: 'show directory tree', requiresWorkspaceOnly: true },

  // Testing
  { pattern: /^jest(\s|$)/, description: 'jest testing' },
  { pattern: /^vitest(\s|$)/, description: 'vitest testing' },
  { pattern: /^pytest(\s|$)/, description: 'pytest testing' },
  { pattern: /^mocha(\s|$)/, description: 'mocha testing' },

  // Linting & Formatting
  { pattern: /^eslint(\s|$)/, description: 'eslint' },
  { pattern: /^prettier(\s|$)/, description: 'prettier' },
  { pattern: /^black(\s|$)/, description: 'black formatter' },

  // Info Commands
  { pattern: /^echo\s+/, description: 'echo output' },
  { pattern: /^date$/, description: 'show date' },
  { pattern: /^whoami$/, description: 'show user' },
  { pattern: /^env$/, description: 'show environment (filtered)' },
]

// Explizit verbotene Patterns (zusätzliche Sicherheit)
const BLOCKED_PATTERNS = [
  /rm\s+-rf\s+[\/~]/,        // rm -rf / oder ~
  />\s*\/dev\/sd/,           // Write to disk devices
  /mkfs/,                     // Format filesystem
  /dd\s+if=/,                // Direct disk access
  /:[()\{]/,                  // Fork bomb patterns
  /curl.*\|\s*(ba)?sh/,      // Download and execute
  /wget.*\|\s*(ba)?sh/,      // Download and execute
  /chmod\s+777/,             // Dangerous permissions
  /chown\s+root/,            // Change to root ownership
  /sudo\s/,                   // Sudo commands
  /su\s+-/,                   // Switch user
  /passwd/,                   // Password changes
  /\$\(/,                     // Command substitution
  /`[^`]+`/,                  // Backtick execution
  /;\s*rm\s/,                 // Command chaining with rm
  /&&\s*rm\s/,               // Command chaining with rm
  /\|\s*rm\s/,                // Pipe to rm
  />\s*\/etc\//,             // Write to /etc
  />\s*\/bin\//,             // Write to /bin
  />\s*\/usr\//,             // Write to /usr
  /export\s+\w+=/,           // Environment modification
  /unset\s/,                  // Environment unsetting
  /source\s/,                 // Sourcing scripts
  /\.\s+\//,                  // Sourcing with dot
  /eval\s/,                   // Eval execution
  /exec\s/,                   // Exec replacement
  /nohup\s/,                  // Background daemon
  /&\s*$/,                    // Background execution
  /cron/,                     // Cron manipulation
  /systemctl/,               // Service manipulation
  /service\s/,                // Service manipulation
  /kill\s/,                   // Process killing
  /pkill\s/,                  // Process killing
  /killall\s/,               // Process killing
]

function isCommandAllowed(command: string): { allowed: boolean; reason?: string } {
  const trimmedCmd = command.trim()

  // Blocked patterns prüfen (höchste Priorität)
  for (const pattern of BLOCKED_PATTERNS) {
    if (pattern.test(trimmedCmd)) {
      return { allowed: false, reason: 'Command contains blocked pattern' }
    }
  }

  // Allowlist prüfen
  for (const allowed of ALLOWED_COMMANDS) {
    if (allowed.pattern.test(trimmedCmd)) {
      return { allowed: true }
    }
  }

  return { allowed: false, reason: 'Command not in allowlist' }
}

// ============================================================
// FILE SIZE & CONTENT LIMITS
// ============================================================

const MAX_FILE_SIZE = 10 * 1024 * 1024  // 10 MB
const MAX_OUTPUT_LENGTH = 50000          // 50k chars
const COMMAND_TIMEOUT = 60000            // 1 minute (reduced from 2)
const MAX_BUFFER = 5 * 1024 * 1024       // 5 MB buffer

// ============================================================
// TOOL EXECUTOR
// ============================================================

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
      console.error(`Tool execution error [${toolName}]:`, errorMessage)
      return { success: false, output: '', error: errorMessage }
    }
  }

  private async readFile(input: ReadFileInput): Promise<ToolResult> {
    const filePath = await securePath(input.path)

    // Check file size before reading
    const stats = await fs.stat(filePath)
    if (stats.size > MAX_FILE_SIZE) {
      return {
        success: false,
        output: '',
        error: `File too large: ${stats.size} bytes (max: ${MAX_FILE_SIZE})`
      }
    }

    const content = await fs.readFile(filePath, 'utf-8')
    return {
      success: true,
      output: content.slice(0, MAX_OUTPUT_LENGTH)
    }
  }

  private async writeFile(input: WriteFileInput): Promise<ToolResult> {
    // Content size check
    if (input.content.length > MAX_FILE_SIZE) {
      return {
        success: false,
        output: '',
        error: `Content too large: ${input.content.length} bytes (max: ${MAX_FILE_SIZE})`
      }
    }

    const filePath = await securePath(input.path)
    const dir = path.dirname(filePath)
    await fs.mkdir(dir, { recursive: true })
    await fs.writeFile(filePath, input.content, 'utf-8')
    return { success: true, output: `File written: ${input.path}` }
  }

  private async listFiles(input: ListFilesInput): Promise<ToolResult> {
    const dirPath = await securePath(input.path)
    const entries = await fs.readdir(dirPath, { withFileTypes: true })
    const list = entries.map(entry => {
      const type = entry.isDirectory() ? '[DIR]' : '[FILE]'
      return `${type} ${entry.name}`
    }).join('\n')
    return { success: true, output: list || '(empty directory)' }
  }

  private async executeBash(input: ExecuteBashInput): Promise<ToolResult> {
    // Command Allowlist prüfen
    const check = isCommandAllowed(input.command)
    if (!check.allowed) {
      return {
        success: false,
        output: '',
        error: `Command not allowed: ${check.reason}. Use only permitted commands.`
      }
    }

    const cwd = input.working_dir
      ? await securePath(input.working_dir)
      : this.workspaceRoot

    try {
      const { stdout, stderr } = await execAsync(input.command, {
        cwd,
        timeout: COMMAND_TIMEOUT,
        maxBuffer: MAX_BUFFER,
        env: {
          // Minimale Environment-Variablen
          PATH: '/usr/local/bin:/usr/bin:/bin',
          HOME: this.workspaceRoot,
          LANG: 'en_US.UTF-8',
          NODE_ENV: 'production',
          // Keine Secrets weiterleiten!
        },
        shell: '/bin/sh'  // Explizit Shell setzen
      })

      const output = (stdout + (stderr ? `\nSTDERR:\n${stderr}` : '')).slice(0, MAX_OUTPUT_LENGTH)
      return { success: true, output: output || '(no output)' }
    } catch (error: unknown) {
      const execError = error as { stdout?: string; stderr?: string; message?: string; killed?: boolean }

      if (execError.killed) {
        return {
          success: false,
          output: '',
          error: `Command timed out after ${COMMAND_TIMEOUT / 1000}s`
        }
      }

      const output = ((execError.stdout || '') + (execError.stderr || '')).slice(0, MAX_OUTPUT_LENGTH)
      return {
        success: false,
        output: output || '',
        error: execError.message || 'Command failed'
      }
    }
  }

  private async gitCommand(input: GitCommandInput): Promise<ToolResult> {
    // Git-spezifische Validierung
    const gitCmd = input.command.trim()

    // Nur erlaubte Git-Subcommands
    const allowedGitCmds = ['init', 'add', 'commit', 'status', 'log', 'diff', 'branch', 'checkout', 'merge', 'pull', 'push', 'clone', 'fetch', 'stash', 'tag', 'remote']
    const firstWord = gitCmd.split(/\s+/)[0]

    if (!allowedGitCmds.includes(firstWord)) {
      return {
        success: false,
        output: '',
        error: `Git subcommand '${firstWord}' not allowed`
      }
    }

    // Prepend 'git' to the command
    const command = `git ${gitCmd}`
    return this.executeBash({ command })
  }

  private async createDirectory(input: CreateDirectoryInput): Promise<ToolResult> {
    const dirPath = await securePath(input.path)
    await fs.mkdir(dirPath, { recursive: true })
    return { success: true, output: `Directory created: ${input.path}` }
  }

  private async deleteFile(input: DeleteFileInput): Promise<ToolResult> {
    const filePath = await securePath(input.path)

    // Prevent deleting workspace root
    if (filePath === this.workspaceRoot) {
      return {
        success: false,
        output: '',
        error: 'Cannot delete workspace root'
      }
    }

    const stat = await fs.stat(filePath)

    if (stat.isDirectory()) {
      // Limit directory deletion depth
      const entries = await fs.readdir(filePath, { recursive: true })
      if (entries.length > 100) {
        return {
          success: false,
          output: '',
          error: 'Directory contains too many files (>100). Delete contents first.'
        }
      }
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

    // Limit results
    const limitedFiles = files.slice(0, 100)
    const relativePaths = limitedFiles.map(f => path.relative(this.workspaceRoot, f))

    if (input.content) {
      // Search within files for content
      const matches: string[] = []
      for (const file of limitedFiles.slice(0, 20)) {  // Limit content search to 20 files
        try {
          const stats = await fs.stat(file)
          if (stats.size > MAX_FILE_SIZE) continue  // Skip large files

          const content = await fs.readFile(file, 'utf-8')
          if (content.includes(input.content)) {
            const relPath = path.relative(this.workspaceRoot, file)
            // Find line numbers
            const lines = content.split('\n')
            const matchingLines = lines
              .map((line, i) => ({ line, num: i + 1 }))
              .filter(({ line }) => input.content && line.includes(input.content))
              .slice(0, 3)  // Limit to 3 matches per file
              .map(({ line, num }) => `  ${num}: ${line.slice(0, 100)}`)

            matches.push(`${relPath}:\n${matchingLines.join('\n')}`)
          }
        } catch {
          // Skip files that can't be read
        }
      }
      return {
        success: true,
        output: (matches.join('\n\n') || 'No matches found').slice(0, MAX_OUTPUT_LENGTH)
      }
    }

    const output = relativePaths.join('\n') || 'No files found'
    const suffix = files.length > 100 ? `\n... and ${files.length - 100} more files` : ''
    return { success: true, output: output + suffix }
  }

  private async taskComplete(input: TaskCompleteInput): Promise<ToolResult> {
    return {
      success: true,
      output: `TASK_COMPLETE: ${input.summary}`,
    }
  }
}
