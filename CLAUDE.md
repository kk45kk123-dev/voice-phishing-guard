# 프로젝트 헌법 — 위반 금지

## 절대 규칙
1. 전화번호, URL, 기관명, 금융 대응 절차를 코드나 프롬프트에 하드코딩하지 않는다.
   → 모두 DB(contact_registry, playbook_steps, kb_chunks)에서만 온다.
   → 테스트 픽스처도 예외가 아니다. `data/contacts.yaml`을 통해 주입한다.
2. lib/rules/ 안의 함수는 LLM을 호출하지 않는다. 순수 함수만 둔다.
3. AI-B(lib/ai/rewrite.ts)에 사용자 원문을 전달하지 않는다.
4. DEV_SPEC.md에 없는 기능을 추가하지 않는다. 필요해 보이면 구현하지 말고 보고한다.
5. Guard를 우회하는 경로를 만들지 않는다. 모든 AI 생성 문장은 lib/guard/index.ts를 통과한다.
6. verified=false 인 playbook_step은 프로덕션에서 렌더링하지 않는다.

## 작업 방식
- Phase 단위로만 작업한다. 현재 Phase의 완료 조건을 만족하기 전에 다음 Phase 파일을 만들지 않는다.
- 각 Phase 끝에 `npm run test`가 통과해야 한다.
- 스키마를 바꿔야 한다고 판단되면 코드를 고치지 말고 먼저 보고한다.

## 금지 표현 (사용자 화면에 출력 금지)
"제가 신청했습니다" / "지급정지 완료" / "반드시 환급" / "당신은 사기 피해자입니다" / "100%"

## Phase 0 보완 결정사항 (아키텍처 · 보안)

§8-3 원문(위)에 없던 세부 사항을 Phase 0 완료 후 설계 검토로 확정한 것이다.
DEV_SPEC.md 원문을 대체하지 않는다 — 원문이 산문으로만 남긴 빈틈을 메운다.

### DB 접근 구조
- 브라우저는 Supabase를 절대 직접 호출하지 않는다. 흐름은 항상
  `브라우저 → Next.js API Route Handler → Supabase 서버 클라이언트 → Postgres`.
- Supabase URL·키는 `NEXT_PUBLIC_` 접두사를 쓰지 않는다. `app/api/**/route.ts`,
  Server Component 등 서버 전용 코드에서만 import한다.

### service_role
- 서버 전용. 브라우저 번들에 절대 포함하지 않는다.
- `NEXT_PUBLIC_` 환경변수로 만들지 않는다.
- Git에 커밋하지 않는다(`.env`는 `.gitignore` 대상, `.env.example`엔 변수명만).
- **service_role은 RLS를 우회한다.** "RLS가 세션을 검증한다"고 표현하지 않는다.
- 모든 사용자 입력(특히 `session_id`)은 서버에서 검증한 뒤에만 쿼리에 사용한다.

### RLS
- 9개 테이블 전부 RLS ENABLE. `anon`/`authenticated`용 정책은 하나도 두지 않는다
  (이 앱엔 로그인이 없고 클라이언트가 Supabase를 직접 호출하지 않으므로 그
  역할들이 쓰일 정상 경로가 없다 — 정책 부재 자체가 fail-safe 기본 거부다).
- 실질적인 세션 접근 통제(소유 확인, 만료 확인, 하위 테이블 스코프 제한)는
  DB가 아니라 **Next.js 서버 계층(app/api/**, lib/db/)**에서 수행한다.

### session_id 처리 원칙 (Phase 1부터 강제)
1. 서버에서 UUID로 생성(`sessions.id default gen_random_uuid()`)
2. 클라이언트는 localStorage + URL parameter로 보관(쿠키 아님)
3. API 요청 시 세션 관련 엔드포인트는 모두 `session_id`를 받는다
4. 서버는 UUID 형식을 검증한다
5. 서버는 `sessions` 테이블에 해당 행이 존재하는지 확인한다
6. 서버는 `expires_at` 만료 여부를 확인한다
7. `session_analyses`/`session_steps`/`session_deadlines`/`guard_logs` 등 하위
   테이블을 조회·수정할 때는 반드시 `session_id` 조건을 명시한다
8. 위 1~7이 개발자 재량("알아서 `.eq('session_id', ...)` 넣기")에만 기대지 않도록,
   Phase 1의 `lib/db/client.ts`는 세션 스코프를 강제하는 공용 헬퍼로 설계한다
   (예: 임의의 `session_id`를 받아 존재·만료를 먼저 검증하고, 이후의 모든 하위
   쿼리에 그 `session_id` 필터가 자동으로 적용되는 형태의 함수/클라이언트 래퍼).
   개별 route handler가 이 헬퍼를 거치지 않고 세션 테이블에 직접 쿼리하지 않는다.

### vector(1536)
DEV_SPEC.md §9-2 원안을 그대로 유지한다. embedding provider가 아직 미확정이라
지금 임의로 바꾸지 않는다. **provider를 선정하는 단계에서 반드시 차원(dimension)
일치 여부를 재검증한다.**
