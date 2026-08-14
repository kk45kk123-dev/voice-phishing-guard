import type { RiskLevel } from '@/lib/schemas/analysis'

const STYLES: Record<RiskLevel, string> = {
  SAFE: 'bg-green-100 text-green-900 border-green-700',
  CAUTION: 'bg-yellow-100 text-yellow-900 border-yellow-700',
  DANGER: 'bg-orange-100 text-orange-900 border-orange-700',
  CRITICAL: 'bg-red-100 text-red-900 border-red-700',
}

const LABELS: Record<RiskLevel, string> = {
  SAFE: '안전',
  CAUTION: '주의',
  DANGER: '위험',
  CRITICAL: '긴급',
}

export function RiskBadge({ level }: { level: RiskLevel }) {
  return (
    <span
      className={`inline-block rounded-full border-2 px-4 py-1 text-base font-bold ${STYLES[level]}`}
    >
      {LABELS[level]} ({level})
    </span>
  )
}
