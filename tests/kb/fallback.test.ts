import { describe, expect, it } from 'vitest'
import { isStepRenderable } from '@/lib/kb/playbook'
import type { PlaybookStepRecord, KbChunkRecord } from '@/lib/kb/query'

function step(overrides: Partial<PlaybookStepRecord> = {}): PlaybookStepRecord {
  return {
    step_id: 'PB_TEST_01',
    state_code: 'MONEY_SENT',
    seq: 1,
    title: 't',
    why: null,
    kb_chunk_ids: ['chunk-1'],
    contact_ids: [],
    triggers_deadline: false,
    deadline_rule: null,
    verified: true,
    ...overrides,
  }
}

function chunk(id: string, tier: KbChunkRecord['tier']): KbChunkRecord {
  return { id, raw_text: 'text', source_org: 'org', source_url: 'https://example.go.kr', tier, collected_at: '2026-01-01' }
}

describe('isStepRenderable (§5-3 Fallback 규칙)', () => {
  it('verified=false + production이면 렌더링하지 않는다', () => {
    const chunks = new Map([['chunk-1', chunk('chunk-1', 'T1')]])
    expect(isStepRenderable(step({ verified: false }), chunks, true)).toBe(false)
  })

  it('verified=false + non-production이면 렌더링한다', () => {
    const chunks = new Map([['chunk-1', chunk('chunk-1', 'T1')]])
    expect(isStepRenderable(step({ verified: false }), chunks, false)).toBe(true)
  })

  it('kb_chunk_ids가 비어있으면 렌더링하지 않는다', () => {
    const chunks = new Map<string, KbChunkRecord>()
    expect(isStepRenderable(step({ kb_chunk_ids: [] }), chunks, false)).toBe(false)
  })

  it('연결된 청크가 T3뿐이면 렌더링하지 않는다', () => {
    const chunks = new Map([['chunk-1', chunk('chunk-1', 'T3')]])
    expect(isStepRenderable(step(), chunks, false)).toBe(false)
  })

  it('T1/T2가 하나라도 있으면 렌더링한다 (T3와 섞여 있어도)', () => {
    const chunks = new Map([
      ['chunk-1', chunk('chunk-1', 'T3')],
      ['chunk-2', chunk('chunk-2', 'T1')],
    ])
    expect(isStepRenderable(step({ kb_chunk_ids: ['chunk-1', 'chunk-2'] }), chunks, true)).toBe(true)
  })

  it('kb_chunk_ids가 가리키는 청크가 실제로 존재하지 않으면 렌더링하지 않는다', () => {
    const chunks = new Map<string, KbChunkRecord>()
    expect(isStepRenderable(step({ kb_chunk_ids: ['missing'] }), chunks, false)).toBe(false)
  })

  it('현재 KB 데이터가 전혀 없는 상태를 재현: 항상 false가 되어 guidance가 fallback으로 빠진다', () => {
    const chunks = new Map<string, KbChunkRecord>()
    expect(isStepRenderable(step({ verified: true, kb_chunk_ids: [] }), chunks, false)).toBe(false)
  })
})
