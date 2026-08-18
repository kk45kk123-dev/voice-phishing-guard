import { NextResponse, type NextRequest } from 'next/server'
import { getServerSupabaseClient } from '@/lib/db/client'
import {
  requireValidSession,
  sessionGuardErrorResponse,
  supabaseSessionsPort,
} from '@/lib/db/session-guard'
import { getLatestAnalysis, insertAnalysis } from '@/lib/db/session-repo'
import {
  AnalysisResultSchema,
  CONFIDENCE_MANUAL_THRESHOLD,
  MAX_SITUATION_TEXT_LENGTH,
  normalizeSituationText,
  type AnalysisResult,
  type ObservedFact,
} from '@/lib/schemas/analysis'
import { EntryPathSchema, SessionIdSchema } from '@/lib/schemas/session'
import { getAnalyzeProvider } from '@/lib/ai/client'
import { computeRisk } from '@/lib/rules/risk'
import { orderStates } from '@/lib/rules/priority'
import { withApiErrorHandling } from '@/lib/api/handler'

export const dynamic = 'force-dynamic'

// observed_facts[].quote는 사용자 원문의 부분 문자열이어야 한다(§6-1 검증
// 규칙). 이 mock은 원문에서 그대로 발췌하므로 항상 통과하지만, 실제 LLM으로
// 교체된 뒤에도 이 방어선은 유지한다.
function dropUnverifiableQuotes(result: AnalysisResult, normalizedText: string): AnalysisResult {
  return {
    ...result,
    observed_facts: result.observed_facts.filter((f: ObservedFact) => normalizedText.includes(f.quote)),
  }
}

async function runAnalysis(text: string) {
  const provider = getAnalyzeProvider()
  for (let attempt = 0; attempt < 2; attempt++) {
    let output
    try {
      output = await provider.analyze({ text, entryPath: 'SELF_SUSPICION' })
    } catch {
      // 실제 LLM provider는 네트워크/API 오류로 예외를 던질 수 있다(mock은
      // 던지지 않았다). 스키마 검증 실패와 동일하게 다음 시도로 넘기고,
      // 그래도 안 되면 아래에서 null을 반환해 기존 AI_UNAVAILABLE 경로를
      // 그대로 탄다 — 여기서 새 에러 처리 경로를 만들지 않는다.
      continue
    }
    const cleaned = dropUnverifiableQuotes(output.result, text)
    const parsed = AnalysisResultSchema.safeParse(cleaned)
    if (parsed.success) {
      return { result: parsed.data, providerKind: output.providerKind, providerId: output.providerId }
    }
  }
  return null
}

// POST /api/analyze — §9-1 (AI-A).
export const POST = withApiErrorHandling(async (req: NextRequest) => {
  const raw = (await req.json().catch(() => null)) as Record<string, unknown> | null

  if (!raw || typeof raw.text !== 'string') {
    return NextResponse.json({ error: 'TEXT_EMPTY' }, { status: 400 })
  }

  const normalizedText = normalizeSituationText(raw.text)
  if (normalizedText.length === 0) {
    return NextResponse.json({ error: 'TEXT_EMPTY' }, { status: 400 })
  }
  if (normalizedText.length > MAX_SITUATION_TEXT_LENGTH) {
    return NextResponse.json({ error: 'TEXT_TOO_LONG' }, { status: 400 })
  }

  const entryPathParsed = EntryPathSchema.safeParse(raw.entry_path)
  if (!entryPathParsed.success) {
    return NextResponse.json({ error: 'INVALID_ENTRY_PATH' }, { status: 400 })
  }

  const db = getServerSupabaseClient()
  const guard = await requireValidSession(supabaseSessionsPort(db), raw.session_id)
  if (!guard.ok) {
    const { status, body } = sessionGuardErrorResponse(guard.error)
    return NextResponse.json(body, { status })
  }

  const analyzed = await runAnalysis(normalizedText)
  if (!analyzed) {
    return NextResponse.json({ error: 'AI_UNAVAILABLE', fallback: true }, { status: 503 })
  }
  const { result, providerKind, providerId } = analyzed

  if (result.is_out_of_scope) {
    return NextResponse.json({ error: 'OUT_OF_SCOPE' }, { status: 422 })
  }

  const riskLevel = computeRisk(result.states, result.case_code)
  const orderedStates = orderStates(result.states)
  const needsManual = result.confidence < CONFIDENCE_MANUAL_THRESHOLD

  await insertAnalysis(db, guard.session.id, {
    case_code: result.case_code,
    states: result.states,
    risk_level: riskLevel,
    confidence: result.confidence,
    source: 'ai',
  })

  return NextResponse.json({
    analysis: result,
    risk_level: riskLevel,
    ordered_states: orderedStates,
    needs_manual: needsManual,
    is_demo: providerKind === 'mock',
    provider_id: providerId,
  })
})

// GET /api/analyze?session_id=... — §9-1에 없던 추가 엔드포인트. 재진입/
// 새로고침 시 마지막 분석 결과를 다시 보여주기 위해 필요하다(발견된 문제로
// 별도 보고). session_analyses에는 원문·observed_facts가 저장되지 않으므로
// (원문 미저장 원칙) 재조회 시 observed_facts는 항상 빈 배열이다.
export const GET = withApiErrorHandling(async (req: NextRequest) => {
  const sessionId = req.nextUrl.searchParams.get('session_id')

  const formatCheck = SessionIdSchema.safeParse(sessionId)
  if (!formatCheck.success) {
    return NextResponse.json({ error: 'INVALID_SESSION_ID' }, { status: 400 })
  }

  const db = getServerSupabaseClient()
  const guard = await requireValidSession(supabaseSessionsPort(db), formatCheck.data)
  if (!guard.ok) {
    const { status, body } = sessionGuardErrorResponse(guard.error)
    return NextResponse.json(body, { status })
  }

  const analysis = await getLatestAnalysis(db, guard.session.id)
  if (!analysis) {
    return NextResponse.json({ error: 'ANALYSIS_NOT_FOUND' }, { status: 404 })
  }

  const result: AnalysisResult = {
    case_code: analysis.case_code,
    states: analysis.states,
    observed_facts: [],
    missing_info: [],
    confidence: analysis.confidence ?? 0,
    is_out_of_scope: false,
  }

  return NextResponse.json({
    analysis: result,
    risk_level: analysis.risk_level,
    ordered_states: orderStates(analysis.states),
    needs_manual: (analysis.confidence ?? 0) < CONFIDENCE_MANUAL_THRESHOLD,
    source: analysis.source,
  })
})
