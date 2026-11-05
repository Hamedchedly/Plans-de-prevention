import { supabase } from './supabase'

export type TemplateKind = 'IMPORT' | 'LIBRE'
export interface CommTemplate { id: string; kind: TemplateKind; name: string; subject: string; body: string }

/** Variables disponibles dans les modèles, avec leur description (affichée dans l'éditeur). */
export const TEMPLATE_VARIABLES: { key: string; label: string }[] = [
  { key: 'prenom', label: 'Prénom du chargé' },
  { key: 'chargé', label: 'Nom complet du chargé' },
  { key: 'code', label: 'Code chargé (UTIC)' },
  { key: 'nouvelles', label: 'Nombre de nouvelles commandes (dernier import)' },
  { key: 'sans_plan', label: 'Nouvelles commandes sans plan de prévention' },
  { key: 'recap', label: 'Récapitulatif par chargé (mail collectif)' },
  { key: 'fichier', label: 'Nom du fichier importé' },
  { key: 'date', label: 'Date de l’import' },
  { key: 'redacteur', label: 'Nom de l’expéditeur' },
]

/** Remplace {variable} par sa valeur ; une variable inconnue reste telle quelle. */
export function fillMailTemplate(text: string, vars: Record<string, string | number>): string {
  return text.replace(/\{([^{}]+)\}/g, (match, key: string) => {
    const k = key.trim()
    return Object.prototype.hasOwnProperty.call(vars, k) ? String(vars[k]) : match
  })
}

/** Lien mailto : ouvre le client de messagerie avec objet et corps pré-remplis. */
export function mailtoUrl(to: string, subject: string, body: string): string {
  return `mailto:${encodeURIComponent(to.trim())}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
}

export async function fetchTemplates(): Promise<CommTemplate[]> {
  const { data, error } = await supabase.from('communication_templates')
    .select('id,kind,name,subject,body').order('name')
  if (error) throw error
  return (data ?? []) as CommTemplate[]
}

export async function saveTemplate(t: { id?: string; kind: TemplateKind; name: string; subject: string; body: string }): Promise<string> {
  const { data, error } = await supabase.rpc('save_communication_template', {
    p_id: t.id ?? null, p_kind: t.kind, p_name: t.name, p_subject: t.subject, p_body: t.body,
  })
  if (error) throw error
  return String(data)
}

export interface NewCounts {
  nouvelles: number
  /** Nouvelles commandes encore sans plan de prévention ; null pour les imports antérieurs au détail. */
  sans_plan: number | null
}

export interface LastImport {
  file_name: string
  created_at: string
  inserted_count: number
  /** Nouvelles commandes par code chargé ; « » = sans chargé. Null si l'import n'a pas de détail. */
  newByOperator: Record<string, NewCounts> | null
}

/** Accepte l'ancien format (nombre seul) et le nouveau (nouvelles + sans plan). */
function parseNewByOperator(raw: unknown): Record<string, NewCounts> | null {
  if (!raw || typeof raw !== 'object') return null
  const out: Record<string, NewCounts> = {}
  for (const [code, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof v === 'number') out[code] = { nouvelles: v, sans_plan: null }
    else if (v && typeof v === 'object') {
      const o = v as { nouvelles?: number; sans_plan?: number }
      out[code] = { nouvelles: o.nouvelles ?? 0, sans_plan: o.sans_plan ?? 0 }
    }
  }
  return out
}

/** Récapitulatif lisible par chargé, inséré dans le mail collectif. */
export function buildRecap(rows: { name: string; code: string; nouvelles: number; sans_plan: number | null }[]): string {
  return rows.map((r) => {
    const sans = r.sans_plan === null ? 'détail indisponible' : `dont ${r.sans_plan} sans plan de prévention`
    return `- ${r.name} (${r.code}) : ${r.nouvelles} nouvelle(s) commande(s), ${sans}`
  }).join('\n')
}

/** Dernier import de commandes terminé. */
export async function fetchLastCommandesImport(): Promise<LastImport | null> {
  const { data, error } = await supabase.from('imports')
    .select('file_name,created_at,inserted_count,summary')
    .eq('kind', 'COMMANDES').eq('status', 'TERMINE')
    .order('created_at', { ascending: false }).limit(1).maybeSingle()
  if (error) throw error
  if (!data) return null
  const row = data as { file_name: string; created_at: string; inserted_count: number; summary: { new_by_operator?: unknown } | null }
  return {
    file_name: row.file_name,
    created_at: row.created_at,
    inserted_count: row.inserted_count ?? 0,
    newByOperator: parseNewByOperator(row.summary?.new_by_operator),
  }
}

export interface ChargeRecipient { code: string; firstName: string; name: string; email: string | null }

/** Chargés actifs avec leur adresse de contact (contact_email, à défaut l'adresse de connexion). */
export async function fetchChargeRecipients(): Promise<ChargeRecipient[]> {
  const { data, error } = await supabase.from('profiles')
    .select('operator_code,first_name,last_name,email,contact_email,is_active')
    .not('operator_code', 'is', null).eq('is_active', true)
  if (error) throw error
  return (data ?? []).map((p) => {
    const r = p as { operator_code: string; first_name: string | null; last_name: string | null; email: string | null; contact_email: string | null }
    return {
      code: r.operator_code,
      firstName: r.first_name || r.operator_code,
      name: [r.first_name, r.last_name].filter(Boolean).join(' ') || r.operator_code,
      email: (r.contact_email || r.email || null),
    }
  }).sort((a, b) => a.code.localeCompare(b.code))
}
