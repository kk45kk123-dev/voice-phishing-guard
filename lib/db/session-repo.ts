import type { SupabaseClient } from '@supabase/supabase-js'
import type { CaseCode, RiskLevel, State } from '@/lib/schemas/analysis'
import type { StepStatus } from '@/lib/schemas/steps'

// 세션 스코프 테이블(session_analyses, session_steps, session_deadlines,
// guard_logs)에 접근하는 유일한 통로. 모든 함수가 session_id를 첫 인자로
// 받아 내부에서 .eq('session_id', sessionId)를 강제한다 — route handler가
// 이 필터를 빠뜨릴 방법이 없도록 하는 것이 목적이다(Phase 0 보완 설계 §2).

export interface AnalysisRow {
  id: string
  session_id: string
  case_code: CaseCode
  states: State[]
  risk_level: RiskLevel
  confidence: number | null
  source: 'ai' | 'manual'
  created_at: string
}

export async function insertAnalysis(
  db: SupabaseClient,
  sessionId: string,
  input: {
    case_code: CaseCode
    states: State[]
    risk_level: RiskLevel
    confidence: number
    source: 'ai' | 'manual'
  }
): Promise<AnalysisRow> {
  const { data, error } = await db
    .from('session_analyses')
    .insert({ session_id: sessionId, ...input })
    .select()
    .single()
  if (error) throw error
  return data as AnalysisRow
}

export async function getLatestAnalysis(
  db: SupabaseClient,
  sessionId: string
): Promise<AnalysisRow | null> {
  const { data, error } = await db
    .from('session_analyses')
    .select('*')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return data as AnalysisRow | null
}

export interface SessionStepRow {
  id: string
  session_id: string
  step_id: string
  seq: number
  status: StepStatus
  completed_at: string | null
}

export async function upsertSessionSteps(
  db: SupabaseClient,
  sessionId: string,
  steps: Array<{ step_id: string; seq: number }>
): Promise<void> {
  if (steps.length === 0) return
  const rows = steps.map((s) => ({
    session_id: sessionId,
    step_id: s.step_id,
    seq: s.seq,
    status: 'PENDING' as const,
  }))
  // ignoreDuplicates: 이미 진행 중인 세션에서 가이던스를 다시 호출해도
  // 기존 status(DONE 등)를 덮어쓰지 않는다.
  const { error } = await db
    .from('session_steps')
    .upsert(rows, { onConflict: 'session_id,step_id', ignoreDuplicates: true })
  if (error) throw error
}

export async function listSessionSteps(
  db: SupabaseClient,
  sessionId: string
): Promise<SessionStepRow[]> {
  const { data, error } = await db
    .from('session_steps')
    .select('id, session_id, step_id, seq, status, completed_at')
    .eq('session_id', sessionId)
    .order('seq', { ascending: true })
  if (error) throw error
  return (data ?? []) as SessionStepRow[]
}

export async function getSessionStep(
  db: SupabaseClient,
  sessionId: string,
  stepId: string
): Promise<SessionStepRow | null> {
  const { data, error } = await db
    .from('session_steps')
    .select('id, session_id, step_id, seq, status, completed_at')
    .eq('session_id', sessionId)
    .eq('step_id', stepId)
    .maybeSingle()
  if (error) throw error
  return data as SessionStepRow | null
}

export async function updateSessionStepStatus(
  db: SupabaseClient,
  sessionId: string,
  stepId: string,
  status: StepStatus
): Promise<SessionStepRow> {
  const { data, error } = await db
    .from('session_steps')
    .update({
      status,
      completed_at: status === 'DONE' ? new Date().toISOString() : null,
    })
    .eq('session_id', sessionId)
    .eq('step_id', stepId)
    .select()
    .single()
  if (error) throw error
  return data as SessionStepRow
}
