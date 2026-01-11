'use client'

import { useEffect, useState } from 'react'
import TaskCard from '../components/TaskCard'

interface Task {
  id: string
  goal: string
  status: { phase: string }
  output?: string
  summary?: string
  createdAt: string
  updatedAt?: string
  totalDuration?: number
  totalCost?: number
}

interface Stats {
  total: number
  completed: number
  executing: number
  waiting: number
  failed: number
}

export default function Dashboard() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<string>('all')
  const [selectedTask, setSelectedTask] = useState<Task | null>(null)
  const [editMode, setEditMode] = useState(false)
  const [editPhase, setEditPhase] = useState('')
  const [stats, setStats] = useState<Stats>({
    total: 0,
    completed: 0,
    executing: 0,
    waiting: 0,
    failed: 0
  })

  useEffect(() => {
    fetchTasks()
    fetchStats()
    const interval = setInterval(() => {
      fetchTasks()
      fetchStats()
    }, 5000)
    return () => clearInterval(interval)
  }, [])

  // GET /api/tasks - Alle Tasks abrufen
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

  // GET /api/tasks?stats=true - Stats via API
  const fetchStats = async () => {
    try {
      const res = await fetch('/api/tasks?stats=true')
      const data = await res.json()
      setStats(data)
    } catch (error) {
      console.error('Failed to fetch stats:', error)
    }
  }

  // DELETE /api/tasks?id=xxx - Task löschen
  const deleteTask = async (taskId: string) => {
    if (!confirm('Task wirklich löschen?')) return

    try {
      const res = await fetch(`/api/tasks?id=${taskId}`, {
        method: 'DELETE'
      })
      if (res.ok) {
        setTasks(tasks.filter(t => t.id !== taskId))
        setSelectedTask(null)
        fetchStats()
      } else {
        alert('Fehler beim Löschen')
      }
    } catch (error) {
      console.error('Failed to delete task:', error)
      alert('Fehler beim Löschen')
    }
  }

  // PATCH /api/tasks - Task aktualisieren
  const updateTask = async (taskId: string, phase: string) => {
    try {
      const res = await fetch('/api/tasks', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: taskId, phase })
      })
      if (res.ok) {
        const updated = await res.json()
        setTasks(tasks.map(t => t.id === taskId ? updated : t))
        setSelectedTask(updated)
        setEditMode(false)
        fetchStats()
      } else {
        alert('Fehler beim Aktualisieren')
      }
    } catch (error) {
      console.error('Failed to update task:', error)
      alert('Fehler beim Aktualisieren')
    }
  }

  const filteredTasks = tasks.filter(task => {
    if (filter === 'all') return true
    return task.status.phase === filter
  })

  const handleViewDetails = (taskId: string) => {
    const task = tasks.find(t => t.id === taskId)
    setSelectedTask(task || null)
    setEditMode(false)
    setEditPhase(task?.status.phase || '')
  }

  const handleDelete = (taskId: string) => {
    deleteTask(taskId)
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
            onClick={() => { fetchTasks(); fetchStats(); }}
            className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
          >
            Refresh
          </button>
        </div>

        {/* Stats Cards - via API */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-8">
          <div className="bg-white p-4 rounded-lg shadow">
            <div className="text-2xl font-bold text-blue-600">{stats.total}</div>
            <div className="text-gray-600">Total</div>
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
            <div className="text-2xl font-bold text-yellow-600">{stats.waiting}</div>
            <div className="text-gray-600">Waiting</div>
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
              onDelete={handleDelete}
            />
          ))}
        </div>

        {filteredTasks.length === 0 && (
          <div className="text-center py-12 text-gray-500">
            Keine Tasks gefunden
          </div>
        )}

        {/* Task Details Modal */}
        {selectedTask && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-lg p-6 max-w-2xl w-full max-h-[80vh] overflow-y-auto">
              <div className="flex justify-between items-start mb-4">
                <h2 className="text-xl font-bold">{selectedTask.goal}</h2>
                <button
                  onClick={() => setSelectedTask(null)}
                  className="text-gray-500 hover:text-gray-700 text-2xl"
                >
                  &times;
                </button>
              </div>

              <div className="space-y-3 text-sm">
                <p><strong>ID:</strong> {selectedTask.id}</p>

                {/* Status mit Edit-Möglichkeit */}
                <div className="flex items-center gap-2">
                  <strong>Status:</strong>
                  {editMode ? (
                    <>
                      <select
                        value={editPhase}
                        onChange={(e) => setEditPhase(e.target.value)}
                        className="border rounded px-2 py-1"
                      >
                        <option value="waiting">waiting</option>
                        <option value="executing">executing</option>
                        <option value="completed">completed</option>
                        <option value="failed">failed</option>
                      </select>
                      <button
                        onClick={() => updateTask(selectedTask.id, editPhase)}
                        className="px-2 py-1 bg-green-500 text-white rounded text-xs"
                      >
                        Speichern
                      </button>
                      <button
                        onClick={() => setEditMode(false)}
                        className="px-2 py-1 bg-gray-300 rounded text-xs"
                      >
                        Abbrechen
                      </button>
                    </>
                  ) : (
                    <>
                      <span className={`px-2 py-1 rounded ${
                        selectedTask.status.phase === 'completed' ? 'bg-green-100 text-green-800' :
                        selectedTask.status.phase === 'failed' ? 'bg-red-100 text-red-800' :
                        selectedTask.status.phase === 'executing' ? 'bg-blue-100 text-blue-800' :
                        'bg-yellow-100 text-yellow-800'
                      }`}>
                        {selectedTask.status.phase}
                      </span>
                      <button
                        onClick={() => { setEditMode(true); setEditPhase(selectedTask.status.phase); }}
                        className="px-2 py-1 bg-gray-200 rounded text-xs hover:bg-gray-300"
                      >
                        Bearbeiten
                      </button>
                    </>
                  )}
                </div>

                <p><strong>Erstellt:</strong> {new Date(selectedTask.createdAt).toLocaleString()}</p>
                {selectedTask.updatedAt && (
                  <p><strong>Aktualisiert:</strong> {new Date(selectedTask.updatedAt).toLocaleString()}</p>
                )}
                {selectedTask.totalDuration && (
                  <p><strong>Dauer:</strong> {selectedTask.totalDuration}ms</p>
                )}
                {selectedTask.totalCost && (
                  <p><strong>Kosten:</strong> ${selectedTask.totalCost.toFixed(4)}</p>
                )}
                {selectedTask.output && (
                  <div>
                    <strong>Output:</strong>
                    <pre className="mt-1 p-2 bg-gray-100 rounded text-xs overflow-x-auto">
                      {selectedTask.output}
                    </pre>
                  </div>
                )}
                {selectedTask.summary && (
                  <div>
                    <strong>Summary:</strong>
                    <p className="mt-1 text-gray-700">{selectedTask.summary}</p>
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="flex gap-2 mt-6 pt-4 border-t">
                <button
                  onClick={() => deleteTask(selectedTask.id)}
                  className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600"
                >
                  Löschen
                </button>
                <button
                  onClick={() => setSelectedTask(null)}
                  className="px-4 py-2 bg-gray-300 rounded hover:bg-gray-400"
                >
                  Schließen
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
