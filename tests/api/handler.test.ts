import { describe, expect, it, vi } from 'vitest'
import { NextResponse } from 'next/server'
import { withApiErrorHandling } from '@/lib/api/handler'
import { DbNotConfiguredError } from '@/lib/db/client'

describe('withApiErrorHandling (STEP 9: DB unavailable / 서버 오류 상태)', () => {
  it('DbNotConfiguredError는 503 DB_UNAVAILABLE로 변환된다', async () => {
    const handler = withApiErrorHandling(async () => {
      throw new DbNotConfiguredError()
    })
    const res = await handler()
    expect(res.status).toBe(503)
    expect(await res.json()).toEqual({ error: 'DB_UNAVAILABLE' })
  })

  it('예상치 못한 에러는 500 INTERNAL_ERROR로 변환되고 스택트레이스를 응답에 담지 않는다', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const handler = withApiErrorHandling(async () => {
      throw new Error('민감한 내부 정보가 담긴 에러 메시지')
    })
    const res = await handler()
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body).toEqual({ error: 'INTERNAL_ERROR' })
    expect(JSON.stringify(body)).not.toContain('민감한')
    consoleSpy.mockRestore()
  })

  it('정상 응답은 그대로 통과시킨다', async () => {
    const handler = withApiErrorHandling(async () => NextResponse.json({ ok: true }))
    const res = await handler()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
  })
})
