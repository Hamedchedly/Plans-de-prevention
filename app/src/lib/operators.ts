import { supabase } from './supabase'

/** Codes des chargés connus dans les profils, triés. */
export async function fetchOperatorCodes(): Promise<string[]> {
  const { data, error } = await supabase.from('profiles').select('operator_code').not('operator_code', 'is', null)
  if (error) throw error
  const codes = new Set((data ?? []).map((r) => (r as { operator_code: string }).operator_code).filter(Boolean))
  return [...codes].sort()
}
