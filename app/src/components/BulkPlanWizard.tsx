import { useEffect, useMemo, useState } from 'react'
import type { Referentiel } from '../lib/refdata'
import { computeMeasures, searchNatures, type NatureRef } from '../lib/rules'
import { fmtFr, defaultPeriod } from '../lib/period'
import { natureCandidates, type OrderSuggestion } from '../lib/natureSuggest'
import { supabase } from '../lib/supabase'
import { derive, contactFor, fetchContacts, measuresFor, periodLabel, savePlans, buildSheetsZip, downloadBlob, buildSheetPdf, unique, planFileName, type Contact, type Line } from '../lib/sheet'
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
      La personne à alerter doit être complétée (Administration › Chargés d’opérations, ou saisie par la personne à son inscription) avant l’export des PDF.
    </Notice>
  )
}

export default function BulkPlanWizard({
  orders, suggestions, ref, companies, template, initial, mode = 'create', onClose, onDone,
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

  const byNumber = useMemo(() => new Map(orders.map((o) => [o.order_number, o])), [orders])

  // Préremplissage : nature seulement si la suggestion est fiable ; lots et risques/mesures en découlent.
  const [lines, setLines] = useState<Line[]>(() => orders.map((o) => {
    const saved = initial?.get(o.order_number)
    if (saved) return saved
    const sg = suggestions.get(o.order_number)
    const natureId = sg?.confident && sg.natureId != null ? sg.natureId : null
    const nature = natureId != null ? ref.natures.find((n) => n.id === natureId) : undefined
    const lots = unique([...(nature?.lots ?? []), ...(nature && sg?.lot != null ? [sg.lot] : [])])
    const d = derive(ref, natureId, lots)
    return {
      orderNumber: o.order_number, natureId, lots, risks: d.risks, measures: d.measures,
      companyFills: false, period: defaultPeriod(o.order_date, o.period_start, o.period_end),
    }
  }))
  const [cur, setCur] = useState(0)
  const [step, setStep] = useState(0)
  const [queries, setQueries] = useState<Record<string, string>>({})
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<string | null>(null)
  const [previewIndex, setPreviewIndex] = useState(0)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)

  const line = lines[cur]
  const order = byNumber.get(line.orderNumber)
  const sg = suggestions.get(line.orderNumber)
  const nature = line.natureId != null ? ref.natures.find((n) => n.id === line.natureId) : undefined

  const updateLine = (orderNumber: string, change: (l: Line) => Partial<Line>) =>
    setLines((prev) => prev.map((l) => (l.orderNumber === orderNumber ? { ...l, ...change(l) } : l)))

  const chooseNature = (natureId: number | null) => updateLine(line.orderNumber, (l) => {
    const n = natureId != null ? ref.natures.find((x) => x.id === natureId) : undefined
    const lots = unique([...l.lots, ...(n?.lots ?? [])])
    const d = derive(ref, natureId, lots, l.measures)
    return { natureId, lots, risks: d.risks, measures: d.measures }
  })
  const toggleLot = (code: number) => updateLine(line.orderNumber, (l) => {
    const lots = l.lots.includes(code) ? l.lots.filter((c) => c !== code) : [...l.lots, code]
    const d = derive(ref, l.natureId, lots, l.measures)
    return { lots, risks: d.risks, measures: d.measures }
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
  const proposeCorrections = async () => {
    setBusy(true); setErr(null)
    try {
      for (const [isis, e] of edits) {
        const before = companies.get(isis)
        if ((before?.name ?? '') === e.name && (before?.os_email ?? '') === e.os_email) continue
        const { error } = await supabase.rpc('propose_company', { p_isis: isis, p_fields: { name: e.name, os_email: e.os_email } })
        if (error) throw new Error(`${isis} : ${error.message}`)
      }
      setProgress('Corrections proposées : elles seront validées par le Super Admin.')
    } catch (e) { setErr(errMsg(e)) } finally { setBusy(false) }
  }

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
    const failures = await savePlans(lines, byNumber, ref)
    setBusy(false)
    if (failures.length) { setErr(`${failures.length} fiche(s) non enregistrée(s) :\n${failures.join('\n')}`); return }
    setCreated(true)
    setProgress(`${lines.length} fiche(s) ${mode === 'edit' ? 'mise(s) à jour' : 'créée(s)'}. Vous pouvez prévisualiser, modifier ou télécharger les PDF.`)
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
  const canNext = step !== 0 || line.natureId != null

  // ---- recherche de nature (préremplie avec le libellé source)
  const query = queries[line.orderNumber] ?? order?.nature_text ?? ''
  const searchHits = useMemo(() => (query.trim() ? searchNatures(query, ref.natures, ref.vocab, ref.lotNameByCode, 8) : []), [query, ref])
  const topCandidates = useMemo(() => (order ? natureCandidates(order, ref, 3) : []), [order, ref])
  const suggestedLots = unique([
    ...(nature?.lots ?? []),
    ...(!nature && topCandidates[0] ? topCandidates[0].nature.lots : []),
    ...(sg?.confident && sg.lot != null ? [sg.lot] : []),
  ])
  const otherLots = ref.lots.filter((lot) => !suggestedLots.includes(lot.code))

  const natureButton = (n: NatureRef, badge?: string) => (
    <button key={n.id} type="button" onClick={() => chooseNature(n.id)}
      className={`flex w-full items-start justify-between gap-3 rounded-md border px-3 py-2 text-left text-sm transition-colors ${line.natureId === n.id ? 'border-primary bg-primary/10' : 'border-border hover:bg-muted'}`}>
      <span>
        <span className="block font-medium">{n.label}</span>
        <span className="block text-xs text-muted-foreground">{n.groupLabel ?? ''}</span>
      </span>
      {badge && <Badge tone={line.natureId === n.id ? 'ok' : 'default'}>{badge}</Badge>}
    </button>
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
                  <h3 className="text-sm font-semibold">Nature</h3>
                  {topCandidates.length > 0 && (
                    <div className="space-y-1.5">
                      <p className="text-xs text-muted-foreground">Suggestions</p>
                      {topCandidates.map((h) => natureButton(h.nature, h.score >= 0.5 ? 'fiable' : 'à confirmer'))}
                    </div>
                  )}
                  <div className="space-y-1.5">
                    <label className="block text-xs text-muted-foreground">Rechercher une autre nature</label>
                    <input className={fieldClass} value={query} onChange={(e) => setQueries((q) => ({ ...q, [line.orderNumber]: e.target.value }))} />
                    {searchHits.length > 0 && (
                      <div className="max-h-64 space-y-1.5 overflow-y-auto pr-1">
                        {searchHits.map((h) => natureButton(h.nature))}
                      </div>
                    )}
                  </div>
                  {nature && (
                    <div className="flex items-center gap-2 text-sm">
                      <span className="text-muted-foreground">Nature retenue :</span>
                      <span className="font-medium">{nature.label}</span>
                      <Button variant="ghost" className="ml-auto h-7 px-2 text-xs" onClick={() => chooseNature(null)}>Retirer</Button>
                    </div>
                  )}
                </Card>

                <Card className="space-y-3">
                  <div>
                    <h3 className="text-sm font-semibold">Lots concernés</h3>
                    <p className="text-xs text-muted-foreground">Les lots suggérés par la nature et l’analyse sont en tête ; cochez ou décochez librement.</p>
                  </div>
                  {suggestedLots.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {ref.lots.filter((lot) => suggestedLots.includes(lot.code)).map((lot) => (
                        <LotChip key={lot.code} name={lot.name} on={line.lots.includes(lot.code)} suggested onClick={() => toggleLot(lot.code)} />
                      ))}
                    </div>
                  )}
                  <div className="flex flex-wrap gap-1.5">
                    {otherLots.map((lot) => (
                      <LotChip key={lot.code} name={lot.name} on={line.lots.includes(lot.code)} onClick={() => toggleLot(lot.code)} />
                    ))}
                  </div>
                </Card>
              </div>
            )}

            {step === 1 && (
              <div className="space-y-4">
                <p className="text-xs text-muted-foreground">
                  Risques proposés par les lots et la nature. Les mesures se mettent à jour quand vous modifiez les risques.
                </p>
                <Card className="space-y-3">
                  <h3 className="text-sm font-semibold">Risques ({line.risks.length})</h3>
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
                </Card>
                <Card className="space-y-3">
                  <h3 className="text-sm font-semibold">Mesures de prévention ({line.measures.length})</h3>
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
                </Card>
              </div>
            )}

            {step === 2 && (
              <div className="space-y-4">
                <Card className="space-y-3">
                  <h3 className="text-sm font-semibold">Entreprise</h3>
                  {order?.isis_code ? (
                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="block text-xs text-muted-foreground">Nom de l’entreprise (n° {order.isis_code})
                        <input className={fieldClass} value={companyOf(order.isis_code).name} onChange={(e) => setEdit(order.isis_code!, 'name', e.target.value)} placeholder="Nom de l’entreprise" />
                      </label>
                      <label className="block text-xs text-muted-foreground">Email OS
                        <input className={fieldClass} value={companyOf(order.isis_code).os_email} onChange={(e) => setEdit(order.isis_code!, 'os_email', e.target.value)} placeholder="Email OS" />
                      </label>
                      <div className="sm:col-span-2 flex flex-wrap items-center gap-2">
                        <Button variant="ghost" onClick={() => void proposeCorrections()} disabled={busy || !edits.size}>Proposer les corrections au Super Admin</Button>
                        <span className="text-xs text-muted-foreground">Les corrections sont validées par le Super Admin ; la fiche peut être créée sans elles.</span>
                      </div>
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
                          return (
                            <tr key={l.orderNumber} onClick={() => setPreviewIndex(i)}
                              className={`cursor-pointer border-t border-border ${i === previewIndex ? 'bg-primary/10' : 'hover:bg-muted/50'}`}>
                              <td className="px-2 py-1.5 font-mono">{l.orderNumber}</td>
                              <td className="px-2 py-1.5">{n?.label ?? <span className="text-amber-700">à choisir</span>}</td>
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
                {identityMissing && <IdentityNotice codes={operatorsIncomplete} />}
                <div className="flex flex-wrap items-center gap-2">
                  <Button onClick={() => void validate()} disabled={busy || !lines.length || lines.some((l) => l.natureId == null)}>
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
