-- ── 지식베이스 ──────────────────────────────────────────
create table kb_documents (
  id           uuid primary key default gen_random_uuid(),
  source_org   text not null,
  source_url   text not null,
  tier         text not null check (tier in ('T1','T2','T3')),
  title        text not null,
  collected_at date not null,
  created_at   timestamptz default now()
);
create unique index kb_documents_url_uk on kb_documents(source_url);

create table kb_chunks (
  id           uuid primary key default gen_random_uuid(),
  document_id  uuid not null references kb_documents(id) on delete cascade,
  seq          int  not null,
  raw_text     text not null check (char_length(raw_text) <= 800),
  embedding    vector(1536),
  created_at   timestamptz default now()
);
create index kb_chunks_doc_idx on kb_chunks(document_id, seq);
create index kb_chunks_emb_idx on kb_chunks using ivfflat (embedding vector_cosine_ops);

-- ── 검증된 연락처 화이트리스트 (Guard G1의 근거) ──────────
create table contact_registry (
  id           uuid primary key default gen_random_uuid(),
  label        text not null,
  type         text not null check (type in ('PHONE','URL')),
  value        text not null,
  source_org   text not null,
  source_url   text not null,
  tier         text not null check (tier in ('T1','T2')),   -- T3 금지
  collected_at date not null,
  active       boolean not null default true
);
create unique index contact_registry_value_uk on contact_registry(type, value);
create index contact_registry_active_idx on contact_registry(active) where active;

-- ── 플레이북 (사람이 검증해 입력한 절차) ────────────────
create table playbook_steps (
  id                uuid primary key default gen_random_uuid(),
  step_id           text not null unique,       -- 예: PB_MONEY_SENT_01
  state_code        text not null,              -- STATE enum
  seq               int  not null,
  title             text not null,
  why               text,
  kb_chunk_ids      uuid[] not null default '{}',
  contact_ids       uuid[] not null default '{}',
  triggers_deadline boolean not null default false,
  deadline_rule     text,                       -- null이면 기한 UI 미표시
  verified          boolean not null default false,
  verified_at       date,
  verified_by       text
);
create index playbook_state_idx on playbook_steps(state_code, seq);
create index playbook_verified_idx on playbook_steps(verified) where verified;

-- ── 세션 (개인 식별 정보 없음) ──────────────────────────
create table sessions (
  id           uuid primary key default gen_random_uuid(),
  entry_path   text,
  created_at   timestamptz default now(),
  expires_at   timestamptz default now() + interval '7 days'
);

create table session_analyses (
  id            uuid primary key default gen_random_uuid(),
  session_id    uuid not null references sessions(id) on delete cascade,
  case_code     text not null,
  states        text[] not null,
  risk_level    text not null,
  confidence    numeric(3,2),
  source        text not null default 'ai' check (source in ('ai','manual')),
  created_at    timestamptz default now()
  -- ⚠️ 사용자 원문(text)은 저장하지 않는다
);
create index session_analyses_sid_idx on session_analyses(session_id);

create table session_steps (
  id            uuid primary key default gen_random_uuid(),
  session_id    uuid not null references sessions(id) on delete cascade,
  step_id       text not null references playbook_steps(step_id),
  seq           int not null,
  status        text not null default 'PENDING'
                check (status in ('PENDING','IN_PROGRESS','DONE','SKIPPED')),
  completed_at  timestamptz
);
create unique index session_steps_uk on session_steps(session_id, step_id);

create table session_deadlines (
  id            uuid primary key default gen_random_uuid(),
  session_id    uuid not null references sessions(id) on delete cascade,
  rule_id       text not null,
  anchor_at     timestamptz not null,
  starts_at     date not null,
  ends_at       date not null
);

-- ── Guard 로그 (심사 어필 + 디버깅) ─────────────────────
create table guard_logs (
  id            uuid primary key default gen_random_uuid(),
  session_id    uuid references sessions(id) on delete set null,
  verdict       text not null check (verdict in ('PASS','MODIFIED','BLOCK')),
  rule_hits     text[] not null default '{}',
  created_at    timestamptz default now()
  -- 원문 미저장. 규칙 ID만 기록
);

-- ── RLS ──────────────────────────────────────────────────
-- DEV_SPEC.md §9-2: "모든 테이블 RLS 활성화. sessions·session_*는 session_id
-- 일치 시에만 접근. kb_*·playbook_steps·contact_registry는 읽기 전용 공개,
-- 쓰기는 service role만."
--
-- ⚠️ 미구현: DEV_SPEC.md는 이 요구사항을 산문으로만 명시했고, 구체적인
-- CREATE POLICY 문은 스펙에 없다. 이 앱은 Supabase Auth(로그인)가 없어
-- session_id를 어떤 클레임/컨텍스트로 대조할지가 정의되어 있지 않다.
-- Phase 0 범위("DDL을 그대로 넣는다")를 벗어나므로 임의로 정책을 만들지
-- 않고 보고한다 — Phase 1(lib/db/client.ts) 이전에 정책 설계를 확인 필요.
