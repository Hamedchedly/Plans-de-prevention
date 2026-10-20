import { useEffect, useMemo, useState } from 'react'
import type { Referentiel } from '../lib/refdata'
import { computeMeasures, fold, proposeRisks, searchNatures, tokens, type NatureRef } from '../lib/rules'
import { getReferentiel } from '../lib/refdata'
import { fmtFr, defaultPeriod } from '../lib/period'
import { natureCandidates, type OrderSuggestion } from '../lib/natureSuggest'
import { supabase } from '../lib/supabase'
import { derive, natureIdsOf, contactFor, fetchContacts, measuresFor, savePlans, buildSheetsZip, downloadBlob, buildSheetPdf, unique, planFileName, type Contact, type Line } from '../lib/sheet'
import type { OrderRow } from '../lib/types'
import type { CompanyRow } from '../pages/AdminCompanies'
import { Badge, Button, Card, Notice, errMsg, fieldClass } from './ui'

interface CompanyEdit { name: string; os_email: string }

const STEPS = ['Nature et lots', 'Risques et mesures', 'Entreprise et date', 'Aperçu et validation']
const OVERVIEW = STEPS.length - 1
const BY_ORDER_STEPS = STEPS.length - 1

/** Chargés dont la personne à alerter n'est pas complète : les PDF ne peuvent pas être exportés tant que ce n'est pas réglé. */
function IdentityNotice({ codes }: { codes: string[] }) {
  return (
    <Notice tone="warn">
      Identité incomplète ou compte non inscrit pour : <span className="font-mono">{codes.join(', ')}</span>.
      La personne à alerter doit être complétée (Administration › Utilisateurs et chargés, ou saisie par la personne à son inscription) avant l’export des PDF.
    </Notice>
  )
}

