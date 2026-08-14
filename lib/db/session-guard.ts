import type { SupabaseClient } from '@supabase/supabase-js'
import { SessionIdSchema } from '@/lib/schemas/session'

export interface SessionRow {
  id: string
  entry_path: string | null
  created_at: string
  expires_at: string
}

// 실제 DB I/O는 이 좁은 포트 뒤에 숨긴다 — 테스트에서 Supabase 전체를 흉내 낼
// 필요 없이 이 인터페이스만 구현하는 가짜 객체를 주입할 수 있다.
export interface SessionsPort {
  getById(id: string): Promise<SessionRow | null>
}

export function supabaseSessionsPort(db: SupabaseClient): SessionsPort {
  return {
    async getById(id) {
      const { data, error } = await db
        .from('sessions')
        .select('id, entry_path, created_at, expires_at')
        .eq('id', id)
        .maybeSingle()
      if (error) throw error
      return data as SessionRow | null
    },
  }
}

export type SessionGuardError = 'INVALID_SESSION_ID' | 'SESSION_NOT_FOUND' | 'SESSION_EXPIRED'

export type SessionGuardResult =
  | { ok: true; session: SessionRow }
  | { ok: false; error: SessionGuardError }

// 모든 세션 관련 API가 거쳐야 하는 단 하나의 검증 지점.
// (1) UUID 형식 (2) 존재 여부 (3) 만료 여부 를 이 순서로 확인한다.
export async function requireValidSession(
  port: SessionsPort,
  sessionId: unknown
): Promise<SessionGuardResult> {
  const parsed = SessionIdSchema.safeParse(sessionId)
  if (!parsed.success) {
    return { ok: false, error: 'INVALID_SESSION_ID' }
  }

  const session = await port.getById(parsed.data)
  if (!session) {
    return { ok: false, error: 'SESSION_NOT_FOUND' }
  }

  if (new Date(session.expires_at).getTime() < Date.now()) {
    return { ok: false, error: 'SESSION_EXPIRED' }
  }

  return { ok: true, session }
}

// 세션 관련 route handler들이 동일한 에러를 동일한 상태코드/바디로 응답하도록
// 강제한다. §9-1은 PATCH /api/session에 대해서만 404 SESSION_NOT_FOUND를
// 정의했다 — 다른 세션 스코프 API들과 SESSION_EXPIRED 케이스는 여기서 일관된
// 규칙으로 확장한 것이며, 이는 §9-1에 없던 결정이라 별도로 보고한다.
export function sessionGuardErrorResponse(
  error: SessionGuardError
): { status: number; body: { error: SessionGuardError } } {
  switch (error) {
    case 'INVALID_SESSION_ID':
      return { status: 400, body: { error } }
    case 'SESSION_NOT_FOUND':
    case 'SESSION_EXPIRED':
      return { status: 404, body: { error } }
  }
}
