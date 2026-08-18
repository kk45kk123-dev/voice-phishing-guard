import { ImageResponse } from 'next/og'

// 브라우저 탭 파비콘. 외부 이미지/폰트 없이 코드로만 생성한다 — 빌드 중
// 네트워크 요청이 필요 없다. 방패 모양은 "보호"라는 서비스 성격을 짧게
// 전달하기 위한 것일 뿐, 실제 기관 마크나 인증 표시가 아니다.
export const size = { width: 32, height: 32 }
export const contentType = 'image/png'

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#1d4ed8',
          borderRadius: 7,
        }}
      >
        <svg width="19" height="19" viewBox="0 0 24 24" fill="none">
          <path
            d="M12 2L4 5v6c0 5.2 3.4 9.7 8 11 4.6-1.3 8-5.8 8-11V5l-8-3z"
            fill="white"
          />
          <path
            d="M9.5 12.2l1.8 1.8 3.8-4.2"
            stroke="#1d4ed8"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        </svg>
      </div>
    ),
    { ...size }
  )
}
