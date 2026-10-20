export type Role = 'SUPER_ADMIN' | 'RESPONSABLE' | 'CHARGE_OPERATIONS'

export interface Profile {
  user_id: string
  full_name: string
  email: string | null
  role: Role
  operator_code: string | null
  sector_codes: string[]
  is_active: boolean
  first_name: string | null
  last_name: string | null
  phone: string | null
  contact_email: string | null
}

/** Adresse à afficher : correction saisie par le chargé, sinon adresse source (commande ou suivi budgétaire). */
export const addressOf = (o: Pick<OrderRow, 'address' | 'address_manual'>): string | null => o.address_manual || o.address || null

export type ScopeStatus = 'IN_SCOPE' | 'OUT_OF_SCOPE'
export type PlanStatus = 'NON_QUALIFIEE' | 'A_ENVOYER' | 'EN_ATTENTE_RETOUR' | 'SIGNEE' | 'ARCHIVEE' | 'ENVOYE_MANUELLEMENT'
export type ArchiveReason = 'MANUEL' | 'OBSOLETE' | 'ENVOI_SANS_RETOUR' | 'SIGNEE_6_MOIS'
export type ScopeRequestStatus = 'AUCUNE' | 'EN_ATTENTE' | 'APPROUVEE' | 'REFUSEE'
export type QualificationStatus = 'AUTO' | 'A_QUALIFIER' | 'QUALIFIED'

export interface OrderRow {
  order_number: string
  sector_code: string | null
  tranche_name: string | null
  address: string | null
  address_manual: string | null
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
  plan_status: PlanStatus
  archive_reason: ArchiveReason | null
  nature_proposal_id: number | null
  scope_request_status: ScopeRequestStatus
  scope_request_reason: string | null
  period_start: string | null
  period_end: string | null
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
  options: string[] | null
}
