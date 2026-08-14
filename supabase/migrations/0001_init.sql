-- ── 확장 ────────────────────────────────────────────────
-- kb_chunks.embedding(vector) 타입에 필요. Supabase 신규 프로젝트는 기본
-- 비활성화 상태이므로 여기서 명시적으로 활성화한다. Supabase 문서 권장대로
-- extensions 스키마에 설치(공개 스키마 오염 방지). Supabase 관리형 역할의
-- 기본 search_path에 extensions가 포함되어 있어 아래 vector(1536) 등 비한정
-- 타입 참조가 그대로 동작한다.
create extension if not exists vector with schema extensions;

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
  embedding    vector(1536), -- 임시값(§9-2 원안 유지). embedding provider 미확정.
                              -- provider 선정 시 차원 일치 여부 재검증 필요.
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
-- 확정 아키텍처: 브라우저 → Next.js API Route → Supabase 서버 클라이언트
-- (service_role) → Postgres. 프론트엔드는 Supabase를 직접 호출하지 않는다.
-- 그래서 anon/authenticated 정책은 하나도 만들지 않는다 — 이 두 역할로 이
-- DB에 접근할 정상 경로 자체가 없다. RLS를 켜두는 이유는 그 경로가 실수로
-- 생기더라도(예: 클라이언트에 anon 키가 잘못 노출되는 경우) 기본 거부로
-- 막기 위한 안전망이다.
-- service_role은 RLS를 우회하므로, 이 정책들이 "세션을 검증"하는 것이
-- 아니다. 실질적인 세션 접근 통제(session_id 소유 확인, 만료 확인, 하위
-- 테이블 스코프 제한)는 Next.js 서버 계층(app/api/**, lib/db/)에서 수행한다.
alter table kb_documents      enable row level security;
alter table kb_chunks         enable row level security;
alter table contact_registry  enable row level security;
alter table playbook_steps    enable row level security;
alter table sessions          enable row level security;
alter table session_analyses  enable row level security;
alter table session_steps     enable row level security;
alter table session_deadlines enable row level security;
alter table guard_logs        enable row level security;
