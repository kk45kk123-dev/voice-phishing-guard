import type { SupabaseClient } from '@supabase/supabase-js'
import type { State } from '@/lib/schemas/analysis'
import {
  fetchContactsByIds,
  fetchKbChunksByIds,
  fetchPlaybookStepsForStates,
  type ContactRecord,
  type KbChunkRecord,
  type PlaybookStepRecord,
} from '@/lib/kb/query'

export interface GuidanceChannel {
  label: string
  type: 'PHONE' | 'URL'
  value: string
  source_org: string
}

export interface GuidanceEvidence {
  chunk_id: string
  raw_text: string
  source_org: string
  source_url: string
  tier: 'T1' | 'T2' | 'T3'
  collected_at: string
}

export interface GuidanceStep {
  step_id: string
  seq: number
  title: string
  why: string | null
  channels: GuidanceChannel[]
  evidence: GuidanceEvidence[]
  triggers_deadline: boolean
  deadline_rule: string | null
}

// DEV_SPEC.md §5-3: 다음 중 하나라도 해당하면 이 step은 렌더링하지 않는다.
// 1) verified=false 이고 production   2) kb_chunk_ids 비어있음
// 3) 연결된 청크가 T3뿐임
// 순수 함수 — DB 없이 테스트 가능하다.
export function isStepRenderable(
  step: PlaybookStepRecord,
  chunksById: Map<string, KbChunkRecord>,
  isProduction: boolean
): boolean {
  if (!step.verified && isProduction) return false
  if (step.kb_chunk_ids.length === 0) return false
  const chunks = step.kb_chunk_ids
    .map((id) => chunksById.get(id))
    .filter((c): c is KbChunkRecord => Boolean(c))
  if (chunks.length === 0) return false
  const hasNonT3Evidence = chunks.some((c) => c.tier !== 'T3')
  return hasNonT3Evidence
}

export function assembleGuidanceStep(
  step: PlaybookStepRecord,
  chunksById: Map<string, KbChunkRecord>,
  contactsById: Map<string, ContactRecord>
): GuidanceStep {
  const evidence: GuidanceEvidence[] = step.kb_chunk_ids
    .map((id) => chunksById.get(id))
    .filter((c): c is KbChunkRecord => Boolean(c))
    .map((c) => ({
      chunk_id: c.id,
      raw_text: c.raw_text,
      source_org: c.source_org,
      source_url: c.source_url,
      tier: c.tier,
      collected_at: c.collected_at,
    }))

  const channels: GuidanceChannel[] = step.contact_ids
    .map((id) => contactsById.get(id))
    .filter((c): c is ContactRecord => Boolean(c))
    .map((c) => ({ label: c.label, type: c.type, value: c.value, source_org: c.source_org }))

  return {
    step_id: step.step_id,
    seq: step.seq,
    title: step.title,
    why: step.why,
    channels,
    evidence,
    triggers_deadline: step.triggers_deadline,
    deadline_rule: step.deadline_rule,
  }
}

// orderedStates 순서(우선순위) → 각 state 안에서는 seq 순서로 최종 step 순서를 만든다.
export async function getGuidanceSteps(
  db: SupabaseClient,
  orderedStates: State[],
  opts: { isProduction: boolean }
): Promise<GuidanceStep[]> {
  const rawSteps = await fetchPlaybookStepsForStates(db, orderedStates)

  const allChunkIds = [...new Set(rawSteps.flatMap((s) => s.kb_chunk_ids))]
  const allContactIds = [...new Set(rawSteps.flatMap((s) => s.contact_ids))]
  const [chunks, contacts] = await Promise.all([
    fetchKbChunksByIds(db, allChunkIds),
    fetchContactsByIds(db, allContactIds),
  ])
  const chunksById = new Map(chunks.map((c) => [c.id, c]))
  const contactsById = new Map(contacts.map((c) => [c.id, c]))

  const renderable = rawSteps.filter((s) => isStepRenderable(s, chunksById, opts.isProduction))

  const byState = new Map<State, PlaybookStepRecord[]>()
  for (const step of renderable) {
    const list = byState.get(step.state_code) ?? []
    list.push(step)
    byState.set(step.state_code, list)
  }
  for (const list of byState.values()) list.sort((a, b) => a.seq - b.seq)

  const ordered = orderedStates.flatMap((state) => byState.get(state) ?? [])
  return ordered.map((step) => assembleGuidanceStep(step, chunksById, contactsById))
}
