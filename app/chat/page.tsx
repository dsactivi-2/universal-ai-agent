'use client'

import { useState } from 'react'
import Link from 'next/link'

export default function Chat() {
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [response, setResponse] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message })
      })
      const data = await res.json()
      setResponse(`Task created: ${data.taskId}`)
    } catch (error) {
      setResponse('Error creating task')
    } finally {
      setLoading(false)
    }
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

      <div className="container mx-auto p-6">
        <h1 className="text-2xl font-bold mb-4">Neuen Task erstellen</h1>
      <form onSubmit={handleSubmit} className="space-y-4">
        <textarea
          id="chat-input"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Describe your task..."
          className="w-full p-2 border rounded"
          rows={4}
        />
        <button
          id="chat-submit"
          type="submit"
          disabled={loading}
          className="px-4 py-2 bg-blue-500 text-white rounded disabled:opacity-50"
        >
          {loading ? 'Processing...' : 'Submit Task'}
        </button>
      </form>
        {response && (
          <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded-lg">
            <p className="text-green-800">{response}</p>
            <Link href="/dashboard" className="text-blue-600 hover:underline mt-2 inline-block">
              → Zum Dashboard
            </Link>
          </div>
        )}
      </div>
    </div>
  )
}