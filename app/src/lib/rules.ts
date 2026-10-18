// Logique métier pure : recherche de nature, risques, mesures. Aucun accès réseau ici.

export type RuleType = 'ANY_RISK' | 'ALL_RISKS' | 'MANUAL'

export interface MeasureRule {
  code: string
  label: string
  family: string
  ruleType: RuleType
  risks: string[] // codes risques (R01..R14)
}

export interface NatureRef {
  id: number                 // négatif = proposition de la session, pas encore validée
  label: string
  groupLabel: string | null
  modelCode: string | null
  lots: number[]
  extraRisks: string[]
  measures?: string[]
  pending?: boolean
  proposalId?: number
}

export interface VocabEntry { term: string; equivalents: string[] }

const STOP = new Set('de du des la le les un une et en a au aux pour sur sous dans par avec d l y ou ce cet'.split(' '))

export function fold(s: string): string {
  return s
    .toLowerCase()
    .replace(/[’']/g, ' ')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
}

export function tokens(s: string): string[] {
  return fold(s)
    .split(/[\s/\-,.()]+/)
    .filter((t) => t.length > 1 && !STOP.has(t))
}

function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length
  if (!m) return n
  if (!n) return m
  let prev = Array.from({ length: n + 1 }, (_, j) => j)
  for (let i = 1; i <= m; i++) {
    const cur = [i]
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
    }
    prev = cur
  }
  return prev[n]
}

/** Score d'un mot saisi face à un mot de référence : 1 identique, 0.8 préfixe, 0.7 faute légère. */
function wordScore(w: string, kw: string): number {
  if (kw === w) return 1
  if (w.length >= 4 && kw.startsWith(w.slice(0, Math.max(4, w.length - 2)))) return 0.8
  if (w.length >= 5 && kw.length >= 5 && levenshtein(w, kw) <= (w.length >= 8 ? 2 : 1)) return 0.7
  return 0
}

export function expandQuery(query: string, vocab: VocabEntry[]): string[] {
  const base = tokens(query)
  const map = new Map(vocab.map((v) => [fold(v.term), v.equivalents.map(fold)]))
  const out = new Set(base)
  for (const w of base) for (const e of map.get(w) ?? []) out.add(e)
  return [...out]
}

/** Mots de procédure ou de quantité, sans valeur pour distinguer une nature d'une autre. */
const GENERIC_WORDS = new Set(
  'remplacement remplacer remplace travaux travail reprise reprises remise remises fourniture fournir pose depose installation mise place creation realisation selon devis unite unites ensemble suite'.split(' '),
)

export interface SearchHit { nature: NatureRef; score: number }

/** Recherche de natures : mots du descriptif + vocabulaire métier + nom du lot. */
export function searchNatures(
  query: string,
  natures: NatureRef[],
  vocab: VocabEntry[],
  lotNameByCode: Map<number, string>,
  limit = 8,
): SearchHit[] {
  const qt = tokens(query)
  if (!qt.length) return []
  const qe = expandQuery(query, vocab)
  const phrase = fold(query).replace(/\s+/g, ' ').trim()
  // opération demandée : pose, dépose, ou les deux (« pose / dépose » couvre les deux)
  const qFold = fold(query)
  const wantsDepose = /\bdepos/.test(qFold)
  const wantsPose = /\bpos(e|er)\b|\binstall/.test(qFold) && !wantsDepose
  // poids IDF : un mot rare dans le référentiel (« interphone ») pèse plus qu'un mot courant (« pose »)
  const labelTokens = natures.map((n) => tokens(n.label))
  const weight = new Map<string, number>()
  for (const w of qe) {
    const df = labelTokens.filter((ks) => ks.some((kw) => wordScore(w, kw) >= 0.8)).length
    // mot inconnu du référentiel : il ne doit pas diluer le score des mots connus
    if (df === 0) { weight.set(w, 0); continue }
    // verbe générique (« remplacement », « travaux »…) : présent partout, il ne départage rien
    if (GENERIC_WORDS.has(w)) { weight.set(w, 0); continue }
    weight.set(w, Math.log(1 + natures.length / (1 + df)))
  }
  const wSum = qe.reduce((acc, w) => acc + (weight.get(w) ?? 0), 0) || 1
  const hits: SearchHit[] = []
  for (let i = 0; i < natures.length; i++) {
    const n = natures[i]
    const kws = labelTokens[i]
    const labelFold = fold(n.label)
    // score pondéré, ramené entre 0 et 1 (mots reconnus / poids total de la recherche)
    let s = 0
    for (const w of qe) {
      let best = 0
      for (const kw of kws) best = Math.max(best, wordScore(w, kw))
      s += best * (weight.get(w) ?? 0)
    }
    s /= wSum
    // phrase tapée presque telle quelle dans le libellé : signal fort
    if (phrase.length >= 4 && labelFold.includes(phrase)) s += 0.5
    // le verbe demandé est porté par le libellé
    if (wantsDepose && labelFold.includes('depos')) s += 0.5
    if (wantsPose && /\bpose\b|^installation|\binstall/.test(labelFold)) s += 0.5
    // un mot qui désigne le lot (ex. « toiture » → Couverture) compte aussi
    for (const lot of n.lots) {
      const lname = fold(lotNameByCode.get(lot) ?? '')
      for (const w of qe) if (w.length >= 4 && lname.includes(w)) s += 0.5
    }
    if (s > 0) hits.push({ nature: n, score: s })
  }
  return hits.sort((a, b) => b.score - a.score).slice(0, limit)
}

/** Risques proposés pour un ensemble de lots : défauts des lots + écarts propres aux natures retenues. */
export function proposeRisks(
  lotDefaults: Map<number, string[]>,
  lots: number[],
  natures: NatureRef[],
): Map<string, 'LOT_DEFAUT' | 'NATURE'> {
  const out = new Map<string, 'LOT_DEFAUT' | 'NATURE'>()
  for (const lot of lots) for (const r of lotDefaults.get(lot) ?? []) out.set(r, 'LOT_DEFAUT')
  for (const n of natures) for (const r of n.extraRisks) if (!out.has(r)) out.set(r, 'NATURE')
  return out
}

/** Mesures cochées à partir des risques cochés. MANUAL n'est jamais automatique. */
export function computeMeasures(checkedRisks: Set<string>, rules: MeasureRule[]): Set<string> {
  const out = new Set<string>()
  for (const m of rules) {
    if (m.ruleType === 'MANUAL') continue
    if (m.ruleType === 'ALL_RISKS') {
      if (checkedRisks.size > 0) out.add(m.code)
      continue
    }
    if (m.risks.some((r) => checkedRisks.has(r))) out.add(m.code)
  }
  return out
}

/** Mesures qui n'ont plus aucune justification après décochage d'un risque : à signaler, pas à supprimer. */
export function orphanMeasures(manualMeasures: Set<string>, auto: Set<string>, computed: Set<string>): string[] {
  return [...auto].filter((m) => !computed.has(m) && !manualMeasures.has(m))
}
