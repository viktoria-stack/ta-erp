'use client'
import { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import * as XLSX from 'xlsx'
import Shell from '@/components/Shell'
import { T, KPI, Card, Th, Td, BtnPrimary, BtnGhost, Loading, ErrorMsg, fmt } from '@/components/ui'
import { supabase } from '@/lib/supabase'

const PAGE_SIZE = 100
const MOV_SIZE  = 50
const SIZES     = new Set(['XS','S','M','L','XL','XXL','XXXL','OS','ONE SIZE'])

// Load ALL Supabase items — no filters (filtering is client-side now)
async function fetchAllSupabase() {
  const { data, error } = await supabase
    .from('inventory_restock')
    .select('*')
    .order('product_name')
    .order('size')
  if (error) throw error
  return data || []
}

async function fetchKPIs() {
  const { data, error } = await supabase.rpc('inventory_kpis').single()
  if (error) {
    const { data: d2 } = await supabase.from('inventory').select('qty_uk, qty_us').limit(5000)
    const rows = d2 || []
    return {
      total_skus: rows.length,
      total_uk: rows.reduce((s, r) => s + (r.qty_uk || 0), 0),
      total_us: rows.reduce((s, r) => s + (r.qty_us || 0), 0),
      out_of_stock: rows.filter(r => !r.qty_uk && !r.qty_us).length,
      low_stock: rows.filter(r => (r.qty_uk > 0 && r.qty_uk < 10) || (r.qty_us > 0 && r.qty_us < 10)).length,
    }
  }
  return data
}

async function fetchMovements({ search, page }) {
  let query = supabase.from('inventory_movements').select('*', { count: 'exact' })
  if (search && search.length >= 2)
    query = query.or(`sku.ilike.%${search}%,product_name.ilike.%${search}%`)
  const from = page * MOV_SIZE
  const { data, error, count } = await query
    .order('changed_at', { ascending: false })
    .range(from, from + MOV_SIZE - 1)
  if (error) throw error
  return { data: data || [], total: count || 0 }
}

async function fetchSnapshot(date) {
  const { data, error } = await supabase
    .from('inventory_snapshots')
    .select('*')
    .eq('snapshot_date', date)
    .order('product_name')
  if (error) throw error
  return data || []
}

const Delta = ({ val }) => {
  if (!val) return <span style={{ color: T.muted }}>—</span>
  const color = val > 0 ? '#22c55e' : '#ef4444'
  return <span style={{ color, fontWeight: 700 }}>{val > 0 ? `+${val}` : val}</span>
}

const fmtDateTime = (ts) => {
  if (!ts) return '—'
  const d = new Date(ts)
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' }) +
    ' ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
}

export default function InventoryPage() {
  const [view, setView] = useState('live')

  // ── Live: all Supabase items loaded once
  const [supabaseItems, setSupabaseItems] = useState([])
  const [kpis, setKpis]     = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]   = useState('')
  const [store, setStore]   = useState('All')
  const [search, setSearch] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [page, setPage]     = useState(0)
  const [exporting, setExporting] = useState(false)
  const searchTimer = useRef(null)

  // ── Movements
  const [movements, setMovements]       = useState([])
  const [movTotal, setMovTotal]         = useState(0)
  const [movPage, setMovPage]           = useState(0)
  const [movSearch, setMovSearch]       = useState('')
  const [movSearchInput, setMovSearchInput] = useState('')
  const [movLoading, setMovLoading]     = useState(false)
  const movTimer = useRef(null)

  // ── Snapshot
  const [snapDate, setSnapDate]     = useState(new Date().toISOString().slice(0, 10))
  const [snapData, setSnapData]     = useState([])
  const [snapLoading, setSnapLoading] = useState(false)
  const [snapError, setSnapError]   = useState('')
  const [snapping, setSnapping]     = useState(false)
  const [snapMsg, setSnapMsg]       = useState('')
  const [snapSearchInput, setSnapSearchInput] = useState('')
  const [snapSearch, setSnapSearch] = useState('')
  const snapTimer = useRef(null)

  // ── Sheet qty (Maxtrify) — primary source of qty + title for sheet-only items
  const [sheetQty, setSheetQty] = useState({})
  useEffect(() => {
    fetch('/api/inventory-data')
      .then(r => r.json())
      .then(d => {
        if (d.items) {
          const map = {}
          d.items.forEach(i => {
            map[i.sku.toUpperCase()] = {
              qty_uk: i.qty_row ?? 0,
              qty_us: i.qty_us  ?? 0,
              title:  i.title   || '',
            }
          })
          setSheetQty(map)
        }
      })
      .catch(() => {})
  }, [])

  // ── GA4 weekly sales
  const [weeklySales, setWeeklySales] = useState({})
  useEffect(() => {
    Promise.all([
      fetch('/api/sales-data?days=7&store=row').then(r => r.json()),
      fetch('/api/sales-data?days=7&store=us').then(r => r.json()),
    ]).then(([rowData, usData]) => {
      const map = {}
      for (const r of (rowData.rows || [])) {
        const k = (r.item_id || '').toUpperCase()
        if (!map[k]) map[k] = { row: 0, us: 0 }
        map[k].row = r.purchased || 0
      }
      for (const r of (usData.rows || [])) {
        const k = (r.item_id || '').toUpperCase()
        if (!map[k]) map[k] = { row: 0, us: 0 }
        map[k].us = r.purchased || 0
      }
      setWeeklySales(map)
    }).catch(() => {})
  }, [])

  const [coverSort, setCoverSort] = useState(false)
  const [abcFilter, setAbcFilter] = useState('All')

  const abcMap = useMemo(() => {
    const entries = Object.entries(weeklySales)
      .map(([sku, v]) => ({ sku, units: (v.row || 0) + (v.us || 0) }))
      .filter(e => e.units > 0)
    const total = entries.reduce((s, e) => s + e.units, 0)
    if (total === 0) return {}
    entries.sort((a, b) => b.units - a.units)
    let cum = 0
    const map = {}
    for (const e of entries) {
      cum += e.units
      map[e.sku] = cum / total <= 0.8 ? 'A' : cum / total <= 0.95 ? 'B' : 'C'
    }
    return map
  }, [weeklySales])

  // ── Load ALL Supabase items once on mount
  const loadSupabase = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const data = await fetchAllSupabase()
      setSupabaseItems(data)
    } catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchKPIs().then(setKpis).catch(() => {}) }, [])
  useEffect(() => { loadSupabase() }, [])

  // Reset page when any filter changes
  useEffect(() => { setPage(0) }, [search, store, abcFilter, coverSort])

  // ── Merge: Supabase items + sheet-only items (in Maxtrify but not in ERP DB)
  const mergedItems = useMemo(() => {
    const supabaseSkus = new Set(supabaseItems.map(p => (p.sku || '').toUpperCase()))
    const sheetOnly = Object.entries(sheetQty)
      .filter(([sku, v]) => !supabaseSkus.has(sku) && (v.qty_uk > 0 || v.qty_us > 0))
      .map(([sku, v]) => {
        const parts = sku.split('-')
        const last  = parts[parts.length - 1]
        return {
          id: `sheet-${sku}`,
          product_name: v.title || sku,
          sku,
          size: SIZES.has(last) ? last : null,
          qty_uk: 0, qty_us: 0,
          cost_price: null, retail_price: null, barcode: null,
          incoming_uk: null, incoming_us: null,
          restock_date_uk: null, restock_date_us: null,
          _sheetOnly: true,
        }
      })
    return [...supabaseItems, ...sheetOnly]
  }, [supabaseItems, sheetQty])

  // ── Client-side filter + sort
  const filteredItems = useMemo(() => {
    let result = mergedItems

    if (search && search.length >= 2) {
      const q = search.toLowerCase()
      result = result.filter(p =>
        (p.product_name || '').toLowerCase().includes(q) ||
        (p.sku          || '').toLowerCase().includes(q) ||
        (p.barcode      || '').toLowerCase().includes(q) ||
        (p.size         || '').toLowerCase().includes(q)
      )
    }

    if (store !== 'All') {
      result = result.filter(p => {
        const sq   = sheetQty[(p.sku || '').toUpperCase()] || {}
        const qRow = sq.qty_uk ?? p.qty_uk ?? 0
        const qUs  = sq.qty_us ?? p.qty_us ?? 0
        if (store === 'UK')           return qRow > 0
        if (store === 'US')           return qUs  > 0
        if (store === 'Out of stock') return qRow === 0 && qUs === 0
        if (store === 'Low stock')    return (qRow > 0 && qRow < 10) || (qUs > 0 && qUs < 10)
        return true
      })
    }

    if (abcFilter !== 'All') {
      result = result.filter(p => abcMap[(p.sku || '').toUpperCase()] === abcFilter)
    }

    return [...result].sort((a, b) => {
      if (coverSort) {
        const cover = p => {
          const sq = sheetQty[(p.sku || '').toUpperCase()] || {}
          const ws = weeklySales[(p.sku || '').toUpperCase()] || {}
          const cr = ws.row > 0 ? (sq.qty_uk ?? 0) / ws.row : Infinity
          const cu = ws.us  > 0 ? (sq.qty_us ?? 0) / ws.us  : Infinity
          return Math.min(cr, cu)
        }
        return cover(a) - cover(b)
      }
      const nc = (a.product_name || '').localeCompare(b.product_name || '')
      return nc !== 0 ? nc : (a.size || '').localeCompare(b.size || '')
    })
  }, [mergedItems, search, store, abcFilter, abcMap, coverSort, sheetQty, weeklySales])

  const totalPages = Math.ceil(filteredItems.length / PAGE_SIZE)
  const pageItems  = filteredItems.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  const coverageDist = useMemo(() => {
    const b = { critical: 0, low: 0, ok: 0, good: 0, noSales: 0 }
    for (const item of mergedItems) {
      const sq = sheetQty[(item.sku || '').toUpperCase()] || {}
      const ws = weeklySales[(item.sku || '').toUpperCase()] || {}
      const qUk = sq.qty_uk ?? item.qty_uk ?? 0
      const qUs = sq.qty_us ?? item.qty_us ?? 0
      if (!ws.row && !ws.us) { b.noSales++; continue }
      const cr = ws.row > 0 ? qUk / ws.row : Infinity
      const cu = ws.us  > 0 ? qUs / ws.us  : Infinity
      const cover = Math.min(cr, cu)
      if (cover < 4) b.critical++
      else if (cover < 8) b.low++
      else if (cover < 12) b.ok++
      else b.good++
    }
    return b
  }, [mergedItems, sheetQty, weeklySales])

  const baseSku = (sku) => {
    const parts = sku.split('-')
    const last = parts[parts.length - 1]
    return SIZES.has(last) ? parts.slice(0, -1).join('-') : sku
  }

  const styleGroups = useMemo(() => {
    const groups = {}
    for (const item of filteredItems) {
      const sku = (item.sku || '').toUpperCase()
      const base = baseSku(sku)
      const sq = sheetQty[sku] || {}
      const qUk = sq.qty_uk ?? item.qty_uk ?? 0
      const qUs = sq.qty_us ?? item.qty_us ?? 0
      if (!groups[base]) groups[base] = {
        base_sku: base,
        product_name: item.product_name || sku,
        total_uk: 0, total_us: 0,
        sizes: [],
      }
      groups[base].total_uk += qUk
      groups[base].total_us += qUs
      const sz = item.size
      if (sz) groups[base].sizes.push({ size: sz, qty_uk: qUk, qty_us: qUs })
    }
    return Object.values(groups).sort((a,b) => a.product_name.localeCompare(b.product_name))
  }, [filteredItems, sheetQty])

  const handleSearch = (val) => {
    setSearchInput(val)
    clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => setSearch(val), 300)
  }
  const handleStore = (s) => setStore(s)

  // ── Movements
  const loadMovements = useCallback(async (s, p) => {
    setMovLoading(true)
    try {
      const { data, total } = await fetchMovements({ search: s, page: p })
      setMovements(data); setMovTotal(total)
    } catch (e) { console.error(e) }
    finally { setMovLoading(false) }
  }, [])

  useEffect(() => {
    if (view === 'movements') loadMovements(movSearch, movPage)
  }, [view, movSearch, movPage])

  const handleMovSearch = (val) => {
    setMovSearchInput(val)
    clearTimeout(movTimer.current)
    movTimer.current = setTimeout(() => { setMovPage(0); setMovSearch(val) }, 400)
  }

  // ── Snapshot
  const loadSnapshot = useCallback(async (date) => {
    setSnapLoading(true); setSnapError('')
    try {
      const data = await fetchSnapshot(date)
      setSnapData(data)
      if (data.length === 0) setSnapError('No snapshot found for this date. Snapshots are taken automatically every night at 2:00 AM.')
    } catch (e) { setSnapError(e.message) }
    finally { setSnapLoading(false) }
  }, [])

  useEffect(() => {
    if (view === 'snapshot') loadSnapshot(snapDate)
  }, [view, snapDate])

  const handleSnapSearch = (val) => {
    setSnapSearchInput(val)
    clearTimeout(snapTimer.current)
    snapTimer.current = setTimeout(() => setSnapSearch(val), 300)
  }

  const takeSnapshotNow = async () => {
    setSnapping(true); setSnapMsg('')
    try {
      const res  = await fetch('/api/inventory-snapshot', { method: 'POST' })
      const data = await res.json()
      if (data.error) setSnapMsg(`Error: ${data.error}`)
      else { setSnapMsg(`✓ Snapshot saved: ${data.upserted} SKUs for ${data.date}`); loadSnapshot(snapDate) }
    } catch (e) { setSnapMsg(`Error: ${e.message}`) }
    setSnapping(false)
  }

  // ── Export (uses current filtered view)
  const exportExcel = () => {
    setExporting(true)
    try {
      const rows = filteredItems.map(p => {
        const sq   = sheetQty[(p.sku || '').toUpperCase()] || {}
        const qRow = sq.qty_uk ?? p.qty_uk ?? 0
        const qUs  = sq.qty_us ?? p.qty_us ?? 0
        return {
          'Product Name':       p.product_name || '',
          'Size':               p.size || '',
          'SKU':                p.sku || '',
          'Barcode':            p.barcode || '',
          'UK Qty':             qRow,
          'US Qty':             qUs,
          'Total':              qRow + qUs,
          'Cost Price (GBP)':   p.cost_price || '',
          'Retail Price (GBP)': p.retail_price || '',
          'UK Incoming':        p.incoming_uk || 0,
          'UK Restock Date':    p.restock_date_uk || '',
          'US Incoming':        p.incoming_us || 0,
          'US Restock Date':    p.restock_date_us || '',
          'In ERP':             p._sheetOnly ? 'No' : 'Yes',
        }
      })
      const ws = XLSX.utils.json_to_sheet(rows)
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'Inventory')
      XLSX.writeFile(wb, `inventory-${new Date().toISOString().slice(0, 10)}.xlsx`)
    } catch (e) { console.error('Export failed:', e) }
    setExporting(false)
  }

  const movTotalPages = Math.ceil(movTotal / MOV_SIZE)
  const qtyStyle = (qty) => ({ textAlign: 'right', fontWeight: qty === 0 ? 400 : 700, color: qty === 0 ? T.border : qty < 10 ? T.yellow : T.text })

  const filteredSnap = snapSearch.length >= 2
    ? snapData.filter(r => r.product_name?.toLowerCase().includes(snapSearch.toLowerCase()) || r.sku?.toLowerCase().includes(snapSearch.toLowerCase()))
    : snapData

  const Tab = ({ id, label }) => (
    <button onClick={() => setView(id)} style={{
      background: view === id ? T.accent : T.subtle,
      color: view === id ? '#fff' : T.muted,
      border: 'none', borderRadius: 5, padding: '7px 18px',
      fontSize: 13, fontWeight: 600, cursor: 'pointer',
    }}>{label}</button>
  )

  const ABCBadge = ({ sku }) => {
    const grade = abcMap[(sku || '').toUpperCase()]
    if (!grade) return <span style={{ color: T.border, fontSize: 11 }}>—</span>
    const colors = { A: '#22c55e', B: '#f59e0b', C: T.muted }
    return (
      <span style={{ background: colors[grade] + '20', color: colors[grade], border: `1px solid ${colors[grade]}40`, borderRadius: 3, padding: '1px 7px', fontSize: 11, fontWeight: 800 }}>{grade}</span>
    )
  }

  return (
    <Shell title="Inventory">
      {/* KPIs — qty totals from sheet, counts from Supabase */}
      {(() => {
        const sheetVals = Object.values(sheetQty)
        const hasSheet  = sheetVals.length > 0
        const totalRow  = hasSheet ? sheetVals.reduce((s, v) => s + (v.qty_uk || 0), 0) : kpis?.total_uk
        const totalUs   = hasSheet ? sheetVals.reduce((s, v) => s + (v.qty_us || 0), 0) : kpis?.total_us
        const sheetOnlyCount = Object.keys(sheetQty).filter(sku => {
          const v = sheetQty[sku]
          return (v.qty_uk > 0 || v.qty_us > 0) &&
            !supabaseItems.some(p => (p.sku || '').toUpperCase() === sku)
        }).length
        const criticalCount = hasSheet ? Object.entries(sheetQty).filter(([sku, v]) => {
          const ws = weeklySales[sku] || {}
          const coverRow = ws.row > 0 ? v.qty_uk / ws.row : null
          const coverUs  = ws.us  > 0 ? v.qty_us / ws.us  : null
          return (coverRow !== null && coverRow < 4) || (coverUs !== null && coverUs < 4)
        }).length : null
        return (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 12, marginBottom: 20 }}>
            <KPI label="Total SKUs (ERP)" value={kpis ? kpis.total_skus?.toLocaleString() : '…'} />
            <KPI label="🇬🇧 ROW Units"    value={totalRow != null ? totalRow.toLocaleString() : '…'} color="#3b82f6" />
            <KPI label="🇺🇸 US Units"     value={totalUs  != null ? totalUs.toLocaleString()  : '…'} color="#8b5cf6" />
            <KPI label="Sheet-only SKUs"  value={sheetOnlyCount > 0 ? sheetOnlyCount : '0'} color={sheetOnlyCount > 0 ? T.yellow : T.muted} />
            <KPI label="Out of Stock"     value={kpis ? kpis.out_of_stock?.toLocaleString() : '…'} color={T.red} />
            <KPI label="⚠ Critical (<4w)" value={criticalCount != null ? criticalCount.toLocaleString() : '…'} color={criticalCount > 0 ? T.red : T.green} />
          </div>
        )
      })()}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <Tab id="live"      label="📦 Live" />
        <Tab id="movements" label="🔄 Movements" />
        <Tab id="snapshot"  label="📸 Snapshot" />
        <Tab id="style"     label="👗 By Style" />
      </div>

      {/* ── LIVE VIEW ── */}
      {view === 'live' && <>
        {Object.values(weeklySales).length > 0 && (
          <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 10, padding: '14px 20px', marginBottom: 16, display: 'flex', gap: 20, alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ fontSize: 11, color: T.muted, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700, whiteSpace: 'nowrap' }}>Stock Coverage Distribution</div>
            <div style={{ display: 'flex', gap: 12, flex: 1, flexWrap: 'wrap' }}>
              {[
                { label: 'Critical <4w', value: coverageDist.critical, color: T.red },
                { label: '4–8 weeks',    value: coverageDist.low,      color: T.yellow },
                { label: '8–12 weeks',   value: coverageDist.ok,       color: '#3b82f6' },
                { label: '12+ weeks',    value: coverageDist.good,     color: T.green },
                { label: 'No sales data',value: coverageDist.noSales,  color: T.border },
              ].map(b => {
                const total = Object.values(coverageDist).reduce((s,v)=>s+v,0) || 1
                const pct = ((b.value / total) * 100).toFixed(0)
                return (
                  <div key={b.label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <div style={{ width: 10, height: 10, borderRadius: 2, background: b.color, flexShrink: 0 }} />
                    <div>
                      <div style={{ fontSize: 11, color: T.muted }}>{b.label}</div>
                      <div style={{ fontSize: 15, fontFamily: 'Barlow Condensed', fontWeight: 800, color: b.color }}>{b.value.toLocaleString()} <span style={{ fontSize: 10, fontWeight: 400, color: T.muted }}>({pct}%)</span></div>
                    </div>
                  </div>
                )
              })}
            </div>
            <div style={{ flex: 1, minWidth: 200 }}>
              <div style={{ height: 8, borderRadius: 4, overflow: 'hidden', display: 'flex', gap: 1 }}>
                {[
                  { value: coverageDist.critical, color: T.red },
                  { value: coverageDist.low,      color: T.yellow },
                  { value: coverageDist.ok,       color: '#3b82f6' },
                  { value: coverageDist.good,     color: T.green },
                ].map((b,i) => {
                  const total = Object.values(coverageDist).reduce((s,v)=>s+v,0) || 1
                  return <div key={i} style={{ flex: b.value / total, background: b.color, minWidth: b.value > 0 ? 2 : 0 }} />
                })}
              </div>
            </div>
          </div>
        )}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {[
              { id: 'All',          label: 'All' },
              { id: 'UK',           label: '🇬🇧 ROW in stock' },
              { id: 'US',           label: '🇺🇸 US in stock' },
              { id: 'Low stock',    label: '⚠ Low stock' },
              { id: 'Out of stock', label: '✕ Out of stock' },
            ].map(f => (
              <button key={f.id} onClick={() => handleStore(f.id)} style={{
                background: store === f.id ? T.accent : T.subtle,
                color: store === f.id ? '#fff' : T.muted,
                border: 'none', borderRadius: 4, padding: '5px 12px',
                fontSize: 12, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
              }}>{f.label}</button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <input placeholder="Search product, SKU, barcode…" value={searchInput} onChange={e => handleSearch(e.target.value)}
              style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 5, padding: '7px 12px', color: T.text, fontSize: 13, width: 260, outline: 'none' }} />
            <div style={{ width: 1, height: 20, background: T.border }} />
            {[
              { val: 'All', label: 'All' },
              { val: 'A',   label: 'A — Top', color: '#22c55e' },
              { val: 'B',   label: 'B — Mid', color: '#f59e0b' },
              { val: 'C',   label: 'C — Slow', color: T.muted },
            ].map(({ val, label, color }) => (
              <button key={val} onClick={() => setAbcFilter(val)} style={{
                background: abcFilter === val ? (color || T.accent) : T.subtle,
                color: abcFilter === val ? (val === 'C' ? T.text : '#fff') : T.muted,
                border: 'none', borderRadius: 4, padding: '5px 12px',
                fontSize: 12, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap',
              }}>{label}</button>
            ))}
            <div style={{ width: 1, height: 20, background: T.border }} />
            <button onClick={() => setCoverSort(v => !v)} style={{ background: coverSort ? T.red : T.subtle, color: coverSort ? '#fff' : T.muted, border: 'none', borderRadius: 4, padding: '7px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>
              {coverSort ? '⚠ Critical first ✓' : 'Sort by cover'}
            </button>
            <BtnGhost onClick={exportExcel} disabled={exporting}>{exporting ? 'Exporting…' : '⬇ Export Excel'}</BtnGhost>
          </div>
        </div>

        {error && <div style={{ color: T.red, padding: 12, marginBottom: 12, fontSize: 13 }}>⚠ {error}</div>}

        <Card>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: T.surface }}>
                  <Th>Product Name</Th><Th>Size</Th><Th>SKU</Th><Th>Barcode</Th>
                  <Th style={{ textAlign: 'right', color: '#3b82f6' }}>🇬🇧 ROW</Th>
                  <Th style={{ textAlign: 'right', color: '#8b5cf6' }}>🇺🇸 US</Th>
                  <Th style={{ textAlign: 'right' }}>Total</Th>
                  <Th style={{ textAlign: 'center' }}>ABC</Th>
                  <Th style={{ textAlign: 'right' }}>Cost</Th>
                  <Th style={{ textAlign: 'right' }}>Retail</Th>
                  <Th style={{ textAlign: 'right' }}>Margin</Th>
                  <Th style={{ textAlign: 'right', color: '#3b82f6' }}>🇬🇧 Incoming</Th>
                  <Th style={{ textAlign: 'right', color: '#3b82f6' }}>🇬🇧 Restock</Th>
                  <Th style={{ textAlign: 'right', color: '#8b5cf6' }}>🇺🇸 Incoming</Th>
                  <Th style={{ textAlign: 'right', color: '#8b5cf6' }}>🇺🇸 Restock</Th>
                  <Th style={{ textAlign: 'right', color: T.muted }}>🇬🇧 Cover</Th>
                  <Th style={{ textAlign: 'right', color: T.muted }}>🇺🇸 Cover</Th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={17} style={{ padding: 40, textAlign: 'center', color: T.muted }}>
                    <div style={{ display: 'inline-block', width: 20, height: 20, border: `2px solid ${T.border}`, borderTopColor: T.accent, borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
                  </td></tr>
                ) : pageItems.length === 0 ? (
                  <tr><td colSpan={17} style={{ padding: 40, textAlign: 'center', color: T.muted }}>
                    {search || store !== 'All' || abcFilter !== 'All' ? 'No results for current filters' : 'No inventory data'}
                  </td></tr>
                ) : pageItems.map((p, i) => {
                  const sq  = sheetQty[(p.sku || '').toUpperCase()] || {}
                  const ws  = weeklySales[(p.sku || '').toUpperCase()] || {}
                  const qRow = sq.qty_uk ?? p.qty_uk ?? 0
                  const qUs  = sq.qty_us ?? p.qty_us ?? 0
                  const tot  = qRow + qUs
                  const coverRow = ws.row > 0 ? qRow / ws.row : null
                  const coverUs  = ws.us  > 0 ? qUs  / ws.us  : null
                  const CoverCell = ({ weeks }) => {
                    if (weeks === null) return <Td style={{ textAlign: 'right', color: T.border, fontSize: 12 }}>—</Td>
                    const color = weeks < 4 ? T.red : weeks < 8 ? T.yellow : T.green
                    return <Td style={{ textAlign: 'right', fontWeight: 700, fontSize: 12, color }}>{weeks.toFixed(1)}w</Td>
                  }
                  const isCritical = abcMap[(p.sku||'').toUpperCase()] === 'A' && ((coverRow !== null && coverRow < 4) || (coverUs !== null && coverUs < 4))
                  return (
                    <tr key={p.id || i} className="row-hover" style={{ opacity: p._sheetOnly ? 0.85 : 1, borderLeft: isCritical ? `3px solid ${T.red}` : '3px solid transparent' }}>
                      <Td style={{ fontWeight: 600, maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {p.product_name}
                        {p._sheetOnly && <span style={{ marginLeft: 6, fontSize: 9, background: T.yellow + '30', color: T.yellow, borderRadius: 3, padding: '1px 5px', fontWeight: 700, verticalAlign: 'middle' }}>SHEET</span>}
                      </Td>
                      <Td>{p.size ? <span style={{ background: T.subtle, color: T.text, borderRadius: 4, padding: '2px 8px', fontSize: 11, fontWeight: 700 }}>{p.size}</span> : <span style={{ color: T.muted, fontSize: 12 }}>—</span>}</Td>
                      <Td style={{ fontFamily: 'monospace', fontSize: 11, color: T.muted }}>{p.sku || '—'}</Td>
                      <Td style={{ fontFamily: 'monospace', fontSize: 11, color: T.muted }}>{p.barcode || '—'}</Td>
                      <Td style={qtyStyle(qRow)}>{qRow.toLocaleString()}</Td>
                      <Td style={qtyStyle(qUs)}>{qUs.toLocaleString()}</Td>
                      <Td style={{ textAlign: 'right', fontWeight: 700, color: tot === 0 ? T.red : tot < 20 ? T.yellow : T.text }}>{tot.toLocaleString()}</Td>
                      <Td style={{ textAlign: 'center' }}><ABCBadge sku={p.sku} /></Td>
                      <Td style={{ textAlign: 'right', color: T.muted, fontSize: 12 }}>{p.cost_price ? fmt(p.cost_price, 'GBP') : '—'}</Td>
                      <Td style={{ textAlign: 'right', color: T.accent, fontSize: 12 }}>{p.retail_price ? fmt(p.retail_price, 'GBP') : '—'}</Td>
                      {(() => {
                        if (!p.cost_price || !p.retail_price) return <Td style={{ textAlign: 'right', color: T.border, fontSize: 12 }}>—</Td>
                        const margin = ((p.retail_price - p.cost_price) / p.retail_price) * 100
                        const color  = margin >= 80 ? T.green : margin >= 60 ? T.yellow : T.red
                        return <Td style={{ textAlign: 'right', fontWeight: 700, fontSize: 12, color }}>{margin.toFixed(0)}%</Td>
                      })()}
                      <Td style={{ textAlign: 'right', color: '#3b82f6', fontWeight: p.incoming_uk > 0 ? 700 : 400 }}>{p.incoming_uk > 0 ? `+${p.incoming_uk}` : '—'}</Td>
                      <Td style={{ textAlign: 'right', fontSize: 12 }}>
                        {p.restock_date_uk ? <span style={{ color: new Date(p.restock_date_uk) < new Date(Date.now() + 30*864e5) ? T.green : T.muted, fontWeight: 600 }}>{new Date(p.restock_date_uk).toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'2-digit' })}</span> : <span style={{ color: T.border }}>—</span>}
                      </Td>
                      <Td style={{ textAlign: 'right', color: '#8b5cf6', fontWeight: p.incoming_us > 0 ? 700 : 400 }}>{p.incoming_us > 0 ? `+${p.incoming_us}` : '—'}</Td>
                      <Td style={{ textAlign: 'right', fontSize: 12 }}>
                        {p.restock_date_us ? <span style={{ color: new Date(p.restock_date_us) < new Date(Date.now() + 30*864e5) ? T.green : T.muted, fontWeight: 600 }}>{new Date(p.restock_date_us).toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'2-digit' })}</span> : <span style={{ color: T.border }}>—</span>}
                      </Td>
                      <CoverCell weeks={coverRow} />
                      <CoverCell weeks={coverUs} />
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          {filteredItems.length > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderTop: `1px solid ${T.border}` }}>
              <span style={{ fontSize: 12, color: T.muted }}>
                Showing {(page * PAGE_SIZE + 1).toLocaleString()}–{Math.min((page + 1) * PAGE_SIZE, filteredItems.length).toLocaleString()} of <strong style={{ color: T.text }}>{filteredItems.length.toLocaleString()}</strong> variants
              </span>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <button onClick={() => setPage(0)} disabled={page === 0} style={{ background: T.subtle, border: 'none', color: page === 0 ? T.border : T.muted, borderRadius: 4, padding: '5px 10px', cursor: page === 0 ? 'default' : 'pointer', fontSize: 13 }}>«</button>
                <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0} style={{ background: T.subtle, border: 'none', color: page === 0 ? T.border : T.muted, borderRadius: 4, padding: '5px 12px', cursor: page === 0 ? 'default' : 'pointer', fontSize: 13 }}>‹ Prev</button>
                <span style={{ fontSize: 12, color: T.muted, padding: '0 8px' }}>Page {page + 1} / {totalPages}</span>
                <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1} style={{ background: T.subtle, border: 'none', color: page >= totalPages - 1 ? T.border : T.muted, borderRadius: 4, padding: '5px 12px', cursor: page >= totalPages - 1 ? 'default' : 'pointer', fontSize: 13 }}>Next ›</button>
                <button onClick={() => setPage(totalPages - 1)} disabled={page >= totalPages - 1} style={{ background: T.subtle, border: 'none', color: page >= totalPages - 1 ? T.border : T.muted, borderRadius: 4, padding: '5px 10px', cursor: page >= totalPages - 1 ? 'default' : 'pointer', fontSize: 13 }}>»</button>
              </div>
            </div>
          )}
        </Card>
      </>}

      {/* ── MOVEMENTS VIEW ── */}
      {view === 'movements' && <>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <span style={{ fontSize: 13, color: T.muted }}>Automatically logged on every inventory update</span>
          <input placeholder="Search product or SKU…" value={movSearchInput} onChange={e => handleMovSearch(e.target.value)}
            style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 5, padding: '7px 12px', color: T.text, fontSize: 13, width: 260, outline: 'none' }} />
        </div>

        <Card>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: T.surface }}>
                  <Th>Date & Time</Th><Th>Product</Th><Th>SKU</Th>
                  <Th style={{ textAlign: 'right', color: '#3b82f6' }}>🇬🇧 Before</Th>
                  <Th style={{ textAlign: 'right', color: '#3b82f6' }}>🇬🇧 After</Th>
                  <Th style={{ textAlign: 'right', color: '#3b82f6' }}>🇬🇧 Δ</Th>
                  <Th style={{ textAlign: 'right', color: '#8b5cf6' }}>🇺🇸 Before</Th>
                  <Th style={{ textAlign: 'right', color: '#8b5cf6' }}>🇺🇸 After</Th>
                  <Th style={{ textAlign: 'right', color: '#8b5cf6' }}>🇺🇸 Δ</Th>
                </tr>
              </thead>
              <tbody>
                {movLoading ? (
                  <tr><td colSpan={9} style={{ padding: 40, textAlign: 'center', color: T.muted }}>
                    <div style={{ display: 'inline-block', width: 20, height: 20, border: `2px solid ${T.border}`, borderTopColor: T.accent, borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
                  </td></tr>
                ) : movements.length === 0 ? (
                  <tr><td colSpan={9} style={{ padding: 40, textAlign: 'center', color: T.muted }}>
                    No movements yet — changes to inventory will appear here automatically
                  </td></tr>
                ) : movements.map(m => (
                  <tr key={m.id} className="row-hover">
                    <Td style={{ fontSize: 12, color: T.muted, whiteSpace: 'nowrap' }}>{fmtDateTime(m.changed_at)}</Td>
                    <Td style={{ fontWeight: 600, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.product_name || '—'}</Td>
                    <Td style={{ fontFamily: 'monospace', fontSize: 11, color: T.muted }}>{m.sku || '—'}</Td>
                    <Td style={{ textAlign: 'right', color: T.muted }}>{m.qty_uk_before}</Td>
                    <Td style={{ textAlign: 'right', fontWeight: 700 }}>{m.qty_uk_after}</Td>
                    <Td style={{ textAlign: 'right' }}><Delta val={m.qty_uk_after - m.qty_uk_before} /></Td>
                    <Td style={{ textAlign: 'right', color: T.muted }}>{m.qty_us_before}</Td>
                    <Td style={{ textAlign: 'right', fontWeight: 700 }}>{m.qty_us_after}</Td>
                    <Td style={{ textAlign: 'right' }}><Delta val={m.qty_us_after - m.qty_us_before} /></Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {movTotal > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderTop: `1px solid ${T.border}` }}>
              <span style={{ fontSize: 12, color: T.muted }}>{movTotal.toLocaleString()} total movements</span>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <button onClick={() => setMovPage(p => Math.max(0, p - 1))} disabled={movPage === 0} style={{ background: T.subtle, border: 'none', color: movPage === 0 ? T.border : T.muted, borderRadius: 4, padding: '5px 12px', cursor: movPage === 0 ? 'default' : 'pointer', fontSize: 13 }}>‹ Prev</button>
                <span style={{ fontSize: 12, color: T.muted, padding: '0 8px' }}>Page {movPage + 1} / {movTotalPages}</span>
                <button onClick={() => setMovPage(p => Math.min(movTotalPages - 1, p + 1))} disabled={movPage >= movTotalPages - 1} style={{ background: T.subtle, border: 'none', color: movPage >= movTotalPages - 1 ? T.border : T.muted, borderRadius: 4, padding: '5px 12px', cursor: movPage >= movTotalPages - 1 ? 'default' : 'pointer', fontSize: 13 }}>Next ›</button>
              </div>
            </div>
          )}
        </Card>
      </>}

      {/* ── SNAPSHOT VIEW ── */}
      {view === 'snapshot' && <>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <label style={{ fontSize: 13, color: T.muted }}>View snapshot for:</label>
            <input type="date" value={snapDate} onChange={e => setSnapDate(e.target.value)}
              style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 5, padding: '7px 12px', color: T.text, fontSize: 13, outline: 'none' }} />
            {!snapLoading && snapData.length > 0 && (
              <span style={{ fontSize: 12, color: T.muted }}>{snapData.length.toLocaleString()} SKUs</span>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input placeholder="Search product or SKU…" value={snapSearchInput} onChange={e => handleSnapSearch(e.target.value)}
              style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 5, padding: '7px 12px', color: T.text, fontSize: 13, width: 240, outline: 'none' }} />
            <BtnGhost onClick={takeSnapshotNow} disabled={snapping} style={{ fontSize: 12 }}>
              {snapping ? 'Saving…' : '📸 Take snapshot now'}
            </BtnGhost>
          </div>
        </div>

        {snapMsg && (
          <div style={{ background: snapMsg.startsWith('✓') ? '#22c55e15' : '#ef444415', border: `1px solid ${snapMsg.startsWith('✓') ? '#22c55e40' : '#ef444440'}`, borderRadius: 8, padding: '10px 16px', marginBottom: 12, fontSize: 13, color: snapMsg.startsWith('✓') ? '#22c55e' : '#ef4444' }}>
            {snapMsg}
          </div>
        )}

        <Card>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: T.surface }}>
                  <Th>Product Name</Th><Th>SKU</Th>
                  <Th style={{ textAlign: 'right', color: '#3b82f6' }}>🇬🇧 ROW</Th>
                  <Th style={{ textAlign: 'right', color: '#8b5cf6' }}>🇺🇸 US</Th>
                  <Th style={{ textAlign: 'right' }}>Total</Th>
                </tr>
              </thead>
              <tbody>
                {snapLoading ? (
                  <tr><td colSpan={5} style={{ padding: 40, textAlign: 'center', color: T.muted }}>
                    <div style={{ display: 'inline-block', width: 20, height: 20, border: `2px solid ${T.border}`, borderTopColor: T.accent, borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
                  </td></tr>
                ) : snapError ? (
                  <tr><td colSpan={5} style={{ padding: 40, textAlign: 'center', color: T.muted, fontSize: 13 }}>{snapError}</td></tr>
                ) : filteredSnap.length === 0 ? (
                  <tr><td colSpan={5} style={{ padding: 40, textAlign: 'center', color: T.muted }}>No results</td></tr>
                ) : filteredSnap.map(r => {
                  const tot = (r.qty_uk || 0) + (r.qty_us || 0)
                  return (
                    <tr key={r.id} className="row-hover">
                      <Td style={{ fontWeight: 600 }}>{r.product_name || '—'}</Td>
                      <Td style={{ fontFamily: 'monospace', fontSize: 11, color: T.muted }}>{r.sku || '—'}</Td>
                      <Td style={qtyStyle(r.qty_uk || 0)}>{(r.qty_uk || 0).toLocaleString()}</Td>
                      <Td style={qtyStyle(r.qty_us || 0)}>{(r.qty_us || 0).toLocaleString()}</Td>
                      <Td style={{ textAlign: 'right', fontWeight: 700, color: tot === 0 ? T.red : tot < 20 ? T.yellow : T.text }}>{tot.toLocaleString()}</Td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          {!snapLoading && !snapError && snapData.length > 0 && (
            <div style={{ padding: '10px 16px', borderTop: `1px solid ${T.border}`, display: 'flex', gap: 20 }}>
              <span style={{ fontSize: 12, color: T.muted }}>🇬🇧 ROW total: <strong style={{ color: '#3b82f6' }}>{snapData.reduce((s, r) => s + (r.qty_uk || 0), 0).toLocaleString()}</strong></span>
              <span style={{ fontSize: 12, color: T.muted }}>🇺🇸 US total: <strong style={{ color: '#8b5cf6' }}>{snapData.reduce((s, r) => s + (r.qty_us || 0), 0).toLocaleString()}</strong></span>
            </div>
          )}
        </Card>
      </>}

      {/* ── STYLE VIEW ── */}
      {view === 'style' && <>
        <div style={{ marginBottom: 12, fontSize: 13, color: T.muted }}>
          {styleGroups.length.toLocaleString()} styles · grouped by base product · apply filters above to narrow down
        </div>
        <Card>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: T.surface }}>
                  <Th>Product</Th>
                  <Th>Base SKU</Th>
                  <Th style={{ textAlign: 'right', color: '#3b82f6' }}>🇬🇧 ROW Total</Th>
                  <Th style={{ textAlign: 'right', color: '#8b5cf6' }}>🇺🇸 US Total</Th>
                  <Th style={{ textAlign: 'right' }}>Combined</Th>
                  <Th>Size Breakdown</Th>
                </tr>
              </thead>
              <tbody>
                {styleGroups.length === 0 ? (
                  <tr><td colSpan={6} style={{ padding: 40, textAlign: 'center', color: T.muted }}>No styles found</td></tr>
                ) : styleGroups.map((g, i) => (
                  <tr key={g.base_sku} className="row-hover" style={{ borderTop: `1px solid ${T.border}` }}>
                    <Td style={{ fontWeight: 600, maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.product_name}</Td>
                    <Td style={{ fontFamily: 'monospace', fontSize: 11, color: T.muted }}>{g.base_sku}</Td>
                    <Td style={{ textAlign: 'right', fontWeight: 700, color: g.total_uk === 0 ? T.red : g.total_uk < 20 ? T.yellow : '#3b82f6' }}>{g.total_uk.toLocaleString()}</Td>
                    <Td style={{ textAlign: 'right', fontWeight: 700, color: g.total_us === 0 ? T.red : g.total_us < 20 ? T.yellow : '#8b5cf6' }}>{g.total_us.toLocaleString()}</Td>
                    <Td style={{ textAlign: 'right', fontWeight: 700 }}>{(g.total_uk + g.total_us).toLocaleString()}</Td>
                    <Td>
                      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                        {g.sizes.sort((a,b) => {
                          const ORDER = ['XS','S','M','L','XL','XXL','XXXL','OS','ONE SIZE']
                          return ORDER.indexOf(a.size) - ORDER.indexOf(b.size)
                        }).map(s => (
                          <span key={s.size} style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 4, padding: '2px 7px', fontSize: 11, whiteSpace: 'nowrap' }}>
                            <span style={{ fontWeight: 700, color: T.text }}>{s.size}</span>
                            <span style={{ color: '#3b82f6', marginLeft: 4 }}>{s.qty_uk}</span>
                            <span style={{ color: T.border, marginLeft: 2 }}>/</span>
                            <span style={{ color: '#8b5cf6', marginLeft: 2 }}>{s.qty_us}</span>
                          </span>
                        ))}
                      </div>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </>}

      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </Shell>
  )
}
