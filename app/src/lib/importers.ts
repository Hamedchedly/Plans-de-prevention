import * as XLSX from 'xlsx'

export type ImportKind = 'COMMANDES' | 'SUIVI_BUDGET'

/** SHA-256 du fichier : sert à l'import idempotent (même fichier = aucun doublon). */
export async function sha256(file: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', file)
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** En-têtes des exports : « COMN_NUM.ANA_COMD_TRAV_ER » → « COMN_NUM ». */
export function cleanHeader(h: unknown): string {
  return String(h ?? '').split('.')[0].replace(/ /g, ' ').trim()
}

export function readRows(buffer: ArrayBuffer): Record<string, unknown>[] {
  const wb = XLSX.read(buffer, { type: 'array', cellDates: true })
  const ws = wb.Sheets[wb.SheetNames[0]]
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true, defval: null }) as unknown[][]
  const header = (matrix[0] ?? []).map(cleanHeader)
  return matrix.slice(1).map((row) => {
    const o: Record<string, unknown> = {}
    header.forEach((h, i) => { if (h) o[h] = row[i] ?? null })
    return o
  })
}

const str = (v: unknown): string | null => {
  if (v === null || v === undefined) return null
  const s = String(v).replace(/ /g, ' ').trim()
  return s === '' || s === 'None' ? null : s
}
const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null
  const n = typeof v === 'number' ? v : Number(String(v).replace(',', '.'))
  return Number.isFinite(n) ? n : null
}
const date = (v: unknown): string | null => {
  if (v instanceof Date && !isNaN(v.getTime())) return v.toISOString().slice(0, 10)
  const s = str(v)
  if (!s) return null
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null
}

/** Ligne ANM_COMD_TRAV_ER → colonnes source de plans_prevention.orders (sans les décisions). */
export function mapCommande(r: Record<string, unknown>) {
  const orderNumber = str(r['COMN_NUM'])
  if (!orderNumber) return null
  return {
    order_number: orderNumber,
    sector_code: str(r['PERC_SECTEUR']),
    wpatrimoine: str(r['WPATRIMOINE']),
    tranche_name: str(r['WNOM_ADRESSE']),
    address: str(r['WADRESSE']),
    city: str(r['WCOMMUNE']),
    nature_text: str(r['WNATURE']),
    description: str(r['WNOTES']),
    isis_code: str(r['ENTN_NUM']),
    operator_code: str(r['UTIC_CODE']),
    order_date: date(r['COMD_DATE']),
    amount_ttc: num(r['COMN_MT_DEVIS']),
    naac_code: str(r['NAAC_CODE']),
    intc_code: str(r['INTC_CODE']),
  }
}

/** Ligne ANM_SUIVTRXSECT : seulement les lignes rattachables à une commande. */
export function mapSuivi(r: Record<string, unknown>) {
  return { order_number: str(r['COMN_NUM']), raw: r }
}
