import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { FakeSupabaseClient } from '../helpers/fake-db'

// DEV_SPEC.md §10 Phase 10은 "복합 피해 시나리오 S0→S11 완주"를 Playwright류
// 브라우저 E2E로 상정하지만, §8-1이 채택한 테스트 도구는 Vitest뿐이다
// (package.json에 별도 브라우저 E2E 러너를 추가하지 않음, Phase 1 범위 밖).
// 그래서 여기서는 실제 route handler들을 순서대로 호출하는 Vitest 기반
// "체인 테스트"로 흐름을 검증한다 — 브라우저는 아니지만 세션 생성부터
// 단계 조회까지 실제 서버 로직이 실제로 이어지는지 확인한다.

const fakeDb = new FakeSupabaseClient()

vi.mock('@/lib/db/client', () => ({
  getServerSupabaseClient: () => fakeDb,
}))

const { POST: createSession, PATCH: patchSession } = await import('@/app/api/session/route')
const { POST: analyze } = await import('@/app/api/analyze/route')
const { POST: guidance } = await import('@/app/api/guidance/route')
const { GET: getSteps } = await import('@/app/api/session/steps/route')

beforeEach(() => {
  fakeDb.reset()
})

function jsonReq(url: string, method: string, body: unknown) {
  return new NextRequest(`http://localhost${url}`, {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('핵심 사용자 흐름: 세션 생성 → 진입경로 → 분석 → 가이던스 → 단계 조회', () => {
  it('복합 피해(송금+앱설치) 시나리오가 끝까지 이어진다', async () => {
    // S0→S1: 세션 생성
    const createRes = await createSession()
    expect(createRes.status).toBe(200)
    const { session_id: sessionId } = await createRes.json()
    expect(sessionId).toBeTruthy()

    // S1: 진입 경로 선택
    const patchRes = await patchSession(
      jsonReq('/api/session', 'PATCH', { session_id: sessionId, entry_path: 'ALREADY_SENT' })
    )
    expect(patchRes.status).toBe(200)

    // S2→S3/S4/S5: 상황 분석 (mock AI, 복합 피해 문구)
    const analyzeRes = await analyze(
      jsonReq('/api/analyze', 'POST', {
        session_id: sessionId,
        text: '검찰청이라면서 계좌가 연루됐다고 해서 앱을 설치했고 500만원을 송금했습니다.',
        entry_path: 'ALREADY_SENT',
      })
    )
    expect(analyzeRes.status).toBe(200)
    const analyzeBody = await analyzeRes.json()
    expect(analyzeBody.is_demo).toBe(true) // mock임을 숨기지 않는다
    expect(analyzeBody.analysis.states.length).toBeGreaterThanOrEqual(2) // 복합 피해
    expect(analyzeBody.risk_level).toBe('CRITICAL') // MONEY_SENT 포함 → CRITICAL

    // S6→S7: 행동요령 — 아직 KB 데이터가 없으므로 반드시 fallback이어야 한다
    const guidanceRes = await guidance(
      jsonReq('/api/guidance', 'POST', { session_id: sessionId })
    )
    expect(guidanceRes.status).toBe(200)
    const guidanceBody = await guidanceRes.json()
    expect(guidanceBody.fallback).toBe(true)
    expect(guidanceBody.risk_level).toBe('CRITICAL')

    // S9: 단계 조회 — 세션 스텝이 아직 없으므로 빈 목록이어야 한다(가이던스 없음 상태)
    const stepsRes = await getSteps(
      new NextRequest(`http://localhost/api/session/steps?session_id=${sessionId}`)
    )
    expect(stepsRes.status).toBe(200)
    const stepsBody = await stepsRes.json()
    expect(stepsBody.steps).toEqual([])
    expect(stepsBody.progress).toEqual({ done: 0, total: 0 })
  })

  it('세션이 없으면 분석 단계에서 막힌다 (다른 세션 id 추측 방지)', async () => {
    const analyzeRes = await analyze(
      jsonReq('/api/analyze', 'POST', {
        session_id: '00000000-0000-4000-8000-000000000000',
        text: '아무 상황',
        entry_path: 'SELF_SUSPICION',
      })
    )
    expect(analyzeRes.status).toBe(404)
  })

  it('분석 없이 가이던스를 요청하면 409 ANALYSIS_REQUIRED', async () => {
    const createRes = await createSession()
    const { session_id: sessionId } = await createRes.json()
    const guidanceRes = await guidance(
      jsonReq('/api/guidance', 'POST', { session_id: sessionId })
    )
    expect(guidanceRes.status).toBe(409)
    expect((await guidanceRes.json()).error).toBe('ANALYSIS_REQUIRED')
  })
})
