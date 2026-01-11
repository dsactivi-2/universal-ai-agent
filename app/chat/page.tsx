'use client'

import { useState } from 'react'

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
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">AI Agent Chat</h1>
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
      {response && <p className="mt-4">{response}</p>}
    </div>
  )
}