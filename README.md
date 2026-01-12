# Universal AI Agent

Transform natural language into automated workflows with AI-powered agents.

## Features

- **AI Planning**: Automatically analyze tasks and create detailed implementation plans
- **Human-in-the-Loop**: Review and approve plans before execution
- **Autonomous Execution**: Execute approved plans with built-in tool capabilities
- **Real-time Monitoring**: Track execution progress with step-by-step visibility
- **Follow-up Chat**: Continue conversations with context awareness

## Tech Stack

- **Framework**: Next.js 14 (App Router)
- **Language**: TypeScript
- **AI**: Anthropic Claude API
- **Database**: SQLite (better-sqlite3)
- **Styling**: Tailwind CSS

## Quick Start

### Prerequisites

- Node.js 18+
- npm or yarn
- Anthropic API key

### Installation

```bash
# Clone the repository
git clone https://github.com/dsactivi-2/universal-ai-agent.git
cd universal-ai-agent

# Install dependencies
npm install

# Copy environment file
cp .env.example .env

# Add your Anthropic API key to .env
# ANTHROPIC_API_KEY=sk-ant-...

# Start development server
npm run dev
```

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `ANTHROPIC_API_KEY` | Yes | Your Anthropic API key |
| `JWT_SECRET` | Yes | Secret for JWT token signing (min 32 chars) |
| `AGENT_WORKSPACE` | No | Workspace directory for agent operations (default: `/app/workspace`) |

## API Endpoints

### Authentication

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| POST | `/api/auth/login` | Login with email/password | No |
| GET | `/api/auth/me` | Get current user | Yes |

### Tasks

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/api/tasks` | Get all tasks | Optional |
| POST | `/api/tasks` | Create new task (starts planning) | Yes |
| PATCH | `/api/tasks` | Update task | Yes |
| DELETE | `/api/tasks?id=X` | Delete task | Yes |
| POST | `/api/tasks/[id]/approve` | Approve plan and start execution | Yes |
| GET | `/api/tasks/[id]/messages` | Get task messages | Optional |
| POST | `/api/tasks/[id]/messages` | Send follow-up message | Yes |
| GET | `/api/tasks/[id]/steps` | Get execution steps | Optional |

### Demo Credentials

```
Admin: admin@example.com / admin123
User:  user@example.com / user123
```

## Architecture

```
universal-ai-agent/
├── app/
│   ├── api/
│   │   ├── auth/           # Authentication endpoints
│   │   └── tasks/          # Task management API
│   ├── dashboard/          # Task dashboard UI
│   └── chat/               # Chat interface
├── lib/
│   ├── middleware/         # Auth & rate limiting
│   ├── utils/              # Retry logic, helpers
│   ├── orchestrator.ts     # AI agent orchestrator
│   ├── tools.ts            # Tool definitions
│   ├── tool-executor.ts    # Tool implementation
│   └── database.ts         # SQLite database
└── data/                   # SQLite database files
```

## Available Tools

The AI agent has access to these tools:

| Tool | Description |
|------|-------------|
| `read_file` | Read file contents |
| `write_file` | Create or overwrite files |
| `list_files` | List directory contents |
| `execute_bash` | Run bash commands (allowlisted) |
| `git_command` | Execute git commands |
| `create_directory` | Create directories |
| `delete_file` | Delete files or directories |
| `search_files` | Search for files by pattern or content |
| `task_complete` | Mark task as complete |

## Security

- **Authentication**: JWT-based authentication
- **Rate Limiting**: Configurable per-endpoint rate limits
- **Command Allowlist**: Only approved bash commands can run
- **Path Sandboxing**: File operations restricted to workspace
- **Blocked Patterns**: Dangerous command patterns are blocked

## Development

```bash
# Run development server
npm run dev

# Type checking
npm run lint

# Build for production
npm run build

# Start production server
npm start
```

## Docker

```bash
# Build image
docker build -t universal-ai-agent .

# Run container
docker run -p 3000:3000 \
  -e ANTHROPIC_API_KEY=your-key \
  -e JWT_SECRET=your-secret \
  universal-ai-agent
```

## License

MIT
