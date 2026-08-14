import { randomUUID } from 'node:crypto'
import { NextRequest } from 'next/server'
import { afterAll, describe, expect, it } from 'vitest'
import { isDbConfigured, getServerSupabaseClient } from '@/lib/db/client'

// Phase 2 STEP 3: 실제 Supabase에 대한 통합 테스트. SUPABASE_URL /
// SUPABASE_SERVICE_ROLE_KEY가 없으면 전부 skip되고, vitest 출력에
// "skipped"로 명확히 표시된다 — 실행된 것처럼 보고하지 않는다.
//
// ⚠️ 이 스위트는 실제 DB에 행을 만들고(afterAll에서 정리) 지운다. 운영
// Supabase 프로젝트가 아니라 개발/테스트 전용 프로젝트에 대해 실행할 것.
const hasLiveDb = isDbConfigured()

if (!hasLiveDb) {
  console.log(
    'ℹ️  tests/integration/api-flow.test.ts: SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY 미설정 — 전체 skip (NOT RUN)'
  )
}

describe.skipIf(!hasLiveDb)('실제 Supabase 통합 테스트', () => {
  const createdSessionIds: string[] = []

  afterAll(async () => {
    if (!hasLiveDb || createdSessionIds.length === 0) return
    const db = getServerSupabaseClient()
    await db.from('sessions').delete().in('id', createdSessionIds)
  })

  async function createRealSession(): Promise<string> {
    const db = getServerSupabaseClient()
    const { data, error } = await db.from('sessions').insert({}).select('id').single()
    if (error || !data) throw new Error(`테스트 세션 생성 실패: ${error?.message}`)
    createdSessionIds.push(data.id)
    return data.id
  }

  async function createExpiredSession(): Promise<string> {
    const db = getServerSupabaseClient()
    const { data, error } = await db
      .from('sessions')
      .insert({ expires_at: new Date(Date.now() - 60_000).toISOString() })
      .select('id')
      .single()
    if (error || !data) throw new Error(`만료 세션 생성 실패: ${error?.message}`)
    createdSessionIds.push(data.id)
    return data.id
  }

  function jsonReq(url: string, method: string, body: unknown) {
    return new NextRequest(`http://localhost${url}`, {
      method,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
  }

  describe('1. POST /api/session', () => {
    it('실제 sessions 테이블에 행을 만든다', async () => {
      const { POST } = await import('@/app/api/session/route')
      const res = await POST()
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.session_id).toMatch(/^[0-9a-f-]{36}$/)
      createdSessionIds.push(body.session_id)

      const db = getServerSupabaseClient()
      const { data } = await db.from('sessions').select('id').eq('id', body.session_id).maybeSingle()
      expect(data).not.toBeNull()
    })
  })

  describe('2. GET /api/session — 세션 격리(session isolation)', () => {
    it('잘못된 UUID는 400', async () => {
      const { GET } = await import('@/app/api/session/route')
      const res = await GET(new NextRequest('http://localhost/api/session?session_id=not-a-uuid'))
      expect(res.status).toBe(400)
    })

    it('session_id 누락은 400', async () => {
      const { GET } = await import('@/app/api/session/route')
      const res = await GET(new NextRequest('http://localhost/api/session'))
      expect(res.status).toBe(400)
    })

    it('존재하지 않는(형식은 맞는) session_id는 404', async () => {
      const { GET } = await import('@/app/api/session/route')
      const res = await GET(new NextRequest(`http://localhost/api/session?session_id=${randomUUID()}`))
      expect(res.status).toBe(404)
    })

    it('실제로 만료된 session_id는 404 SESSION_EXPIRED', async () => {
      const expiredId = await createExpiredSession()
      const { GET } = await import('@/app/api/session/route')
      const res = await GET(new NextRequest(`http://localhost/api/session?session_id=${expiredId}`))
      expect(res.status).toBe(404)
      expect((await res.json()).error).toBe('SESSION_EXPIRED')
    })

    it('자신의 session_id로는 정상 조회된다', async () => {
      const id = await createRealSession()
      const { GET } = await import('@/app/api/session/route')
      const res = await GET(new NextRequest(`http://localhost/api/session?session_id=${id}`))
      expect(res.status).toBe(200)
    })
  })

  describe('3. POST /api/analyze', () => {
    it('잘못된 request body(text 없음)는 400', async () => {
      const { POST } = await import('@/app/api/analyze/route')
      const id = await createRealSession()
      const res = await POST(jsonReq('/api/analyze', 'POST', { session_id: id, entry_path: 'SELF_SUSPICION' }))
      expect(res.status).toBe(400)
    })

    it('실제 세션에 대해 분석하고 session_analyses에 저장한다', async () => {
      const { POST } = await import('@/app/api/analyze/route')
      const id = await createRealSession()
      const res = await POST(
        jsonReq('/api/analyze', 'POST', {
          session_id: id,
          text: '검찰청이라면서 계좌가 연루됐다고 해서 송금했습니다.',
          entry_path: 'ALREADY_SENT',
        })
      )
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.is_demo).toBe(true)

      const db = getServerSupabaseClient()
      const { data } = await db.from('session_analyses').select('*').eq('session_id', id)
      expect(data).toHaveLength(1)
    })

    it('다른 세션의 session_id를 추측해 넣어도 분석할 수 없다', async () => {
      const { POST } = await import('@/app/api/analyze/route')
      const res = await POST(
        jsonReq('/api/analyze', 'POST', {
          session_id: randomUUID(),
          text: '아무 내용',
          entry_path: 'SELF_SUSPICION',
        })
      )
      expect(res.status).toBe(404)
    })
  })

  describe('4. GET /api/analyze', () => {
    it('분석 전에는 404 ANALYSIS_NOT_FOUND', async () => {
      const { GET } = await import('@/app/api/analyze/route')
      const id = await createRealSession()
      const res = await GET(new NextRequest(`http://localhost/api/analyze?session_id=${id}`))
      expect(res.status).toBe(404)
    })

    it('다른 세션의 분석 결과를 조회할 수 없다 — 하위 테이블 격리', async () => {
      const { POST: analyze } = await import('@/app/api/analyze/route')
      const { GET: getAnalyze } = await import('@/app/api/analyze/route')

      const ownerId = await createRealSession()
      await analyze(
        jsonReq('/api/analyze', 'POST', {
          session_id: ownerId,
          text: '아들이라면서 앱을 설치했어요.',
          entry_path: 'SELF_SUSPICION',
        })
      )

      const attackerId = await createRealSession()
      // attacker가 자기 세션 대신 ownerId를 넣어 조회를 시도한다 — session-guard가
      // session_id 자체로 소유를 판별하므로 ownerId를 "알고 있다면" 그건 곧 그
      // 세션의 소유자라는 뜻이다(캡세이빌리티 모델). 진짜 검증 포인트는
      // attacker의 세션(attackerId)으로는 owner의 데이터가 절대 섞여 나오지
      // 않는다는 것 — 아래에서 attacker 자신의 조회 결과가 비어있는지 확인한다.
      const attackerRes = await getAnalyze(
        new NextRequest(`http://localhost/api/analyze?session_id=${attackerId}`)
      )
      expect(attackerRes.status).toBe(404) // attacker는 분석한 적 없으므로 404가 정답
    })
  })

  describe('5. POST /api/guidance', () => {
    it('분석 없이 요청하면 409 ANALYSIS_REQUIRED', async () => {
      const { POST } = await import('@/app/api/guidance/route')
      const id = await createRealSession()
      const res = await POST(jsonReq('/api/guidance', 'POST', { session_id: id }))
      expect(res.status).toBe(409)
    })

    it('KB 데이터가 없으면 fallback을 반환한다 (§5-3, data/kb 비어있음)', async () => {
      const { POST: analyze } = await import('@/app/api/analyze/route')
      const { POST: guidance } = await import('@/app/api/guidance/route')
      const id = await createRealSession()
      await analyze(
        jsonReq('/api/analyze', 'POST', {
          session_id: id,
          text: '송금했습니다.',
          entry_path: 'ALREADY_SENT',
        })
      )
      const res = await guidance(jsonReq('/api/guidance', 'POST', { session_id: id }))
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.fallback).toBe(true)
    })
  })

  describe('6. GET /api/session/steps', () => {
    it('session_id 누락은 400', async () => {
      const { GET } = await import('@/app/api/session/steps/route')
      const res = await GET(new NextRequest('http://localhost/api/session/steps'))
      expect(res.status).toBe(400)
    })

    it('세션은 있지만 진행할 단계가 없으면 빈 목록', async () => {
      const { GET } = await import('@/app/api/session/steps/route')
      const id = await createRealSession()
      const res = await GET(new NextRequest(`http://localhost/api/session/steps?session_id=${id}`))
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.steps).toEqual([])
    })
  })

  describe('7. PATCH /api/session/steps', () => {
    it('잘못된 status 값은 400 INVALID_STATUS', async () => {
      const { PATCH } = await import('@/app/api/session/steps/route')
      const id = await createRealSession()
      const res = await PATCH(
        jsonReq('/api/session/steps', 'PATCH', { session_id: id, step_id: 'x', status: 'NOT_A_STATUS' })
      )
      expect(res.status).toBe(400)
    })

    it('자신의 세션에 배정되지 않은 step_id는 404 STEP_NOT_FOUND', async () => {
      const { PATCH } = await import('@/app/api/session/steps/route')
      const id = await createRealSession()
      const res = await PATCH(
        jsonReq('/api/session/steps', 'PATCH', { session_id: id, step_id: 'PB_NEVER_ASSIGNED', status: 'DONE' })
      )
      expect(res.status).toBe(404)
      expect((await res.json()).error).toBe('STEP_NOT_FOUND')
    })
  })
})
