import Link from 'next/link'

export default function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-600 via-purple-600 to-indigo-800">
      <div className="container mx-auto px-6 py-12">
        {/* Header */}
        <div className="text-center mb-16">
          <h1 className="text-6xl font-bold text-white mb-4">Universal AI Agent</h1>
          <p className="text-xl text-blue-100 mb-8 max-w-2xl mx-auto">
            Transform natural language into automated workflows. Research, analyze, communicate, and execute tasks with AI-powered agents.
          </p>
          <div className="flex justify-center space-x-4">
            <Link href="/chat" className="px-8 py-3 bg-white text-blue-600 rounded-lg font-semibold hover:bg-blue-50 transition-colors">
              Start New Task
            </Link>
            <Link href="/dashboard" className="px-8 py-3 bg-blue-500 text-white rounded-lg font-semibold hover:bg-blue-400 transition-colors">
              View Dashboard
            </Link>
          </div>
        </div>

        {/* Features Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 mb-16">
          <div className="bg-white/10 backdrop-blur-lg rounded-xl p-6 text-white">
            <div className="text-3xl mb-4">🧠</div>
            <h3 className="text-xl font-semibold mb-2">AI-Powered Agents</h3>
            <p className="text-blue-100">Specialized agents for research, communication, development, and analysis</p>
          </div>

          <div className="bg-white/10 backdrop-blur-lg rounded-xl p-6 text-white">
            <div className="text-3xl mb-4">⚡</div>
            <h3 className="text-xl font-semibold mb-2">Automated Workflows</h3>
            <p className="text-blue-100">Complex multi-step tasks executed automatically with proper dependencies</p>
          </div>

          <div className="bg-white/10 backdrop-blur-lg rounded-xl p-6 text-white">
            <div className="text-3xl mb-4">🔗</div>
            <h3 className="text-xl font-semibold mb-2">API Integrations</h3>
            <p className="text-blue-100">Connect with GitHub, Slack, Email, CRM, and more through MCP servers</p>
          </div>

          <div className="bg-white/10 backdrop-blur-lg rounded-xl p-6 text-white">
            <div className="text-3xl mb-4">📊</div>
            <h3 className="text-xl font-semibold mb-2">Real-time Monitoring</h3>
            <p className="text-blue-100">Track task progress, view statistics, and get notifications</p>
          </div>

          <div className="bg-white/10 backdrop-blur-lg rounded-xl p-6 text-white">
            <div className="text-3xl mb-4">🎯</div>
            <h3 className="text-xl font-semibold mb-2">Task Templates</h3>
            <p className="text-blue-100">Pre-built templates for common tasks like research, emails, and analysis</p>
          </div>

          <div className="bg-white/10 backdrop-blur-lg rounded-xl p-6 text-white">
            <div className="text-3xl mb-4">🔧</div>
            <h3 className="text-xl font-semibold mb-2">Configurable</h3>
            <p className="text-blue-100">Customize agents, set API keys, and adjust system preferences</p>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="bg-white/5 backdrop-blur-lg rounded-xl p-8 text-center">
          <h2 className="text-2xl font-semibold text-white mb-6">Quick Start</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Link href="/chat" className="block p-4 bg-white/10 rounded-lg hover:bg-white/20 transition-colors">
              <div className="text-2xl mb-2">💬</div>
              <div className="text-white font-medium">Create Task</div>
              <div className="text-blue-100 text-sm">Describe what you need done</div>
            </Link>
            <Link href="/dashboard" className="block p-4 bg-white/10 rounded-lg hover:bg-white/20 transition-colors">
              <div className="text-2xl mb-2">📈</div>
              <div className="text-white font-medium">Monitor Tasks</div>
              <div className="text-blue-100 text-sm">Track progress and results</div>
            </Link>
            <Link href="/settings" className="block p-4 bg-white/10 rounded-lg hover:bg-white/20 transition-colors">
              <div className="text-2xl mb-2">⚙️</div>
              <div className="text-white font-medium">Configure</div>
              <div className="text-blue-100 text-sm">Set up API keys and preferences</div>
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}