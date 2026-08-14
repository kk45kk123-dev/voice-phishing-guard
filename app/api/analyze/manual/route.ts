import { NextResponse, type NextRequest } from 'next/server'
import { getServerSupabaseClient } from '@/lib/db/client'
import {
  requireValidSession,
  sessionGuardErrorResponse,
  supabaseSessionsPort,
} from '@/lib/db/session-guard'
import { insertAnalysis } from '@/lib/db/session-repo'
import { ManualAnalyzeRequestSchema, type AnalysisResult } from '@/lib/schemas/analysis'
import { computeRisk } from '@/lib/rules/risk'
import { orderStates } from '@/lib/rules/priority'
import { withApiErrorHandling } from '@/lib/api/handler'

export const dynamic = 'force-dynamic'

// POST /api/analyze/manual — §9-1. S4b 수동 보정. AI 오분류가 사고로
// 이어지지 않도록 하는 필수 안전장치(§2 규칙).
export const POST = withApiErrorHandling(async (req: NextRequest) => {
  const raw = await req.json().catch(() => null)
  const parsed = ManualAnalyzeRequestSchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: 'INVALID_REQUEST' }, { status: 400 })
  }

  const db = getServerSupabaseClient()
  const guard = await requireValidSession(supabaseSessionsPort(db), parsed.data.session_id)
  if (!guard.ok) {
    const { status, body } = sessionGuardErrorResponse(guard.error)
    return NextResponse.json(body, { status })
  }

  const riskLevel = computeRisk(parsed.data.states, parsed.data.case_code)
  const orderedStates = orderStates(parsed.data.states)

  await insertAnalysis(db, guard.session.id, {
    case_code: parsed.data.case_code,
    states: parsed.data.states,
    risk_level: riskLevel,
    confidence: 1,
    source: 'manual',
  })

  const result: AnalysisResult = {
    case_code: parsed.data.case_code,
    states: parsed.data.states,
    observed_facts: [],
    missing_info: [],
    confidence: 1,
    is_out_of_scope: false,
  }

  return NextResponse.json({
    analysis: result,
    risk_level: riskLevel,
    ordered_states: orderedStates,
    needs_manual: false,
    source: 'manual',
  })
})
