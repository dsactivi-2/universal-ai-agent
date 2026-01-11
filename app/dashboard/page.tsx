'use client'

import { useEffect, useState } from 'react'

interface Task {
  id: string
  goal: string
  status: { phase: string }
  createdAt: string
}

export default function Dashboard() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchTasks()
  }, [])

  const fetchTasks = async () => {
    try {
      const res = await fetch('/api/tasks')
      const data = await res.json()
      setTasks(data)
    } catch (error) {
      console.error('Failed to fetch tasks:', error)
    } finally {
      setLoading(false)
    }
  }

  if (loading) return <div>Loading...</div>

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">Task Dashboard</h1>
      <ul id="task-list" className="space-y-2">
        {tasks.map(task => (
          <li key={task.id} id={`task-item-${task.id}`} className="p-4 border rounded">
            <h2>{task.goal}</h2>
            <p>Status: {task.status.phase}</p>
            <p>Created: {new Date(task.createdAt).toLocaleString()}</p>
          </li>
        ))}
      </ul>
    </div>
  )
}