import { z } from 'zod'
import { EntryPathSchema, SessionIdSchema } from './session'

export const CASE_CODES = [
  'IMPERSONATION_AUTHORITY',
  'LOAN_PRETEXT',
  'IMPERSONATION_ACQUAINTANCE',
  'MALICIOUS_APP_LINK',
  'CREDENTIAL_THEFT',
  'UNKNOWN',
] as const
export const CaseCodeSchema = z.enum(CASE_CODES)
export type CaseCode = z.infer<typeof CaseCodeSchema>

export const STATES = [
  'NONE',
  'LINK_CLICKED',
  'PII_DISCLOSED',
  'ACCOUNT_INFO_DISCLOSED',
  'CREDENTIAL_DISCLOSED',
  'APP_INSTALLED',
  'MONEY_SENT',
] as const
export const StateSchema = z.enum(STATES)
export type State = z.infer<typeof StateSchema>

export const PERSUASION_TACTICS = [
  'AUTHORITY',
  'TIME_PRESSURE',
  'FEAR',
  'ISOLATION',
  'REWARD',
  'RELATIONSHIP',
] as const
export const PersuasionTacticSchema = z.enum(PERSUASION_TACTICS)

const StatesArraySchema = z
  .array(StateSchema)
  .min(1)
  .max(7)
  .refine((states: string[]) => new Set(states).size === states.length, {
    message: 'states must not contain duplicates',
  })
  .refine((states: string[]) => !(states.includes('NONE') && states.length > 1), {
    message: 'NONE must not be combined with other states',
  })

export const ObservedFactSchema = z.object({
  fact: z.string().max(80),
  quote: z.string().max(120),
})
export type ObservedFact = z.infer<typeof ObservedFactSchema>

export const AnalysisResultSchema = z.object({
  case_code: CaseCodeSchema,
  states: StatesArraySchema,
  observed_facts: z.array(ObservedFactSchema).max(6),
  persuasion_tactics: z.array(PersuasionTacticSchema).max(4).optional(),
  missing_info: z.array(z.string().max(60)).max(3),
  confidence: z.number().min(0).max(1),
  is_out_of_scope: z.boolean().optional(),
})
export type AnalysisResult = z.infer<typeof AnalysisResultSchema>

export const RISK_LEVELS = ['SAFE', 'CAUTION', 'DANGER', 'CRITICAL'] as const
export const RiskLevelSchema = z.enum(RISK_LEVELS)
export type RiskLevel = z.infer<typeof RiskLevelSchema>

export const MAX_SITUATION_TEXT_LENGTH = 2000

export const AnalyzeRequestSchema = z.object({
  session_id: SessionIdSchema,
  text: z.string().trim().min(1).max(MAX_SITUATION_TEXT_LENGTH),
  entry_path: EntryPathSchema,
})
export type AnalyzeRequest = z.infer<typeof AnalyzeRequestSchema>

export const ManualAnalyzeRequestSchema = z.object({
  session_id: SessionIdSchema,
  case_code: CaseCodeSchema,
  states: StatesArraySchema,
})
export type ManualAnalyzeRequest = z.infer<typeof ManualAnalyzeRequestSchema>

export const CONFIDENCE_MANUAL_THRESHOLD = 0.4

// C0 제어문자(탭·개행 제외) + DEL 제거용. 코드포인트로 구성해 소스에 원문
// 제어문자를 직접 넣지 않는다.
const CONTROL_CHAR_CODES = [
  ...Array.from({ length: 9 }, (_, i) => i), // 0x00-0x08
  0x0b,
  0x0c,
  ...Array.from({ length: 18 }, (_, i) => 0x0e + i), // 0x0e-0x1f
  0x7f,
]
const CONTROL_CHARS_PATTERN = new RegExp(
  `[${CONTROL_CHAR_CODES.map((c) => `\\u${c.toString(16).padStart(4, '0')}`).join('')}]`,
  'g'
)

// F2: "입력 정규화(공백·제어문자 제거)". 원문은 저장하지 않지만(요청 바디로만
// 전달) 분석 전에는 항상 이 정규화를 거친다.
export function normalizeSituationText(input: string): string {
  return input
    .replace(/\r\n?/g, '\n')
    .replace(CONTROL_CHARS_PATTERN, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
