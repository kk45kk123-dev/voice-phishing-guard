import { NextResponse, type NextRequest } from 'next/server'
import { getServerSupabaseClient } from '@/lib/db/client'
import {
  requireValidSession,
  sessionGuardErrorResponse,
  supabaseSessionsPort,
} from '@/lib/db/session-guard'
import { PatchSessionRequestSchema, SessionIdSchema } from '@/lib/schemas/session'
import { withApiErrorHandling } from '@/lib/api/handler'

export const dynamic = 'force-dynamic'

// POST /api/session — §9-1. 익명 세션 생성.
export const POST = withApiErrorHandling(async () => {
  const db = getServerSupabaseClient()
  const { data, error } = await db.from('sessions').insert({}).select('id').single()
  if (error || !data) {
    return NextResponse.json({ error: 'SESSION_CREATE_FAILED' }, { status: 500 })
  }
  return NextResponse.json({ session_id: data.id })
})

// PATCH /api/session — §9-1. entry_path 기록.
export const PATCH = withApiErrorHandling(async (req: NextRequest) => {
  const parsed = PatchSessionRequestSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'INVALID_ENTRY_PATH' }, { status: 400 })
  }

  const db = getServerSupabaseClient()
  const guard = await requireValidSession(supabaseSessionsPort(db), parsed.data.session_id)
  if (!guard.ok) {
    const { status, body } = sessionGuardErrorResponse(guard.error)
    return NextResponse.json(body, { status })
  }

  const { error } = await db
    .from('sessions')
    .update({ entry_path: parsed.data.entry_path })
    .eq('id', guard.session.id)
  if (error) {
    return NextResponse.json({ error: 'SESSION_CREATE_FAILED' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
})

// GET /api/session?session_id=... — §9-1에 없던 추가 엔드포인트.
// 새로고침/재진입 시 화면이 어느 단계를 보여줘야 하는지 판단하려면
// 클라이언트가 세션 상태를 다시 읽어올 방법이 필요하다(AC-1: "새로고침
// 후에도 세션 유지"). 사유는 최종 보고서 "발견된 문제"에 기록한다.
export const GET = withApiErrorHandling(async (req: NextRequest) => {
  const sessionId = req.nextUrl.searchParams.get('session_id')

  // 형식 검증은 DB 없이 먼저 끝낸다 — 잘못된 session_id로 인한 400 응답이
  // DB 연결 여부에 좌우되지 않도록 한다.
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

  return NextResponse.json({
    session_id: guard.session.id,
    entry_path: guard.session.entry_path,
    created_at: guard.session.created_at,
    expires_at: guard.session.expires_at,
  })
})
