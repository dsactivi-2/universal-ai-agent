import { NextRequest, NextResponse } from 'next/server'
import { Orchestrator } from '@/lib/orchestrator'

const orchestrator = new Orchestrator()

export async function GET() {
  try {
    // Mock data for now - in real implementation, fetch from DB
    const tasks = [
      {
        id: '1',
        goal: 'Research competitors',
        status: { phase: 'completed' },
        createdAt: new Date().toISOString()
      }
    ]
    return NextResponse.json(tasks)
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch tasks' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const { message } = await request.json()
    
    const result = await orchestrator.handleRequest({
      message,
      context: {
        explicit: {},
        historical: [],
        conversational: [],
        preferences: {}
      }
    })
    
    return NextResponse.json(result)
  } catch (error) {
    return NextResponse.json({ error: 'Failed to create task' }, { status: 500 })
  }
}