import { randomUUID } from 'node:crypto'
import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

interface FakeSessionRow {
  id: string
  entry_path: string | null
  created_at: string
  expires_at: string
}

const store = new Map<string, FakeSessionRow>()

function makeRow(overrides: Partial<FakeSessionRow> = {}): FakeSessionRow {
  return {
    id: randomUUID(),
    entry_path: null,
    created_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    ...overrides,
  }
}

// lib/db/client는 실제 Supabase에 연결하므로, 라우트 테스트는 이 모듈만
// 가짜로 바꿔치기한다 — route/session-guard/session-repo 로직 자체는
// 실제 코드 그대로 실행된다.
vi.mock('@/lib/db/client', () => ({
  getServerSupabaseClient: () => ({
    from(table: string) {
      if (table !== 'sessions') throw new Error(`fake client: unexpected table ${table}`)
      return {
        insert() {
          return {
            select() {
              return {
                async single() {
                  const row = makeRow()
                  store.set(row.id, row)
                  return { data: { id: row.id }, error: null }
                },
              }
            },
          }
        },
        select() {
          return {
            eq(_col: string, val: string) {
              return {
                async maybeSingle() {
                  return { data: store.get(val) ?? null, error: null }
                },
              }
            },
          }
        },
        update(payload: Partial<FakeSessionRow>) {
          return {
            eq(_col: string, val: string) {
              const row = store.get(val)
              if (row) Object.assign(row, payload)
              return Promise.resolve({ error: row ? null : { message: 'not found' } })
            },
          }
        },
      }
    },
  }),
}))

const { POST, PATCH, GET } = await import('@/app/api/session/route')

beforeEach(() => {
  store.clear()
})

describe('POST /api/session', () => {
  it('정상적으로 세션을 생성한다', async () => {
    const res = await POST()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.session_id).toBeTruthy()
    expect(store.has(body.session_id)).toBe(true)
  })
})

describe('PATCH /api/session', () => {
  function patchReq(body: unknown) {
    return new NextRequest('http://localhost/api/session', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
  }

  it('잘못된 request body(entry_path 없음)는 400 INVALID_ENTRY_PATH', async () => {
    const row = makeRow()
    store.set(row.id, row)
    const res = await PATCH(patchReq({ session_id: row.id }))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('INVALID_ENTRY_PATH')
  })

  it('entry_path가 enum에 없는 값이면 400', async () => {
    const row = makeRow()
    store.set(row.id, row)
    const res = await PATCH(patchReq({ session_id: row.id, entry_path: 'NOT_A_PATH' }))
    expect(res.status).toBe(400)
  })

  it('잘못된 형식의 session_id는 400 (§9-1은 이 엔드포인트에 대해 INVALID_ENTRY_PATH/SESSION_NOT_FOUND만 정의하므로, 스키마 파싱 실패는 통합된 INVALID_ENTRY_PATH로 응답한다)', async () => {
    const res = await PATCH(patchReq({ session_id: 'not-a-uuid', entry_path: 'SELF_SUSPICION' }))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('INVALID_ENTRY_PATH')
  })

  it('존재하지 않는 session_id는 404 SESSION_NOT_FOUND', async () => {
    const res = await PATCH(patchReq({ session_id: randomUUID(), entry_path: 'SELF_SUSPICION' }))
    expect(res.status).toBe(404)
    expect((await res.json()).error).toBe('SESSION_NOT_FOUND')
  })

  it('만료된 session_id는 404 SESSION_EXPIRED', async () => {
    const row = makeRow({ expires_at: new Date(Date.now() - 1000).toISOString() })
    store.set(row.id, row)
    const res = await PATCH(patchReq({ session_id: row.id, entry_path: 'SELF_SUSPICION' }))
    expect(res.status).toBe(404)
    expect((await res.json()).error).toBe('SESSION_EXPIRED')
  })

  it('정상 요청은 entry_path를 갱신한다', async () => {
    const row = makeRow()
    store.set(row.id, row)
    const res = await PATCH(patchReq({ session_id: row.id, entry_path: 'ALREADY_SENT' }))
    expect(res.status).toBe(200)
    expect(store.get(row.id)?.entry_path).toBe('ALREADY_SENT')
  })
})

describe('GET /api/session', () => {
  it('session_id 쿼리 파라미터가 없으면 400', async () => {
    const res = await GET(new NextRequest('http://localhost/api/session'))
    expect(res.status).toBe(400)
  })

  it('다른(존재하지 않는) session_id로는 절대 조회할 수 없다', async () => {
    const mine = makeRow()
    store.set(mine.id, mine)
    const someoneElsesGuess = randomUUID()
    const res = await GET(
      new NextRequest(`http://localhost/api/session?session_id=${someoneElsesGuess}`)
    )
    expect(res.status).toBe(404)
  })

  it('자신의 session_id로는 정상 조회된다', async () => {
    const row = makeRow({ entry_path: 'BANK_CALL' })
    store.set(row.id, row)
    const res = await GET(new NextRequest(`http://localhost/api/session?session_id=${row.id}`))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.session_id).toBe(row.id)
    expect(body.entry_path).toBe('BANK_CALL')
  })
})
