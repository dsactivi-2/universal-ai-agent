'use client'

import { useEffect, useState } from 'react'
import TaskCard from '../components/TaskCard'

interface Task {
  id: string
  goal: string
  status: { phase: string }
  createdAt: string
  totalDuration?: number
  totalCost?: number
}

export default function Dashboard() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<string>('all')
  const [selectedTask, setSelectedTask] = useState<Task | null>(null)
  const [stats, setStats] = useState({
    total: 0,
    completed: 0,
    executing: 0,
    failed: 0
  })

  useEffect(() => {
    fetchTasks()
    const interval = setInterval(fetchTasks, 5000) // Auto-refresh every 5 seconds
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    calculateStats()
  }, [tasks])

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

  const calculateStats = () => {
    const stats = tasks.reduce(
      (acc, task) => {
        acc.total++
        acc[task.status.phase as keyof typeof acc] = (acc[task.status.phase as keyof typeof acc] || 0) + 1
        return acc
      },
      { total: 0, completed: 0, executing: 0, failed: 0, waiting: 0 }
    )
    setStats(stats)
  }

  const filteredTasks = tasks.filter(task => {
    if (filter === 'all') return true
    return task.status.phase === filter
  })

  const handleViewDetails = (taskId: string) => {
    const task = tasks.find(t => t.id === taskId)
    setSelectedTask(task || null)
  }

  if (loading) return (
    <div className="flex justify-center items-center min-h-screen">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto p-6">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Task Dashboard</h1>
          <button
            onClick={fetchTasks}
            className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
          >
            Refresh
          </button>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-white p-4 rounded-lg shadow">
            <div className="text-2xl font-bold text-blue-600">{stats.total}</div>
            <div className="text-gray-600">Total Tasks</div>
          </div>
          <div className="bg-white p-4 rounded-lg shadow">
            <div className="text-2xl font-bold text-green-600">{stats.completed}</div>
            <div className="text-gray-600">Completed</div>
          </div>
          <div className="bg-white p-4 rounded-lg shadow">
            <div className="text-2xl font-bold text-blue-600">{stats.executing}</div>
            <div className="text-gray-600">Executing</div>
          </div>
          <div className="bg-white p-4 rounded-lg shadow">
            <div className="text-2xl font-bold text-red-600">{stats.failed}</div>
            <div className="text-gray-600">Failed</div>
          </div>
        </div>

        {/* Filters */}
        <div className="mb-6">
          <div className="flex space-x-2">
            {['all', 'completed', 'executing', 'waiting', 'failed'].map(status => (
              <button
                key={status}
                onClick={() => setFilter(status)}
                className={`px-4 py-2 rounded-lg capitalize ${
                  filter === status
                    ? 'bg-blue-500 text-white'
                    : 'bg-white text-gray-700 hover:bg-gray-100'
                } transition-colors`}
              >
                {status}
              </button>
            ))}
          </div>
        </div>

        {/* Task Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredTasks.map(task => (
            <TaskCard
              key={task.id}
              task={task}
              onViewDetails={handleViewDetails}
            />
          ))}
        </div>

        {/* Task Details Modal */}
        {selectedTask && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-lg p-6 max-w-2xl w-full max-h-96 overflow-y-auto">
              <div className="flex justify-between items-start mb-4">
                <h2 className="text-xl font-bold">{selectedTask.goal}</h2>
                <button
                  onClick={() => setSelectedTask(null)}
                  className="text-gray-500 hover:text-gray-700 text-xl"
                >
                  ×
                </button>
              </div>
              <div className="space-y-2 text-sm">
                <p><strong>ID:</strong> {selectedTask.id}</p>
                <p><strong>Status:</strong> {selectedTask.status.phase}</p>
                <p><strong>Created:</strong> {new Date(selectedTask.createdAt).toLocaleString()}</p>
                {selectedTask.totalDuration && <p><strong>Duration:</strong> {selectedTask.totalDuration}ms</p>}
                {selectedTask.totalCost && <p><strong>Cost:</strong> ${selectedTask.totalCost.toFixed(4)}</p>}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}