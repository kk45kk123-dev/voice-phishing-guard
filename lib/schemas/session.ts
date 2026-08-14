import { z } from 'zod'

export const ENTRY_PATHS = [
  'FDS_ALERT',
  'CARRIER_WARNING',
  'BANK_CALL',
  'SELF_SUSPICION',
  'ALREADY_SENT',
  'ALREADY_DISCLOSED',
] as const

export const EntryPathSchema = z.enum(ENTRY_PATHS)
export type EntryPath = z.infer<typeof EntryPathSchema>

export const SessionIdSchema = z.string().uuid()

export const PatchSessionRequestSchema = z.object({
  session_id: SessionIdSchema,
  entry_path: EntryPathSchema,
})
export type PatchSessionRequest = z.infer<typeof PatchSessionRequestSchema>
