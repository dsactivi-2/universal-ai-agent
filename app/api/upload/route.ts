import { NextRequest, NextResponse } from 'next/server'
import { writeFile, mkdir } from 'fs/promises'
import { existsSync } from 'fs'
import path from 'path'
import { v4 as uuidv4 } from 'uuid'
import Anthropic from '@anthropic-ai/sdk'
import { apiLogger } from '@/lib/logger'
import { authAndRateLimit } from '@/lib/auth'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || ''
})

const UPLOAD_DIR = path.join(process.cwd(), 'data', 'uploads')

// Supported file types for analysis
const ANALYZABLE_TYPES = [
  'text/plain',
  'text/markdown',
  'text/csv',
  'application/json',
  'application/xml',
  'text/xml',
  'text/html',
  'text/css',
  'text/javascript',
  'application/javascript',
  'application/typescript',
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'application/pdf'
]

const FILE_ANALYSIS_PROMPT = `Analysiere diese Datei und erstelle eine kurze, nuetzliche Zusammenfassung fuer einen KI-Agenten der eine Aufgabe basierend auf dieser Datei ausfuehren soll.

Beschreibe:
1. Was fuer eine Art von Datei/Dokument ist das?
2. Was ist der Hauptinhalt?
3. Welche wichtigen Details oder Anforderungen sind enthalten?
4. Falls es Code ist: Welche Sprache, Frameworks, wichtige Funktionen?
5. Falls es ein Bild ist: Was zeigt es? UI-Elemente, Text, Diagramme?

Halte die Analyse unter 500 Woertern. Sei praezise und fokussiert auf relevante Informationen.`

// POST /api/upload - Upload and analyze file
export async function POST(request: NextRequest) {
  const startTime = Date.now()
  try {
    // Auth + Rate Limit prüfen
    const authResult = authAndRateLimit(request)
    if ('error' in authResult) return authResult.error

    const formData = await request.formData()
    const file = formData.get('file') as File | null
    const taskId = formData.get('taskId') as string | null

    if (!file) {
      apiLogger.warn('Upload attempted without file')
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    // Check file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      apiLogger.warn('File too large', { filename: file.name, size: file.size })
      return NextResponse.json({ error: 'File too large (max 10MB)' }, { status: 400 })
    }

    apiLogger.info('File upload started', { filename: file.name, size: file.size, mimeType: file.type })

    // Create upload directory if not exists
    if (!existsSync(UPLOAD_DIR)) {
      await mkdir(UPLOAD_DIR, { recursive: true })
    }

    // Generate unique filename
    const fileId = uuidv4()
    const ext = path.extname(file.name) || ''
    const filename = `${fileId}${ext}`
    const filePath = path.join(UPLOAD_DIR, filename)

    // Save file
    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)
    await writeFile(filePath, buffer)

    // Analyze file content
    let analysis = ''
    const mimeType = file.type || 'application/octet-stream'

    if (process.env.ANTHROPIC_API_KEY && ANALYZABLE_TYPES.some(t => mimeType.startsWith(t.split('/')[0]))) {
      try {
        // For text files, read content directly
        if (mimeType.startsWith('text/') || mimeType === 'application/json' || mimeType === 'application/xml') {
          const textContent = buffer.toString('utf-8').slice(0, 50000) // Limit to 50k chars

          const response = await anthropic.messages.create({
            model: 'claude-sonnet-4-20250514',
            max_tokens: 1024,
            messages: [{
              role: 'user',
              content: `${FILE_ANALYSIS_PROMPT}\n\n--- DATEIINHALT (${file.name}) ---\n${textContent}`
            }]
          })

          analysis = response.content
            .filter(block => block.type === 'text')
            .map(block => (block as { type: 'text'; text: string }).text)
            .join('\n')
        }
        // For images, use vision
        else if (mimeType.startsWith('image/')) {
          const base64 = buffer.toString('base64')
          const mediaType = mimeType as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp'

          const response = await anthropic.messages.create({
            model: 'claude-sonnet-4-20250514',
            max_tokens: 1024,
            messages: [{
              role: 'user',
              content: [
                {
                  type: 'image',
                  source: {
                    type: 'base64',
                    media_type: mediaType,
                    data: base64
                  }
                },
                {
                  type: 'text',
                  text: `${FILE_ANALYSIS_PROMPT}\n\nDateiname: ${file.name}`
                }
              ]
            }]
          })

          analysis = response.content
            .filter(block => block.type === 'text')
            .map(block => (block as { type: 'text'; text: string }).text)
            .join('\n')
        }
        // For PDF, note that we can't analyze it directly yet
        else if (mimeType === 'application/pdf') {
          analysis = `PDF-Datei: ${file.name} (${(file.size / 1024).toFixed(1)} KB). PDF-Inhalte koennen vom Agenten gelesen werden.`
        }
      } catch (analysisError) {
        console.error('File analysis failed:', analysisError)
        analysis = `Datei hochgeladen: ${file.name} (${mimeType}, ${(file.size / 1024).toFixed(1)} KB). Automatische Analyse fehlgeschlagen.`
      }
    } else {
      analysis = `Datei: ${file.name} (${mimeType}, ${(file.size / 1024).toFixed(1)} KB)`
    }

    apiLogger.info('File upload completed', {
      fileId,
      filename: file.name,
      size: file.size,
      durationMs: Date.now() - startTime,
      analyzed: !!analysis
    })

    return NextResponse.json({
      success: true,
      file: {
        id: fileId,
        filename,
        originalName: file.name,
        mimeType,
        size: file.size,
        analysis,
        path: `/api/upload/${filename}`
      }
    })
  } catch (error) {
    apiLogger.error('Upload failed', error)
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 })
  }
}
