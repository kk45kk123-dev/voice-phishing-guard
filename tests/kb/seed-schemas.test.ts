import { describe, expect, it } from 'vitest'
import {
  ContactSeedSchema,
  ContactsFileSchema,
  KbDocumentMetaSchema,
  PlaybookFileSchema,
  findDuplicateContacts,
  splitIntoChunks,
  validateChunkLengths,
  MAX_CHUNK_LENGTH,
  type ContactSeed,
} from '@/lib/kb/seed-schemas'

// 아래 값들은 전부 합성 테스트 픽스처다 — 실제 금융기관 연락처/절차가 아니다.
function fixtureContact(overrides: Partial<ContactSeed> = {}): ContactSeed {
  return {
    label: '테스트 상담센터',
    type: 'PHONE',
    value: '000-000-0000',
    source_org: 'TEST_ORG',
    source_url: 'https://example.go.kr/test',
    tier: 'T1',
    collected_at: '2026-08-14',
    ...overrides,
  }
}

describe('ContactSeedSchema', () => {
  it('T3는 애초에 enum에 없어 거부된다 (§5-1)', () => {
    const res = ContactSeedSchema.safeParse({ ...fixtureContact(), tier: 'T3' })
    expect(res.success).toBe(false)
  })

  it('source_url이 URL 형식이 아니면 거부한다', () => {
    const res = ContactSeedSchema.safeParse({ ...fixtureContact(), source_url: 'not-a-url' })
    expect(res.success).toBe(false)
  })

  it('선택 메타데이터(verified_at 등)가 없어도 통과한다', () => {
    expect(ContactSeedSchema.safeParse(fixtureContact()).success).toBe(true)
  })

  it('선택 메타데이터를 포함해도 통과한다', () => {
    const res = ContactSeedSchema.safeParse(
      fixtureContact({ verified_at: '2026-08-14', effective_from: '2026-02-01', category: 'MONEY_SENT', authority: 'TEST_ORG' })
    )
    expect(res.success).toBe(true)
  })

  it('날짜 형식이 아니면 거부한다', () => {
    const res = ContactSeedSchema.safeParse(fixtureContact({ collected_at: '2026/08/14' }))
    expect(res.success).toBe(false)
  })
})

describe('ContactsFileSchema (현재 data/contacts.yaml 상태 재현)', () => {
  it('빈 배열도 유효하다 (Phase 2 STEP 4: 구조만, 데이터는 비움)', () => {
    expect(ContactsFileSchema.safeParse({ contacts: [] }).success).toBe(true)
  })
})

describe('findDuplicateContacts', () => {
  it('동일한 (type, value) 중복을 찾는다', () => {
    const dups = findDuplicateContacts([fixtureContact(), fixtureContact()])
    expect(dups).toEqual(['PHONE:000-000-0000'])
  })

  it('type이 다르면 중복이 아니다', () => {
    const dups = findDuplicateContacts([
      fixtureContact({ type: 'PHONE', value: 'x' }),
      fixtureContact({ type: 'URL', value: 'x' }),
    ])
    expect(dups).toEqual([])
  })
})

describe('KbDocumentMetaSchema', () => {
  it('T1/T2/T3 전부 허용한다 (kb_documents는 T3 교차확인용으로 저장 가능, §5-1)', () => {
    for (const tier of ['T1', 'T2', 'T3']) {
      const res = KbDocumentMetaSchema.safeParse({
        source_org: 'TEST_ORG',
        source_url: 'https://example.go.kr/doc',
        tier,
        title: '테스트 문서',
        collected_at: '2026-08-14',
      })
      expect(res.success).toBe(true)
    }
  })
})

describe('splitIntoChunks (§5-2 청킹 규칙)', () => {
  it('--- 구분자로 청크를 나눈다', () => {
    const md = '첫 번째 단계\n\n---\n\n두 번째 단계'
    expect(splitIntoChunks(md)).toEqual(['첫 번째 단계', '두 번째 단계'])
  })

  it('빈 청크는 제거한다', () => {
    const md = '첫 단계\n\n---\n\n\n\n---\n\n둘째 단계'
    expect(splitIntoChunks(md)).toEqual(['첫 단계', '둘째 단계'])
  })

  it('구분자가 없으면 전체가 청크 1개다', () => {
    expect(splitIntoChunks('그냥 한 문단')).toEqual(['그냥 한 문단'])
  })
})

describe('validateChunkLengths', () => {
  it(`${MAX_CHUNK_LENGTH}자 이하는 통과한다`, () => {
    expect(validateChunkLengths(['x'.repeat(MAX_CHUNK_LENGTH)])).toEqual([])
  })

  it(`${MAX_CHUNK_LENGTH}자 초과는 에러를 낸다`, () => {
    const errors = validateChunkLengths(['x'.repeat(MAX_CHUNK_LENGTH + 1)])
    expect(errors).toHaveLength(1)
    expect(errors[0]).toContain('최대 800자 초과')
  })
})

describe('PlaybookFileSchema', () => {
  it('state_code는 STATE enum이어야 한다', () => {
    const res = PlaybookFileSchema.safeParse({ state_code: 'NOT_A_STATE', steps: [] })
    expect(res.success).toBe(false)
  })

  it('정상적인 (비어있지 않은, 합성) playbook 파일을 통과시킨다', () => {
    const res = PlaybookFileSchema.safeParse({
      state_code: 'MONEY_SENT',
      steps: [
        {
          step_id: 'PB_TEST_01',
          seq: 1,
          title: '테스트 단계',
          kb_chunk_refs: ['https://example.go.kr/doc#1'],
          contact_refs: ['000-000-0000'],
        },
      ],
    })
    expect(res.success).toBe(true)
    if (res.success) {
      expect(res.data.steps[0]?.verified).toBe(false) // 기본값: 미검증
      expect(res.data.steps[0]?.triggers_deadline).toBe(false)
    }
  })

  it('verified 기본값은 false다 — 출처 없는 playbook이 실수로 프로덕션에 노출되지 않도록', () => {
    const res = PlaybookFileSchema.parse({
      state_code: 'MONEY_SENT',
      steps: [{ step_id: 'PB_TEST_02', seq: 1, title: 't' }],
    })
    expect(res.steps[0]?.verified).toBe(false)
  })
})
