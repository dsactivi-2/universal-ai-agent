'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

interface Step {
  id: number
  taskId: string
  stepNumber: number
  tool: string
  input: unknown
  output: string
  success: boolean
  duration: number
  createdAt: string
}

interface Task {
  id: string
  goal: string
  status: { phase: string }
  plan?: string
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

interface FileInfo {
  name: string
  path: string
  size: number
  isDirectory: boolean
  modified: string
}

interface Stats {
  total: number
  completed: number
  executing: number
  planning: number
  awaiting_approval: number
  failed: number
  stopped: number
  rejected: number
}

export default function Dashboard() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<string>('all')
  const [selectedTask, setSelectedTask] = useState<Task | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [steps, setSteps] = useState<Step[]>([])
  const [files, setFiles] = useState<FileInfo[]>([])
  const [newMessage, setNewMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [approving, setApproving] = useState(false)
  const [stopping, setStopping] = useState(false)
  const [retrying, setRetrying] = useState(false)
  const [activeTab, setActiveTab] = useState<'plan' | 'steps' | 'output' | 'chat' | 'files'>('plan')
  const [rejectFeedback, setRejectFeedback] = useState('')
  const [showRejectModal, setShowRejectModal] = useState(false)
  const [editingPlan, setEditingPlan] = useState(false)
  const [editedPlan, setEditedPlan] = useState('')
  const [savingPlan, setSavingPlan] = useState(false)
  const [aiReview, setAiReview] = useState<{ status: string; feedback: string } | null>(null)
  const [showReviewModal, setShowReviewModal] = useState(false)
  const [stats, setStats] = useState<Stats>({
    total: 0, completed: 0, executing: 0, planning: 0,
    awaiting_approval: 0, failed: 0, stopped: 0, rejected: 0
  })

  useEffect(() => {
    fetchTasks()
    fetchStats()
    const interval = setInterval(() => {
      fetchTasks()
      fetchStats()
    }, 3000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    if (selectedTask) {
      fetchMessages(selectedTask.id)
      fetchSteps(selectedTask.id)
      fetchFiles(selectedTask.id)
      if (selectedTask.status.phase === 'awaiting_approval' || selectedTask.status.phase === 'planning') {
        setActiveTab('plan')
      } else if (selectedTask.status.phase === 'executing') {
        setActiveTab('steps')
      }
    }
  }, [selectedTask?.id, selectedTask?.status.phase])

  useEffect(() => {
    if (selectedTask?.status.phase === 'executing') {
      const interval = setInterval(() => {
        fetchSteps(selectedTask.id)
      }, 2000)
      return () => clearInterval(interval)
    }
  }, [selectedTask?.id, selectedTask?.status.phase])

  const fetchTasks = async () => {
    try {
      const res = await fetch('/api/tasks')
      const data = await res.json()
      setTasks(data)
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

  const fetchSteps = async (taskId: string) => {
    try {
      const res = await fetch(`/api/tasks/${taskId}/steps`)
      const data = await res.json()
      setSteps(data.steps || [])
    } catch (error) {
      console.error('Failed to fetch steps:', error)
      setSteps([])
    }
  }

  const fetchFiles = async (taskId: string) => {
    try {
      const res = await fetch(`/api/tasks/${taskId}/files`)
      const data = await res.json()
      setFiles(data.taskFiles || [])
    } catch (error) {
      console.error('Failed to fetch files:', error)
      setFiles([])
    }
  }

  const approveTask = async () => {
    if (!selectedTask || approving) return
    setApproving(true)
    try {
      const res = await fetch(`/api/tasks/${selectedTask.id}/approve`, { method: 'POST' })
      if (res.ok) {
        fetchTasks()
        setActiveTab('steps')
      } else {
        const error = await res.json()
        alert('Fehler: ' + error.error)
      }
    } catch (error) {
      console.error('Failed to approve:', error)
      alert('Fehler beim Genehmigen')
    } finally {
      setApproving(false)
    }
  }

  const rejectTask = async (regenerate: boolean = false) => {
    if (!selectedTask) return
    try {
      const res = await fetch(`/api/tasks/${selectedTask.id}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ feedback: rejectFeedback, regenerate })
      })
      if (res.ok) {
        fetchTasks()
        setShowRejectModal(false)
        setRejectFeedback('')
        if (!regenerate) setSelectedTask(null)
      } else {
        const error = await res.json()
        alert('Fehler: ' + error.error)
      }
    } catch (error) {
      console.error('Failed to reject:', error)
    }
  }

  const stopTask = async () => {
    if (!selectedTask || stopping) return
    if (!confirm('Task wirklich abbrechen?')) return
    setStopping(true)
    try {
      const res = await fetch(`/api/tasks/${selectedTask.id}/stop`, { method: 'POST' })
      if (res.ok) {
        fetchTasks()
      } else {
        const error = await res.json()
        alert('Fehler: ' + error.error)
      }
    } catch (error) {
      console.error('Failed to stop:', error)
    } finally {
      setStopping(false)
    }
  }

  const retryTask = async () => {
    if (!selectedTask || retrying) return
    setRetrying(true)
    try {
      const res = await fetch(`/api/tasks/${selectedTask.id}/retry`, { method: 'POST' })
      if (res.ok) {
        fetchTasks()
        setActiveTab('plan')
      } else {
        const error = await res.json()
        alert('Fehler: ' + error.error)
      }
    } catch (error) {
      console.error('Failed to retry:', error)
    } finally {
      setRetrying(false)
    }
  }

  const savePlan = async () => {
    if (!selectedTask || !editedPlan.trim() || savingPlan) return
    setSavingPlan(true)
    try {
      const res = await fetch(`/api/tasks/${selectedTask.id}/edit-plan`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan: editedPlan })
      })
      const data = await res.json()
      if (res.ok) {
        fetchTasks()
        setEditingPlan(false)
        // Show AI review feedback
        if (data.review) {
          setAiReview(data.review)
          setShowReviewModal(true)
        }
      } else {
        alert('Fehler: ' + data.error)
      }
    } catch (error) {
      console.error('Failed to save plan:', error)
    } finally {
      setSavingPlan(false)
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
        setMessages(prev => [
          ...prev,
          { id: 'user-' + Date.now(), taskId: selectedTask.id, role: 'user', content: newMessage, createdAt: new Date().toISOString() },
          data.message
        ])
        setNewMessage('')
        fetchTasks()
      } else {
        const error = await res.json()
        alert('Fehler: ' + error.error)
      }
    } catch (error) {
      console.error('Failed to send message:', error)
    } finally {
      setSending(false)
    }
  }

  const deleteTask = async (taskId: string) => {
    if (!confirm('Task wirklich loeschen?')) return
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

  const downloadFile = async (filePath: string) => {
    if (!selectedTask) return
    window.open(`/api/tasks/${selectedTask.id}/files${filePath}?download=true`, '_blank')
  }

  const filteredTasks = tasks.filter(task => {
    if (filter === 'all') return true
    return task.status.phase === filter
  })

  const getStatusColor = (phase: string) => {
    switch (phase) {
      case 'completed': return 'bg-green-100 text-green-800'
      case 'executing': return 'bg-blue-100 text-blue-800'
      case 'planning': return 'bg-purple-100 text-purple-800'
      case 'awaiting_approval': return 'bg-yellow-100 text-yellow-800'
      case 'failed': return 'bg-red-100 text-red-800'
      case 'stopped': return 'bg-orange-100 text-orange-800'
      case 'rejected': return 'bg-gray-100 text-gray-800'
      default: return 'bg-gray-100 text-gray-800'
    }
  }

  const getStatusLabel = (phase: string) => {
    switch (phase) {
      case 'awaiting_approval': return 'Warte auf OK'
      case 'planning': return 'Plant...'
      case 'executing': return 'Fuehrt aus...'
      case 'completed': return 'Fertig'
      case 'failed': return 'Fehler'
      case 'stopped': return 'Gestoppt'
      case 'rejected': return 'Abgelehnt'
      default: return phase
    }
  }

  const getToolIcon = (tool: string) => {
    switch (tool) {
      case 'read_file': return '📖'
      case 'write_file': return '✏️'
      case 'list_files': return '📁'
      case 'execute_bash': return '💻'
      case 'git_command': return '🔀'
      case 'create_directory': return '📂'
      case 'delete_file': return '🗑️'
      case 'search_files': return '🔍'
      case 'task_complete': return '✅'
      default: return '🔧'
    }
  }

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B'
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
  }

  if (loading) return (
    <div className="flex justify-center items-center min-h-screen">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Navigation */}
      <nav className="bg-white shadow-sm border-b">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between">
          <Link href="/" className="text-xl font-bold text-gray-900">Universal AI Agent</Link>
          <div className="flex gap-2">
            <Link href="/chat" className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300">
              Chat
            </Link>
            <span className="px-4 py-2 bg-blue-500 text-white rounded-lg">Dashboard</span>
          </div>
        </div>
      </nav>

      <div className="container mx-auto p-6">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">AI Agent Dashboard</h1>
            <p className="text-gray-600 mt-1">Autonomer Agent mit Planungs-Phase</p>
          </div>
          <button
            onClick={() => { fetchTasks(); fetchStats(); }}
            className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
          >
            Refresh
          </button>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-4 mb-8">
          <div className="bg-white p-4 rounded-lg shadow">
            <div className="text-2xl font-bold text-gray-600">{stats.total}</div>
            <div className="text-gray-500 text-sm">Total</div>
          </div>
          <div className="bg-white p-4 rounded-lg shadow">
            <div className="text-2xl font-bold text-purple-600">{stats.planning || 0}</div>
            <div className="text-gray-500 text-sm">Planning</div>
          </div>
          <div className="bg-white p-4 rounded-lg shadow">
            <div className="text-2xl font-bold text-yellow-600">{stats.awaiting_approval || 0}</div>
            <div className="text-gray-500 text-sm">Warte auf OK</div>
          </div>
          <div className="bg-white p-4 rounded-lg shadow">
            <div className="text-2xl font-bold text-blue-600">{stats.executing || 0}</div>
            <div className="text-gray-500 text-sm">Executing</div>
          </div>
          <div className="bg-white p-4 rounded-lg shadow">
            <div className="text-2xl font-bold text-green-600">{stats.completed || 0}</div>
            <div className="text-gray-500 text-sm">Completed</div>
          </div>
          <div className="bg-white p-4 rounded-lg shadow">
            <div className="text-2xl font-bold text-red-600">{stats.failed || 0}</div>
            <div className="text-gray-500 text-sm">Failed</div>
          </div>
          <div className="bg-white p-4 rounded-lg shadow">
            <div className="text-2xl font-bold text-orange-600">{stats.stopped || 0}</div>
            <div className="text-gray-500 text-sm">Stopped</div>
          </div>
          <div className="bg-white p-4 rounded-lg shadow">
            <div className="text-2xl font-bold text-gray-600">{stats.rejected || 0}</div>
            <div className="text-gray-500 text-sm">Rejected</div>
          </div>
        </div>

        {/* Filters */}
        <div className="mb-6 flex flex-wrap gap-2">
          {['all', 'awaiting_approval', 'planning', 'executing', 'completed', 'failed', 'stopped', 'rejected'].map(status => (
            <button
              key={status}
              onClick={() => setFilter(status)}
              className={`px-4 py-2 rounded-lg ${
                filter === status ? 'bg-blue-500 text-white' : 'bg-white text-gray-700 hover:bg-gray-100'
              }`}
            >
              {status === 'all' ? 'Alle' : getStatusLabel(status)}
            </button>
          ))}
        </div>

        {/* Task Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredTasks.map(task => (
            <div
              key={task.id}
              className={`bg-white p-4 rounded-lg shadow hover:shadow-md cursor-pointer border-l-4 ${
                task.status.phase === 'awaiting_approval' ? 'border-yellow-500' :
                task.status.phase === 'planning' ? 'border-purple-500' :
                task.status.phase === 'executing' ? 'border-blue-500' :
                task.status.phase === 'completed' ? 'border-green-500' :
                task.status.phase === 'stopped' ? 'border-orange-500' :
                task.status.phase === 'rejected' ? 'border-gray-500' : 'border-red-500'
              }`}
              onClick={() => setSelectedTask(task)}
            >
              <div className="flex justify-between items-start mb-2">
                <h3 className="font-semibold truncate flex-1 mr-2">{task.goal}</h3>
                <span className={`px-2 py-1 rounded-full text-xs whitespace-nowrap ${getStatusColor(task.status.phase)}`}>
                  {getStatusLabel(task.status.phase)}
                </span>
              </div>
              <p className="text-sm text-gray-600 mb-2">
                {new Date(task.createdAt).toLocaleString()}
              </p>
              {task.status.phase === 'awaiting_approval' && (
                <div className="text-sm text-yellow-600 font-medium">
                  Plan wartet auf Bestaetigung
                </div>
              )}
            </div>
          ))}
        </div>

        {filteredTasks.length === 0 && (
          <div className="text-center py-12 text-gray-500">Keine Tasks gefunden</div>
        )}

        {/* Task Detail Modal */}
        {selectedTask && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-lg w-full max-w-5xl max-h-[90vh] flex flex-col">
              {/* Header */}
              <div className="flex justify-between items-start p-4 border-b">
                <div>
                  <h2 className="text-xl font-bold">{selectedTask.goal}</h2>
                  <div className="flex items-center gap-2 mt-1">
                    <span className={`inline-block px-2 py-1 rounded text-xs ${getStatusColor(selectedTask.status.phase)}`}>
                      {getStatusLabel(selectedTask.status.phase)}
                    </span>
                    {(selectedTask.status.phase === 'executing' || selectedTask.status.phase === 'planning') && (
                      <span className="text-blue-500 animate-pulse text-sm">Laeuft...</span>
                    )}
                  </div>
                </div>
                <button onClick={() => setSelectedTask(null)} className="text-2xl text-gray-500 hover:text-gray-700">&times;</button>
              </div>

              {/* Approval Banner */}
              {selectedTask.status.phase === 'awaiting_approval' && (
                <div className="bg-yellow-50 border-b border-yellow-200 p-4 flex items-center justify-between">
                  <div>
                    <span className="text-yellow-800 font-medium">Plan erstellt - Bitte pruefen und bestaetigen</span>
                    <p className="text-yellow-700 text-sm">Lies dir den Plan durch und klicke auf Genehmigen um die Ausfuehrung zu starten.</p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setShowRejectModal(true)}
                      className="px-4 py-2 bg-red-100 text-red-700 rounded hover:bg-red-200"
                    >
                      Ablehnen
                    </button>
                    <button
                      onClick={approveTask}
                      disabled={approving}
                      className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 disabled:opacity-50"
                    >
                      {approving ? 'Startet...' : 'Genehmigen & Ausfuehren'}
                    </button>
                  </div>
                </div>
              )}

              {/* Stop Banner for running tasks */}
              {(selectedTask.status.phase === 'executing' || selectedTask.status.phase === 'planning') && (
                <div className="bg-blue-50 border-b border-blue-200 p-4 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-500"></div>
                    <span className="text-blue-800 font-medium">Task wird ausgefuehrt...</span>
                  </div>
                  <button
                    onClick={stopTask}
                    disabled={stopping}
                    className="px-4 py-2 bg-orange-500 text-white rounded hover:bg-orange-600 disabled:opacity-50"
                  >
                    {stopping ? 'Stoppe...' : 'Abbrechen'}
                  </button>
                </div>
              )}

              {/* Retry Banner for failed/stopped tasks */}
              {['failed', 'stopped', 'rejected'].includes(selectedTask.status.phase) && (
                <div className="bg-gray-50 border-b border-gray-200 p-4 flex items-center justify-between">
                  <span className="text-gray-800 font-medium">
                    {selectedTask.status.phase === 'failed' ? 'Task fehlgeschlagen' :
                     selectedTask.status.phase === 'stopped' ? 'Task wurde gestoppt' : 'Plan wurde abgelehnt'}
                  </span>
                  <button
                    onClick={retryTask}
                    disabled={retrying}
                    className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50"
                  >
                    {retrying ? 'Startet neu...' : 'Neu starten'}
                  </button>
                </div>
              )}

              {/* Tabs */}
              <div className="flex border-b">
                <button
                  onClick={() => setActiveTab('plan')}
                  className={`px-4 py-2 ${activeTab === 'plan' ? 'border-b-2 border-blue-500 text-blue-600' : 'text-gray-600'}`}
                >
                  Plan
                </button>
                <button
                  onClick={() => setActiveTab('steps')}
                  className={`px-4 py-2 ${activeTab === 'steps' ? 'border-b-2 border-blue-500 text-blue-600' : 'text-gray-600'}`}
                >
                  Steps ({steps.length})
                </button>
                <button
                  onClick={() => setActiveTab('output')}
                  className={`px-4 py-2 ${activeTab === 'output' ? 'border-b-2 border-blue-500 text-blue-600' : 'text-gray-600'}`}
                >
                  Output
                </button>
                <button
                  onClick={() => setActiveTab('files')}
                  className={`px-4 py-2 ${activeTab === 'files' ? 'border-b-2 border-blue-500 text-blue-600' : 'text-gray-600'}`}
                >
                  Dateien ({files.length})
                </button>
                <button
                  onClick={() => setActiveTab('chat')}
                  className={`px-4 py-2 ${activeTab === 'chat' ? 'border-b-2 border-blue-500 text-blue-600' : 'text-gray-600'}`}
                >
                  Chat ({messages.length})
                </button>
              </div>

              {/* Content Area */}
              <div className="flex-1 overflow-y-auto p-4">
                {/* Task Info */}
                <div className="mb-4 p-3 bg-gray-50 rounded text-sm grid grid-cols-2 md:grid-cols-4 gap-2">
                  <div><strong>ID:</strong> {selectedTask.id.slice(0, 8)}...</div>
                  <div><strong>Erstellt:</strong> {new Date(selectedTask.createdAt).toLocaleString()}</div>
                  {selectedTask.totalDuration && <div><strong>Dauer:</strong> {(selectedTask.totalDuration / 1000).toFixed(1)}s</div>}
                  {selectedTask.totalCost !== undefined && <div><strong>Kosten:</strong> ${selectedTask.totalCost.toFixed(4)}</div>}
                </div>

                {/* Plan Tab */}
                {activeTab === 'plan' && (
                  <div>
                    {selectedTask.plan ? (
                      <div>
                        {selectedTask.status.phase === 'awaiting_approval' && !editingPlan && (
                          <div className="mb-2 flex justify-end">
                            <button
                              onClick={() => { setEditedPlan(selectedTask.plan || ''); setEditingPlan(true); }}
                              className="px-3 py-1 text-sm bg-gray-200 rounded hover:bg-gray-300"
                            >
                              Plan bearbeiten
                            </button>
                          </div>
                        )}
                        {editingPlan ? (
                          <div>
                            <textarea
                              value={editedPlan}
                              onChange={(e) => setEditedPlan(e.target.value)}
                              className="w-full h-96 p-4 border rounded font-mono text-sm"
                            />
                            <div className="flex gap-2 mt-2">
                              <button
                                onClick={savePlan}
                                disabled={savingPlan}
                                className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 disabled:opacity-50 flex items-center gap-2"
                              >
                                {savingPlan ? (
                                  <>
                                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                                    KI analysiert...
                                  </>
                                ) : (
                                  'Speichern & Pruefen'
                                )}
                              </button>
                              <button
                                onClick={() => setEditingPlan(false)}
                                disabled={savingPlan}
                                className="px-4 py-2 bg-gray-300 rounded hover:bg-gray-400 disabled:opacity-50"
                              >
                                Abbrechen
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="p-4 bg-white border rounded-lg whitespace-pre-wrap font-mono text-sm">
                            {selectedTask.plan}
                          </div>
                        )}
                      </div>
                    ) : selectedTask.status.phase === 'planning' ? (
                      <div className="text-center text-gray-500 py-8">
                        <div className="flex items-center justify-center gap-2">
                          <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-purple-500"></div>
                          <span>Plan wird erstellt...</span>
                        </div>
                      </div>
                    ) : (
                      <div className="text-center text-gray-500 py-8">Kein Plan vorhanden</div>
                    )}
                  </div>
                )}

                {/* Steps Tab */}
                {activeTab === 'steps' && (
                  <div className="space-y-3">
                    {steps.length === 0 ? (
                      <div className="text-center text-gray-500 py-8">
                        {selectedTask.status.phase === 'executing' ? (
                          <div className="flex items-center justify-center gap-2">
                            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-500"></div>
                            <span>Agent arbeitet...</span>
                          </div>
                        ) : selectedTask.status.phase === 'awaiting_approval' ? (
                          'Genehmige den Plan um die Ausfuehrung zu starten'
                        ) : (
                          'Keine Steps vorhanden'
                        )}
                      </div>
                    ) : (
                      steps.map((step) => (
                        <div
                          key={step.id}
                          className={`p-3 rounded-lg border ${step.success ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'}`}
                        >
                          <div className="flex justify-between items-start mb-2">
                            <div className="flex items-center gap-2">
                              <span className="text-lg">{getToolIcon(step.tool)}</span>
                              <span className="font-medium">{step.tool}</span>
                              <span className="text-xs text-gray-500">#{step.stepNumber}</span>
                            </div>
                            <div className="text-xs text-gray-500">{step.duration}ms</div>
                          </div>
                          <div className="text-xs text-gray-600 mb-2">
                            <strong>Input:</strong>
                            <pre className="mt-1 p-2 bg-white rounded overflow-x-auto">
                              {typeof step.input === 'object' ? JSON.stringify(step.input, null, 2) : String(step.input)}
                            </pre>
                          </div>
                          <div className="text-xs">
                            <strong>Output:</strong>
                            <pre className="mt-1 p-2 bg-white rounded overflow-x-auto max-h-32">{step.output}</pre>
                          </div>
                        </div>
                      ))
                    )}
                    {selectedTask.status.phase === 'executing' && steps.length > 0 && (
                      <div className="flex items-center justify-center gap-2 text-blue-500 py-2">
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-500"></div>
                        <span className="text-sm">Weitere Steps werden ausgefuehrt...</span>
                      </div>
                    )}
                  </div>
                )}

                {/* Output Tab */}
                {activeTab === 'output' && (
                  <div>
                    {selectedTask.output ? (
                      <div className="p-4 bg-gray-50 rounded whitespace-pre-wrap font-mono text-sm">
                        {selectedTask.output}
                      </div>
                    ) : (
                      <div className="text-center text-gray-500 py-8">
                        {selectedTask.status.phase === 'executing' ? 'Noch kein Output...' : 'Kein Output'}
                      </div>
                    )}
                  </div>
                )}

                {/* Files Tab */}
                {activeTab === 'files' && (
                  <div>
                    {files.length === 0 ? (
                      <div className="text-center text-gray-500 py-8">Keine Dateien erstellt</div>
                    ) : (
                      <div className="space-y-2">
                        {files.map((file, idx) => (
                          <div
                            key={idx}
                            className="flex items-center justify-between p-3 bg-gray-50 rounded hover:bg-gray-100"
                          >
                            <div className="flex items-center gap-3">
                              <span className="text-xl">{file.isDirectory ? '📁' : '📄'}</span>
                              <div>
                                <div className="font-medium">{file.name}</div>
                                <div className="text-xs text-gray-500">{file.path}</div>
                              </div>
                            </div>
                            <div className="flex items-center gap-4">
                              <span className="text-sm text-gray-500">{formatFileSize(file.size)}</span>
                              {!file.isDirectory && (
                                <button
                                  onClick={() => downloadFile(file.path)}
                                  className="px-3 py-1 text-sm bg-blue-100 text-blue-700 rounded hover:bg-blue-200"
                                >
                                  Download
                                </button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Chat Tab */}
                {activeTab === 'chat' && (
                  <div>
                    {messages.length > 0 && (
                      <div className="space-y-3 mb-4 max-h-64 overflow-y-auto">
                        {messages.map(msg => (
                          <div
                            key={msg.id}
                            className={`p-3 rounded ${msg.role === 'user' ? 'bg-gray-100 ml-8' : 'bg-green-50 mr-8'}`}
                          >
                            <div className="text-xs text-gray-500 mb-1">
                              {msg.role === 'user' ? 'Du' : 'AI'} - {new Date(msg.createdAt).toLocaleTimeString()}
                            </div>
                            <div className="whitespace-pre-wrap text-sm">{msg.content}</div>
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={newMessage}
                        onChange={(e) => setNewMessage(e.target.value)}
                        onKeyPress={(e) => e.key === 'Enter' && !e.shiftKey && sendMessage()}
                        placeholder="Folgenachricht eingeben..."
                        className="flex-1 px-3 py-2 border rounded focus:ring-2 focus:ring-blue-500"
                        disabled={sending}
                      />
                      <button
                        onClick={sendMessage}
                        disabled={sending || !newMessage.trim()}
                        className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 disabled:opacity-50"
                      >
                        {sending ? 'Sende...' : 'Senden'}
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Footer Actions */}
              <div className="flex gap-2 p-4 border-t bg-gray-50">
                <button
                  onClick={() => deleteTask(selectedTask.id)}
                  className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600"
                >
                  Loeschen
                </button>
                <button
                  onClick={() => setSelectedTask(null)}
                  className="px-4 py-2 bg-gray-300 rounded hover:bg-gray-400"
                >
                  Schliessen
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Reject Modal */}
        {showRejectModal && selectedTask && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-[60]">
            <div className="bg-white rounded-lg w-full max-w-md p-6">
              <h3 className="text-lg font-bold mb-4">Plan ablehnen</h3>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Feedback (optional)
                </label>
                <textarea
                  value={rejectFeedback}
                  onChange={(e) => setRejectFeedback(e.target.value)}
                  placeholder="Was soll anders sein? z.B. 'Nutze React statt Vue'"
                  className="w-full h-24 p-3 border rounded"
                />
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => { setShowRejectModal(false); setRejectFeedback(''); }}
                  className="flex-1 px-4 py-2 bg-gray-300 rounded hover:bg-gray-400"
                >
                  Abbrechen
                </button>
                <button
                  onClick={() => rejectTask(false)}
                  className="flex-1 px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600"
                >
                  Ablehnen
                </button>
                {rejectFeedback.trim() && (
                  <button
                    onClick={() => rejectTask(true)}
                    className="flex-1 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
                  >
                    Neuer Plan
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* AI Review Modal */}
        {showReviewModal && aiReview && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-[70]">
            <div className="bg-white rounded-lg w-full max-w-2xl max-h-[80vh] flex flex-col">
              <div className={`p-4 rounded-t-lg flex items-center justify-between ${
                aiReview.status === 'APPROVED' ? 'bg-green-500' : 'bg-yellow-500'
              }`}>
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{aiReview.status === 'APPROVED' ? '✅' : '⚠️'}</span>
                  <div>
                    <h3 className="text-lg font-bold text-white">
                      {aiReview.status === 'APPROVED' ? 'Plan genehmigt' : 'Ueberarbeitung empfohlen'}
                    </h3>
                    <p className="text-white text-sm opacity-90">
                      {aiReview.status === 'APPROVED'
                        ? 'Die KI hat deinen bearbeiteten Plan analysiert und fuer gut befunden.'
                        : 'Die KI hat moegliche Probleme in deinem Plan gefunden.'}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setShowReviewModal(false)}
                  className="text-white text-2xl hover:opacity-70"
                >
                  &times;
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-4">
                <div className="prose prose-sm max-w-none whitespace-pre-wrap">
                  {aiReview.feedback}
                </div>
              </div>
              <div className="p-4 border-t flex gap-2">
                {aiReview.status !== 'APPROVED' && (
                  <button
                    onClick={() => {
                      setShowReviewModal(false)
                      setEditingPlan(true)
                      setEditedPlan(selectedTask?.plan || '')
                    }}
                    className="flex-1 px-4 py-2 bg-yellow-500 text-white rounded hover:bg-yellow-600"
                  >
                    Plan nochmal bearbeiten
                  </button>
                )}
                <button
                  onClick={() => setShowReviewModal(false)}
                  className={`flex-1 px-4 py-2 rounded ${
                    aiReview.status === 'APPROVED'
                      ? 'bg-green-500 text-white hover:bg-green-600'
                      : 'bg-gray-300 text-gray-700 hover:bg-gray-400'
                  }`}
                >
                  {aiReview.status === 'APPROVED' ? 'Verstanden' : 'Trotzdem fortfahren'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
