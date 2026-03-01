import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
export const supabase = createClient(supabaseUrl, supabaseAnonKey)

export async function getSuppliers() {
  const { data, error } = await supabase.from('suppliers').select('*').order('name')
  if (error) throw error
  return data
}

export async function getProducts() {
  const { data, error } = await supabase.from('products').select('*').order('name')
  if (error) throw error
  return data
}

export async function getPurchaseOrders() {
  const [{ data: pos, error: e1 }, { data: shipments, error: e2 }, { data: lines, error: e3 }] = await Promise.all([
    supabase.from('purchase_orders').select('*').order('created_at', { ascending: false }),
    supabase.from('shipments').select('*'),
    supabase.from('po_lines').select('*'),
  ])
  if (e1) throw e1
  if (e2) throw e2

  return (pos || []).map(po => ({
    ...po,
    shipments: (shipments || []).filter(s => s.po_id === po.id),
    po_lines: (lines || []).filter(l => l.po_id === po.id),
  }))
}

export async function createPurchaseOrder(po, lines = [], shipments = []) {
  const { data: newPO, error: poError } = await supabase.from('purchase_orders').insert(po).select().single()
  if (poError) throw poError
  if (lines.length > 0) {
    const { error } = await supabase.from('po_lines').insert(lines.map(l => ({ ...l, po_id: newPO.id })))
    if (error) throw error
  }
  if (shipments.length > 0) {
    const { error } = await supabase.from('shipments').insert(shipments.map(s => ({ ...s, po_id: newPO.id })))
    if (error) throw error
  }
  return newPO
}

export async function updatePurchaseOrder(id, updates) {
  const { data, error } = await supabase.from('purchase_orders').update(updates).eq('id', id).select().single()
  if (error) throw error
  return data
}

export async function updateShipment(id, updates) {
  const { data, error } = await supabase.from('shipments').update(updates).eq('id', id).select().single()
  if (error) throw error
  return data
}

export async function addShipment(shipment) {
  const { data, error } = await supabase.from('shipments').insert(shipment).select().single()
  if (error) throw error
  return data
}
