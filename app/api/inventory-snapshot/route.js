export const runtime = 'nodejs'

import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const getSupabase = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
)

async function takeSnapshot() {
  const supabase = getSupabase()
  const today = new Date().toISOString().slice(0, 10)

  const { data: inventory, error: fetchErr } = await supabase
    .from('inventory')
    .select('sku, product_name, qty_uk, qty_us')

  if (fetchErr) throw fetchErr

  const rows = (inventory || []).map(r => ({
    snapshot_date: today,
    sku: r.sku,
    product_name: r.product_name,
    qty_uk: r.qty_uk || 0,
    qty_us: r.qty_us || 0,
  }))

  const CHUNK = 100
  let upserted = 0
  const errors = []
  for (let i = 0; i < rows.length; i += CHUNK) {
    const { error } = await supabase
      .from('inventory_snapshots')
      .upsert(rows.slice(i, i + CHUNK), { onConflict: 'snapshot_date,sku' })
    if (error) errors.push(error.message)
    else upserted += Math.min(CHUNK, rows.length - i)
  }

  return { upserted, total: rows.length, errors, date: today }
}

export async function GET() {
  try {
    const result = await takeSnapshot()
    return NextResponse.json(result)
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function POST() {
  try {
    const result = await takeSnapshot()
    return NextResponse.json(result)
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
