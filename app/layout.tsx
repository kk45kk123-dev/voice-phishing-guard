import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: '보이스피싱 대응 가이드',
  description: '이상 징후를 알아챈 다음, 지금 무엇을 해야 할지 순서대로 안내합니다.',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="ko">
      <body>
        {/* 모바일(기본)에서는 카드가 화면을 꽉 채워 기존과 동일하게
            보인다. sm: 이상(데스크톱)에서만 은은한 배경 위에 그림자 있는
            카드로 떠 보이게 한다 — 시연이 노트북 화면에서 이뤄질 수 있다는
            점을 고려한 조정이며, 모바일 사용성에는 영향이 없다. */}
        <div className="mx-auto min-h-screen max-w-md bg-white px-4 py-6 sm:my-10 sm:min-h-0 sm:rounded-3xl sm:border sm:border-slate-200 sm:px-8 sm:py-10 sm:shadow-xl sm:shadow-slate-900/5">
          {children}
        </div>
      </body>
    </html>
  )
}
