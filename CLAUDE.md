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
