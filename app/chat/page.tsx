'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function Chat() {
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [response, setResponse] = useState('')
  const [error, setError] = useState('')
  const router = useRouter()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!message.trim()) return

    setLoading(true)
    setError('')
    setResponse('')

    try {
      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message })
      })

      const data = await res.json()

      if (!res.ok) {
        if (res.status === 401) {
          setError('Please log in to create tasks')
        } else if (res.status === 429) {
          setError(`Rate limit exceeded. Try again in ${data.retryAfter} seconds`)
        } else {
          setError(data.error || 'Failed to create task')
        }
        return
      }

      setResponse(`Task created successfully! ID: ${data.taskId}`)
      setMessage('')

      // Redirect to dashboard after short delay
      setTimeout(() => {
        router.push('/dashboard')
      }, 1500)
    } catch (err) {
      setError('Network error. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="container mx-auto p-4 max-w-2xl" data-testid="chat_page">
      <h1 className="text-2xl font-bold mb-4" data-testid="chat_title">AI Agent Chat</h1>

      <p className="text-gray-600 mb-6" data-testid="chat_description">
        Describe your task and the AI agent will create a plan for you to review before execution.
      </p>

      <form onSubmit={handleSubmit} className="space-y-4" data-testid="chat_form">
        <div>
          <label htmlFor="chat-input" className="block text-sm font-medium text-gray-700 mb-1">
            Task Description
          </label>
          <textarea
            id="chat-input"
            data-testid="chat_input_message"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Describe your task in detail... Example: Create a React component for a login form with email and password validation."
            className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            rows={6}
            disabled={loading}
          />
        </div>

        <div className="flex items-center gap-4">
          <button
            id="chat-submit"
            data-testid="chat_button_submit"
            type="submit"
            disabled={loading || !message.trim()}
            className="px-6 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? 'Creating Task...' : 'Submit Task'}
          </button>

          <span className="text-sm text-gray-500" data-testid="chat_text_hint">
            {message.length}/10000 characters
          </span>
        </div>
      </form>

      {error && (
        <div
          className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700"
          data-testid="chat_alert_error"
          role="alert"
        >
          {error}
        </div>
      )}

      {response && (
        <div
          className="mt-4 p-4 bg-green-50 border border-green-200 rounded-lg text-green-700"
          data-testid="chat_alert_success"
          role="status"
        >
          {response}
          <p className="text-sm mt-2">Redirecting to dashboard...</p>
        </div>
      )}

      <div className="mt-8 p-4 bg-gray-50 rounded-lg" data-testid="chat_section_tips">
        <h2 className="font-semibold mb-2">Tips for better results:</h2>
        <ul className="list-disc list-inside text-sm text-gray-600 space-y-1">
          <li>Be specific about what you want to create</li>
          <li>Mention the programming language or framework</li>
          <li>Include any specific requirements or constraints</li>
          <li>The agent will create a plan first for your approval</li>
        </ul>
      </div>
    </div>
  )
}
