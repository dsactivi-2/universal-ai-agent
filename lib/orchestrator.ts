import Anthropic from '@anthropic-ai/sdk'
import { AGENT_TOOLS } from './tools'
import { ToolExecutor } from './tool-executor'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || ''
})

export interface StepResult {
  step: number
  tool: string
  input: unknown
  output: string
  success: boolean
  duration: number
}

export interface OrchestratorRequest {
  message: string
  taskId: string
  onStep?: (step: StepResult) => void
  context?: {
    explicit?: Record<string, unknown>
    historical?: unknown[]
    conversational?: unknown[]
    preferences?: Record<string, unknown>
  }
}

export interface OrchestratorResponse {
  taskId: string
  success: boolean
  output: string
  summary: string
  stepResults: StepResult[]
  totalDuration: number
  totalCost: number
}

const SYSTEM_PROMPT = `Du bist ein autonomer AI-Agent, der Programmieraufgaben selbstständig ausführen kann.

Du hast Zugriff auf folgende Tools:
- read_file: Dateien lesen
- write_file: Dateien schreiben/erstellen
- list_files: Verzeichnisse auflisten
- execute_bash: Bash-Befehle ausführen (npm, python, etc.)
- git_command: Git-Befehle (status, add, commit, push, etc.)
- create_directory: Verzeichnisse erstellen
- delete_file: Dateien/Verzeichnisse löschen
- search_files: Nach Dateien/Inhalten suchen
- task_complete: Aufgabe als erledigt markieren

WICHTIGE REGELN:
1. Arbeite selbstständig und vollständig - führe alle nötigen Schritte aus
2. Bei Code-Erstellung: Erstelle komplette, funktionierende Dateien
3. Installiere benötigte Dependencies mit npm/pip
4. Teste deinen Code wenn möglich
5. Wenn du fertig bist, rufe task_complete auf mit einer Zusammenfassung
6. Bei Fehlern: Analysiere und behebe sie selbstständig
7. Erstelle sauberen, gut strukturierten Code

Arbeitsverzeichnis: /app/workspace
Hier werden alle Dateien erstellt und Befehle ausgeführt.`

export class Orchestrator {
  private toolExecutor: ToolExecutor
  private maxIterations = 50

  constructor() {
    this.toolExecutor = new ToolExecutor()
  }

  async handleRequest(request: OrchestratorRequest): Promise<OrchestratorResponse> {
    const startTime = Date.now()
    const stepResults: StepResult[] = []
    let totalInputTokens = 0
    let totalOutputTokens = 0

    // Check for API key
    if (!process.env.ANTHROPIC_API_KEY) {
      return {
        taskId: request.taskId,
        success: false,
        output: 'ANTHROPIC_API_KEY not configured. Please set the environment variable.',
        summary: 'API key missing',
        stepResults: [],
        totalDuration: Date.now() - startTime,
        totalCost: 0
      }
    }

    try {
      // Initialize conversation
      const messages: Anthropic.MessageParam[] = [
        {
          role: 'user',
          content: `Aufgabe: ${request.message}

Beginne jetzt mit der Ausführung. Nutze die verfügbaren Tools um die Aufgabe vollständig zu erledigen.`
        }
      ]

      let isComplete = false
      let iteration = 0
      let finalOutput = ''

      // Agentic loop
      while (!isComplete && iteration < this.maxIterations) {
        iteration++

        // Call Claude with tools
        const response = await anthropic.messages.create({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 8192,
          system: SYSTEM_PROMPT,
          tools: AGENT_TOOLS,
          messages: messages
        })

        totalInputTokens += response.usage?.input_tokens || 0
        totalOutputTokens += response.usage?.output_tokens || 0

        // Process response content
        const assistantContent: Anthropic.ContentBlockParam[] = []
        const toolResults: Anthropic.ToolResultBlockParam[] = []

        for (const block of response.content) {
          if (block.type === 'text') {
            finalOutput = block.text
            assistantContent.push({ type: 'text', text: block.text })
          } else if (block.type === 'tool_use') {
            assistantContent.push({
              type: 'tool_use',
              id: block.id,
              name: block.name,
              input: block.input as Record<string, unknown>
            })

            // Execute the tool
            const stepStart = Date.now()
            const result = await this.toolExecutor.execute(block.name, block.input)
            const stepDuration = Date.now() - stepStart

            // Check for task completion
            if (block.name === 'task_complete') {
              isComplete = true
              finalOutput = result.output
            }

            // Record step result
            const stepResult: StepResult = {
              step: stepResults.length + 1,
              tool: block.name,
              input: block.input,
              output: result.output.slice(0, 2000), // Limit output size
              success: result.success,
              duration: stepDuration
            }
            stepResults.push(stepResult)

            // Notify listener
            if (request.onStep) {
              request.onStep(stepResult)
            }

            // Add tool result
            const toolOutput = result.success
              ? result.output
              : `Error: ${result.error}\n${result.output}`

            toolResults.push({
              type: 'tool_result',
              tool_use_id: block.id,
              content: toolOutput.slice(0, 10000) // Limit size
            })
          }
        }

        // Add assistant message
        messages.push({
          role: 'assistant',
          content: assistantContent
        })

        // Add tool results if any
        if (toolResults.length > 0) {
          messages.push({
            role: 'user',
            content: toolResults
          })
        }

        // Check stop reason
        if (response.stop_reason === 'end_turn' && toolResults.length === 0) {
          // No more tool calls, we're done
          isComplete = true
        }
      }

      // Calculate cost (Claude 3.5 Sonnet: $3/1M input, $15/1M output)
      const cost = (totalInputTokens * 0.003 + totalOutputTokens * 0.015) / 1000

      return {
        taskId: request.taskId,
        success: true,
        output: finalOutput,
        summary: finalOutput.slice(0, 300) + (finalOutput.length > 300 ? '...' : ''),
        stepResults,
        totalDuration: Date.now() - startTime,
        totalCost: cost
      }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      return {
        taskId: request.taskId,
        success: false,
        output: `Error: ${errorMessage}`,
        summary: 'Task failed with error',
        stepResults,
        totalDuration: Date.now() - startTime,
        totalCost: 0
      }
    }
  }
}
