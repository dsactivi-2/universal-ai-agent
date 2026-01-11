'use client'

import { useState } from 'react'

const TASK_TEMPLATES = [
  {
    name: 'Research Task',
    template: 'Research the top 3 competitors of [COMPANY] and create a comparison report including pricing, features, and market positioning.'
  },
  {
    name: 'Email Automation',
    template: 'Send a professional email to [RECIPIENT] about [TOPIC] with the following key points: [POINTS]'
  },
  {
    name: 'Data Analysis',
    template: 'Analyze the provided dataset and generate insights about [METRICS]. Create visualizations and recommendations.'
  },
  {
    name: 'Content Creation',
    template: 'Write a comprehensive article about [TOPIC] with introduction, main points, and conclusion. Include relevant examples and data.'
  },
  {
    name: 'Meeting Preparation',
    template: 'Prepare for a meeting with [PERSON/COMPANY] about [TOPIC]. Research background, prepare questions, and create an agenda.'
  }
]

export default function Chat() {
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [response, setResponse] = useState('')
  const [selectedTemplate, setSelectedTemplate] = useState('')
  const [showTemplates, setShowTemplates] = useState(false)

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
      setResponse(`✅ Task created successfully!\n\nTask ID: ${data.taskId}\nStatus: ${data.success ? 'Processing' : 'Failed'}\n\nYou can monitor progress in the Dashboard.`)
      setMessage('')
    } catch (error) {
      setResponse('❌ Error creating task. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const applyTemplate = (template: string) => {
    setMessage(template)
    setShowTemplates(false)
    setSelectedTemplate(template)
  }

  const clearMessage = () => {
    setMessage('')
    setResponse('')
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="container mx-auto p-6 max-w-4xl">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">AI Agent Chat</h1>
          <p className="text-lg text-gray-600">Describe your task in natural language and let AI handle the rest</p>
        </div>

        <div className="bg-white rounded-xl shadow-lg p-6 mb-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold">Create New Task</h2>
            <button
              onClick={() => setShowTemplates(!showTemplates)}
              className="px-4 py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-600 transition-colors"
            >
              {showTemplates ? 'Hide Templates' : 'Use Template'}
            </button>
          </div>

          {/* Task Templates */}
          {showTemplates && (
            <div className="mb-6 p-4 bg-purple-50 rounded-lg">
              <h3 className="font-medium mb-3 text-purple-900">Choose a Task Template:</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {TASK_TEMPLATES.map((template, index) => (
                  <button
                    key={index}
                    onClick={() => applyTemplate(template.template)}
                    className="text-left p-3 bg-white rounded border hover:border-purple-300 hover:shadow-sm transition-all"
                  >
                    <div className="font-medium text-purple-900">{template.name}</div>
                    <div className="text-sm text-gray-600 mt-1 truncate">{template.template}</div>
                  </button>
                ))}
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <div className="mb-4">
              <label htmlFor="task-input" className="block text-sm font-medium text-gray-700 mb-2">
                Describe your task:
              </label>
              <textarea
                id="task-input"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Example: Research the top 3 AI companies and create a comparison report..."
                className="w-full p-4 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-vertical min-h-[120px]"
                rows={6}
                required
              />
            </div>

            <div className="flex space-x-3">
              <button
                type="submit"
                disabled={loading || !message.trim()}
                className="flex-1 px-6 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
              >
                {loading ? (
                  <div className="flex items-center justify-center">
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
                    Creating Task...
                  </div>
                ) : (
                  'Create Task'
                )}
              </button>
              <button
                type="button"
                onClick={clearMessage}
                className="px-6 py-3 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition-colors"
              >
                Clear
              </button>
            </div>
          </form>
        </div>

        {/* Response Display */}
        {response && (
          <div className="bg-white rounded-xl shadow-lg p-6">
            <h3 className="text-lg font-semibold mb-3 text-gray-900">Task Status</h3>
            <div className="bg-gray-50 rounded-lg p-4">
              <pre className="whitespace-pre-wrap text-gray-800 font-mono text-sm">
                {response}
              </pre>
            </div>
          </div>
        )}

        {/* Help Section */}
        <div className="bg-white rounded-xl shadow-lg p-6 mt-6">
          <h3 className="text-lg font-semibold mb-3 text-gray-900">💡 Tips for Better Tasks</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-gray-600">
            <div>
              <h4 className="font-medium text-gray-900 mb-2">Be Specific:</h4>
              <p>"Research AI trends" → "Research top 5 AI trends in healthcare for 2024 with market data"</p>
            </div>
            <div>
              <h4 className="font-medium text-gray-900 mb-2">Include Context:</h4>
              <p>Mention deadlines, formats, sources, or specific requirements</p>
            </div>
            <div>
              <h4 className="font-medium text-gray-900 mb-2">Define Output:</h4>
              <p>Specify if you want reports, emails, analysis, or other deliverables</p>
            </div>
            <div>
              <h4 className="font-medium text-gray-900 mb-2">Use Templates:</h4>
              <p>Start with pre-built templates for common task types</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}