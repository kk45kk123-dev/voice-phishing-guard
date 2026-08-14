import { readdirSync, readFileSync, statSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { parse as parseYaml } from 'yaml'
import {
  ContactsFileSchema,
  KbDocumentMetaSchema,
  PlaybookFileSchema,
  findDuplicateContacts,
  splitIntoChunks,
  validateChunkLengths,
} from '@/lib/kb/seed-schemas'

// DB 없이(오프라인) data/의 정합성을 검증한다. seed-kb.ts를 실제 Supabase에
// 돌리기 전에 항상 먼저 실행해서, DB에 넣기도 전에 잡을 수 있는 문제(중복,
// 참조 무결성, 형식 오류)를 미리 걸러낸다. §5-3/§F5 규칙도 정적으로 확인한다.

const ROOT = process.cwd()
let hasError = false

function fail(msg: string) {
  console.error(`❌ ${msg}`)
  hasError = true
}
function ok(msg: string) {
  console.log(`✅ ${msg}`)
}

// 1) contacts.yaml
const contactsPath = resolve(ROOT, 'data/contacts.yaml')
const contactsParsed = ContactsFileSchema.safeParse(parseYaml(readFileSync(contactsPath, 'utf-8')))
if (!contactsParsed.success) {
  fail(`contacts.yaml 스키마 오류: ${contactsParsed.error.issues.map((i) => i.message).join('; ')}`)
} else {
  const dups = findDuplicateContacts(contactsParsed.data.contacts)
  if (dups.length > 0) fail(`contacts.yaml 중복: ${dups.join(', ')}`)
  else ok(`contacts.yaml: ${contactsParsed.data.contacts.length}건, 중복 없음, 전부 T1/T2`)
}
const contactValues = new Set((contactsParsed.success ? contactsParsed.data.contacts : []).map((c) => c.value))

// 2) data/kb/*
const kbDir = resolve(ROOT, 'data/kb')
const documentsByUrl = new Map<string, { chunkCount: number; tier: string }>()
const seenSourceUrls = new Set<string>()
for (const slug of readdirSync(kbDir)) {
  const dir = join(kbDir, slug)
  if (!statSync(dir).isDirectory()) continue
  let meta
  try {
    meta = KbDocumentMetaSchema.parse(JSON.parse(readFileSync(join(dir, 'meta.json'), 'utf-8')))
  } catch (e) {
    fail(`kb/${slug}/meta.json 스키마 오류: ${e instanceof Error ? e.message : e}`)
    continue
  }
  if (seenSourceUrls.has(meta.source_url)) fail(`kb/${slug}: source_url 중복 — ${meta.source_url}`)
  seenSourceUrls.add(meta.source_url)

  const chunks = splitIntoChunks(readFileSync(join(dir, 'content.md'), 'utf-8'))
  const lenErrors = validateChunkLengths(chunks)
  if (lenErrors.length > 0) fail(`kb/${slug}: ${lenErrors.join('; ')}`)
  documentsByUrl.set(meta.source_url, { chunkCount: chunks.length, tier: meta.tier })
  ok(`kb/${slug}: tier=${meta.tier} chunks=${chunks.length}`)
}

// 3) data/playbooks/*
const pbDir = resolve(ROOT, 'data/playbooks')
const seenStepIds = new Set<string>()
let totalSteps = 0
for (const file of readdirSync(pbDir)) {
  if (!file.endsWith('.yaml') && !file.endsWith('.yml')) continue
  let parsed
  try {
    parsed = PlaybookFileSchema.parse(parseYaml(readFileSync(join(pbDir, file), 'utf-8')))
  } catch (e) {
    fail(`playbooks/${file} 스키마 오류: ${e instanceof Error ? e.message : e}`)
    continue
  }

  const seqSeen = new Set<number>()
  for (const step of parsed.steps) {
    totalSteps += 1

    // step_id 전역 중복 (playbook_steps.step_id는 DB에서도 unique)
    if (seenStepIds.has(step.step_id)) fail(`${file}: step_id 중복 — ${step.step_id}`)
    seenStepIds.add(step.step_id)

    // seq 순서: 같은 state_code 안에서 중복 없어야 함
    if (seqSeen.has(step.seq)) fail(`${file}: ${step.step_id} seq 중복 — ${step.seq}`)
    seqSeen.add(step.seq)

    // §5-3: verified=true인 step은 근거 청크가 최소 1개 있어야 하고, 전부
    // 실제 존재하는 문서/청크를 가리켜야 한다 (source 참조 무결성)
    if (step.verified && step.kb_chunk_refs.length === 0) {
      fail(`${file}: ${step.step_id}는 verified=true인데 kb_chunk_refs가 비어있음`)
    }
    for (const ref of step.kb_chunk_refs) {
      const [url, seqStr] = ref.split('#')
      const doc = documentsByUrl.get(url ?? '')
      if (!doc) {
        fail(`${file}: ${step.step_id} kb_chunk_refs 참조 오류 — 문서 없음: ${ref}`)
        continue
      }
      const n = Number(seqStr)
      if (!Number.isInteger(n) || n < 1 || n > doc.chunkCount) {
        fail(`${file}: ${step.step_id} kb_chunk_refs 범위 오류 — ${ref} (문서엔 청크 ${doc.chunkCount}개)`)
      }
    }

    // contact 참조 무결성
    for (const ref of step.contact_refs) {
      if (!contactValues.has(ref)) {
        fail(`${file}: ${step.step_id} contact_refs 참조 오류 — contacts.yaml에 없는 값: ${ref}`)
      }
    }

    // §F5: triggers_deadline=true면 deadline_rule이 있어야 의미가 있다
    if (step.triggers_deadline && !step.deadline_rule) {
      fail(`${file}: ${step.step_id} triggers_deadline=true인데 deadline_rule이 없음`)
    }
  }
  ok(`playbooks/${file}: state=${parsed.state_code} steps=${parsed.steps.length}, seq 중복 없음`)
}

console.log(`\n총 playbook_steps 후보: ${totalSteps}건`)

if (hasError) {
  console.error('\n❌ 검증 실패 — 위 오류를 해결한 뒤 seed:kb를 실행하세요.')
  process.exit(1)
}
console.log('\n✅ 전부 통과 — DB 없이 확인 가능한 범위(스키마·중복·참조 무결성)는 문제 없음.')
