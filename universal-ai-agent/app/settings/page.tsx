'use client'

import { useState, useEffect } from 'react'

interface Settings {
  autoRefresh: boolean
  refreshInterval: number
  notifications: boolean
  theme: 'light' | 'dark' | 'auto'
  maxConcurrentTasks: number
  apiKeys: {
    anthropic: string
    openai: string
    github: string
    slack: string
  }
}

export default function Settings() {
  const [settings, setSettings] = useState<Settings>({
    autoRefresh: true,
    refreshInterval: 5,
    notifications: true,
    theme: 'light',
    maxConcurrentTasks: 5,
    apiKeys: {
      anthropic: '',
      openai: '',
      github: '',
      slack: ''
    }
  })
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    // Load settings from localStorage
    const saved = localStorage.getItem('agent-settings')
    if (saved) {
      setSettings(JSON.parse(saved))
    }
  }, [])

  const handleSave = async () => {
    setSaving(true)
    try {
      // Save to localStorage (in real app, save to backend)
      localStorage.setItem('agent-settings', JSON.stringify(settings))
      setMessage('✅ Settings saved successfully!')
      setTimeout(() => setMessage(''), 3000)
    } catch (error) {
      setMessage('❌ Error saving settings')
    } finally {
      setSaving(false)
    }
  }

  const updateSetting = (key: string, value: any) => {
    setSettings(prev => ({ ...prev, [key]: value }))
  }

  const updateApiKey = (provider: string, value: string) => {
    setSettings(prev => ({
      ...prev,
      apiKeys: { ...prev.apiKeys, [provider]: value }
    }))
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto p-6 max-w-4xl">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Settings</h1>
          <p className="text-gray-600 mt-2">Configure your AI Agent preferences and API integrations</p>
        </div>

        {message && (
          <div className={`mb-6 p-4 rounded-lg ${message.includes('✅') ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>
            {message}
          </div>
        )}

        <div className="space-y-8">
          {/* General Settings */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold mb-4">General Settings</h2>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <label className="font-medium">Auto-refresh Dashboard</label>
                  <p className="text-sm text-gray-600">Automatically refresh task status</p>
                </div>
                <input
                  type="checkbox"
                  checked={settings.autoRefresh}
                  onChange={(e) => updateSetting('autoRefresh', e.target.checked)}
                  className="w-4 h-4 text-blue-600"
                />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <label className="font-medium">Refresh Interval (seconds)</label>
                  <p className="text-sm text-gray-600">How often to check for updates</p>
                </div>
                <input
                  type="number"
                  value={settings.refreshInterval}
                  onChange={(e) => updateSetting('refreshInterval', parseInt(e.target.value))}
                  className="w-20 px-3 py-2 border rounded"
                  min="1"
                  max="60"
                />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <label className="font-medium">Enable Notifications</label>
                  <p className="text-sm text-gray-600">Get notified when tasks complete</p>
                </div>
                <input
                  type="checkbox"
                  checked={settings.notifications}
                  onChange={(e) => updateSetting('notifications', e.target.checked)}
                  className="w-4 h-4 text-blue-600"
                />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <label className="font-medium">Max Concurrent Tasks</label>
                  <p className="text-sm text-gray-600">Maximum tasks to run simultaneously</p>
                </div>
                <input
                  type="number"
                  value={settings.maxConcurrentTasks}
                  onChange={(e) => updateSetting('maxConcurrentTasks', parseInt(e.target.value))}
                  className="w-20 px-3 py-2 border rounded"
                  min="1"
                  max="10"
                />
              </div>
            </div>
          </div>

          {/* API Keys */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold mb-4">API Integrations</h2>
            <div className="space-y-4">
              <div className="warning-message bg-yellow-50 border border-yellow-200 rounded p-4 mb-4">
                <div className="flex">
                  <div className="flex-shrink-0">
                    <svg className="h-5 w-5 text-yellow-400" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <div className="ml-3">
                    <p className="text-sm text-yellow-800">
                      API keys are stored locally in your browser. In a production environment, these would be securely stored on the server.
                    </p>
                  </div>
                </div>
              </div>

              {Object.entries(settings.apiKeys).map(([provider, key]) => (
                <div key={provider} className="flex items-center justify-between">
                  <div className="flex-1 mr-4">
                    <label className="font-medium capitalize">{provider} API Key</label>
                    <p className="text-sm text-gray-600">
                      {provider === 'anthropic' && 'For Claude AI models'}
                      {provider === 'openai' && 'For GPT models'}
                      {provider === 'github' && 'For GitHub integration'}
                      {provider === 'slack' && 'For Slack messaging'}
                    </p>
                  </div>
                  <input
                    type="password"
                    value={key}
                    onChange={(e) => updateApiKey(provider, e.target.value)}
                    className="flex-1 px-3 py-2 border rounded"
                    placeholder={`Enter ${provider} API key`}
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Save Button */}
          <div className="flex justify-end">
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-6 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
            >
              {saving ? 'Saving...' : 'Save Settings'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}