import { beforeEach, describe, expect, it } from 'vitest'
import { getGuidanceSteps } from '@/lib/kb/playbook'
import { FakeSupabaseClient } from '../helpers/fake-db'
import type { SupabaseClient } from '@supabase/supabase-js'

// Phase 2 STEP 6: §5-3 Fallback 규칙 시나리오 A~E를 명시적으로 재현한다.
// 전부 합성 픽스처(TEST_ORG 등)이며 실제 금융기관 데이터가 아니다.

const db = new FakeSupabaseClient()

function insertDocument(sourceUrl: string, tier: 'T1' | 'T2' | 'T3') {
  const row = {
    source_org: 'TEST_ORG',
    source_url: sourceUrl,
    tier,
    title: 'test doc',
    collected_at: '2026-08-14',
  }
  const table = db.table('kb_documents')
  const inserted = { id: crypto.randomUUID(), ...row }
  table.rows.push(inserted)
  return inserted.id
}

function insertChunk(documentId: string, seq: number) {
  const inserted = { id: crypto.randomUUID(), document_id: documentId, seq, raw_text: 'chunk text' }
  db.table('kb_chunks').rows.push(inserted)
  return inserted.id
}

function insertStep(step: {
  step_id: string
  state_code: string
  seq: number
  kb_chunk_ids: string[]
  verified: boolean
}) {
  db.table('playbook_steps').rows.push({
    title: 't',
    why: null,
    contact_ids: [],
    triggers_deadline: false,
    deadline_rule: null,
    ...step,
  })
}

beforeEach(() => {
  db.reset()
})

describe('STEP 6 시나리오 A: 충분한 공식 데이터(T1, verified) → 실제 playbook 반환', () => {
  it('verified=true + T1 근거가 있으면 렌더링된다', async () => {
    const docId = insertDocument('https://example.go.kr/a', 'T1')
    const chunkId = insertChunk(docId, 1)
    insertStep({ step_id: 'PB_A_01', state_code: 'MONEY_SENT', seq: 1, kb_chunk_ids: [chunkId], verified: true })

    const steps = await getGuidanceSteps(db as unknown as SupabaseClient, ['MONEY_SENT'], {
      isProduction: true,
    })
    expect(steps).toHaveLength(1)
    expect(steps[0]?.step_id).toBe('PB_A_01')
    expect(steps[0]?.evidence).toHaveLength(1)
  })
})

describe('STEP 6 시나리오 B: 일부 데이터만 있는 경우 → 확인된 정보만 반환', () => {
  it('같은 state에 verified/unverified가 섞여 있으면 verified만 나온다(production)', async () => {
    const docId = insertDocument('https://example.go.kr/b', 'T1')
    const chunkId = insertChunk(docId, 1)
    insertStep({ step_id: 'PB_B_VERIFIED', state_code: 'MONEY_SENT', seq: 1, kb_chunk_ids: [chunkId], verified: true })
    insertStep({ step_id: 'PB_B_UNVERIFIED', state_code: 'MONEY_SENT', seq: 2, kb_chunk_ids: [chunkId], verified: false })

    const steps = await getGuidanceSteps(db as unknown as SupabaseClient, ['MONEY_SENT'], {
      isProduction: true,
    })
    expect(steps.map((s) => s.step_id)).toEqual(['PB_B_VERIFIED'])
  })
})

describe('STEP 6 시나리오 C: 공식 데이터가 전혀 없는 경우 → fallback(빈 배열)', () => {
  it('playbook_steps가 하나도 없으면 빈 배열을 반환한다', async () => {
    const steps = await getGuidanceSteps(db as unknown as SupabaseClient, ['MONEY_SENT'], {
      isProduction: false,
    })
    expect(steps).toEqual([])
  })
})

describe('STEP 6 시나리오 D: 출처가 불명확(T3뿐)한 경우 → production 안내에 쓰지 않음', () => {
  it('T3 청크뿐인 step은 production에서 제외된다', async () => {
    const docId = insertDocument('https://example.or.kr/d', 'T3')
    const chunkId = insertChunk(docId, 1)
    insertStep({ step_id: 'PB_D_01', state_code: 'MONEY_SENT', seq: 1, kb_chunk_ids: [chunkId], verified: true })

    const steps = await getGuidanceSteps(db as unknown as SupabaseClient, ['MONEY_SENT'], {
      isProduction: true,
    })
    expect(steps).toEqual([])
  })
})

describe('STEP 6 시나리오 E: CRITICAL 위험도(복합 피해) → 가장 되돌리기 어려운 행동이 먼저 노출', () => {
  it('MONEY_SENT이 APP_INSTALLED보다 먼저 나온다 (Rule Engine 우선순위)', async () => {
    const docId = insertDocument('https://example.go.kr/e', 'T1')
    const moneyChunk = insertChunk(docId, 1)
    const appChunk = insertChunk(docId, 2)
    insertStep({ step_id: 'PB_APP_01', state_code: 'APP_INSTALLED', seq: 1, kb_chunk_ids: [appChunk], verified: true })
    insertStep({ step_id: 'PB_MONEY_01', state_code: 'MONEY_SENT', seq: 1, kb_chunk_ids: [moneyChunk], verified: true })

    // orderStates(['APP_INSTALLED','MONEY_SENT'])는 이미 rules에서 검증됨 —
    // 여기서는 그 순서를 getGuidanceSteps에 그대로 넘겼을 때 실제 반환
    // 배열 순서까지 이어지는지 확인한다.
    const steps = await getGuidanceSteps(db as unknown as SupabaseClient, ['MONEY_SENT', 'APP_INSTALLED'], {
      isProduction: true,
    })
    expect(steps.map((s) => s.step_id)).toEqual(['PB_MONEY_01', 'PB_APP_01'])
  })
})

describe('STEP 9: hallucinated contact 정보 차단 (구조적 방지)', () => {
  it('channels는 오직 contact_registry(contact_ids)에서만 오고, title/why는 AI가 손대지 않은 원문 그대로다', async () => {
    const docId = insertDocument('https://example.go.kr/f', 'T1')
    const chunkId = insertChunk(docId, 1)
    const contact = { id: crypto.randomUUID(), label: '테스트센터', type: 'PHONE', value: '000-000-0000', source_org: 'TEST_ORG', active: true }
    db.table('contact_registry').rows.push(contact)
    db.table('playbook_steps').rows.push({
      step_id: 'PB_G_01',
      state_code: 'MONEY_SENT',
      seq: 1,
      title: '원본 제목 그대로',
      why: '원본 이유 그대로',
      kb_chunk_ids: [chunkId],
      contact_ids: [contact.id],
      triggers_deadline: false,
      deadline_rule: null,
      verified: true,
    })

    const steps = await getGuidanceSteps(db as unknown as SupabaseClient, ['MONEY_SENT'], {
      isProduction: true,
    })
    // AI-B(문장 재작성)는 Phase 6 범위라 아직 없다 — 즉 지금 guidance가
    // 반환하는 title/why는 DB 원문 그대로이고, 이 경로에서 AI가 번호를
    // "만들어낼" 여지가 구조적으로 없다.
    expect(steps[0]?.title).toBe('원본 제목 그대로')
    expect(steps[0]?.why).toBe('원본 이유 그대로')
    expect(steps[0]?.channels).toEqual([
      { label: '테스트센터', type: 'PHONE', value: '000-000-0000', source_org: 'TEST_ORG' },
    ])
  })
})