export default function BulkPlanWizard({
  orders, suggestions, ref: refInitial, companies, template, initial, mode = 'create', onClose, onDone,
}: {
  orders: OrderRow[]
  suggestions: Map<string, OrderSuggestion>
  ref: Referentiel
  companies: Map<string, CompanyRow>
  template: string
  initial?: Map<string, Line>          // fiches déjà créées : modification
  mode?: 'create' | 'edit'
  onClose: () => void
  onDone: (message: string) => void
}) {
  // Personne à alerter : le chargé qui a créé chaque commande (identité saisie par le Super Admin ou à l'inscription)
  const [contacts, setContacts] = useState<Map<string, Contact>>(new Map())
  const [contactsReady, setContactsReady] = useState(false)
  useEffect(() => {
    fetchContacts(orders.map((o) => o.operator_code ?? ''))
      .then(setContacts)
      .catch(() => setContacts(new Map()))
      .finally(() => setContactsReady(true))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const operatorsIncomplete = unique(orders.map((o) => o.operator_code ?? '').filter((c) => !c || !contacts.get(c)?.complete))
  const identityMissing = contactsReady && operatorsIncomplete.length > 0
  const contactOf = (o: OrderRow) => contactFor(contacts, o)
  const [created, setCreated] = useState(false)

  // Référentiel local : une nature proposée depuis la fiche devient utilisable immédiatement.
  const [ref, setRef] = useState<Referentiel>(refInitial)

  const byNumber = useMemo(() => new Map(orders.map((o) => [o.order_number, o])), [orders])

  // Préremplissage : nature seulement si la suggestion est fiable ; lots et risques/mesures en découlent.
  const [lines, setLines] = useState<Line[]>(() => orders.map((o) => {
    const saved = initial?.get(o.order_number)
    if (saved) return saved
    const sg = suggestions.get(o.order_number)
    const natureId = sg?.confident && sg.natureId != null ? sg.natureId : null
    const nature = natureId != null ? ref.natures.find((n) => n.id === natureId) : undefined
    const lots = unique([...(nature?.lots ?? []), ...(nature && sg?.lot != null ? [sg.lot] : [])])
    const d = derive(ref, natureId != null ? [natureId] : [], lots)
    return {
      orderNumber: o.order_number, natureId, extraNatures: [], lots, risks: d.risks, measures: d.measures,
      companyFills: false, period: defaultPeriod(o.order_date, o.period_start, o.period_end),
    }
  }))
  const [cur, setCur] = useState(0)
  const [step, setStep] = useState(0)
  const [queries, setQueries] = useState<Record<string, string>>({})   // clé « commande:champ »
  const [lotSearch, setLotSearch] = useState('')
  const [natureOpen, setNatureOpen] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<string | null>(null)
  const [previewIndex, setPreviewIndex] = useState(0)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [proposing, setProposing] = useState(false)
  const [newNature, setNewNature] = useState({ label: '', lots: [] as number[], reason: '', touched: false })

  const line = lines[cur]
  const order = byNumber.get(line.orderNumber)
  const sg = suggestions.get(line.orderNumber)
  const nature = line.natureId != null ? ref.natures.find((n) => n.id === line.natureId) : undefined

  const updateLine = (orderNumber: string, change: (l: Line) => Partial<Line>) =>
    setLines((prev) => prev.map((l) => (l.orderNumber === orderNumber ? { ...l, ...change(l) } : l)))

  // Natures multiples : la nature retenue (gras) est la première activée ; les autres restent activées.
  const toggleNature = (natureId: number) => updateLine(line.orderNumber, (l) => {
    const current = natureIdsOf(l)
    const wasOn = current.includes(natureId)
    const next = wasOn ? current.filter((x) => x !== natureId) : [...current, natureId]
    const main = l.natureId != null && next.includes(l.natureId) ? l.natureId : (next[0] ?? null)
    const added = wasOn ? [] : (ref.natures.find((n) => n.id === natureId)?.lots ?? [])
    const lots = unique([...l.lots, ...added])
    const d = derive(ref, next, lots, l.measures)
    return { natureId: main, extraNatures: next.filter((x) => x !== main), lots, risks: unique([...l.risks, ...d.risks]), measures: d.measures }
  })
  const retainNature = (natureId: number) => updateLine(line.orderNumber, (l) => ({
    natureId, extraNatures: natureIdsOf(l).filter((x) => x !== natureId),
  }))
  const toggleLot = (code: number) => updateLine(line.orderNumber, (l) => {
    const lots = l.lots.includes(code) ? l.lots.filter((c) => c !== code) : [...l.lots, code]
    const d = derive(ref, natureIdsOf(l), lots, l.measures)
    return { lots, risks: unique([...l.risks, ...d.risks]), measures: d.measures }
  })
  const toggleRisk = (code: string) => updateLine(line.orderNumber, (l) => {
    const risks = l.risks.includes(code) ? l.risks.filter((c) => c !== code) : [...l.risks, code]
    return { risks, measures: measuresFor(ref, risks, l.measures) }
  })
  const toggleMeasure = (code: string) => updateLine(line.orderNumber, (l) => ({
    measures: l.measures.includes(code) ? l.measures.filter((c) => c !== code) : [...l.measures, code],
  }))

  // ---- entreprises (corrections partagées par commande)
  const isisOf = (orderNumber: string) => byNumber.get(orderNumber)?.isis_code ?? null
  const [edits, setEdits] = useState<Map<string, CompanyEdit>>(new Map())
  const companyOf = (isis: string): CompanyEdit => edits.get(isis) ?? { name: companies.get(isis)?.name ?? '', os_email: companies.get(isis)?.os_email ?? '' }
  const setEdit = (isis: string, field: keyof CompanyEdit, value: string) => {
    setEdits((prev) => new Map(prev).set(isis, { ...companyOf(isis), [field]: value }))
  }
  const companyLabel = (isis: string | null) => {
    if (!isis) return ''
    const name = companyOf(isis).name.trim()
    return name || isis
  }
  // Saisie d'entreprise : envoyée au Super Admin pour validation à la création de la fiche (surbrillance dans sa page).
  const changedCompanies = () => [...edits.entries()].filter(([isis, e]) => {
    const before = companies.get(isis)
    return (before?.name ?? '') !== e.name.trim() || (before?.os_email ?? '') !== e.os_email.trim()
  })
  const missingCompanies = lines.filter((l) => { const isis = isisOf(l.orderNumber); return !!isis && !companyOf(isis).name.trim() })

  // ---- aperçu PDF (étape finale) : construit à partir des données de la fiche
  useEffect(() => {
    if (step !== OVERVIEW) return
    const l = lines[previewIndex]
    const o = l && byNumber.get(l.orderNumber)
    if (!l || !o) return
    let url: string | null = null
    let alive = true
    ;(async () => {
      try {
        const bytes = await buildSheetPdf(l, o, ref, companyLabel(o.isis_code), contactOf(o))
        url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/pdf' }))
        if (alive) setPreviewUrl(url); else URL.revokeObjectURL(url)
      } catch (e) { if (alive) setErr(errMsg(e)) }
    })()
    return () => { alive = false; if (url) URL.revokeObjectURL(url); setPreviewUrl(null) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, previewIndex, lines, edits, contacts])

  // ---- validation : la fiche est créée (statut « Fiche créée ») même sans export
  const validate = async () => {
    setBusy(true); setErr(null); setProgress(null)
    const sent = changedCompanies()
    const proposalFailures: string[] = []
    for (const [isis, e] of sent) {
      const { error } = await supabase.rpc('propose_company', { p_isis: isis, p_fields: { name: e.name.trim(), os_email: e.os_email.trim() } })
      if (error) proposalFailures.push(`Entreprise ${isis} : ${error.message}`)
    }
    const failures = [...proposalFailures, ...(await savePlans(lines, byNumber, ref))]
    setBusy(false)
    if (failures.length) { setErr(`${failures.length} élément(s) non enregistré(s) :\n${failures.join('\n')}`); return }
    setCreated(true)
    const corrections = sent.length ? ` ${sent.length} correction(s) d’entreprise envoyée(s) au Super Admin pour validation.` : ''
    setProgress(`${lines.length} fiche(s) ${mode === 'edit' ? 'mise(s) à jour' : 'créée(s)'}.${corrections} Vous pouvez prévisualiser, modifier ou télécharger les PDF.`)
  }

  // ---- téléchargement des PDF (ZIP) des fiches enregistrées
  const download = async () => {
    setBusy(true); setErr(null)
    try {
      const { blob, count, failures } = await buildSheetsZip(lines, byNumber, ref, companyLabel, contactOf, template, setProgress)
      if (count > 0) downloadBlob(blob, `fiches_plans_prevention_${new Date().toISOString().slice(0, 10)}.zip`)
      setBusy(false)
      if (failures.length) setErr(`${failures.length} PDF non généré(s) :\n${failures.join('\n')}`)
    } catch (e) { setBusy(false); setErr(errMsg(e)) }
  }

  const finish = () => onDone(`${lines.length} fiche(s) ${mode === 'edit' ? 'mise(s) à jour' : 'créée(s)'}.`)

  // ---- navigation : étapes pour chaque commande, puis aperçu et export
  const goNext = () => {
    if (step < BY_ORDER_STEPS - 1) setStep(step + 1)
    else if (cur < lines.length - 1) { setCur(cur + 1); setStep(0) }
    else setStep(OVERVIEW)
  }
  const goPrev = () => {
    if (step === OVERVIEW) { setCur(lines.length - 1); setStep(BY_ORDER_STEPS - 1); return }
    if (step > 0) setStep(step - 1)
    else if (cur > 0) { setCur(cur - 1); setStep(BY_ORDER_STEPS - 1) }
  }
  const companyNameMissing = (orderNumber: string) => { const isis = isisOf(orderNumber); return !!isis && !companyOf(isis).name.trim() }
  const canNext = (step !== 0 || line.natureId != null) && (step !== 2 || !companyNameMissing(line.orderNumber))

  // ---- recherche de nature (préremplie avec le libellé source)
  const qv = (field: 'nature' | 'risk' | 'measure') => queries[`${line.orderNumber}:${field}`] ?? ''
  const setQv = (field: 'nature' | 'risk' | 'measure', value: string) => setQueries((q) => ({ ...q, [`${line.orderNumber}:${field}`]: value }))
  const natureQ = qv('nature')
  const natureHits = useMemo(
    () => (natureQ.trim() ? searchNatures(natureQ, ref.natures, ref.vocab, ref.lotNameByCode, 60).map((h) => h.nature) : null),
    [natureQ, ref])
  const natureGroups = useMemo(() => {
    const g = new Map<number, NatureRef[]>()
    for (const n of ref.natures) {
      const key = n.lots.length ? Math.min(...n.lots) : 0
      g.set(key, [...(g.get(key) ?? []), n])
    }
    return [...g.entries()].sort((a, b) => a[0] - b[0]).map(([code, items]) => ({
      code,
      name: code ? (ref.lotNameByCode.get(code) ?? `Lot ${code}`) : 'Sans lot',
      items: [...items].sort((a, b) => a.label.localeCompare(b.label, 'fr')),
    }))
  }, [ref])
  const topCandidates = useMemo(() => (order ? natureCandidates(order, ref, 3) : []), [order, ref])
  const selectedIds = natureIdsOf(line)
  const natureState = (id: number): 'retained' | 'selected' | 'off' =>
    id === line.natureId ? 'retained' : selectedIds.includes(id) ? 'selected' : 'off'
  const stateClass = (st: 'retained' | 'selected' | 'off') =>
    st === 'retained' ? 'border-emerald-600 bg-emerald-50 font-bold text-emerald-900'
      : st === 'selected' ? 'border-sky-500 bg-sky-50 font-medium text-sky-900'
      : 'border-border hover:bg-muted'

  /** Lots possiblement concernés par un libellé : lots des natures proches et lots dont le nom contient un mot du libellé. */
  const lotsFromText = (text: string): number[] => {
    const words = tokens(text)
    if (!words.length) return []
    const fromNatures = searchNatures(text, ref.natures, ref.vocab, ref.lotNameByCode, 5)
      .filter((h) => h.score >= 0.3)
      .flatMap((h) => h.nature.lots)
    const fromNames = ref.lots
      .filter((l) => words.some((w) => w.length >= 4 && fold(l.name).includes(w)))
      .map((l) => l.code)
    return unique([...fromNatures, ...fromNames])
  }
  const openProposal = () => {
    const label = natureQ || (order?.nature_text ?? '')
    setNewNature({ label, lots: lotsFromText(label), reason: '', touched: false })
    setProposing(true)
  }
  /** Nature absente du référentiel : proposition envoyée au Super Admin, puis retenue sur cette fiche. */
  const proposeNature = async () => {
    setBusy(true); setErr(null)
    try {
      const lots = newNature.lots
      const risks = [...proposeRisks(ref.lotDefaults, lots, []).keys()]
      const measures = [...computeMeasures(new Set(risks), ref.rules)]
      const label = newNature.label.trim()
      const { error } = await supabase.rpc('propose_referential', {
        p_kind: 'NATURE_NOUVELLE', p_nature_id: null, p_label: label, p_lots: lots,
        p_risks: risks, p_measures: measures, p_reason: newNature.reason.trim() || null,
      })
      if (error) throw new Error(error.message)
      const fresh = await getReferentiel(true)
      setRef(fresh)
      const created = fresh.natures.find((n) => n.pending && n.label === label)
      if (created) toggleNature(created.id)
      setProposing(false)
      setProgress(`Nature « ${label} » proposée et retenue sur cette fiche. Elle deviendra définitive après validation du Super Admin.`)
    } catch (e) { setErr(errMsg(e)) } finally { setBusy(false) }
  }

  const natureRow = (n: NatureRef, badge?: string) => {
    const st = natureState(n.id)
    return (
      <button key={n.id} type="button" onClick={() => toggleNature(n.id)} aria-pressed={st !== 'off'}
        className={`flex w-full items-start justify-between gap-3 rounded-md border px-3 py-2 text-left text-sm transition-colors ${st === 'off' && badge ? 'border-dashed border-amber-400 bg-amber-50/60 hover:bg-amber-50' : stateClass(st)}`}>
        <span className="min-w-0">
          <span className="block">{st !== 'off' ? (st === 'retained' ? '★ ' : '✓ ') : ''}{n.label}</span>
          <span className="block text-xs font-normal text-muted-foreground">{n.groupLabel ?? ''}{n.id < 0 ? ' · proposition en attente' : ''}</span>
        </span>
        {badge && <Badge tone={st === 'off' ? 'default' : 'ok'}>{badge}</Badge>}
      </button>
    )
  }

  const lotQ = tokens(lotSearch)
  const lotMatches = (lot: { code: number; name: string }) => !lotQ.length || lotQ.every((t) => fold(`${lot.name} ${lot.code}`).includes(t))
  const suggestedLotsAll = unique([
    ...(nature?.lots ?? []),
    ...(!nature && topCandidates[0] ? topCandidates[0].nature.lots : []),
    ...(sg?.confident && sg.lot != null ? [sg.lot] : []),
  ])
  const suggestedLots = suggestedLotsAll
  const visibleLots = ref.lots.filter(lotMatches)
  const otherLots = visibleLots.filter((lot) => !suggestedLots.includes(lot.code))

  // Recherche de risques et de mesures : chaque clic ajoute ou retire l'élément
  const hitsOf = <T extends { code: string; label: string; family: string }>(items: T[], query: string) => {
    const t = tokens(query)
    if (!t.length) return []
    return items.filter((i) => { const hay = fold(`${i.label} ${i.family}`); return t.every((x) => hay.includes(x)) }).slice(0, 12)
  }
  const riskQ = qv('risk')
  const measureQ = qv('measure')
  const riskHits = hitsOf(ref.risks, riskQ)
  const measureHits = hitsOf(ref.measures, measureQ)
  const measureLabel = useMemo(() => new Map(ref.measures.map((m) => [m.code, m.label])), [ref])
  const addRow = (key: string, label: string, family: string, on: boolean, onToggle: () => void) => (
    <button key={key} type="button" onClick={onToggle} aria-pressed={on}
      className={`flex w-full items-center gap-3 rounded-md border px-3 py-1.5 text-left text-sm transition-colors ${on ? 'border-emerald-600 bg-emerald-50' : 'border-border hover:bg-muted'}`}>
      <span className="min-w-0 flex-1">
        <span className="block">{label}</span>
        <span className="block text-xs text-muted-foreground">{family}</span>
      </span>
      <span className={`shrink-0 text-xs ${on ? 'font-medium text-emerald-800' : 'text-primary'}`}>{on ? '✓ Ajouté' : '+ Ajouter'}</span>
    </button>
  )
  const chip = (label: string, onRemove: () => void) => (
    <span key={label} className="inline-flex items-center gap-1 rounded-full border border-primary/40 bg-primary/10 px-2.5 py-0.5 text-xs">
      {label}
      <button type="button" onClick={onRemove} aria-label={`Retirer ${label}`} className="text-muted-foreground hover:text-foreground">×</button>
    </span>
  )

  const riskGroups = useMemo(() => {
    const g = new Map<string, Referentiel['risks']>()
    for (const r of ref.risks) g.set(r.family, [...(g.get(r.family) ?? []), r])
    return [...g.entries()]
  }, [ref])
  const measureGroups = useMemo(() => {
    const g = new Map<string, Referentiel['measures']>()
    for (const m of ref.measures) g.set(m.family, [...(g.get(m.family) ?? []), m])
    return [...g.entries()]
  }, [ref])
  const computedMeasures = useMemo(() => new Set(computeMeasures(new Set(line.risks), ref.rules)), [line.risks, ref])

  const isComplete = (l: Line) => l.natureId != null

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4" role="dialog" aria-modal="true">
      <div className="my-6 w-full max-w-5xl space-y-4 rounded-xl border border-border bg-card p-5 shadow-xl">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="mr-auto font-semibold">
            {lines.length === 1 ? `Créer la fiche · ${lines[0].orderNumber}` : `Création groupée de fiches · ${lines.length} commande(s)`}
          </h2>
          <Button variant="ghost" onClick={onClose} disabled={busy}>Fermer</Button>
        </div>

        <div className="flex flex-wrap gap-2 text-sm">
          {STEPS.map((s, i) => (
            <button key={s} type="button" onClick={() => setStep(i)}
              className={`rounded-full border px-3 py-1 text-xs ${i === step ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-muted-foreground hover:bg-muted'}`}>
              {i + 1}. {s}
            </button>
          ))}
        </div>

        {/* Libellé source, descriptif et numéro : toujours visibles */}
        {step !== OVERVIEW && order && (
          <Card className="space-y-1 bg-muted/40">
            <div className="flex flex-wrap items-baseline gap-2">
              <span className="font-mono text-sm font-semibold">{order.order_number}</span>
              <span className="text-xs text-muted-foreground">{[order.address, order.city].filter(Boolean).join(', ') || '—'}</span>
              <span className="ml-auto text-xs text-muted-foreground">Commande {cur + 1} / {lines.length}</span>
            </div>
            <p className="text-sm"><span className="text-xs text-muted-foreground">Libellé source · </span>{order.nature_text || '—'}</p>
            <p className="text-sm text-muted-foreground"><span className="text-xs">Descriptif · </span>{order.description || '—'}</p>
          </Card>
        )}

        {err && <Notice tone="error">{err}</Notice>}
        {progress && <Notice tone="ok">{progress}</Notice>}

        <div className={`grid gap-4 ${lines.length > 1 ? 'md:grid-cols-[220px_1fr]' : ''}`}>
          {lines.length > 1 && (
            <div className="max-h-[60vh] space-y-1 overflow-y-auto rounded-md border border-border p-2">
              {lines.map((l, i) => (
                <button key={l.orderNumber} type="button" onClick={() => { setCur(i); if (step === OVERVIEW) setPreviewIndex(i) }}
                  className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs ${i === cur && step !== OVERVIEW ? 'bg-primary/10 font-medium' : 'hover:bg-muted'}`}>
                  <span className={`h-2 w-2 shrink-0 rounded-full ${isComplete(l) ? 'bg-emerald-500' : 'bg-amber-400'}`} aria-hidden="true" />
                  <span className="font-mono">{l.orderNumber}</span>
                  <span className="truncate text-muted-foreground">{companyLabel(isisOf(l.orderNumber)) || '—'}</span>
                </button>
              ))}
            </div>
          )}

          <div className="min-w-0 space-y-4">
            {step === 0 && (
              <div className="space-y-4">
                <Card className="space-y-3">
                  <h3 className="text-sm font-semibold">Natures</h3>
                  {topCandidates.length > 0 && (
                    <div className="space-y-1.5">
                      <p className="text-xs text-muted-foreground">Suggestions</p>
                      {topCandidates.map((h) => natureRow(h.nature, h.score >= 0.5 ? 'fiable' : 'à confirmer'))}
                    </div>
                  )}
                  {selectedIds.length > 0 && (
                    <div className="space-y-1.5">
                      <p className="text-xs text-muted-foreground">Natures activées ({selectedIds.length}) · la nature retenue est en vert, en tête</p>
                      {[...selectedIds].sort((a, b) => Number(b === line.natureId) - Number(a === line.natureId)).map((id) => {
                        const n = ref.natures.find((x) => x.id === id)
                        if (!n) return null
                        const retained = id === line.natureId
                        return (
                          <div key={id} className={`flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm ${stateClass(retained ? 'retained' : 'selected')}`}>
                            <span className="min-w-0 flex-1 truncate">{retained ? '★ Retenue : ' : ''}{n.label}</span>
                            {!retained && <Button variant="ghost" className="h-7 px-2 text-xs" onClick={() => retainNature(id)}>Retenir</Button>}
                            <Button variant="ghost" className="h-7 px-2 text-xs" onClick={() => toggleNature(id)}>Retirer</Button>
                          </div>
                        )
                      })}
                    </div>
                  )}
                  <div className="space-y-1.5">
                    <label className="block text-xs text-muted-foreground">Rechercher ou choisir dans la liste par lot</label>
                    <div className="flex gap-2">
                      <input className={fieldClass} value={natureQ} placeholder="Tapez un mot (ex. peinture, joint, ascenseur)"
                        onFocus={() => setNatureOpen(true)}
                        onChange={(e) => { setQv('nature', e.target.value); setNatureOpen(true) }} />
                      <Button variant="ghost" onClick={() => setNatureOpen((o) => !o)} aria-expanded={natureOpen}>{natureOpen ? 'Fermer' : 'Liste'}</Button>
                    </div>
                    {natureOpen && (
                      <div className="max-h-72 space-y-3 overflow-y-auto rounded-md border border-border p-2">
                        {natureQ.trim() && (
                          <button type="button" onClick={() => { openProposal(); setNatureOpen(false) }}
                            className="flex w-full items-center gap-2 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-left text-sm font-medium text-red-700 hover:bg-red-100">
                            Nature absente de la liste ? Proposer « {natureQ.trim()} »
                          </button>
                        )}
                        {natureHits ? (
                          natureHits.length ? natureHits.map((n) => natureRow(n)) : <p className="p-2 text-xs text-muted-foreground">Aucune nature trouvée.</p>
                        ) : (
                          natureGroups.map((g) => (
                            <div key={g.code}>
                              <p className="mb-1 text-xs font-semibold text-muted-foreground">{g.name}</p>
                              <div className="space-y-1">{g.items.map((n) => natureRow(n))}</div>
                            </div>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                  {proposing && (
                    <div className="space-y-2 rounded-md border border-dashed border-border p-3">
                      <p className="text-xs text-muted-foreground">La proposition est envoyée au Super Admin et retenue sur cette fiche tout de suite.</p>
                      <input className={fieldClass} value={newNature.label} placeholder="Libellé de la nature"
                        onChange={(e) => setNewNature((n) => ({ ...n, label: e.target.value, lots: n.touched ? n.lots : lotsFromText(e.target.value) }))} />
                      <p className="text-xs text-muted-foreground">Lots pré-cochés d’après le libellé : ajustez-les si besoin.</p>
                      <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
                        {ref.lots.map((l) => (
                          <label key={l.code} className="flex items-center gap-2 text-sm">
                            <input type="checkbox" checked={newNature.lots.includes(l.code)}
                              onChange={() => setNewNature((n) => ({ ...n, touched: true, lots: n.lots.includes(l.code) ? n.lots.filter((x) => x !== l.code) : [...n.lots, l.code] }))} />
                            {l.name}
                          </label>
                        ))}
                      </div>
                      <input className={fieldClass} value={newNature.reason} onChange={(e) => setNewNature({ ...newNature, reason: e.target.value })} placeholder="Motif (optionnel)" />
                      <div className="flex gap-2">
                        <Button onClick={() => void proposeNature()} disabled={busy || !newNature.label.trim() || newNature.lots.length === 0}>Proposer et retenir</Button>
                        <Button variant="ghost" onClick={() => setProposing(false)}>Annuler</Button>
                      </div>
                    </div>
                  )}
                </Card>

                <Card className="space-y-3">
                  <div>
                    <h3 className="text-sm font-semibold">Lots concernés</h3>
                    <p className="text-xs text-muted-foreground">Les lots suggérés par la nature et l’analyse sont en tête ; cochez ou décochez librement.</p>
                  </div>
                  <input className={`${fieldClass} md:w-64`} value={lotSearch} placeholder="Rechercher un lot" aria-label="Rechercher un lot"
                    onChange={(e) => setLotSearch(e.target.value)} />
                  {suggestedLots.length > 0 && visibleLots.some((lot) => suggestedLots.includes(lot.code)) && (
                    <div className="flex flex-wrap gap-1.5">
                      {visibleLots.filter((lot) => suggestedLots.includes(lot.code)).map((lot) => (
                        <LotChip key={lot.code} name={lot.name} on={line.lots.includes(lot.code)} suggested onClick={() => toggleLot(lot.code)} />
                      ))}
                    </div>
                  )}
                  <div className="flex flex-wrap gap-1.5">
                    {otherLots.map((lot) => (
                      <LotChip key={lot.code} name={lot.name} on={line.lots.includes(lot.code)} onClick={() => toggleLot(lot.code)} />
                    ))}
                    {visibleLots.length === 0 && <p className="text-xs text-muted-foreground">Aucun lot ne correspond.</p>}
                  </div>
                </Card>
              </div>
            )}

            {step === 1 && (
              <div className="space-y-4">
                <p className="text-xs text-muted-foreground">
                  Risques proposés par les lots et les natures. Recherchez pour en ajouter ; les mesures se mettent à jour avec les risques.
                </p>
                <Card className="space-y-3">
                  <h3 className="text-sm font-semibold">Risques ({line.risks.length})</h3>
                  <div className="flex flex-wrap gap-1.5">
                    {line.risks.map((code) => chip(ref.riskLabel.get(code) ?? code, () => toggleRisk(code)))}
                    {line.risks.length === 0 && <span className="text-xs text-muted-foreground">Aucun risque retenu.</span>}
                  </div>
                  <input className={fieldClass} value={riskQ} placeholder="Rechercher un risque à ajouter (ex. chute, électrique)" aria-label="Rechercher un risque"
                    onChange={(e) => setQv('risk', e.target.value)} />
                  {riskHits.length > 0 && <div className="max-h-64 space-y-1.5 overflow-y-auto pr-1">
                    {riskHits.map((r) => addRow(r.code, r.label, r.family, line.risks.includes(r.code), () => toggleRisk(r.code)))}
                  </div>}
                  <details>
                    <summary className="cursor-pointer text-xs text-muted-foreground">Parcourir tous les risques par famille</summary>
                    <div className="mt-2 space-y-3">
                      {riskGroups.map(([family, items]) => (
                        <div key={family}>
                          <p className="mb-1 text-xs font-medium text-muted-foreground">{family}</p>
                          <div className="grid gap-1.5 sm:grid-cols-2">
                            {items.map((r) => (
                              <label key={r.code} className="flex cursor-pointer items-center gap-2 rounded-md border border-border px-2 py-1.5 text-sm hover:bg-muted/50">
                                <input type="checkbox" className="accent-primary" checked={line.risks.includes(r.code)} onChange={() => toggleRisk(r.code)} />
                                <span>{r.label}</span>
                              </label>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </details>
                </Card>
                <Card className="space-y-3">
                  <h3 className="text-sm font-semibold">Mesures de prévention ({line.measures.length})</h3>
                  <div className="flex flex-wrap gap-1.5">
                    {line.measures.map((code) => chip(measureLabel.get(code) ?? code, () => toggleMeasure(code)))}
                    {line.measures.length === 0 && <span className="text-xs text-muted-foreground">Aucune mesure retenue.</span>}
                  </div>
                  <input className={fieldClass} value={measureQ} placeholder="Rechercher une mesure à ajouter" aria-label="Rechercher une mesure"
                    onChange={(e) => setQv('measure', e.target.value)} />
                  {measureHits.length > 0 && <div className="max-h-64 space-y-1.5 overflow-y-auto pr-1">
                    {measureHits.map((m) => addRow(m.code, m.label, m.family, line.measures.includes(m.code), () => toggleMeasure(m.code)))}
                  </div>}
                  <details>
                    <summary className="cursor-pointer text-xs text-muted-foreground">Parcourir toutes les mesures par famille</summary>
                    <div className="mt-2 space-y-3">
                      {measureGroups.map(([family, items]) => (
                        <div key={family}>
                          <p className="mb-1 text-xs font-medium text-muted-foreground">{family}</p>
                          <div className="grid gap-1.5 sm:grid-cols-2">
                            {items.map((m) => (
                              <label key={m.code} className="flex cursor-pointer items-center gap-2 rounded-md border border-border px-2 py-1.5 text-sm hover:bg-muted/50">
                                <input type="checkbox" className="accent-primary" checked={line.measures.includes(m.code)} onChange={() => toggleMeasure(m.code)} />
                                <span className="flex-1">{m.label}</span>
                                <span className="text-[10px] text-muted-foreground">{computedMeasures.has(m.code) ? 'auto' : m.ruleType === 'MANUAL' ? 'manuel' : ''}</span>
                              </label>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </details>
                </Card>
              </div>
            )}

            {step === 2 && (
              <div className="space-y-4">
                <Card className="space-y-3">
                  <h3 className="text-sm font-semibold">Entreprise</h3>
                  {order?.isis_code ? (
                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="block text-xs text-muted-foreground">Nom de l’entreprise * (n° {order.isis_code})
                        <input className={`${fieldClass} ${companyNameMissing(line.orderNumber) ? 'border-red-500' : ''}`} value={companyOf(order.isis_code).name}
                          aria-invalid={companyNameMissing(line.orderNumber)}
                          onChange={(e) => setEdit(order.isis_code!, 'name', e.target.value)} placeholder="Nom de l’entreprise" />
                      </label>
                      <label className="block text-xs text-muted-foreground">Email OS
                        <input className={fieldClass} value={companyOf(order.isis_code).os_email} onChange={(e) => setEdit(order.isis_code!, 'os_email', e.target.value)} placeholder="Email OS" />
                      </label>
                      <p className="sm:col-span-2 text-xs text-muted-foreground">
                        Le nom est obligatoire. Une modification est envoyée au Super Admin à la création de la fiche, pour validation.
                      </p>
                      {companyNameMissing(line.orderNumber) && <p className="sm:col-span-2 text-xs text-red-700">Renseignez le nom de l’entreprise pour continuer.</p>}
                    </div>
                  ) : (
                    <Notice>Aucune entreprise rattachée à cette commande.</Notice>
                  )}
                </Card>

                <Card className="space-y-3">
                  <h3 className="text-sm font-semibold">Date d’intervention</h3>
                  <label className="flex cursor-pointer items-center gap-2 text-sm">
                    <input type="checkbox" className="accent-primary" checked={line.companyFills}
                      onChange={(e) => updateLine(line.orderNumber, () => ({ companyFills: e.target.checked }))} />
                    C’est à l’entreprise de renseigner la date d’intervention
                  </label>
                  {!line.companyFills && (
                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="block text-xs text-muted-foreground">Début
                        <input type="date" className={fieldClass} value={line.period.start}
                          onChange={(e) => updateLine(line.orderNumber, (l) => ({ period: { start: e.target.value, end: l.period.end } }))} />
                      </label>
                      <label className="block text-xs text-muted-foreground">Fin
                        <input type="date" className={fieldClass} value={line.period.end}
                          onChange={(e) => updateLine(line.orderNumber, (l) => ({ period: { start: l.period.start, end: e.target.value } }))} />
                      </label>
                      <p className="sm:col-span-2 text-xs text-muted-foreground">Par défaut : du jour de la commande à deux mois plus tard. Modifiable.</p>
                    </div>
                  )}
                  {line.companyFills && (
                    <Notice>La fiche indiquera « À renseigner par l’entreprise ». Les dates restent à compléter par l’entreprise.</Notice>
                  )}
                </Card>

                {identityMissing && <IdentityNotice codes={operatorsIncomplete} />}
              </div>
            )}

            {step === OVERVIEW && (
              <div className="space-y-4">
                <div className="grid gap-3 md:grid-cols-[1fr_1.3fr]">
                  <div className="max-h-[60vh] overflow-auto rounded-md border border-border">
                    <table className="w-full text-xs">
                      <thead className="bg-muted text-left text-muted-foreground">
                        <tr><th className="px-2 py-1.5">Commande</th><th className="px-2 py-1.5">Nature</th><th className="px-2 py-1.5">Lots</th><th className="px-2 py-1.5">Risques</th><th className="px-2 py-1.5">Date</th></tr>
                      </thead>
                      <tbody>
                        {lines.map((l, i) => {
                          const n = l.natureId != null ? ref.natures.find((x) => x.id === l.natureId) : undefined
                          const extra = l.extraNatures.length
                          return (
                            <tr key={l.orderNumber} onClick={() => setPreviewIndex(i)}
                              className={`cursor-pointer border-t border-border ${i === previewIndex ? 'bg-primary/10' : 'hover:bg-muted/50'}`}>
                              <td className="px-2 py-1.5 font-mono">{l.orderNumber}</td>
                              <td className="px-2 py-1.5">{n?.label ?? <span className="text-amber-700">à choisir</span>}{extra > 0 && <span className="text-muted-foreground"> +{extra}</span>}</td>
                              <td className="px-2 py-1.5">{l.lots.length}</td>
                              <td className="px-2 py-1.5">{l.risks.length}</td>
                              <td className="px-2 py-1.5">{l.companyFills ? 'entreprise' : `${fmtFr(l.period.start)}`}</td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                  <div className="min-h-[50vh] rounded-md border border-border">
                    {previewUrl ? (
                      <iframe title="Aperçu de la fiche" src={previewUrl} className="h-[60vh] w-full" />
                    ) : (
                      <p className="p-4 text-sm text-muted-foreground">Génération de l’aperçu…</p>
                    )}
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  Chaque fiche est enregistrée puis passe à « À envoyer ». Les PDF sont regroupés dans un ZIP nommé selon le modèle défini par le Super Admin.
                </p>
                <div className="rounded-md border border-border p-3 font-mono text-xs">
                  {lines.slice(0, 5).map((l) => {
                    const o = byNumber.get(l.orderNumber)
                    return <div key={l.orderNumber}>{planFileName(template, { entreprise: companyLabel(o?.isis_code ?? null) || l.orderNumber, commande: l.orderNumber, secteur: o?.sector_code ?? '' })}</div>
                  })}
                  {lines.length > 5 && <div className="text-muted-foreground">… {lines.length - 5} autre(s)</div>}
                </div>
                {lines.some((l) => l.natureId == null) && (
                  <Notice tone="error">Certaines commandes n’ont pas de nature : revenez à l’étape 1.</Notice>
                )}
                {missingCompanies.length > 0 && (
                  <Notice tone="error">Nom d’entreprise manquant pour {missingCompanies.map((l) => l.orderNumber).join(', ')} : revenez à l’étape 3.</Notice>
                )}
                {identityMissing && <IdentityNotice codes={operatorsIncomplete} />}
                <div className="flex flex-wrap items-center gap-2">
                  <Button onClick={() => void validate()} disabled={busy || !lines.length || lines.some((l) => l.natureId == null) || missingCompanies.length > 0}>
                    {busy ? 'Enregistrement…' : mode === 'edit' ? `Enregistrer les modifications (${lines.length})` : `Valider et créer ${lines.length > 1 ? `les ${lines.length} fiches` : 'la fiche'}`}
                  </Button>
                  <Button variant="ghost" onClick={() => void download()} disabled={busy || !created || identityMissing}>Télécharger les PDF (ZIP)</Button>
                  {created && <Button variant="ghost" onClick={finish} disabled={busy}>Terminer</Button>}
                </div>
                {!created && <p className="text-xs text-muted-foreground">La fiche est créée dès la validation ; l’export PDF peut se faire ensuite depuis la liste.</p>}
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 border-t border-border pt-3">
          <Button variant="ghost" onClick={goPrev} disabled={busy || (step === 0 && cur === 0)}>Précédent</Button>
          <span className="mr-auto text-xs text-muted-foreground">
            {step !== OVERVIEW && `${STEPS[step]} · commande ${cur + 1} / ${lines.length}`}
          </span>
          {step === 0 && !canNext && <span className="text-xs text-amber-700">Choisissez une nature pour continuer</span>}
          {step === 2 && !canNext && <span className="text-xs text-amber-700">Le nom de l’entreprise est obligatoire</span>}
          {step !== OVERVIEW && (
            <Button onClick={goNext} disabled={busy || !canNext}>
              {step === BY_ORDER_STEPS - 1 && cur === lines.length - 1 ? 'Aperçu et validation' : step === BY_ORDER_STEPS - 1 ? 'Commande suivante' : 'Suivant'}
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}

function LotChip({ name, on, suggested, onClick }: { name: string; on: boolean; suggested?: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={on}
      className={`rounded-md border px-2.5 py-1 text-xs transition-colors ${on ? 'border-primary bg-primary/10 font-medium' : suggested ? 'border-dashed border-primary/60 text-foreground' : 'border-border text-muted-foreground hover:bg-muted'}`}>
      {on ? '✓ ' : ''}{name}{suggested && !on ? ' · suggéré' : ''}
    </button>
  )
}
