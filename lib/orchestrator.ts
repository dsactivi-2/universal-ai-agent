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
  mode: 'plan' | 'execute'
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
  plan?: string
  stepResults: StepResult[]
  totalDuration: number
  totalCost: number
}

const PLANNING_SYSTEM_PROMPT = `Du bist ein erfahrener Software-Architekt und Berater. Deine Aufgabe ist es, Projekte zu ANALYSIEREN und einen detaillierten PLAN zu erstellen - NOCH NICHT umzusetzen.

Bei jeder Aufgabe sollst du:

1. **ANALYSE** - Was genau wird angefragt?
   - Verstehe die Anforderungen
   - Identifiziere die Kernfunktionalität

2. **TECHNOLOGIE-EMPFEHLUNGEN** - Was wird benötigt?
   Für jede Komponente empfehle konkrete Technologien mit Begründung:
   - 🔧 **Technologie**: Name + warum
   - 💰 **Kosten**: Geschätzte Kosten (falls relevant)
   - ⚡ **Alternativen**: Andere Optionen

3. **ARCHITEKTUR-VORSCHLAG**
   - Systemübersicht
   - Komponenten und deren Zusammenspiel
   - Datenfluss

4. **IMPLEMENTIERUNGS-SCHRITTE**
   Nummerierte Liste mit konkreten Schritten:
   1. Schritt 1: ...
   2. Schritt 2: ...
   etc.

5. **RISIKEN & HINWEISE**
   - Mögliche Probleme
   - Wichtige Überlegungen
   - Sicherheitsaspekte

6. **GESCHÄTZTER AUFWAND**
   - Ungefähre Komplexität (Einfach/Mittel/Komplex)

BEISPIEL für "Erstelle einen Call Agent auf Deutsch":

---
## 📋 ANALYSE
Du möchtest einen KI-gestützten Telefon-Agenten, der auf Deutsch Anrufe entgegennimmt und automatisch beantwortet.

## 🔧 TECHNOLOGIE-EMPFEHLUNGEN

### LLM (Sprachmodell)
- **Empfehlung**: Claude 3.5 Sonnet
- **Begründung**: Exzellente deutsche Sprachfähigkeiten, schnelle Antwortzeiten
- **Alternativen**: GPT-4, Gemini Pro

### Voice/TTS (Text-zu-Sprache)
- **Empfehlung**: ElevenLabs (Deutsch)
- **Begründung**: Natürlichste deutsche Stimmen
- **Kosten**: ~$0.30/1000 Zeichen
- **Alternativen**: Azure Neural TTS, Google Cloud TTS

### STT (Sprache-zu-Text)
- **Empfehlung**: Deepgram
- **Begründung**: Echtzeit-Transkription, gute deutsche Erkennung
- **Alternativen**: Whisper, Google Speech-to-Text

### Telefonie-Provider
- **Empfehlung**: Twilio
- **Begründung**: Zuverlässig, deutsche Nummern verfügbar
- **Kosten**: ~€0.01/Minute eingehend
- **Alternativen**: Vonage, Plivo

### Backend
- **Empfehlung**: Node.js + Express
- **Begründung**: Einfache WebSocket-Integration für Echtzeit

## 🏗️ ARCHITEKTUR
[Diagramm-Beschreibung]

## 📝 IMPLEMENTIERUNGS-SCHRITTE
1. Twilio-Account erstellen und deutsche Nummer kaufen
2. Backend-Server mit WebSocket aufsetzen
3. Deepgram STT integrieren
4. Claude API für Antwort-Generierung
5. ElevenLabs TTS integrieren
6. Twilio Webhook verbinden
7. Testen und optimieren

## ⚠️ RISIKEN & HINWEISE
- Latenz: Gesamtlatenz unter 1s halten für natürliches Gespräch
- Kosten: Bei hohem Volumen können Kosten steigen
- DSGVO: Datenschutz bei Gesprächsaufzeichnung beachten

## 📊 GESCHÄTZTER AUFWAND
**Komplexität**: Mittel
---

Erstelle NUR den Plan - implementiere noch nichts!`

