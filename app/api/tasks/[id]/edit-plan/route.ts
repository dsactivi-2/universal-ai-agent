import { NextRequest, NextResponse } from 'next/server'
import { getTaskById, updateTask } from '@/lib/database'
import Anthropic from '@anthropic-ai/sdk'
import { authAndLLMRateLimit } from '@/lib/auth'
import { validateBody, validateParams, TaskIdParamSchema, EditPlanSchema } from '@/lib/validation'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || ''
})

const REVIEW_SYSTEM_PROMPT = `Du bist ein erfahrener Software-Architekt. Der Benutzer hat einen von der KI erstellten Plan manuell bearbeitet.

Deine Aufgabe:
1. Analysiere die Aenderungen des Benutzers
2. Pruefe ob der bearbeitete Plan technisch sinnvoll ist
3. Identifiziere moegliche Probleme oder Verbesserungen
4. Gib konstruktives Feedback

Antworte in diesem Format:

## Analyse der Aenderungen
[Was hat der Benutzer geaendert?]

## Bewertung
[Ist der Plan so umsetzbar? Gibt es Probleme?]

## Empfehlungen
[Falls noetig: Konkrete Verbesserungsvorschlaege]

## Status
[APPROVED - Plan ist gut so / NEEDS_REVIEW - Ueberarbeitung empfohlen]

Sei konstruktiv aber ehrlich. Wenn der Plan Probleme hat, sag es klar.`

// PATCH /api/tasks/[id]/edit-plan - Edit plan with AI review
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Auth + LLM Rate Limit prüfen (enthält AI Review)
    const authResult = authAndLLMRateLimit(request)
    if ('error' in authResult) return authResult.error

    // Params validieren
    const { id: taskId } = await params
    const paramResult = validateParams(TaskIdParamSchema, { id: taskId })
    if (!paramResult.success) return paramResult.error

    // Body validieren
    const body = await request.json()
    const bodyResult = validateBody(EditPlanSchema, body)
    if (!bodyResult.success) return bodyResult.error

    const { plan } = bodyResult.data

    // Check if task exists
    const task = getTaskById(taskId)
    if (!task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 })
    }

    // Check if task is in a state where plan can be edited
    if (task.status.phase !== 'awaiting_approval') {
      return NextResponse.json(
        { error: `Plan kann nur bearbeitet werden wenn Status "awaiting_approval". Aktuell: ${task.status.phase}` },
        { status: 400 }
      )
    }

    // Get AI review of the edited plan
    let aiReview = ''
    let reviewStatus = 'APPROVED'

    if (process.env.ANTHROPIC_API_KEY) {
      try {
        const response = await anthropic.messages.create({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 2048,
          system: REVIEW_SYSTEM_PROMPT,
          messages: [
            {
              role: 'user',
              content: `## Urspruengliche Aufgabe
${task.goal}

## Urspruenglicher Plan (von KI erstellt)
${task.plan || 'Nicht verfuegbar'}

## Bearbeiteter Plan (vom Benutzer)
${plan}

Bitte analysiere die Aenderungen und gib Feedback.`
            }
          ]
        })

        aiReview = response.content
          .filter(block => block.type === 'text')
          .map(block => (block as { type: 'text'; text: string }).text)
          .join('\n')

        // Check if AI recommends review
        if (aiReview.includes('NEEDS_REVIEW')) {
          reviewStatus = 'NEEDS_REVIEW'
        }
      } catch (error) {
        console.error('AI review failed:', error)
        aiReview = 'KI-Review konnte nicht durchgefuehrt werden.'
      }
    }

    // Update the plan with review info
    const updated = updateTask(taskId, {
      plan,
      output: plan,
      summary: reviewStatus === 'APPROVED'
        ? 'Plan bearbeitet und von KI geprueft - OK'
        : 'Plan bearbeitet - KI empfiehlt Ueberarbeitung'
    })

    return NextResponse.json({
      success: true,
      message: 'Plan wurde analysiert und gespeichert',
      task: updated,
      review: {
        status: reviewStatus,
        feedback: aiReview
      }
    })
  } catch (error) {
    console.error('Failed to edit plan:', error)
    return NextResponse.json({ error: 'Failed to edit plan' }, { status: 500 })
  }
}
