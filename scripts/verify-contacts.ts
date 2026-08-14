import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { parse as parseYaml } from 'yaml'
import { ContactsFileSchema, findDuplicateContacts } from '@/lib/kb/seed-schemas'

// DEV_SPEC.md §10 Phase 5: "scripts/verify-contacts.ts — 화이트리스트
// 정합성 검사". DB 없이 data/contacts.yaml 파일만 검증한다(Guard G1의
// 근거가 될 데이터이므로, 적재 전에 형식이 틀리면 바로 잡아낸다).

function main() {
  const path = resolve(process.cwd(), 'data/contacts.yaml')
  const raw = readFileSync(path, 'utf-8')
  const parsed = parseYaml(raw)

  const result = ContactsFileSchema.safeParse(parsed)
  if (!result.success) {
    console.error('❌ data/contacts.yaml 형식 오류:')
    for (const issue of result.error.issues) {
      console.error(`  - ${issue.path.join('.')}: ${issue.message}`)
    }
    process.exit(1)
  }

  const { contacts } = result.data

  const dups = findDuplicateContacts(contacts)
  if (dups.length > 0) {
    console.error('❌ 중복된 (type, value) 항목:')
    for (const d of dups) console.error(`  - ${d}`)
    process.exit(1)
  }

  const t3 = contacts.filter((c) => (c.tier as string) === 'T3')
  if (t3.length > 0) {
    // 스키마 enum이 이미 T1/T2만 허용하므로 실제로는 여기 도달할 수 없다.
    // 그래도 §5-1 "T3 금지" 원칙을 스크립트 차원에서도 이중으로 확인한다.
    console.error('❌ T3 등급 연락처는 화이트리스트에 넣을 수 없습니다 (§5-1).')
    process.exit(1)
  }

  console.log(`✅ data/contacts.yaml 통과 — ${contacts.length}개 연락처, 중복/T3 없음`)
  if (contacts.length === 0) {
    console.log('   (현재 비어 있음 — Phase 2 STEP 4 결정: 구조만 먼저, 데이터는 비워둔다)')
  }
}

main()
