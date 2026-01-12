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
import { toolLogger } from './logger'

const execAsync = promisify(exec)

// Workspace directory for agent operations
const WORKSPACE_ROOT = process.env.AGENT_WORKSPACE || '/app/workspace'

// Security: Ensure path is within workspace
function securePath(inputPath: string): string {
  const resolved = path.resolve(WORKSPACE_ROOT, inputPath)
  if (!resolved.startsWith(WORKSPACE_ROOT)) {
    toolLogger.error('Path traversal attempt blocked', new Error('Access denied'), {
      inputPath,
      resolvedPath: resolved,
      workspace: WORKSPACE_ROOT
    })
    throw new Error(`Access denied: Path outside workspace: ${inputPath}`)
  }
  return resolved
}

// Blocked commands for security
// Categories: destructive, network exfiltration, privilege escalation, crypto mining, reverse shells
const BLOCKED_COMMANDS = [
  // Destructive file operations
  'rm -rf /',
  'rm -rf /*',
  'rm -rf ~',
  'rm -rf .',
  'rm -rf ..',
  'rm -rf $HOME',
  'rm -rf $PWD',
  'shred',
  'wipefs',

  // Disk/filesystem destruction
  'mkfs',
  'dd if=',
  'dd of=/dev',
  '> /dev/sda',
  '> /dev/nvme',
  'fdisk',
  'parted',

  // Fork bombs and resource exhaustion
  ':(){',
  'fork bomb',
  ':(){ :|:& };:',
  'while true; do',
  'yes |',

  // Dangerous permissions
  'chmod -R 777 /',
  'chmod 777 /',
  'chown -R',
  'chattr',

  // Piped remote execution (dangerous patterns)
  'curl | bash',
  'curl | sh',
  'wget | bash',
  'wget | sh',
  '| bash',
  '| sh -c',
  'bash -c "$(curl',
  'bash -c "$(wget',

  // Network exfiltration
  'nc -e',
  'netcat -e',
  '/dev/tcp/',
  '/dev/udp/',
  'ncat --exec',

  // Reverse shells
  'bash -i >& /dev/tcp',
  'python -c \'import socket',
  'python3 -c \'import socket',
  'perl -e \'use Socket',
  'php -r \'$sock=fsockopen',
  'ruby -rsocket',
  'mkfifo /tmp/f',

  // Privilege escalation
  'sudo su',
  'sudo -i',
  'su root',
  'passwd root',
  'visudo',

  // Environment/secret exfiltration
  'printenv | curl',
  'env | curl',
  'cat /etc/shadow',
  'cat /etc/passwd | curl',
  '.bash_history',
  '.ssh/id_rsa',
  '.aws/credentials',

  // Crypto mining indicators
  'xmrig',
  'minerd',
  'cpuminer',
  'stratum+tcp',

  // System modification
  'systemctl disable',
  'systemctl stop',
  '/etc/crontab',
  'crontab -r',

  // Dangerous process manipulation
  'kill -9 1',
  'killall',
  'pkill -9',
]

// Additional dangerous patterns (regex-based check)
const DANGEROUS_PATTERNS = [
  /rm\s+(-[a-z]*f[a-z]*\s+)?(-[a-z]*r[a-z]*\s+)?\//i,  // rm with -rf and starting with /
  />\s*\/dev\/(sd|nvme|hd)/i,                           // writing to disk devices
  /base64\s+-d.*\|\s*(bash|sh)/i,                       // base64 decode piped to shell
  /eval\s*\(\s*\$\(/i,                                  // eval with command substitution
]

function isCommandSafe(command: string): boolean {
  const lowerCmd = command.toLowerCase()

  // Check blocked command strings
  const isBlocked = BLOCKED_COMMANDS.some(blocked => lowerCmd.includes(blocked.toLowerCase()))
  if (isBlocked) {
    toolLogger.error('Dangerous command blocked (string match)', new Error('Security violation'), {
      command: command.slice(0, 200)
    })
    return false
  }

  // Check dangerous patterns (regex)
  const matchedPattern = DANGEROUS_PATTERNS.find(pattern => pattern.test(command))
  if (matchedPattern) {
    toolLogger.error('Dangerous command blocked (pattern match)', new Error('Security violation'), {
      command: command.slice(0, 200),
      pattern: matchedPattern.source
    })
    return false
  }

  return true
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
    const startTime = Date.now()

    try {
      toolLogger.debug(`Executing tool: ${toolName}`, { input: JSON.stringify(input).slice(0, 200) })

      let result: ToolResult

      switch (toolName) {
        case 'read_file':
          result = await this.readFile(input as ReadFileInput)
          break
        case 'write_file':
          result = await this.writeFile(input as WriteFileInput)
          break
        case 'list_files':
          result = await this.listFiles(input as ListFilesInput)
          break
        case 'execute_bash':
          result = await this.executeBash(input as ExecuteBashInput)
          break
        case 'git_command':
          result = await this.gitCommand(input as GitCommandInput)
          break
        case 'create_directory':
          result = await this.createDirectory(input as CreateDirectoryInput)
          break
        case 'delete_file':
          result = await this.deleteFile(input as DeleteFileInput)
          break
        case 'search_files':
          result = await this.searchFiles(input as SearchFilesInput)
          break
        case 'task_complete':
          result = await this.taskComplete(input as TaskCompleteInput)
          break
        default:
          toolLogger.warn(`Unknown tool requested: ${toolName}`)
          result = { success: false, output: '', error: `Unknown tool: ${toolName}` }
      }

      const duration = Date.now() - startTime
      if (result.success) {
        toolLogger.debug(`Tool ${toolName} completed`, { durationMs: duration })
      } else {
        toolLogger.warn(`Tool ${toolName} failed`, { durationMs: duration, error: result.error })
      }

      return result
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      const duration = Date.now() - startTime
      toolLogger.error(`Tool ${toolName} threw exception`, error, { durationMs: duration })
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
    toolLogger.info('File written', { path: input.path, size: input.content.length })
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
      toolLogger.error('Bash command blocked', new Error('Security violation'), { command: input.command })
      return { success: false, output: '', error: 'Command blocked for security reasons' }
    }

    const cwd = input.working_dir
      ? securePath(input.working_dir)
      : this.workspaceRoot

    toolLogger.info('Executing bash command', { command: input.command.slice(0, 100), cwd })

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
      if (stderr) {
        toolLogger.warn('Bash command produced stderr', { stderr: stderr.slice(0, 200) })
      }
      return { success: true, output: output || '(no output)' }
    } catch (error: unknown) {
      const execError = error as { stdout?: string; stderr?: string; message?: string; code?: number }
      const output = (execError.stdout || '') + (execError.stderr || '')
      toolLogger.error('Bash command failed', error, {
        command: input.command.slice(0, 100),
        exitCode: execError.code
      })
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
      toolLogger.info('Directory deleted', { path: input.path })
      return { success: true, output: `Directory deleted: ${input.path}` }
    } else {
      await fs.unlink(filePath)
      toolLogger.info('File deleted', { path: input.path })
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
              .filter(({ line }) => input.content && line.includes(input.content))
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
    toolLogger.info('Task completed by agent', { summary: input.summary.slice(0, 200) })
    return {
      success: true,
      output: `TASK_COMPLETE: ${input.summary}`,
    }
  }
}
