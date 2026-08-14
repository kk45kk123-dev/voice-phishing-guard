import { z } from 'zod'
import { SessionIdSchema } from './session'

export const AGE_BANDS = ['20s', '30s', '40s', '50s', '60s', '70s_plus'] as const
export const DEVICE_TYPES = ['android', 'ios', 'unknown'] as const

export const UserContextSchema = z
  .object({
    age_band: z.enum(AGE_BANDS).optional(),
    primary_bank: z.string().max(60).optional(),
    device: z.enum(DEVICE_TYPES).optional(),
  })
  .optional()

export const GuidanceRequestSchema = z.object({
  session_id: SessionIdSchema,
  user_context: UserContextSchema,
})
export type GuidanceRequest = z.infer<typeof GuidanceRequestSchema>
