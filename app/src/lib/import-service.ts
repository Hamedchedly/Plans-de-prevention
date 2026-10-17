import { supabase } from './supabase'
import { OrderRow, TrackingRow } from './excel-parser'

export interface ImportResult {
  imported: number
  skipped: number
  errors: string[]
  qualifyingOrders: string[]
}

// Budget natures permanently excluded (never shown in UI)
export const EXCLUDED_BUDGET_NATURES = ['HO']
// Budget natures hidden by default but operator can reveal them
export const HIDDEN_BUDGET_NATURES = ['AC']

export async function importOrders(
  orders: OrderRow[],
  trackingData: TrackingRow[],
  onProgress?: (pct: number, message: string) => void
): Promise<ImportResult> {
  const result: ImportResult = { imported: 0, skipped: 0, errors: [], qualifyingOrders: [] }

  onProgress?.(5, 'Chargement des règles de périmètre...')

  const trackingMap = new Map<string, TrackingRow[]>()
  trackingData.forEach(row => {
    if (!trackingMap.has(row.order_number)) trackingMap.set(row.order_number, [])
    trackingMap.get(row.order_number)!.push(row)
  })

  const rulesResult = await supabase
    .from('pp_command_scope_rules')
    .select('*, pp_command_scope_rule_values(value)')
    .eq('active', true)
    .single()

  const allowedValues: string[] =
    rulesResult.data?.pp_command_scope_rule_values?.map((v: any) => v.value) || ['GT', 'GE', 'CP']

  const getScopeStatus = (budgetNature: string) => {
    if (!allowedValues.length) return 'IN_SCOPE'
    return allowedValues.includes(budgetNature) ? 'IN_SCOPE' : 'OUT_OF_SCOPE'
  }

  // HO: excluded — skip from import (still count as skipped)
  const eliminatedOrders = orders.filter(o => EXCLUDED_BUDGET_NATURES.includes(o.budget_nature))
  const validOrders = orders.filter(o => !EXCLUDED_BUDGET_NATURES.includes(o.budget_nature))
  result.skipped += eliminatedOrders.length

  onProgress?.(15, 'Vérification des commandes existantes...')

  // Single batch fetch of all existing orders
  const { data: existingOrders, error: fetchError } = await supabase
    .from('pp_orders')
    .select('id, order_number, qualification_status, tracking_match_status')
    .in('order_number', validOrders.map(o => o.order_number))

  if (fetchError) throw new Error(fetchError.message)

  const existingMap = new Map(existingOrders?.map(o => [o.order_number, o]) || [])
  const toCreate = validOrders.filter(o => !existingMap.has(o.order_number))
  const toUpdate = validOrders.filter(o => existingMap.has(o.order_number))

  onProgress?.(30, `Importation de ${toCreate.length} nouvelles commandes...`)

  // Batch insert new orders
  if (toCreate.length > 0) {
    const newRows = toCreate.map(o => ({
      order_number: o.order_number,
      order_date: o.order_date ? new Date(o.order_date).toISOString() : null,
      work_nature: o.work_nature,
      work_description: o.work_description,
      company_id: o.company_id,
      owner_user_id: o.owner_user_id,
      budget_nature: o.budget_nature,
      intervention_code: o.intervention_code,
      site_city_zip: o.site_city_zip,
      site_address: o.site_address,
      amount_ttc: o.amount_ttc,
      scope_status: getScopeStatus(o.budget_nature),
      tracking_match_status: trackingMap.has(o.order_number) ? 'MATCHED' : 'NOT_FOUND',
      qualification_status: trackingMap.has(o.order_number) ? 'QUALIFIED' : 'PENDING',
    }))

    for (let i = 0; i < newRows.length; i += 200) {
      const chunk = newRows.slice(i, i + 200)
      const { error } = await supabase.from('pp_orders').insert(chunk)
      if (error) result.errors.push(`Insertion: ${error.message}`)
      else result.imported += chunk.length
      onProgress?.(30 + 15 * Math.min(1, (i + 200) / newRows.length), 'Importation des nouvelles commandes...')
    }

    toCreate.forEach(o => {
      if (!trackingMap.has(o.order_number)) result.qualifyingOrders.push(o.order_number)
    })
  }

  onProgress?.(50, `Mise à jour de ${toUpdate.length} commandes existantes...`)

  // Batch upsert existing orders — preserve qualification_status
  if (toUpdate.length > 0) {
    const updateRows = toUpdate.map(o => {
      const ex = existingMap.get(o.order_number)!
      return {
        id: ex.id,
        order_number: o.order_number,
        order_date: o.order_date ? new Date(o.order_date).toISOString() : null,
        work_nature: o.work_nature,
        work_description: o.work_description,
        company_id: o.company_id,
        owner_user_id: o.owner_user_id,
        budget_nature: o.budget_nature,
        intervention_code: o.intervention_code,
        site_city_zip: o.site_city_zip,
        site_address: o.site_address,
        amount_ttc: o.amount_ttc,
        scope_status: getScopeStatus(o.budget_nature),
        qualification_status: ex.qualification_status, // PRESERVE
        tracking_match_status: trackingMap.has(o.order_number) ? 'MATCHED' : 'NOT_FOUND',
      }
    })

    for (let i = 0; i < updateRows.length; i += 200) {
      const chunk = updateRows.slice(i, i + 200)
      const { error } = await supabase.from('pp_orders').upsert(chunk)
      if (error) result.errors.push(`Mise à jour: ${error.message}`)
      else result.imported += chunk.length
      onProgress?.(50 + 15 * Math.min(1, (i + 200) / updateRows.length), 'Mise à jour des commandes...')
    }
  }

  onProgress?.(70, 'Réconciliation avec le suivi budgétaire...')

  // Collect orders needing reconciliation
  const newMatchedNums = toCreate.filter(o => trackingMap.has(o.order_number)).map(o => o.order_number)
  const prevUnmatchedNums = toUpdate
    .filter(o => {
      const ex = existingMap.get(o.order_number)!
      return (!ex.tracking_match_status || ex.tracking_match_status === 'NOT_FOUND') && trackingMap.has(o.order_number)
    })
    .map(o => o.order_number)

  const reconNums = [...newMatchedNums, ...prevUnmatchedNums]

  if (reconNums.length > 0) {
    const { data: reconOrders } = await supabase
      .from('pp_orders')
      .select('id, order_number, qualification_status')
      .in('order_number', reconNums)

    if (reconOrders && reconOrders.length > 0) {
      // Batch insert reconciliation records (skip existing)
      const { data: existingRecon } = await supabase
        .from('pp_order_reconciliation')
        .select('order_id')
        .in('order_id', reconOrders.map(o => o.id))

      const existingReconSet = new Set(existingRecon?.map(r => r.order_id) || [])
      const newReconRows = reconOrders
        .filter(o => !existingReconSet.has(o.id))
        .map(o => ({ order_id: o.id, match_status: 'MATCHED', confidence: 1.0 }))

      if (newReconRows.length > 0) {
        await supabase.from('pp_order_reconciliation').insert(newReconRows)
      }

      onProgress?.(85, "Liaison des corps d'état...")

      // Fetch all trades once
      const { data: allTrades } = await supabase.from('pp_trades').select('id, name, code')
      if (allTrades) {
        const tradeMap = new Map<string, string>()
        allTrades.forEach(t => {
          if (t.name) tradeMap.set(t.name.toLowerCase().trim(), t.id)
          if (t.code) tradeMap.set(t.code.toLowerCase().trim(), t.id)
        })

        const assocToInsert: any[] = []
        for (const o of reconOrders) {
          if (o.qualification_status === 'QUALIFIED') continue
          for (const track of trackingMap.get(o.order_number) || []) {
            const tn = track.trade_name.toLowerCase().trim()
            const tradeId = tradeMap.get(tn) ||
              [...tradeMap.entries()].find(([k]) => tn.includes(k) || k.includes(tn))?.[1]
            if (tradeId) {
              assocToInsert.push({ order_id: o.id, trade_id: tradeId, source: 'BUDGET_TRACKING', confidence_score: 0.9 })
            }
          }
        }

        if (assocToInsert.length > 0) {
          const { data: existingAssoc } = await supabase
            .from('pp_order_trades')
            .select('order_id, trade_id')
            .in('order_id', reconOrders.map(o => o.id))

          const existingSet = new Set(existingAssoc?.map(a => `${a.order_id}:${a.trade_id}`) || [])
          const newAssoc = assocToInsert.filter(a => !existingSet.has(`${a.order_id}:${a.trade_id}`))

          for (let i = 0; i < newAssoc.length; i += 200) {
            await supabase.from('pp_order_trades').insert(newAssoc.slice(i, i + 200))
          }
        }
      }
    }
  }

  onProgress?.(100, 'Importation terminée')
  return result
}

export async function qualifyOrder(orderId: string, tradeIds: string[], userId: string): Promise<void> {
  for (const tradeId of tradeIds) {
    await supabase.from('pp_order_trades').insert({
      order_id: orderId,
      trade_id: tradeId,
      source: 'MANUAL',
      selected_by: userId,
      selected_at: new Date().toISOString(),
    })
  }
  await supabase
    .from('pp_orders')
    .update({ qualification_status: 'QUALIFIED' })
    .eq('id', orderId)
}

export async function getOrdersNeedingQualification() {
  const { data } = await supabase
    .from('pp_orders')
    .select('*')
    .eq('qualification_status', 'PENDING')
    .not('budget_nature', 'in', `(${EXCLUDED_BUDGET_NATURES.join(',')})`)

  return data || []
}
