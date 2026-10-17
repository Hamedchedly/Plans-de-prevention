export type Role = 'SUPER_ADMIN' | 'RESPONSABLE' | 'CHARGE_OPERATIONS'

export interface Profile {
  user_id: string
  full_name: string
  email: string | null
  role: Role
  operator_code: string | null
  sector_codes: string[]
  is_active: boolean
}

export type ScopeStatus = 'IN_SCOPE' | 'OUT_OF_SCOPE'
export type QualificationStatus = 'AUTO' | 'A_QUALIFIER' | 'QUALIFIED'

export interface OrderRow {
  order_number: string
  sector_code: string | null
  tranche_name: string | null
  address: string | null
  city: string | null
  nature_text: string | null
  description: string | null
  isis_code: string | null
  operator_code: string | null
  order_date: string | null
  amount_ttc: number | null
  naac_code: string | null
  scope_status: ScopeStatus
  scope_override: boolean
  qualification_status: QualificationStatus
  nature_id: number | null
}

export type AlertStatus = 'A_VALIDER' | 'APPLIQUE_A_VALIDER' | 'VALIDE' | 'MODIFIE' | 'IGNORE'

export interface AlertRow {
  code: string
  type: string
  object: string
  finding: string
  proposal: string
  status: AlertStatus
  decision_comment: string | null
}
