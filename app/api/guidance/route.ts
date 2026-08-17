import { NextResponse, type NextRequest } from 'next/server'
import { getServerSupabaseClient } from '@/lib/db/client'
import {
  requireValidSession,
  sessionGuardErrorResponse,
  supabaseSessionsPort,
} from '@/lib/db/session-guard'
import { getLatestAnalysis, upsertSessionSteps } from '@/lib/db/session-repo'
import { getGuidanceSteps } from '@/lib/kb/playbook'
import { GuidanceRequestSchema } from '@/lib/schemas/guidance'
import { orderStates, buildCompoundNotice } from '@/lib/rules/priority'
import { withApiErrorHandling } from '@/lib/api/handler'

export const dynamic = 'force-dynamic'

const FALLBACK_MESSAGE =
  '⚠️ 이 상황에 대한 공식 안내를 아직 확인하지 못했습니다.\n\n정확한 안내를 위해 공식 채널로 직접 문의해 주세요.'

// POST /api/guidance — §9-1. Rule Engine → playbook 조회 → RAG 청크 조회 →
// (AI-B 재작성/Guard는 Phase 6·8 범위, 이번 Phase 1에는 없음) → 렌더링.
export const POST = withApiErrorHandling(async (req: NextRequest) => {
  const raw = await req.json().catch(() => null)
  const parsed = GuidanceRequestSchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: 'INVALID_REQUEST' }, { status: 400 })
  }

  const db = getServerSupabaseClient()
  const guard = await requireValidSession(supabaseSessionsPort(db), parsed.data.session_id)
  if (!guard.ok) {
    const { status, body } = sessionGuardErrorResponse(guard.error)
    return NextResponse.json(body, { status })
  }

  const analysis = await getLatestAnalysis(db, guard.session.id)
  if (!analysis) {
    return NextResponse.json({ error: 'ANALYSIS_REQUIRED' }, { status: 409 })
  }

  const ordered = orderStates(analysis.states)
  const steps = await getGuidanceSteps(db, ordered, {
    isProduction: process.env.NODE_ENV === 'production',
    primaryBank: parsed.data.user_context?.primary_bank,
  })

  if (steps.length === 0) {
    // §5-3: verified 근거가 하나도 없으면 해당 step을 렌더링하지 않고
    // Fallback을 보여준다. state별로 독립 평가되므로, 아직 playbook_steps가
    // seed되지 않은 state로 요청하면 항상 이 경로를 탄다 — 버그가 아니라
    // 의도된 동작이다.
    return NextResponse.json({
      fallback: true,
      reason: 'NO_VERIFIED_STEPS',
      message: FALLBACK_MESSAGE,
      channels: [],
      risk_level: analysis.risk_level,
    })
  }

  await upsertSessionSteps(
    db,
    guard.session.id,
    steps.map((s) => ({ step_id: s.step_id, seq: s.seq }))
  )

  return NextResponse.json({
    risk_level: analysis.risk_level,
    is_compound: ordered.length >= 2,
    compound_notice: buildCompoundNotice(ordered),
    steps,
  })
})
