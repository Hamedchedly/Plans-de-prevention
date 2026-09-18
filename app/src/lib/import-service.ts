import { supabase } from './supabase'
import { OrderRow, TrackingRow } from './excel-parser'

export interface ImportResult {
  imported: number
  skipped: number
  errors: string[]
  qualifyingOrders: string[] // Orders that need manual qualification
}

export async function importOrders(
  orders: OrderRow[],
  trackingData: TrackingRow[],
  scopeRules?: { values: string[] }
): Promise<ImportResult> {
  const result: ImportResult = {
    imported: 0,
    skipped: 0,
    errors: [],
    qualifyingOrders: [],
  }

  // Build tracking map for reconciliation
  const trackingMap = new Map<string, TrackingRow[]>()
  trackingData.forEach(row => {
    if (!trackingMap.has(row.order_number)) {
      trackingMap.set(row.order_number, [])
    }
    trackingMap.get(row.order_number)!.push(row)
  })

  // Get scope rules
  const rulesResult = await supabase
    .from('pp_command_scope_rules')
    .select('*, pp_command_scope_rule_values(value)')
    .eq('active', true)
    .single()

  const rules = rulesResult.data

  const allowedValues = rules?.pp_command_scope_rule_values?.map((v: any) => v.value) || []

  // Import each order
  for (const order of orders) {
    try {
      // Check scope
      const isInScope = !allowedValues.length || allowedValues.includes(order.budget_nature)
      const scopeStatus = isInScope ? 'IN_SCOPE' : 'OUT_OF_SCOPE'

      // Check if exists
      const existingResult = await supabase
        .from('pp_orders')
        .select('id')
        .eq('order_number', order.order_number)
        .single()

      const existing = existingResult.data

      if (existing) {
        result.skipped++
        continue
      }

      // Create order
      const { data: createdOrder, error: orderError } = await supabase
        .from('pp_orders')
        .insert({
          order_number: order.order_number,
          order_date: order.order_date ? new Date(order.order_date).toISOString() : null,
          work_nature: order.work_nature,
          work_description: order.work_description,
          company_id: order.company_id,
          owner_user_id: order.owner_user_id,
          budget_nature: order.budget_nature,
          intervention_code: order.intervention_code,
          site_city_zip: order.site_city_zip,
          site_address: order.site_address,
          amount_ttc: order.amount_ttc,
          scope_status: scopeStatus,
          tracking_match_status: trackingMap.has(order.order_number) ? 'MATCHED' : 'NOT_FOUND',
          qualification_status: trackingMap.has(order.order_number) ? 'QUALIFIED' : 'PENDING',
        })
        .select('id')
        .single()

      if (orderError) throw orderError

      // Handle reconciliation
      if (trackingMap.has(order.order_number)) {
        const trackedRows = trackingMap.get(order.order_number)!

        // Create reconciliation record
        await supabase.from('pp_order_reconciliation').insert({
          order_id: createdOrder.id,
          match_status: 'MATCHED',
          confidence: 1.0,
        })

        // Try to link trades from tracking
        for (const track of trackedRows) {
          // Find trade by name or code
          const tradeResult = await supabase
            .from('pp_trades')
            .select('id')
            .or(`name.ilike.%${track.trade_name}%, code.eq.${track.trade_name}`)
            .single()

          const trade = tradeResult.data

          if (trade) {
            await supabase.from('pp_order_trades').insert({
              order_id: createdOrder.id,
              trade_id: trade.id,
              source: 'BUDGET_TRACKING',
              confidence_score: 0.9,
            })
          }
        }
      } else {
        // Order needs manual qualification
        result.qualifyingOrders.push(order.order_number)
      }

      result.imported++
    } catch (error) {
      result.errors.push(`Order ${order.order_number}: ${error}`)
    }
  }

  return result
}

export async function qualifyOrder(
  orderId: string,
  tradeIds: string[],
  userId: string
): Promise<void> {
  // Add trades
  for (const tradeId of tradeIds) {
    await supabase.from('pp_order_trades').insert({
      order_id: orderId,
      trade_id: tradeId,
      source: 'MANUAL',
      selected_by: userId,
      selected_at: new Date().toISOString(),
    })
  }

  // Mark as qualified
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

  return data || []
}
