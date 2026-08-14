import type { SupabaseClient } from '@supabase/supabase-js'
import type { State } from '@/lib/schemas/analysis'

// Phase 5(RAG) 전용이 아니라 Phase 1부터 필요한 "playbook 데이터 연결
// 구조"의 조회 계층. 데이터(kb_documents/kb_chunks/playbook_steps/
// contact_registry)는 아직 비어 있을 수 있으나, 조회 코드는 지금 만든다.

export interface PlaybookStepRecord {
  step_id: string
  state_code: State
  seq: number
  title: string
  why: string | null
  kb_chunk_ids: string[]
  contact_ids: string[]
  triggers_deadline: boolean
  deadline_rule: string | null
  verified: boolean
}

export async function fetchPlaybookStepsForStates(
  db: SupabaseClient,
  states: State[]
): Promise<PlaybookStepRecord[]> {
  if (states.length === 0) return []
  const { data, error } = await db
    .from('playbook_steps')
    .select(
      'step_id, state_code, seq, title, why, kb_chunk_ids, contact_ids, triggers_deadline, deadline_rule, verified'
    )
    .in('state_code', states)
    .order('seq', { ascending: true })
  if (error) throw error
  return (data ?? []) as PlaybookStepRecord[]
}

// 골든타임 화면(S9)은 session_steps(step_id/seq/status)만으로는 제목을
// 보여줄 수 없다 — playbook_steps.title을 별도로 조회해 붙인다.
export async function fetchPlaybookStepTitles(
  db: SupabaseClient,
  stepIds: string[]
): Promise<Map<string, string>> {
  if (stepIds.length === 0) return new Map()
  const { data, error } = await db
    .from('playbook_steps')
    .select('step_id, title')
    .in('step_id', stepIds)
  if (error) throw error
  return new Map((data ?? []).map((row) => [row.step_id as string, row.title as string]))
}

export interface KbChunkRecord {
  id: string
  raw_text: string
  source_org: string
  source_url: string
  tier: 'T1' | 'T2' | 'T3'
  collected_at: string
}

// source_org/source_url/tier/collected_at은 kb_chunks가 아니라 kb_documents에
// 있다(§9-2 DDL). 처음엔 PostgREST 중첩 select(`kb_chunks(...kb_documents(...))`)
// 로 한 번에 가져왔는데, 실제 Supabase에 한 번도 실행해본 적이 없어 FK
// 관계 이름 자동 인식이 실패할 위험이 있었다(Phase 2 STEP 1 검토에서 지적,
// 인메모리 테스트로 재현됨 — 가짜 DB도 그 조인을 흉내 낼 방법이 마땅치
// 않았다). 조인 없이 평범한 쿼리 두 번 + JS 조인으로 바꿔 그 위험 자체를
// 없앴다.
async function fetchKbDocumentsByIds(
  db: SupabaseClient,
  ids: string[]
): Promise<Map<string, { source_org: string; source_url: string; tier: 'T1' | 'T2' | 'T3'; collected_at: string }>> {
  if (ids.length === 0) return new Map()
  const { data, error } = await db
    .from('kb_documents')
    .select('id, source_org, source_url, tier, collected_at')
    .in('id', ids)
  if (error) throw error
  return new Map((data ?? []).map((row) => [row.id as string, row]))
}

export async function fetchKbChunksByIds(
  db: SupabaseClient,
  ids: string[]
): Promise<KbChunkRecord[]> {
  if (ids.length === 0) return []
  const { data, error } = await db
    .from('kb_chunks')
    .select('id, raw_text, document_id')
    .in('id', ids)
  if (error) throw error
  const chunks = (data ?? []) as Array<{ id: string; raw_text: string; document_id: string }>

  const documentsById = await fetchKbDocumentsByIds(db, [...new Set(chunks.map((c) => c.document_id))])

  return chunks
    .map((chunk) => {
      const doc = documentsById.get(chunk.document_id)
      if (!doc) return null
      return {
        id: chunk.id,
        raw_text: chunk.raw_text,
        source_org: doc.source_org,
        source_url: doc.source_url,
        tier: doc.tier,
        collected_at: doc.collected_at,
      }
    })
    .filter((c): c is KbChunkRecord => c !== null)
}

export interface ContactRecord {
  id: string
  label: string
  type: 'PHONE' | 'URL'
  value: string
  source_org: string
}

export async function fetchContactsByIds(
  db: SupabaseClient,
  ids: string[]
): Promise<ContactRecord[]> {
  if (ids.length === 0) return []
  const { data, error } = await db
    .from('contact_registry')
    .select('id, label, type, value, source_org')
    .in('id', ids)
    .eq('active', true)
  if (error) throw error
  return (data ?? []) as ContactRecord[]
}
