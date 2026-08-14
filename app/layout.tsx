import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'voice-phishing-guard',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="ko">
      <body>
        <div className="mx-auto min-h-screen max-w-md px-4 py-6">{children}</div>
      </body>
    </html>
  )
}
