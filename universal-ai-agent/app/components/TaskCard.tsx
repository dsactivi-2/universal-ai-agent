'use client'

import { useState } from 'react'

interface Task {
  id: string
  goal: string
  status: { phase: string }
  createdAt: string
  totalDuration?: number
  totalCost?: number
}

interface TaskCardProps {
  task: Task
  onViewDetails: (taskId: string) => void
  onDelete?: (taskId: string) => void
}

export default function TaskCard({ task, onViewDetails, onDelete }: TaskCardProps) {
  const [isExpanded, setIsExpanded] = useState(false)

  const getStatusColor = (phase: string) => {
    switch (phase) {
      case 'completed': return 'bg-green-100 text-green-800'
      case 'executing': return 'bg-blue-100 text-blue-800'
      case 'failed': return 'bg-red-100 text-red-800'
      case 'waiting': return 'bg-yellow-100 text-yellow-800'
      default: return 'bg-gray-100 text-gray-800'
    }
  }

  return (
    <div className="border rounded-lg p-4 bg-white shadow-sm hover:shadow-md transition-shadow">
      <div className="flex justify-between items-start mb-2">
        <h3 className="font-semibold text-lg truncate flex-1 mr-2">{task.goal}</h3>
        <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(task.status.phase)}`}>
          {task.status.phase}
        </span>
      </div>

      <div className="text-sm text-gray-600 space-y-1">
        <p className="truncate">ID: {task.id.slice(0, 8)}...</p>
        <p>Erstellt: {new Date(task.createdAt).toLocaleString()}</p>
        {task.totalDuration && <p>Dauer: {task.totalDuration}ms</p>}
        {task.totalCost && <p>Kosten: ${task.totalCost.toFixed(4)}</p>}
      </div>

      <div className="flex flex-wrap gap-2 mt-4">
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="px-3 py-1 text-sm bg-gray-100 hover:bg-gray-200 rounded"
        >
          {isExpanded ? 'Weniger' : 'Mehr'}
        </button>
        <button
          onClick={() => onViewDetails(task.id)}
          className="px-3 py-1 text-sm bg-blue-500 text-white hover:bg-blue-600 rounded"
        >
          Details
        </button>
        {onDelete && (
          <button
            onClick={() => onDelete(task.id)}
            className="px-3 py-1 text-sm bg-red-500 text-white hover:bg-red-600 rounded"
          >
            Löschen
          </button>
        )}
      </div>

      {isExpanded && (
        <div className="mt-4 p-3 bg-gray-50 rounded">
          <h4 className="font-medium mb-2">Task Details</h4>
          <div className="text-sm space-y-1">
            <p><strong>Goal:</strong> {task.goal}</p>
            <p><strong>Status:</strong> {task.status.phase}</p>
            <p><strong>ID:</strong> {task.id}</p>
            <p><strong>Erstellt:</strong> {new Date(task.createdAt).toLocaleString()}</p>
            {task.totalDuration && <p><strong>Verarbeitungszeit:</strong> {task.totalDuration}ms</p>}
            {task.totalCost && <p><strong>Geschätzte Kosten:</strong> ${task.totalCost.toFixed(4)}</p>}
          </div>
        </div>
      )}
    </div>
  )
}
