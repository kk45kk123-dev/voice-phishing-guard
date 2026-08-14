import { z } from 'zod'
import { SessionIdSchema } from './session'

export const STEP_STATUSES = ['PENDING', 'IN_PROGRESS', 'DONE', 'SKIPPED'] as const
export const StepStatusSchema = z.enum(STEP_STATUSES)
export type StepStatus = z.infer<typeof StepStatusSchema>

export const PatchStepRequestSchema = z.object({
  session_id: SessionIdSchema,
  step_id: z.string().min(1),
  status: StepStatusSchema,
})
export type PatchStepRequest = z.infer<typeof PatchStepRequestSchema>
