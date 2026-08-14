// DEV_SPEC.md §10 Phase 2: "샘플 3종은 lib/demo/samples.ts에 상수로 둔다
// (사용자 입력 예시이므로 하드코딩 허용 — 절차·번호가 아님)".
// 여기 있는 문장은 사용자가 입력했을 법한 상황 진술 예시일 뿐, 대응 절차나
// 연락처가 아니므로 CLAUDE.md 절대 규칙 1과 충돌하지 않는다.

export interface SituationSample {
  id: string
  label: string
  text: string
}

export const SITUATION_SAMPLES: SituationSample[] = [
  {
    id: 'authority-money-sent',
    label: '검찰 사칭 + 송금 완료',
    text: '검찰청이라면서 제 계좌가 범죄에 연루됐다고 했어요. 무서워서 시키는 대로 500만원을 알려준 계좌로 송금했습니다.',
  },
  {
    id: 'acquaintance-app-installed',
    label: '가족 사칭 + 앱 설치',
    text: '아들이라면서 문자로 폰이 고장났다고 새 번호로 연락이 왔어요. 시키는 대로 원격 앱을 설치했어요.',
  },
  {
    id: 'loan-pretext-none',
    label: '대출빙자 문자, 아직 아무것도 안 함',
    text: '저금리로 대환대출 해준다는 문자를 받았는데 이상해서 링크는 누르지 않았어요.',
  },
]
