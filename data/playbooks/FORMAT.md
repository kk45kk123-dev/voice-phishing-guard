# data/playbooks/ 형식

이 디렉터리는 아직 비어 있습니다 (Phase 2 STEP 4 결정과 동일한 이유).
`/api/guidance`는 이 데이터가 없는 동안 계속 fallback을 반환합니다 —
버그가 아니라 §5-3 규칙이 의도대로 동작하는 것입니다.

STATE(§4-2) 하나당 YAML 파일 하나를 권장합니다(강제는 아님).

```
data/playbooks/
├── money-sent.yaml       # state_code: MONEY_SENT
├── app-installed.yaml    # state_code: APP_INSTALLED
└── ...
```

## 파일 형식

```yaml
state_code: MONEY_SENT   # STATE enum 중 하나 (lib/schemas/analysis.ts StateSchema)
steps:
  - step_id: PB_MONEY_SENT_01     # 전역에서 고유해야 함
    seq: 1
    title: "..."
    why: "..."
    kb_chunk_refs:                 # "<kb_documents.source_url>#<content.md 청크 순번>"
      - "https://.../report#1"
    contact_refs:                  # contact_registry.value(전화번호/URL) 그대로
      - "1332"
    triggers_deadline: false
    deadline_rule: null            # null이면 기한 UI 미표시(§F5)
    verified: false                # true + 근거 있어야 프로덕션에 노출됨(§5-3, CLAUDE.md 규칙 6)
    verified_at: null
    verified_by: null
```

`scripts/seed-kb.ts`가 `kb_chunk_refs`/`contact_refs`를 실제 DB의 UUID로
해석해서 `playbook_steps.kb_chunk_ids`/`contact_ids`에 채워 넣습니다. 참조
대상(`kb_documents`/`contact_registry`)이 먼저 seed되어 있어야 합니다.

## 절대 하지 말 것

- 전화번호·URL·기관명·구체적 절차를 이 파일에 직접 쓰지 않는다(참조만).
  `contact_refs`는 반드시 `data/contacts.yaml`에 이미 있는 `value`를 가리켜야 한다.
- 공식 출처(T1/T2)로 확인하지 못한 절차는 `verified: false`로 두고, 확인
  전까지는 seq/title조차 추측해서 채우지 않는다.
