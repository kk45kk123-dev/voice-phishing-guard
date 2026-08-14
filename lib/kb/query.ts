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
// 있다(§9-2 DDL). document_id FK로 조인해서 근거 표시(§8 [근거 보기])에
// 필요한 4개 필드를 한 번에 가져온다.
interface KbChunkJoinRow {
  id: string
  raw_text: string
  kb_documents: {
    source_org: string
    source_url: string
    tier: 'T1' | 'T2' | 'T3'
    collected_at: string
  } | null
}

export async function fetchKbChunksByIds(
  db: SupabaseClient,
  ids: string[]
): Promise<KbChunkRecord[]> {
  if (ids.length === 0) return []
  const { data, error } = await db
    .from('kb_chunks')
    .select('id, raw_text, kb_documents(source_org, source_url, tier, collected_at)')
    .in('id', ids)
  if (error) throw error
  const rows = (data ?? []) as unknown as KbChunkJoinRow[]
  return rows
    .filter((row): row is KbChunkJoinRow & { kb_documents: NonNullable<KbChunkJoinRow['kb_documents']> } =>
      row.kb_documents !== null
    )
    .map((row) => ({
      id: row.id,
      raw_text: row.raw_text,
      source_org: row.kb_documents.source_org,
      source_url: row.kb_documents.source_url,
      tier: row.kb_documents.tier,
      collected_at: row.kb_documents.collected_at,
    }))
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
