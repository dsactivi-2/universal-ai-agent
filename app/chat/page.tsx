'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  createdAt: string
}

interface Task {
  id: string
  goal: string
  status: { phase: string }
  plan?: string
}

interface UploadedFile {
  id: string
  filename: string
  originalName: string
  mimeType: string
  size: number
  analysis: string
  path: string
}

export default function Chat() {
  const [message, setMessage] = useState('')
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [activeTask, setActiveTask] = useState<Task | null>(null)
  const [miniChatOpen, setMiniChatOpen] = useState(false)
  const [miniChatMessages, setMiniChatMessages] = useState<Message[]>([])
  const [miniChatInput, setMiniChatInput] = useState('')
  const [miniChatLoading, setMiniChatLoading] = useState(false)
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([])
  const [uploading, setUploading] = useState(false)
  const [dragActive, setDragActive] = useState(false)
  const chatEndRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Auto-scroll mini chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [miniChatMessages])

  // Poll task status when active
  useEffect(() => {
    if (!activeTask) return
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/tasks/${activeTask.id}`)
        const data = await res.json()
        setActiveTask(data)
        if (['completed', 'failed', 'stopped'].includes(data.status.phase)) {
          clearInterval(interval)
        }
      } catch (e) {
        console.error('Failed to poll task:', e)
      }
    }, 2000)
    return () => clearInterval(interval)
  }, [activeTask?.id])

  // Load messages when task is active
  useEffect(() => {
    if (activeTask) {
      loadMessages(activeTask.id)
    }
  }, [activeTask?.id])

  const loadMessages = async (taskId: string) => {
    try {
      const res = await fetch(`/api/tasks/${taskId}/messages`)
      const data = await res.json()
      setMiniChatMessages(Array.isArray(data) ? data : [])
    } catch (e) {
      console.error('Failed to load messages:', e)
    }
  }

  const handleFileUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return

    setUploading(true)
    const newFiles: UploadedFile[] = []

    for (const file of Array.from(files)) {
      try {
        const formData = new FormData()
        formData.append('file', file)

        const res = await fetch('/api/upload', {
          method: 'POST',
          body: formData
        })

        if (res.ok) {
          const data = await res.json()
          newFiles.push(data.file)
        } else {
          const error = await res.json()
          alert(`Fehler beim Hochladen von ${file.name}: ${error.error}`)
        }
      } catch (e) {
        console.error('Upload failed:', e)
        alert(`Fehler beim Hochladen von ${file.name}`)
      }
    }

    setUploadedFiles(prev => [...prev, ...newFiles])
    setUploading(false)
  }

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true)
    } else if (e.type === 'dragleave') {
      setDragActive(false)
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)
    handleFileUpload(e.dataTransfer.files)
  }

  const removeFile = (fileId: string) => {
    setUploadedFiles(prev => prev.filter(f => f.id !== fileId))
  }

  const handlePreview = (e: React.FormEvent) => {
    e.preventDefault()
    if (!message.trim()) return
    setShowConfirm(true)
  }

  const handleConfirm = async () => {
    setLoading(true)
    try {
      // Build message with file analysis
      let fullMessage = message

      if (uploadedFiles.length > 0) {
        fullMessage += '\n\n--- Angehaengte Dateien ---'
        for (const file of uploadedFiles) {
          fullMessage += `\n\n### ${file.originalName}\n${file.analysis}`
        }
      }

      if (notes.trim()) {
        fullMessage += `\n\n--- Zusaetzliche Hinweise ---\n${notes}`
      }

      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: fullMessage })
      })
      const data = await res.json()

      // Set active task and open mini chat
      const taskRes = await fetch(`/api/tasks/${data.taskId}`)
      const taskData = await taskRes.json()
      setActiveTask(taskData)
      setMiniChatOpen(true)
      setShowConfirm(false)
      setMessage('')
      setNotes('')
      setUploadedFiles([])
    } catch (error) {
      console.error('Error creating task:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleCancel = () => {
    setShowConfirm(false)
  }

  const sendMiniChatMessage = async () => {
    if (!activeTask || !miniChatInput.trim() || miniChatLoading) return

    const userMessage = miniChatInput.trim()
    setMiniChatInput('')
    setMiniChatLoading(true)

    // Add user message optimistically
    const tempUserMsg: Message = {
      id: 'temp-' + Date.now(),
      role: 'user',
      content: userMessage,
      createdAt: new Date().toISOString()
    }
    setMiniChatMessages(prev => [...prev, tempUserMsg])

    try {
      const res = await fetch(`/api/tasks/${activeTask.id}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userMessage })
      })
      const data = await res.json()

      // Add AI response
      if (data.message) {
        setMiniChatMessages(prev => [...prev.filter(m => m.id !== tempUserMsg.id),
          { ...tempUserMsg, id: 'user-' + Date.now() },
          data.message
        ])
      }
    } catch (e) {
      console.error('Failed to send message:', e)
    } finally {
      setMiniChatLoading(false)
    }
  }

  const getStatusColor = (phase: string) => {
    switch (phase) {
      case 'completed': return 'bg-green-500'
      case 'executing': return 'bg-blue-500 animate-pulse'
      case 'planning': return 'bg-purple-500 animate-pulse'
      case 'awaiting_approval': return 'bg-yellow-500'
      case 'failed': return 'bg-red-500'
      case 'stopped': return 'bg-orange-500'
      default: return 'bg-gray-500'
    }
  }

  const getStatusText = (phase: string) => {
    switch (phase) {
      case 'completed': return 'Fertig'
      case 'executing': return 'Wird ausgefuehrt...'
      case 'planning': return 'Plant...'
      case 'awaiting_approval': return 'Warte auf OK'
      case 'failed': return 'Fehler'
      case 'stopped': return 'Gestoppt'
      default: return phase
    }
  }

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B'
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
  }

  const getFileIcon = (mimeType: string) => {
    if (mimeType.startsWith('image/')) return '🖼️'
    if (mimeType === 'application/pdf') return '📄'
    if (mimeType.includes('json')) return '📋'
    if (mimeType.includes('javascript') || mimeType.includes('typescript')) return '💻'
    if (mimeType.startsWith('text/')) return '📝'
    return '📎'
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Navigation */}
      <nav className="bg-white shadow-sm border-b">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between">
          <Link href="/" className="text-xl font-bold text-gray-900">Universal AI Agent</Link>
          <div className="flex gap-2">
            <span className="px-4 py-2 bg-blue-500 text-white rounded-lg">Chat</span>
            <Link href="/dashboard" className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300">
              Dashboard
            </Link>
          </div>
        </div>
      </nav>

      <div className="container mx-auto p-6 max-w-3xl">
        <h1 className="text-2xl font-bold mb-6">Neuen Task erstellen</h1>

        {!showConfirm ? (
          <form onSubmit={handlePreview} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Was soll der Agent tun?
              </label>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Beschreibe deine Aufgabe detailliert..."
                className="w-full p-4 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                rows={6}
              />
            </div>

            {/* File Upload Area */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Dateien anhaengen (optional)
              </label>
              <div
                className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors ${
                  dragActive ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-gray-400'
                }`}
                onDragEnter={handleDrag}
                onDragLeave={handleDrag}
                onDragOver={handleDrag}
                onDrop={handleDrop}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  onChange={(e) => handleFileUpload(e.target.files)}
                  className="hidden"
                  accept="image/*,.pdf,.txt,.md,.json,.csv,.html,.css,.js,.ts,.xml"
                />
                {uploading ? (
                  <div className="flex items-center justify-center gap-2">
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-500"></div>
                    <span className="text-gray-600">Wird hochgeladen und analysiert...</span>
                  </div>
                ) : (
                  <>
                    <div className="text-4xl mb-2">📁</div>
                    <p className="text-gray-600 mb-2">
                      Dateien hierher ziehen oder{' '}
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="text-blue-500 hover:underline"
                      >
                        durchsuchen
                      </button>
                    </p>
                    <p className="text-xs text-gray-400">
                      Bilder, PDFs, Text, Code (max. 10MB pro Datei)
                    </p>
                  </>
                )}
              </div>

              {/* Uploaded Files List */}
              {uploadedFiles.length > 0 && (
                <div className="mt-3 space-y-2">
                  {uploadedFiles.map(file => (
                    <div
                      key={file.id}
                      className="flex items-start gap-3 p-3 bg-green-50 border border-green-200 rounded-lg"
                    >
                      <span className="text-2xl">{getFileIcon(file.mimeType)}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium truncate">{file.originalName}</span>
                          <span className="text-xs text-gray-500">{formatFileSize(file.size)}</span>
                        </div>
                        <p className="text-sm text-gray-600 mt-1 line-clamp-2">{file.analysis}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeFile(file.id)}
                        className="text-red-500 hover:text-red-700 p-1"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Zusaetzliche Hinweise (optional)
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="z.B. Technologie-Praeferenzen, Einschraenkungen, besondere Anforderungen..."
                className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                rows={3}
              />
            </div>

            <button
              type="submit"
              disabled={!message.trim()}
              className="w-full px-6 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
            >
              Vorschau & Bestaetigen
            </button>
          </form>
        ) : (
          <div className="bg-white border rounded-lg p-6 space-y-4">
            <h2 className="text-lg font-semibold">Task bestaetigen</h2>

            <div className="bg-gray-50 p-4 rounded-lg">
              <h3 className="text-sm font-medium text-gray-500 mb-2">Aufgabe:</h3>
              <p className="whitespace-pre-wrap">{message}</p>
            </div>

            {uploadedFiles.length > 0 && (
              <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                <h3 className="text-sm font-medium text-blue-700 mb-2">
                  Angehaengte Dateien ({uploadedFiles.length}):
                </h3>
                <div className="space-y-2">
                  {uploadedFiles.map(file => (
                    <div key={file.id} className="flex items-center gap-2 text-blue-800 text-sm">
                      <span>{getFileIcon(file.mimeType)}</span>
                      <span>{file.originalName}</span>
                      <span className="text-blue-500">({formatFileSize(file.size)})</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {notes && (
              <div className="bg-yellow-50 p-4 rounded-lg border border-yellow-200">
                <h3 className="text-sm font-medium text-yellow-700 mb-2">Zusaetzliche Hinweise:</h3>
                <p className="text-yellow-800 whitespace-pre-wrap text-sm">{notes}</p>
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={handleCancel}
                disabled={loading}
                className="flex-1 px-4 py-3 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 disabled:opacity-50"
              >
                Abbrechen
              </button>
              <button
                onClick={handleConfirm}
                disabled={loading}
                className="flex-1 px-4 py-3 bg-green-500 text-white rounded-lg hover:bg-green-600 disabled:opacity-50 font-medium"
              >
                {loading ? 'Wird erstellt...' : 'Task starten'}
              </button>
            </div>
          </div>
        )}

        {/* Active Task Info */}
        {activeTask && !showConfirm && (
          <div className="mt-6 bg-white border rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-medium">Aktiver Task</h3>
                <p className="text-sm text-gray-500 truncate max-w-md">{activeTask.goal}</p>
              </div>
              <div className="flex items-center gap-3">
                <span className={`px-3 py-1 rounded-full text-white text-sm ${getStatusColor(activeTask.status.phase)}`}>
                  {getStatusText(activeTask.status.phase)}
                </span>
                <Link
                  href="/dashboard"
                  className="text-blue-600 hover:underline text-sm"
                >
                  Im Dashboard oeffnen
                </Link>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Mini Chat Widget */}
      {activeTask && (
        <div className="fixed bottom-4 right-4 z-50">
          {miniChatOpen ? (
            <div className="w-80 h-96 bg-white rounded-lg shadow-2xl border flex flex-col">
              {/* Header */}
              <div className="flex items-center justify-between px-4 py-3 border-b bg-blue-500 text-white rounded-t-lg">
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${getStatusColor(activeTask.status.phase)}`}></div>
                  <span className="font-medium text-sm">Task-Assistent</span>
                </div>
                <button onClick={() => setMiniChatOpen(false)} className="text-white hover:text-gray-200">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-3 space-y-2">
                {miniChatMessages.length === 0 ? (
                  <div className="text-center text-gray-400 text-sm py-8">
                    Stelle Fragen zum laufenden Task oder gib weitere Anweisungen.
                  </div>
                ) : (
                  miniChatMessages.map(msg => (
                    <div
                      key={msg.id}
                      className={`p-2 rounded-lg text-sm ${
                        msg.role === 'user'
                          ? 'bg-blue-100 ml-6'
                          : 'bg-gray-100 mr-6'
                      }`}
                    >
                      {msg.content}
                    </div>
                  ))
                )}
                {miniChatLoading && (
                  <div className="bg-gray-100 mr-6 p-2 rounded-lg text-sm">
                    <div className="flex gap-1">
                      <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                      <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{animationDelay: '0.1s'}}></div>
                      <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{animationDelay: '0.2s'}}></div>
                    </div>
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>

              {/* Input */}
              <div className="p-3 border-t">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={miniChatInput}
                    onChange={(e) => setMiniChatInput(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && sendMiniChatMessage()}
                    placeholder="Frage stellen..."
                    className="flex-1 px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                    disabled={miniChatLoading}
                  />
                  <button
                    onClick={sendMiniChatMessage}
                    disabled={!miniChatInput.trim() || miniChatLoading}
                    className="px-3 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setMiniChatOpen(true)}
              className="w-14 h-14 bg-blue-500 text-white rounded-full shadow-lg hover:bg-blue-600 flex items-center justify-center relative"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
              </svg>
              <span className={`absolute -top-1 -right-1 w-4 h-4 rounded-full ${getStatusColor(activeTask.status.phase)}`}></span>
            </button>
          )}
        </div>
      )}
    </div>
  )
}
