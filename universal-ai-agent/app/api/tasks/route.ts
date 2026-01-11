import { NextRequest, NextResponse } from 'next/server'
import { Orchestrator } from '@/lib/orchestrator'

const orchestrator = new Orchestrator()

// Mock task data for demonstration
const mockTasks = [
  {
    id: 'task-001',
    goal: 'Research top 3 AI competitors and create comparison report',
    status: { phase: 'completed' },
    createdAt: new Date(Date.now() - 3600000).toISOString(), // 1 hour ago
    totalDuration: 45000,
    totalCost: 0.0234
  },
  {
    id: 'task-002',
    goal: 'Send weekly sales report to team via email',
    status: { phase: 'executing' },
    createdAt: new Date(Date.now() - 300000).toISOString(), // 5 minutes ago
    totalDuration: 12000,
    totalCost: 0.0089
  },
  {
    id: 'task-003',
    goal: 'Analyze customer feedback data and generate insights',
    status: { phase: 'waiting' },
    createdAt: new Date(Date.now() - 120000).toISOString(), // 2 minutes ago
  },
  {
    id: 'task-004',
    goal: 'Create presentation slides for product launch',
    status: { phase: 'failed' },
    createdAt: new Date(Date.now() - 1800000).toISOString(), // 30 minutes ago
    totalDuration: 89000,
    totalCost: 0.0345
  },
  {
    id: 'task-005',
    goal: 'Schedule team meeting and send calendar invites',
    status: { phase: 'completed' },
    createdAt: new Date(Date.now() - 7200000).toISOString(), // 2 hours ago
    totalDuration: 15600,
    totalCost: 0.0056
  },
  {
    id: 'task-006',
    goal: 'Review and merge pull requests on GitHub',
    status: { phase: 'executing' },
    createdAt: new Date(Date.now() - 60000).toISOString(), // 1 minute ago
    totalDuration: 3200,
    totalCost: 0.0021
  }
]

export async function GET() {
  // Add some randomization to make it more dynamic
  const tasks = mockTasks.map(task => ({
    ...task,
    // Randomly change some statuses for demo purposes
    status: Math.random() > 0.7 && task.status.phase === 'executing'
      ? { phase: 'completed' }
      : task.status
  }))

  return NextResponse.json(tasks)
}

export async function POST(request: NextRequest) {
  try {
    const { message } = await request.json()

    // Simulate processing delay
    await new Promise(resolve => setTimeout(resolve, 1000))

    const result = await orchestrator.handleRequest({
      message,
      context: {
        explicit: {},
        historical: [],
        conversational: [],
        preferences: {}
      }
    })

    // Add some variety to the response based on message content
    if (message.toLowerCase().includes('research')) {
      result.output = 'Research task initiated. Gathering data from web sources...'
    } else if (message.toLowerCase().includes('email')) {
      result.output = 'Email composition task started. Analyzing recipient and drafting message...'
    } else if (message.toLowerCase().includes('analyze')) {
      result.output = 'Analysis task begun. Processing data and generating insights...'
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error('Task creation error:', error)
    return NextResponse.json(
      {
        taskId: null,
        success: false,
        output: 'Failed to create task',
        summary: 'Error occurred during task creation',
        stepResults: [],
        totalDuration: 0,
        totalCost: 0
      },
      { status: 500 }
    )
  }
}