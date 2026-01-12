import { z } from 'zod'
import { NextResponse } from 'next/server'

// ============================================================
// ZOD VALIDATION SCHEMAS
// ============================================================

// Task Schemas
export const CreateTaskSchema = z.object({
  message: z
    .string()
    .min(1, 'Message is required')
    .max(10000, 'Message too long (max 10000 characters)')
    .trim()
})

export const UpdateTaskSchema = z.object({
  id: z.string().uuid('Invalid task ID'),
  phase: z.enum(['planning', 'awaiting_approval', 'executing', 'completed', 'failed']).optional(),
  output: z.string().max(100000).optional(),
  summary: z.string().max(1000).optional(),
  plan: z.string().max(50000).optional()
})

export const TaskIdParamSchema = z.object({
  id: z.string().uuid('Invalid task ID')
})

// Message Schemas
export const SendMessageSchema = z.object({
  message: z
    .string()
    .min(1, 'Message is required')
    .max(10000, 'Message too long (max 10000 characters)')
    .trim()
})

// Auth Schemas
export const LoginSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: z.string().min(8, 'Password must be at least 8 characters')
})

export const RegisterSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number'),
  name: z.string().min(2, 'Name must be at least 2 characters').max(100).optional()
})

// Query Parameter Schemas
export const TaskQuerySchema = z.object({
  stats: z.enum(['true', 'false']).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional().default(50),
  offset: z.coerce.number().int().min(0).optional().default(0),
  phase: z.enum(['planning', 'awaiting_approval', 'executing', 'completed', 'failed']).optional()
})

export const DeleteTaskQuerySchema = z.object({
  id: z.string().uuid('Invalid task ID')
})

// Task Action Schemas
export const RejectTaskSchema = z.object({
  feedback: z.string().max(5000).optional(),
  regenerate: z.boolean().optional().default(false)
})

export const SetActionSchema = z.object({
  actionType: z.string().min(1, 'Action type is required').max(100),
  actionMessage: z.string().min(1, 'Action message is required').max(5000),
  blocking: z.boolean().optional().default(false)
})

export const ClearActionSchema = z.object({
  userInput: z.string().max(10000).optional()
})

export const EditPlanSchema = z.object({
  plan: z.string().min(1, 'Plan is required').max(50000)
})

export const ContinueTaskSchema = z.object({
  adjustment: z.string().max(5000).optional()
})

// ============================================================
// VALIDATION HELPERS
// ============================================================

export interface ValidationResult<T> {
  success: true
  data: T
}

export interface ValidationError {
  success: false
  error: NextResponse
}

export function validateBody<T>(
  schema: z.ZodSchema<T>,
  data: unknown
): ValidationResult<T> | ValidationError {
  const result = schema.safeParse(data)

  if (!result.success) {
    const errors = result.error.errors.map(err => ({
      field: err.path.join('.'),
      message: err.message
    }))

    return {
      success: false,
      error: NextResponse.json(
        {
          error: 'Validation failed',
          code: 'VALIDATION_ERROR',
          details: errors
        },
        { status: 400 }
      )
    }
  }

  return { success: true, data: result.data }
}

export function validateQuery<T>(
  schema: z.ZodSchema<T>,
  searchParams: URLSearchParams
): ValidationResult<T> | ValidationError {
  const params: Record<string, string> = {}
  searchParams.forEach((value, key) => {
    params[key] = value
  })

  return validateBody(schema, params)
}

export function validateParams<T>(
  schema: z.ZodSchema<T>,
  params: Record<string, string>
): ValidationResult<T> | ValidationError {
  return validateBody(schema, params)
}

// ============================================================
// SANITIZATION HELPERS
// ============================================================

// Entfernt potentiell gefährliche Zeichen aus User-Input
export function sanitizeString(input: string): string {
  return input
    .replace(/[<>]/g, '') // Basic XSS prevention
    .trim()
}

// Sanitize für Bash-Commands (zusätzlich zur Allowlist)
export function sanitizeForBash(input: string): string {
  // Entferne Shell-Metacharacters
  return input
    .replace(/[;&|`$(){}[\]!#*?~]/g, '')
    .replace(/\\/g, '')
    .trim()
}

// Sanitize Pfade
export function sanitizePath(input: string): string {
  return input
    .replace(/\.\./g, '') // Keine parent directory traversal
    .replace(/^\/+/, '')   // Kein absoluter Pfad
    .replace(/[<>:"|?*]/g, '') // Windows-inkompatible Zeichen
    .trim()
}

// ============================================================
// TYPE EXPORTS
// ============================================================

export type CreateTaskInput = z.infer<typeof CreateTaskSchema>
export type UpdateTaskInput = z.infer<typeof UpdateTaskSchema>
export type SendMessageInput = z.infer<typeof SendMessageSchema>
export type LoginInput = z.infer<typeof LoginSchema>
export type RegisterInput = z.infer<typeof RegisterSchema>
export type TaskQueryInput = z.infer<typeof TaskQuerySchema>
export type RejectTaskInput = z.infer<typeof RejectTaskSchema>
export type SetActionInput = z.infer<typeof SetActionSchema>
export type ClearActionInput = z.infer<typeof ClearActionSchema>
export type EditPlanInput = z.infer<typeof EditPlanSchema>
export type ContinueTaskInput = z.infer<typeof ContinueTaskSchema>
