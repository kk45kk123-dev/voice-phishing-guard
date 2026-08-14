-- ── Phase 2 STEP 4 보완: KB 메타데이터 확장 ────────────────
-- kb_documents/contact_registry에 검증일·적용일·분류·관할기관을 추적할 수
-- 있게 컬럼을 추가한다(사용자 승인: "새 마이그레이션 추가").
--
-- source_name은 별도 컬럼을 만들지 않는다 — 기존 source_org와 의미가
-- 겹친다(둘 다 "누가 이 정보를 발행했는가").
--
-- category에는 지금 CHECK 제약을 걸지 않는다. DEV_SPEC.md 화면에 없던
-- STEP 5의 11개 상황 분류(의심 전화/의심 문자/…/복합 피해)가 기존
-- STATE(7종)·CASE_CODE(6종) enum과 완전히 일치하지 않는다 — 예를 들어
-- "카드 결제 피해"는 STATE 어디에도 대응값이 없고, "의심 전화/문자"는
-- STATE보다 entry_path에 가깝다. 이 불일치는 별도로 보고하며, category의
-- 값 도메인을 enum으로 고정할지는 그 논의 이후에 결정한다.
alter table kb_documents
  add column verified_at    date,
  add column effective_from date,
  add column category       text,
  add column authority      text;

alter table contact_registry
  add column verified_at    date,
  add column effective_from date,
  add column category       text,
  add column authority      text;

-- seed 스크립트가 (document_id, seq) 기준으로 upsert할 수 있어야 재실행해도
-- 청크가 중복 생성되지 않는다. 0001에는 인덱스만 있고 유니크 제약이 없었다.
create unique index if not exists kb_chunks_doc_seq_uk on kb_chunks(document_id, seq);
