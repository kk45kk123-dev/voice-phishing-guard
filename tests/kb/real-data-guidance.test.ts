import { readdirSync, readFileSync, statSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { parse as parseYaml } from 'yaml'
import { beforeAll, describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getGuidanceSteps } from '@/lib/kb/playbook'
import { computeRisk } from '@/lib/rules/risk'
import { orderStates } from '@/lib/rules/priority'
import {
  ContactsFileSchema,
  KbDocumentMetaSchema,
  PlaybookFileSchema,
  splitIntoChunks,
} from '@/lib/kb/seed-schemas'
import { FakeSupabaseClient } from '../helpers/fake-db'

// 2026-08-14 사용자 제공 Source Mapping Report로 실제로 채운 data/ 내용이
// getGuidanceSteps까지 정말로 이어지는지 검증한다. 합성 픽스처가 아니라
// data/contacts.yaml, data/kb/*, data/playbooks/*의 실제 파일을 읽어서
// FakeSupabaseClient에 그대로 적재한다 — scripts/seed-kb.ts와 같은 파싱
// 로직을 쓴다. 실제 Supabase가 아니므로 "코드 경로 검증"이며, "실제 DB
// 검증"으로 포장하지 않는다.

const ROOT = resolve(__dirname, '../..')
const db = new FakeSupabaseClient()

beforeAll(() => {
  // contacts.yaml → contact_registry
  const contactsPath = resolve(ROOT, 'data/contacts.yaml')
  const contacts = ContactsFileSchema.parse(parseYaml(readFileSync(contactsPath, 'utf-8'))).contacts
  for (const c of contacts) {
    db.table('contact_registry').rows.push({ id: crypto.randomUUID(), active: true, ...c })
  }

  // data/kb/*/{meta.json,content.md} → kb_documents + kb_chunks
  const kbDir = resolve(ROOT, 'data/kb')
  const documentIdByUrl = new Map<string, string>()
  for (const slug of readdirSync(kbDir)) {
    const dir = join(kbDir, slug)
    if (!statSync(dir).isDirectory()) continue
    const meta = KbDocumentMetaSchema.parse(JSON.parse(readFileSync(join(dir, 'meta.json'), 'utf-8')))
    const docId = crypto.randomUUID()
    db.table('kb_documents').rows.push({ id: docId, ...meta })
    documentIdByUrl.set(meta.source_url, docId)

    const chunks = splitIntoChunks(readFileSync(join(dir, 'content.md'), 'utf-8'))
    chunks.forEach((raw_text, i) => {
      db.table('kb_chunks').rows.push({ id: crypto.randomUUID(), document_id: docId, seq: i + 1, raw_text })
    })
  }

  // data/playbooks/*.yaml → playbook_steps (kb_chunk_refs/contact_refs를 실제 UUID로 해석)
  const pbDir = resolve(ROOT, 'data/playbooks')
  for (const file of readdirSync(pbDir)) {
    if (!file.endsWith('.yaml')) continue
    const parsed = PlaybookFileSchema.parse(parseYaml(readFileSync(join(pbDir, file), 'utf-8')))
    for (const step of parsed.steps) {
      const kb_chunk_ids = step.kb_chunk_refs.map((ref) => {
        const [url, seqStr] = ref.split('#')
        const docId = documentIdByUrl.get(url!)
        const chunk = db
          .table('kb_chunks')
          .rows.find((r) => r.document_id === docId && r.seq === Number(seqStr))
        if (!chunk) throw new Error(`fixture 오류: ${ref} 해석 실패`)
        return chunk.id as string
      })
      const contact_ids = step.contact_refs.map((ref) => {
        const contact = db.table('contact_registry').rows.find((r) => r.value === ref)
        if (!contact) throw new Error(`fixture 오류: contact ${ref} 해석 실패`)
        return contact.id as string
      })
      db.table('playbook_steps').rows.push({
        step_id: step.step_id,
        state_code: parsed.state_code,
        seq: step.seq,
        title: step.title,
        why: step.why ?? null,
        kb_chunk_ids,
        contact_ids,
        triggers_deadline: step.triggers_deadline,
        deadline_rule: step.deadline_rule ?? null,
        verified: step.verified,
      })
    }
  }
})

describe('실제 data/ 파일 기준 시나리오 A (기관사칭 + 송금 완료)', () => {
  it('MONEY_SENT 상태로 guidance를 요청하면 fallback이 아니라 실제 2단계가 나온다', async () => {
    const states = orderStates(['MONEY_SENT'])
    const risk = computeRisk(states, 'IMPERSONATION_AUTHORITY')
    expect(risk).toBe('CRITICAL')

    const steps = await getGuidanceSteps(db as unknown as SupabaseClient, states, { isProduction: true })
    expect(steps.map((s) => s.step_id)).toEqual(['PB_MONEY_SENT_01', 'PB_MONEY_SENT_02'])
    expect(steps[1]?.channels).toEqual([
      expect.objectContaining({ value: '112', source_org: '경찰청' }),
    ])
    for (const step of steps) expect(step.evidence.length).toBeGreaterThanOrEqual(1)
  })
})

describe('실제 data/ 파일 기준 시나리오 B (악성앱 설치 + 개인정보 제공)', () => {
  it('APP_INSTALLED + PII_DISCLOSED 복합 상태로 요청하면 4단계가 우선순위대로 나온다', async () => {
    const states = orderStates(['PII_DISCLOSED', 'APP_INSTALLED'])
    expect(states).toEqual(['APP_INSTALLED', 'PII_DISCLOSED']) // APP_INSTALLED가 되돌리기 어려움 우선(§4-4)

    const risk = computeRisk(states, 'MALICIOUS_APP_LINK')
    expect(risk).toBe('CRITICAL')

    const steps = await getGuidanceSteps(db as unknown as SupabaseClient, states, { isProduction: true })
    expect(steps.map((s) => s.step_id)).toEqual([
      'PB_APP_INSTALLED_01',
      'PB_APP_INSTALLED_02',
      'PB_APP_INSTALLED_03',
      'PB_PII_DISCLOSED_01',
    ])
    for (const step of steps) expect(step.evidence.length).toBeGreaterThanOrEqual(1)
  })
})

describe('Msafer(T3) 자료는 근거로 확보돼 있어도 production에 노출되지 않는다', () => {
  it('T3뿐인 근거로는 어떤 playbook step도 만들어지지 않았음을 확인 (아직 step 자체가 없음)', async () => {
    const stepIds = db.table('playbook_steps').rows.map((r) => r.step_id)
    expect(stepIds.every((id) => !String(id).includes('MSAFER'))).toBe(true)
  })
})
