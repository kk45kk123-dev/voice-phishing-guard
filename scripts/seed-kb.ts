import { readdirSync, readFileSync, statSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { parse as parseYaml } from 'yaml'
import { getServerSupabaseClient } from '@/lib/db/client'
import {
  ContactsFileSchema,
  KbDocumentMetaSchema,
  PlaybookFileSchema,
  findDuplicateContacts,
  splitIntoChunks,
  validateChunkLengths,
  type PlaybookStepSeed,
} from '@/lib/kb/seed-schemas'

// DEV_SPEC.md §10 Phase 5: "scripts/seed-kb.ts — data/ → DB 적재".
// data/contacts.yaml, data/kb/<slug>/{meta.json,content.md},
// data/playbooks/*.yaml을 읽어 contact_registry / kb_documents / kb_chunks /
// playbook_steps에 upsert한다. 지금은 세 디렉터리가 모두 비어 있다
// (Phase 2 STEP 4 결정: "구조만 먼저, 데이터는 비워둔다") — 실행하면
// 0건이 정상이다.
//
// 실행 전제: SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY 필요. 없으면
// getServerSupabaseClient()가 DbNotConfiguredError를 던진다.

const ROOT = process.cwd()

async function seedContacts(db: ReturnType<typeof getServerSupabaseClient>) {
  const path = resolve(ROOT, 'data/contacts.yaml')
  const parsed = ContactsFileSchema.parse(parseYaml(readFileSync(path, 'utf-8')))
  const dups = findDuplicateContacts(parsed.contacts)
  if (dups.length > 0) throw new Error(`중복 연락처: ${dups.join(', ')}`)

  if (parsed.contacts.length === 0) {
    console.log('  contacts: 0건 (data/contacts.yaml 비어 있음)')
    return
  }

  const { error } = await db
    .from('contact_registry')
    .upsert(parsed.contacts, { onConflict: 'type,value' })
  if (error) throw error
  console.log(`  contacts: ${parsed.contacts.length}건 upsert`)
}

function listKbDocumentDirs(): string[] {
  const kbDir = resolve(ROOT, 'data/kb')
  return readdirSync(kbDir).filter((name) => statSync(join(kbDir, name)).isDirectory())
}

async function seedKbDocuments(db: ReturnType<typeof getServerSupabaseClient>) {
  const slugs = listKbDocumentDirs()
  if (slugs.length === 0) {
    console.log('  kb_documents/kb_chunks: 0건 (data/kb/ 비어 있음)')
    return new Map<string, string>() // source_url -> document_id, seq는 chunk 조회 시 사용
  }

  let totalChunks = 0
  for (const slug of slugs) {
    const dir = resolve(ROOT, 'data/kb', slug)
    const meta = KbDocumentMetaSchema.parse(JSON.parse(readFileSync(join(dir, 'meta.json'), 'utf-8')))
    const chunks = splitIntoChunks(readFileSync(join(dir, 'content.md'), 'utf-8'))
    const lengthErrors = validateChunkLengths(chunks)
    if (lengthErrors.length > 0) {
      throw new Error(`${slug}: 청크 길이 초과 — ${lengthErrors.join('; ')}`)
    }

    const { data: doc, error: docError } = await db
      .from('kb_documents')
      .upsert(meta, { onConflict: 'source_url' })
      .select('id')
      .single()
    if (docError || !doc) throw docError ?? new Error(`${slug}: kb_documents upsert 실패`)

    const rows = chunks.map((raw_text, i) => ({ document_id: doc.id, seq: i + 1, raw_text }))
    if (rows.length > 0) {
      const { error: chunkError } = await db
        .from('kb_chunks')
        .upsert(rows, { onConflict: 'document_id,seq' })
      if (chunkError) throw chunkError
    }
    totalChunks += rows.length
  }
  console.log(`  kb_documents: ${slugs.length}건, kb_chunks: ${totalChunks}건 upsert`)
}

function listPlaybookFiles(): string[] {
  const dir = resolve(ROOT, 'data/playbooks')
  return readdirSync(dir).filter((name) => name.endsWith('.yaml') || name.endsWith('.yml'))
}

async function resolveChunkRef(
  db: ReturnType<typeof getServerSupabaseClient>,
  ref: string
): Promise<string> {
  const [sourceUrl, seqStr] = ref.split('#')
  const seq = Number(seqStr)
  const { data: doc } = await db.from('kb_documents').select('id').eq('source_url', sourceUrl).maybeSingle()
  if (!doc) throw new Error(`kb_chunk_refs 해석 실패(문서 없음): ${ref}`)
  const { data: chunk } = await db
    .from('kb_chunks')
    .select('id')
    .eq('document_id', doc.id)
    .eq('seq', seq)
    .maybeSingle()
  if (!chunk) throw new Error(`kb_chunk_refs 해석 실패(청크 없음): ${ref}`)
  return chunk.id
}

async function resolveContactRef(
  db: ReturnType<typeof getServerSupabaseClient>,
  ref: string
): Promise<string> {
  const { data } = await db.from('contact_registry').select('id').eq('value', ref).maybeSingle()
  if (!data) throw new Error(`contact_refs 해석 실패: ${ref}`)
  return data.id
}

async function seedPlaybooks(db: ReturnType<typeof getServerSupabaseClient>) {
  const files = listPlaybookFiles()
  if (files.length === 0) {
    console.log('  playbook_steps: 0건 (data/playbooks/ 비어 있음)')
    return
  }

  let total = 0
  for (const file of files) {
    const parsed = PlaybookFileSchema.parse(parseYaml(readFileSync(resolve(ROOT, 'data/playbooks', file), 'utf-8')))
    for (const step of parsed.steps) {
      const kbChunkIds = await Promise.all(step.kb_chunk_refs.map((r) => resolveChunkRef(db, r)))
      const contactIds = await Promise.all(step.contact_refs.map((r) => resolveContactRef(db, r)))
      const row = buildPlaybookRow(parsed.state_code, step, kbChunkIds, contactIds)
      const { error } = await db.from('playbook_steps').upsert(row, { onConflict: 'step_id' })
      if (error) throw error
      total += 1
    }
  }
  console.log(`  playbook_steps: ${total}건 upsert`)
}

function buildPlaybookRow(
  stateCode: string,
  step: PlaybookStepSeed,
  kbChunkIds: string[],
  contactIds: string[]
) {
  return {
    step_id: step.step_id,
    state_code: stateCode,
    seq: step.seq,
    title: step.title,
    why: step.why ?? null,
    kb_chunk_ids: kbChunkIds,
    contact_ids: contactIds,
    triggers_deadline: step.triggers_deadline,
    deadline_rule: step.deadline_rule ?? null,
    verified: step.verified,
    verified_at: step.verified_at ?? null,
    verified_by: step.verified_by ?? null,
  }
}

async function main() {
  const db = getServerSupabaseClient()
  console.log('KB 시딩 시작...')
  await seedContacts(db)
  await seedKbDocuments(db)
  await seedPlaybooks(db)
  console.log('완료.')
}

main().catch((err) => {
  console.error('❌ 시딩 실패:', err instanceof Error ? err.message : err)
  process.exit(1)
})
