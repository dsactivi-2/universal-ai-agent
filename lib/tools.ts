import Anthropic from '@anthropic-ai/sdk'

// Tool definitions for Claude API
export const AGENT_TOOLS: Anthropic.Tool[] = [
  {
    name: 'read_file',
    description: 'Read the contents of a file at the specified path',
    input_schema: {
      type: 'object' as const,
      properties: {
        path: {
          type: 'string',
          description: 'The file path to read (relative to workspace)'
        }
      },
      required: ['path']
    }
  },
  {
    name: 'write_file',
    description: 'Write content to a file. Creates the file if it does not exist, overwrites if it does.',
    input_schema: {
      type: 'object' as const,
      properties: {
        path: {
          type: 'string',
          description: 'The file path to write to (relative to workspace)'
        },
        content: {
          type: 'string',
          description: 'The content to write to the file'
        }
      },
      required: ['path', 'content']
    }
  },
  {
    name: 'list_files',
    description: 'List files and directories at the specified path',
    input_schema: {
      type: 'object' as const,
      properties: {
        path: {
          type: 'string',
          description: 'The directory path to list (relative to workspace, use "." for root)'
        }
      },
      required: ['path']
    }
  },
  {
    name: 'execute_bash',
    description: 'Execute a bash command in the workspace. Use for running scripts, installing packages, building projects, etc.',
    input_schema: {
      type: 'object' as const,
      properties: {
        command: {
          type: 'string',
          description: 'The bash command to execute'
        },
        working_dir: {
          type: 'string',
          description: 'Working directory for the command (relative to workspace, optional)'
        }
      },
      required: ['command']
    }
  },
  {
    name: 'git_command',
    description: 'Execute a git command (init, add, commit, push, pull, status, etc.)',
    input_schema: {
      type: 'object' as const,
      properties: {
        command: {
          type: 'string',
          description: 'The git command (without "git" prefix), e.g. "status", "add .", "commit -m message"'
        }
      },
      required: ['command']
    }
  },
  {
    name: 'create_directory',
    description: 'Create a directory (including parent directories if needed)',
    input_schema: {
      type: 'object' as const,
      properties: {
        path: {
          type: 'string',
          description: 'The directory path to create (relative to workspace)'
        }
      },
      required: ['path']
    }
  },
  {
    name: 'delete_file',
    description: 'Delete a file or directory',
    input_schema: {
      type: 'object' as const,
      properties: {
        path: {
          type: 'string',
          description: 'The path to delete (relative to workspace)'
        }
      },
      required: ['path']
    }
  },
  {
    name: 'search_files',
    description: 'Search for files matching a pattern or containing specific text',
    input_schema: {
      type: 'object' as const,
      properties: {
        pattern: {
          type: 'string',
          description: 'Glob pattern for file names (e.g. "*.ts", "**/*.json")'
        },
        content: {
          type: 'string',
          description: 'Optional: search for this text within files'
        }
      },
      required: ['pattern']
    }
  },
  {
    name: 'task_complete',
    description: 'Mark the task as complete and provide a final summary',
    input_schema: {
      type: 'object' as const,
      properties: {
        summary: {
          type: 'string',
          description: 'A summary of what was accomplished'
        }
      },
      required: ['summary']
    }
  }
]

// Tool input types
export interface ReadFileInput {
  path: string
}

export interface WriteFileInput {
  path: string
  content: string
}

export interface ListFilesInput {
  path: string
}

export interface ExecuteBashInput {
  command: string
  working_dir?: string
}

export interface GitCommandInput {
  command: string
}

export interface CreateDirectoryInput {
  path: string
}

export interface DeleteFileInput {
  path: string
}

export interface SearchFilesInput {
  pattern: string
  content?: string
}

export interface TaskCompleteInput {
  summary: string
}

export type ToolInput =
  | ReadFileInput
  | WriteFileInput
  | ListFilesInput
  | ExecuteBashInput
  | GitCommandInput
  | CreateDirectoryInput
  | DeleteFileInput
  | SearchFilesInput
  | TaskCompleteInput
