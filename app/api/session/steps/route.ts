import { NextResponse, type NextRequest } from 'next/server'
import { getServerSupabaseClient } from '@/lib/db/client'
import {
  requireValidSession,
  sessionGuardErrorResponse,
  supabaseSessionsPort,
} from '@/lib/db/session-guard'
import {
  getSessionStep,
  listSessionSteps,
  updateSessionStepStatus,
} from '@/lib/db/session-repo'
import { fetchPlaybookStepTitles } from '@/lib/kb/query'
import { PatchStepRequestSchema } from '@/lib/schemas/steps'
import { SessionIdSchema } from '@/lib/schemas/session'
import { withApiErrorHandling } from '@/lib/api/handler'

export const dynamic = 'force-dynamic'

// GET /api/session/steps?session_id=... — §9-1에 없던 추가 엔드포인트.
// 골든타임 화면(S9)이 진행 상태를 복원하려면 필요하다(발견된 문제로 별도 보고).
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

  const steps = await listSessionSteps(db, guard.session.id)
  const titles = await fetchPlaybookStepTitles(db, steps.map((s) => s.step_id))
  const enriched = steps.map((s) => ({ ...s, title: titles.get(s.step_id) ?? s.step_id }))
  const done = steps.filter((s) => s.status === 'DONE').length

  return NextResponse.json({ steps: enriched, progress: { done, total: steps.length } })
})

// PATCH /api/session/steps — §9-1.
export const PATCH = withApiErrorHandling(async (req: NextRequest) => {
  const raw = await req.json().catch(() => null)
  const parsed = PatchStepRequestSchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: 'INVALID_STATUS' }, { status: 400 })
  }

  const db = getServerSupabaseClient()
  const guard = await requireValidSession(supabaseSessionsPort(db), parsed.data.session_id)
  if (!guard.ok) {
    const { status, body } = sessionGuardErrorResponse(guard.error)
    return NextResponse.json(body, { status })
  }

  // step_id가 실제로 "이 세션"에 배정된 것인지 확인한다 — 다른 세션에서 만든
  // step_id를 추측해 넣어도 세션 스코프 밖이면 갱신할 수 없다.
  const existing = await getSessionStep(db, guard.session.id, parsed.data.step_id)
  if (!existing) {
    return NextResponse.json({ error: 'STEP_NOT_FOUND' }, { status: 404 })
  }

  await updateSessionStepStatus(db, guard.session.id, parsed.data.step_id, parsed.data.status)

  const steps = await listSessionSteps(db, guard.session.id)
  const done = steps.filter((s) => s.status === 'DONE').length

  return NextResponse.json({ ok: true, progress: { done, total: steps.length } })
})
