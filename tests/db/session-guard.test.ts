import { describe, expect, it } from 'vitest'
import {
  requireValidSession,
  sessionGuardErrorResponse,
  type SessionRow,
  type SessionsPort,
} from '@/lib/db/session-guard'

const VALID_ID = '11111111-1111-4111-8111-111111111111'
const OTHER_ID = '22222222-2222-4222-8222-222222222222'

function fakePort(rows: SessionRow[]): SessionsPort {
  return {
    async getById(id) {
      return rows.find((r) => r.id === id) ?? null
    },
  }
}

function futureSession(id: string): SessionRow {
  return {
    id,
    entry_path: null,
    created_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 1000 * 60 * 60).toISOString(),
  }
}

function expiredSession(id: string): SessionRow {
  return {
    id,
    entry_path: null,
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 24 * 8).toISOString(),
    expires_at: new Date(Date.now() - 1000).toISOString(),
  }
}

describe('requireValidSession', () => {
  it('형식이 잘못된 session_id는 DB를 조회하지 않고 거부한다', async () => {
    let called = false
    const port: SessionsPort = {
      async getById() {
        called = true
        return null
      },
    }
    const result = await requireValidSession(port, 'not-a-uuid')
    expect(result).toEqual({ ok: false, error: 'INVALID_SESSION_ID' })
    expect(called).toBe(false)
  })

  it('null/undefined session_id도 INVALID_SESSION_ID', async () => {
    const port = fakePort([])
    expect((await requireValidSession(port, null)).ok).toBe(false)
    expect((await requireValidSession(port, undefined)).ok).toBe(false)
  })

  it('존재하지 않는 session_id는 SESSION_NOT_FOUND', async () => {
    const port = fakePort([futureSession(VALID_ID)])
    const result = await requireValidSession(port, OTHER_ID)
    expect(result).toEqual({ ok: false, error: 'SESSION_NOT_FOUND' })
  })

  it('만료된 session_id는 SESSION_EXPIRED', async () => {
    const port = fakePort([expiredSession(VALID_ID)])
    const result = await requireValidSession(port, VALID_ID)
    expect(result).toEqual({ ok: false, error: 'SESSION_EXPIRED' })
  })

  it('유효한 session_id는 통과하고 세션 정보를 반환한다', async () => {
    const session = futureSession(VALID_ID)
    const port = fakePort([session])
    const result = await requireValidSession(port, VALID_ID)
    expect(result).toEqual({ ok: true, session })
  })

  it('다른 세션의 존재를 추측해 넣어도 자신의 세션이 아니면 절대 통과하지 않는다', async () => {
    const port = fakePort([futureSession(VALID_ID)])
    // 공격 시나리오: 다른(존재하는) session_id를 넣어도 소유하지 않은 세션이면
    // 이 포트만으로는 "존재"와 "소유"를 구분하지 않는다 — 그래서 session_id
    // 자체가 유일한 접근 키(캡세이빌리티)라는 설계를 뒷받침한다: 진짜 UUID를
    // 모르면 애초에 SESSION_NOT_FOUND로 막힌다.
    const result = await requireValidSession(port, OTHER_ID)
    expect(result.ok).toBe(false)
  })
})

describe('sessionGuardErrorResponse', () => {
  it('INVALID_SESSION_ID는 400', () => {
    expect(sessionGuardErrorResponse('INVALID_SESSION_ID').status).toBe(400)
  })
  it('SESSION_NOT_FOUND는 404', () => {
    expect(sessionGuardErrorResponse('SESSION_NOT_FOUND').status).toBe(404)
  })
  it('SESSION_EXPIRED는 404', () => {
    expect(sessionGuardErrorResponse('SESSION_EXPIRED').status).toBe(404)
  })
})
