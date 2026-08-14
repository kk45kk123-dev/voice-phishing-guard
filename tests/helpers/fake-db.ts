import { randomUUID } from 'node:crypto'

// 실제 Supabase 없이 route handler를 그대로(로직 변경 없이) 실행하기 위한
// 아주 작은 인메모리 대역 구현. supabase-js의 일부 체이닝 표면만 흉내 낸다
// (이 프로젝트 코드가 실제로 쓰는 만큼만). 범용 PostgREST 에뮬레이터가
// 아니므로 새 쿼리 패턴을 쓰면 확장해야 한다.
export type Row = Record<string, unknown>

export class FakeTable {
  rows: Row[] = []
}

class FakeQueryBuilder {
  private filters: Array<(row: Row) => boolean> = []
  private mode: 'select' | 'insert' | 'update' | 'upsert' = 'select'
  private payload: Row | Row[] | null = null
  private upsertConflictKeys: string[] = []
  private upsertIgnoreDuplicates = false
  private orderCol: string | null = null
  private orderAsc = true
  private limitN: number | null = null
  private singleMode: 'none' | 'single' | 'maybeSingle' = 'none'

  constructor(private table: FakeTable) {}

  select(_cols?: string) {
    return this
  }

  insert(payload: Row | Row[]) {
    this.mode = 'insert'
    this.payload = payload
    return this
  }

  update(payload: Row) {
    this.mode = 'update'
    this.payload = payload
    return this
  }

  upsert(payload: Row[], opts: { onConflict: string; ignoreDuplicates?: boolean }) {
    this.mode = 'upsert'
    this.payload = payload
    this.upsertConflictKeys = opts.onConflict.split(',')
    this.upsertIgnoreDuplicates = Boolean(opts.ignoreDuplicates)
    return this
  }

  eq(col: string, val: unknown) {
    this.filters.push((row) => row[col] === val)
    return this
  }

  in(col: string, vals: unknown[]) {
    this.filters.push((row) => vals.includes(row[col]))
    return this
  }

  order(col: string, opts: { ascending: boolean }) {
    this.orderCol = col
    this.orderAsc = opts.ascending
    return this
  }

  limit(n: number) {
    this.limitN = n
    return this
  }

  single() {
    this.singleMode = 'single'
    return this
  }

  maybeSingle() {
    this.singleMode = 'maybeSingle'
    return this
  }

  private matched(): Row[] {
    return this.table.rows.filter((row) => this.filters.every((f) => f(row)))
  }

  private finish(rows: Row[]): { data: unknown; error: null } {
    let result = rows
    if (this.orderCol) {
      const col = this.orderCol
      result = [...result].sort((a, b) => {
        const av = String(a[col] ?? '')
        const bv = String(b[col] ?? '')
        return this.orderAsc ? av.localeCompare(bv) : bv.localeCompare(av)
      })
    }
    if (this.limitN !== null) result = result.slice(0, this.limitN)

    if (this.singleMode === 'single') return { data: result[0] ?? null, error: null }
    if (this.singleMode === 'maybeSingle') return { data: result[0] ?? null, error: null }
    return { data: result, error: null }
  }

  // supabase-js 쿼리 빌더는 thenable이라 route 코드가 await로 바로 쓸 수 있다.
  then(
    resolve: (v: { data: unknown; error: null }) => void,
    reject?: (e: unknown) => void
  ) {
    try {
      if (this.mode === 'insert') {
        const rows = Array.isArray(this.payload) ? this.payload : [this.payload as Row]
        const inserted = rows.map((r) => ({ id: randomUUID(), created_at: new Date().toISOString(), ...r }))
        this.table.rows.push(...inserted)
        resolve(this.finish(inserted))
        return
      }
      if (this.mode === 'update') {
        const targets = this.matched()
        for (const row of targets) Object.assign(row, this.payload)
        resolve(this.finish(targets))
        return
      }
      if (this.mode === 'upsert') {
        const payloadRows = this.payload as Row[]
        const inserted: Row[] = []
        for (const incoming of payloadRows) {
          const existing = this.table.rows.find((row) =>
            this.upsertConflictKeys.every((k) => row[k] === incoming[k])
          )
          if (existing) {
            if (!this.upsertIgnoreDuplicates) Object.assign(existing, incoming)
          } else {
            const row = { id: randomUUID(), ...incoming }
            this.table.rows.push(row)
            inserted.push(row)
          }
        }
        resolve(this.finish(inserted))
        return
      }
      resolve(this.finish(this.matched()))
    } catch (e) {
      if (reject) reject(e)
    }
  }
}

export class FakeSupabaseClient {
  private tables = new Map<string, FakeTable>()

  table(name: string): FakeTable {
    if (!this.tables.has(name)) this.tables.set(name, new FakeTable())
    return this.tables.get(name)!
  }

  from(name: string) {
    return new FakeQueryBuilder(this.table(name))
  }

  reset() {
    this.tables.clear()
  }
}
