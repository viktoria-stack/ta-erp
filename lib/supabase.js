import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// ─── SUPPLIERS ────────────────────────────────────────────────────────────────
export async function getSuppliers() {
  const { data, error } = await supabase
    .from('suppliers')
    .select('*')
    .order('name')
  if (error) throw error
  return data
}

export async function createSupplier(supplier) {
  const { data, error } = await supabase
    .from('suppliers')
    .insert(supplier)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updateSupplier(id, updates) {
  const { data, error } = await supabase
    .from('suppliers')
    .update(updates)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

// ─── PRODUCTS ─────────────────────────────────────────────────────────────────
export async function getProducts() {
  const { data, error } = await supabase
    .from('products')
    .select('*')
    .order('name')
  if (error) throw error
  return data
}

export async function updateProductSizes(id, sizes) {
  const { data, error } = await supabase
    .from('products')
    .update({ sizes })
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

// ─── PURCHASE ORDERS ─────────────────────────────────────────────────────────
export async function getPurchaseOrders() {
  const { data, error } = await supabase
    .from('purchase_orders')
    .select(`
      *,
      po_lines (*)
    `)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data
}

export async function getPurchaseOrder(id) {
  const { data, error } = await supabase
    .from('purchase_orders')
    .select(`*, po_lines (*)`)
    .eq('id', id)
    .single()
  if (error) throw error
  return data
}

export async function createPurchaseOrder(po, lines) {
  // Generate PO ID
  const year = new Date().getFullYear()
  const { count } = await supabase
    .from('purchase_orders')
    .select('*', { count: 'exact', head: true })
  const poId = `PO-${year}-${String((count || 0) + 1).padStart(3, '0')}`

  // Insert PO
  const { data: newPO, error: poError } = await supabase
    .from('purchase_orders')
    .insert({ ...po, id: poId })
    .select()
    .single()
  if (poError) throw poError

  // Insert lines
  if (lines && lines.length > 0) {
    const { error: linesError } = await supabase
      .from('po_lines')
      .insert(lines.map(l => ({ ...l, po_id: poId })))
    if (linesError) throw linesError
  }

  return newPO
}

export async function updatePurchaseOrder(id, updates) {
  const { data, error } = await supabase
    .from('purchase_orders')
    .update(updates)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function deletePurchaseOrder(id) {
  const { error } = await supabase
    .from('purchase_orders')
    .delete()
    .eq('id', id)
  if (error) throw error
}
