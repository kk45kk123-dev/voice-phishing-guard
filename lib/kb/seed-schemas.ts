import { z } from 'zod'
import { StateSchema } from '@/lib/schemas/analysis'

// data/contacts.yaml, data/kb/*/meta.json, data/playbooks/*.yaml의 형식을
// 정의한다. §5-2 청킹 규칙(최대 800자, 단계 단위)과 Phase 2 STEP 4 메타데이터
// 확장(0002_kb_metadata.sql)을 반영한다.

const DateStringSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD 형식이어야 합니다')

const TierSchema = z.enum(['T1', 'T2', 'T3'])
const ContactTierSchema = z.enum(['T1', 'T2']) // contact_registry.tier CHECK: T3 금지 (§5-1)

const MetadataFields = {
  verified_at: DateStringSchema.optional(),
  effective_from: DateStringSchema.optional(),
  category: z.string().max(60).optional(),
  authority: z.string().max(120).optional(),
}

export const ContactSeedSchema = z.object({
  label: z.string().min(1),
  type: z.enum(['PHONE', 'URL']),
  value: z.string().min(1),
  source_org: z.string().min(1),
  source_url: z.string().url(),
  tier: ContactTierSchema,
  collected_at: DateStringSchema,
  ...MetadataFields,
})
export type ContactSeed = z.infer<typeof ContactSeedSchema>

export const ContactsFileSchema = z.object({
  contacts: z.array(ContactSeedSchema),
})

export const KbDocumentMetaSchema = z.object({
  source_org: z.string().min(1),
  source_url: z.string().url(),
  tier: TierSchema,
  title: z.string().min(1),
  collected_at: DateStringSchema,
  ...MetadataFields,
})
export type KbDocumentMeta = z.infer<typeof KbDocumentMetaSchema>

export const MAX_CHUNK_LENGTH = 800

// §5-2 청킹 규칙: "절차 안내는 단계 단위로 자른다(문단 무시). 한 청크 = 한
// 행동." — content.md를 `---`만 있는 줄로 나눈다. 순수 함수(파일 I/O 없음).
// 줄 단위로 처리해 구분자가 연속으로 붙어 있어도(빈 청크만 사이에 있어도)
// 정확히 나뉜다 — 정규식 한 방으로 split하면 연속 구분자에서 경계를
// 잘못 잡는 문제가 있었다(테스트로 발견).
export function splitIntoChunks(markdown: string): string[] {
  const lines = markdown.split('\n')
  const chunks: string[] = []
  let current: string[] = []
  for (const line of lines) {
    if (/^\s*---\s*$/.test(line)) {
      chunks.push(current.join('\n').trim())
      current = []
    } else {
      current.push(line)
    }
  }
  chunks.push(current.join('\n').trim())
  return chunks.filter((s) => s.length > 0)
}

export function validateChunkLengths(chunks: string[]): string[] {
  return chunks
    .map((c, i) => (c.length > MAX_CHUNK_LENGTH ? `chunk #${i + 1}: ${c.length}자 (최대 ${MAX_CHUNK_LENGTH}자 초과)` : null))
    .filter((s): s is string => s !== null)
}

export const PlaybookStepSeedSchema = z.object({
  step_id: z.string().min(1),
  seq: z.number().int().positive(),
  title: z.string().min(1),
  why: z.string().optional(),
  // "<kb_document.source_url>#<chunk seq>" 형식. seed 시점에 실제 UUID로 치환한다.
  kb_chunk_refs: z.array(z.string()).default([]),
  // contact_registry.value(전화번호/URL) 참조. seed 시점에 실제 UUID로 치환한다.
  contact_refs: z.array(z.string()).default([]),
  triggers_deadline: z.boolean().default(false),
  deadline_rule: z.string().nullable().optional(),
  verified: z.boolean().default(false),
  verified_at: DateStringSchema.optional(),
  verified_by: z.string().optional(),
})
export type PlaybookStepSeed = z.infer<typeof PlaybookStepSeedSchema>

export const PlaybookFileSchema = z.object({
  state_code: StateSchema,
  steps: z.array(PlaybookStepSeedSchema),
})
export type PlaybookFile = z.infer<typeof PlaybookFileSchema>

export function findDuplicateContacts(contacts: ContactSeed[]): string[] {
  const seen = new Map<string, number>()
  const dups: string[] = []
  for (const c of contacts) {
    const key = `${c.type}:${c.value}`
    seen.set(key, (seen.get(key) ?? 0) + 1)
    if (seen.get(key) === 2) dups.push(key)
  }
  return dups
}
