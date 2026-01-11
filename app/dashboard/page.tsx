'use client'

import { useEffect, useState } from 'react'

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

interface Message {
  id: string
  taskId: string
  role: 'user' | 'assistant'
  content: string
  createdAt: string
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
  const [messages, setMessages] = useState<Message[]>([])
  const [newMessage, setNewMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [stats, setStats] = useState<Stats>({
    total: 0, completed: 0, executing: 0, waiting: 0, failed: 0
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

  // Load messages when task is selected
  useEffect(() => {
    if (selectedTask) {
      fetchMessages(selectedTask.id)
    }
  }, [selectedTask?.id])

  const fetchTasks = async () => {
    try {
      const res = await fetch('/api/tasks')
      const data = await res.json()
      setTasks(data)
      // Update selected task if it exists
      if (selectedTask) {
        const updated = data.find((t: Task) => t.id === selectedTask.id)
        if (updated) setSelectedTask(updated)
      }
    } catch (error) {
      console.error('Failed to fetch tasks:', error)
    } finally {
      setLoading(false)
    }
  }

  const fetchStats = async () => {
    try {
      const res = await fetch('/api/tasks?stats=true')
      const data = await res.json()
      setStats(data)
    } catch (error) {
      console.error('Failed to fetch stats:', error)
    }
  }

  const fetchMessages = async (taskId: string) => {
    try {
      const res = await fetch(`/api/tasks/${taskId}/messages`)
      const data = await res.json()
      setMessages(Array.isArray(data) ? data : [])
    } catch (error) {
      console.error('Failed to fetch messages:', error)
      setMessages([])
    }
  }

  const sendMessage = async () => {
    if (!selectedTask || !newMessage.trim() || sending) return

    setSending(true)
    try {
      const res = await fetch(`/api/tasks/${selectedTask.id}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: newMessage })
      })

      if (res.ok) {
        const data = await res.json()
        // Add user message and assistant response
        setMessages(prev => [
          ...prev,
          { id: 'user-' + Date.now(), taskId: selectedTask.id, role: 'user', content: newMessage, createdAt: new Date().toISOString() },
          data.message
        ])
        setNewMessage('')
        // Refresh task to get updated output
        fetchTasks()
      } else {
        const error = await res.json()
        alert('Fehler: ' + error.error)
      }
    } catch (error) {
      console.error('Failed to send message:', error)
      alert('Fehler beim Senden')
    } finally {
      setSending(false)
    }
  }

  const deleteTask = async (taskId: string) => {
    if (!confirm('Task wirklich löschen?')) return
    try {
      const res = await fetch(`/api/tasks?id=${taskId}`, { method: 'DELETE' })
      if (res.ok) {
        setTasks(tasks.filter(t => t.id !== taskId))
        setSelectedTask(null)
        fetchStats()
      }
    } catch (error) {
      console.error('Failed to delete task:', error)
    }
  }

  const filteredTasks = tasks.filter(task => {
    if (filter === 'all') return true
    return task.status.phase === filter
  })

  const getStatusColor = (phase: string) => {
    switch (phase) {
      case 'completed': return 'bg-green-100 text-green-800'
      case 'executing': return 'bg-blue-100 text-blue-800'
      case 'failed': return 'bg-red-100 text-red-800'
      case 'waiting': return 'bg-yellow-100 text-yellow-800'
      default: return 'bg-gray-100 text-gray-800'
    }
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
            className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
          >
            Refresh
          </button>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
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
        <div className="mb-6 flex flex-wrap gap-2">
          {['all', 'completed', 'executing', 'waiting', 'failed'].map(status => (
            <button
              key={status}
              onClick={() => setFilter(status)}
              className={`px-4 py-2 rounded-lg capitalize ${
                filter === status ? 'bg-blue-500 text-white' : 'bg-white text-gray-700 hover:bg-gray-100'
              }`}
            >
              {status}
            </button>
          ))}
        </div>

        {/* Task Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredTasks.map(task => (
            <div key={task.id} className="bg-white p-4 rounded-lg shadow hover:shadow-md">
              <div className="flex justify-between items-start mb-2">
                <h3 className="font-semibold truncate flex-1 mr-2">{task.goal}</h3>
                <span className={`px-2 py-1 rounded-full text-xs ${getStatusColor(task.status.phase)}`}>
                  {task.status.phase}
                </span>
              </div>
              <p className="text-sm text-gray-600 mb-2">
                {new Date(task.createdAt).toLocaleString()}
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setSelectedTask(task)}
                  className="px-3 py-1 text-sm bg-blue-500 text-white rounded hover:bg-blue-600"
                >
                  Details
                </button>
                <button
                  onClick={() => deleteTask(task.id)}
                  className="px-3 py-1 text-sm bg-red-500 text-white rounded hover:bg-red-600"
                >
                  Löschen
                </button>
              </div>
            </div>
          ))}
        </div>

        {filteredTasks.length === 0 && (
          <div className="text-center py-12 text-gray-500">Keine Tasks gefunden</div>
        )}

        {/* Task Detail Modal with Chat */}
        {selectedTask && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-lg w-full max-w-4xl max-h-[90vh] flex flex-col">
              {/* Header */}
              <div className="flex justify-between items-start p-4 border-b">
                <div>
                  <h2 className="text-xl font-bold">{selectedTask.goal}</h2>
                  <span className={`inline-block mt-1 px-2 py-1 rounded text-xs ${getStatusColor(selectedTask.status.phase)}`}>
                    {selectedTask.status.phase}
                  </span>
                </div>
                <button onClick={() => setSelectedTask(null)} className="text-2xl text-gray-500 hover:text-gray-700">&times;</button>
              </div>

              {/* Content Area */}
              <div className="flex-1 overflow-y-auto p-4">
                {/* Task Info */}
                <div className="mb-4 p-3 bg-gray-50 rounded text-sm space-y-1">
                  <p><strong>ID:</strong> {selectedTask.id}</p>
                  <p><strong>Erstellt:</strong> {new Date(selectedTask.createdAt).toLocaleString()}</p>
                  {selectedTask.totalDuration && <p><strong>Gesamtdauer:</strong> {selectedTask.totalDuration}ms</p>}
                  {selectedTask.totalCost && <p><strong>Gesamtkosten:</strong> ${selectedTask.totalCost.toFixed(4)}</p>}
                </div>

                {/* Latest Output */}
                {selectedTask.output && (
                  <div className="mb-4">
                    <h3 className="font-semibold mb-2">Letzte Antwort:</h3>
                    <div className="p-3 bg-blue-50 rounded whitespace-pre-wrap text-sm max-h-48 overflow-y-auto">
                      {selectedTask.output}
                    </div>
                  </div>
                )}

                {/* Conversation History */}
                {messages.length > 0 && (
                  <div className="mb-4">
                    <h3 className="font-semibold mb-2">Konversation:</h3>
                    <div className="space-y-3 max-h-64 overflow-y-auto">
                      {messages.map(msg => (
                        <div
                          key={msg.id}
                          className={`p-3 rounded ${
                            msg.role === 'user'
                              ? 'bg-gray-100 ml-8'
                              : 'bg-green-50 mr-8'
                          }`}
                        >
                          <div className="text-xs text-gray-500 mb-1">
                            {msg.role === 'user' ? 'Du' : 'AI'} - {new Date(msg.createdAt).toLocaleTimeString()}
                          </div>
                          <div className="whitespace-pre-wrap text-sm">{msg.content}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Chat Input */}
              <div className="p-4 border-t">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && !e.shiftKey && sendMessage()}
                    placeholder="Folgenachricht eingeben... (z.B. 'Führe Punkt 1 aus')"
                    className="flex-1 px-3 py-2 border rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    disabled={sending}
                  />
                  <button
                    onClick={sendMessage}
                    disabled={sending || !newMessage.trim()}
                    className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {sending ? 'Sende...' : 'Senden'}
                  </button>
                </div>
                <p className="text-xs text-gray-500 mt-2">
                  Schreibe eine Folgenachricht, um an diesem Task weiterzuarbeiten ohne einen neuen zu erstellen.
                </p>
              </div>

              {/* Footer Actions */}
              <div className="flex gap-2 p-4 border-t bg-gray-50">
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