const EXECUTION_SYSTEM_PROMPT = `Du bist ein autonomer AI-Agent, der Programmieraufgaben selbstständig ausführen kann.

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
    if (request.mode === 'plan') {
      return this.createPlan(request)
    } else {
      return this.executeTask(request)
    }
  }

  private async createPlan(request: OrchestratorRequest): Promise<OrchestratorResponse> {
    const startTime = Date.now()

    if (!process.env.ANTHROPIC_API_KEY) {
      return {
        taskId: request.taskId,
        success: false,
        output: 'ANTHROPIC_API_KEY not configured.',
        summary: 'API key missing',
        stepResults: [],
        totalDuration: Date.now() - startTime,
        totalCost: 0
      }
    }

    try {
      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 8192,
        system: PLANNING_SYSTEM_PROMPT,
        messages: [
          {
            role: 'user',
            content: `Bitte analysiere folgende Aufgabe und erstelle einen detaillierten Plan mit Technologie-Empfehlungen:

${request.message}

Erstelle eine vollständige Analyse mit allen Empfehlungen, Alternativen und Implementierungsschritten.`
          }
        ]
      })

      const planText = response.content
        .filter(block => block.type === 'text')
        .map(block => (block as { type: 'text'; text: string }).text)
        .join('\n')

      const inputTokens = response.usage?.input_tokens || 0
      const outputTokens = response.usage?.output_tokens || 0
      // Claude Sonnet 4: $3 input / $15 output per million tokens
      const cost = (inputTokens * 3 + outputTokens * 15) / 1000000

      return {
        taskId: request.taskId,
        success: true,
        output: planText,
        summary: 'Plan erstellt - Warte auf Bestätigung',
        plan: planText,
        stepResults: [],
        totalDuration: Date.now() - startTime,
        totalCost: cost
      }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      return {
        taskId: request.taskId,
        success: false,
        output: `Error: ${errorMessage}`,
        summary: 'Planung fehlgeschlagen',
        stepResults: [],
        totalDuration: Date.now() - startTime,
        totalCost: 0
      }
    }
  }

  private async executeTask(request: OrchestratorRequest): Promise<OrchestratorResponse> {
    const startTime = Date.now()
    const stepResults: StepResult[] = []
    let totalInputTokens = 0
    let totalOutputTokens = 0

    if (!process.env.ANTHROPIC_API_KEY) {
      return {
        taskId: request.taskId,
        success: false,
        output: 'ANTHROPIC_API_KEY not configured.',
        summary: 'API key missing',
        stepResults: [],
        totalDuration: Date.now() - startTime,
        totalCost: 0
      }
    }

    try {
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

      while (!isComplete && iteration < this.maxIterations) {
        iteration++

        const response = await anthropic.messages.create({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 8192,
          system: EXECUTION_SYSTEM_PROMPT,
          tools: AGENT_TOOLS,
          messages: messages
        })

        totalInputTokens += response.usage?.input_tokens || 0
        totalOutputTokens += response.usage?.output_tokens || 0

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

            const stepStart = Date.now()
            const result = await this.toolExecutor.execute(block.name, block.input)
            const stepDuration = Date.now() - stepStart

            if (block.name === 'task_complete') {
              isComplete = true
              finalOutput = result.output
            }

            const stepResult: StepResult = {
              step: stepResults.length + 1,
              tool: block.name,
              input: block.input,
              output: result.output.slice(0, 2000),
              success: result.success,
              duration: stepDuration
            }
            stepResults.push(stepResult)

            if (request.onStep) {
              request.onStep(stepResult)
            }

            const toolOutput = result.success
              ? result.output
              : `Error: ${result.error}\n${result.output}`

            toolResults.push({
              type: 'tool_result',
              tool_use_id: block.id,
              content: toolOutput.slice(0, 10000)
            })
          }
        }

        messages.push({
          role: 'assistant',
          content: assistantContent
        })

        if (toolResults.length > 0) {
          messages.push({
            role: 'user',
            content: toolResults
          })
        }

        if (response.stop_reason === 'end_turn' && toolResults.length === 0) {
          isComplete = true
        }
      }

      // Claude Sonnet 4: $3 input / $15 output per million tokens
      const cost = (totalInputTokens * 3 + totalOutputTokens * 15) / 1000000

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
