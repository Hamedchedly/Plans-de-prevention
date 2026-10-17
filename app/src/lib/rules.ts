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
  id: number
  label: string
  groupLabel: string | null
  modelCode: string | null
  lots: number[]
  extraRisks: string[]
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
  const hits: SearchHit[] = []
  for (const n of natures) {
    const kws = tokens(n.label)
    let s = 0
    for (const w of qe) {
      let best = 0
      for (const kw of kws) best = Math.max(best, wordScore(w, kw))
      s += best
    }
    // un mot qui désigne le lot (ex. « toiture » → Couverture) compte aussi
    for (const lot of n.lots) {
      const lname = fold(lotNameByCode.get(lot) ?? '')
      for (const w of qe) if (w.length >= 4 && lname.includes(w)) s += 0.5
    }
    if (s > 0) hits.push({ nature: n, score: s / qt.length })
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
