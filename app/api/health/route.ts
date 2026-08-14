import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

export async function GET() {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !key) {
    return NextResponse.json({ ok: false, db: false })
  }

  try {
    const supabase = createClient(url, key)
    const { error } = await supabase
      .from('kb_documents')
      .select('id', { count: 'exact', head: true })

    if (error) {
      return NextResponse.json({ ok: false, db: false })
    }

    return NextResponse.json({ ok: true, db: true })
  } catch {
    return NextResponse.json({ ok: false, db: false })
  }
}
