import { supabase } from './supabase'

// User Management
export async function listUsers() {
  const { data } = await supabase.auth.admin.listUsers()
  return data?.users || []
}

export async function createUser(email: string, password: string, role: string) {
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { role },
  })
  if (error) throw error
  return data.user
}

export async function updateUserRole(userId: string, role: string) {
  const { error } = await supabase.auth.admin.updateUserById(userId, {
    user_metadata: { role },
  })
  if (error) throw error
}

export async function deleteUser(userId: string) {
  const { error } = await supabase.auth.admin.deleteUser(userId)
  if (error) throw error
}

// Trade Management
export async function listTrades() {
  const { data } = await supabase
    .from('pp_trades')
    .select('*')
    .order('code')
  return data || []
}

export async function createTrade(code: string, name: string, description?: string) {
  const { data, error } = await supabase
    .from('pp_trades')
    .insert({
      code,
      name,
      description,
      active: true,
    })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updateTrade(id: string, updates: any) {
  const { data, error } = await supabase
    .from('pp_trades')
    .update(updates)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function mergeTrades(sourceTradeId: string, targetTradeId: string) {
  // Update all order_trades pointing to source → target
  const { error: updateError } = await supabase
    .from('pp_order_trades')
    .update({ trade_id: targetTradeId })
    .eq('trade_id', sourceTradeId)

  if (updateError) throw updateError

  // Delete the source trade
  const { error: deleteError } = await supabase
    .from('pp_trades')
    .delete()
    .eq('id', sourceTradeId)

  if (deleteError) throw deleteError
}

// Security Measures Management
export async function listMeasures() {
  const { data } = await supabase
    .from('pp_measures_catalog')
    .select('*')
    .order('code')
  return data || []
}

export async function createMeasure(code: string, description: string, category?: string) {
  const { data, error } = await supabase
    .from('pp_measures_catalog')
    .insert({
      code,
      description,
      category,
      active: true,
    })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updateMeasure(id: string, updates: any) {
  const { data, error } = await supabase
    .from('pp_measures_catalog')
    .update(updates)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

// Scope Rules Management
export async function listScopeRules() {
  const { data } = await supabase
    .from('pp_command_scope_rules')
    .select('*, pp_command_scope_rule_values(*)')
  return data || []
}

export async function createScopeRule(name: string, description?: string) {
  const { data, error } = await supabase
    .from('pp_command_scope_rules')
    .insert({
      name,
      description,
      active: true,
    })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function addScopeRuleValue(ruleId: string, value: string) {
  const { data, error } = await supabase
    .from('pp_command_scope_rule_values')
    .insert({
      rule_id: ruleId,
      value,
    })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function removeScopeRuleValue(valueId: string) {
  const { error } = await supabase
    .from('pp_command_scope_rule_values')
    .delete()
    .eq('id', valueId)
  if (error) throw error
}

// Operator Orders
export async function getOrdersByOperator(operatorCode: string) {
  const { data } = await supabase
    .from('pp_orders')
    .select('*')
    .eq('owner_user_id', operatorCode)
    .order('order_number')
  return data || []
}

export async function listOperators() {
  const { data } = await supabase
    .from('pp_orders')
    .select('owner_user_id')
    .neq('owner_user_id', null)

  if (!data) return []

  // Get unique operators
  const operators = Array.from(new Set(data.map((d) => d.owner_user_id)))
  return operators
}
