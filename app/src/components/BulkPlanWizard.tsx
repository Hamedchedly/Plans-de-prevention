import { useEffect, useMemo, useState } from 'react'
import JSZip from 'jszip'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import type { Referentiel } from '../lib/refdata'
import { computeMeasures, proposeRisks, type NatureRef } from '../lib/rules'
import { buildPlanPdf, planFileName } from '../lib/planPdf'
import { defaultPeriod, fmtFr } from '../lib/period'
import type { OrderRow } from '../lib/types'
import type { CompanyRow } from '../pages/AdminCompanies'
import { Badge, Button, Card, Notice, errMsg, fieldClass } from './ui'

export interface OrderSuggestion { nature: string | null; natureId: number | null; lot: number | null }

interface Line { orderNumber: string; natureId: number | null; lots: number[] }
interface CompanyEdit { name: string; os_email: string }

const STEPS = ['Natures et lots', 'Entreprises', 'Aperçu PDF', 'Export']

/** Données de la fiche pour une ligne : risques et mesures déduits comme dans l'éditeur. */
function sheetFor(line: Line, ref: Referentiel) {
  const nature = line.natureId != null ? ref.natures.find((n) => n.id === line.natureId) : undefined
  const natures: NatureRef[] = nature ? [nature] : []
  const risks = proposeRisks(ref.lotDefaults, line.lots, natures)
  const measures = computeMeasures(new Set(risks.keys()), ref.rules)
  return { nature, risks, measures }
}

export default function BulkPlanWizard({
  orders, suggestions, ref, companies, template, onClose, onDone,
}: {
  orders: OrderRow[]
  suggestions: Map<string, OrderSuggestion>
  ref: Referentiel
  companies: Map<string, CompanyRow>
  template: string
  onClose: () => void
  onDone: (message: string) => void
}) {
  const { profile } = useAuth()
  const identityMissing = !profile || !profile.first_name?.trim() || !profile.last_name?.trim() || !profile.phone?.trim() || !(profile.contact_email?.trim() || profile.email?.trim())
  const redactorOf = () => (profile ? {
    name: [profile.first_name, profile.last_name].filter(Boolean).join(' ') || profile.full_name || '',
    email: profile.contact_email || profile.email || '',
    phone: profile.phone || '',
  } : null)
  const [periods, setPeriods] = useState<Map<string, { start: string; end: string }>>(() =>
    new Map(orders.map((o) => [o.order_number, defaultPeriod(o.order_date, o.period_start, o.period_end)])))
  const periodText = (n: string) => {
    const p = periods.get(n)
    return p ? `${fmtFr(p.start)} au ${fmtFr(p.end)}` : ''
  }
  const [step, setStep] = useState(0)
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<string | null>(null)

  const [lines, setLines] = useState<Line[]>(() => orders.map((o) => {
    const sg = suggestions.get(o.order_number)
    const nature = sg?.natureId != null ? ref.natures.find((n) => n.id === sg.natureId) : undefined
    const lots = new Set<number>(nature?.lots ?? [])
    if (sg?.lot != null) lots.add(sg.lot)
    return { orderNumber: o.order_number, natureId: nature?.id ?? null, lots: [...lots] }
  }))

  const byNumber = useMemo(() => new Map(orders.map((o) => [o.order_number, o])), [orders])
  const isisOf = (orderNumber: string) => byNumber.get(orderNumber)?.isis_code ?? null

  // ---- étape 1 : groupes par nature
  const groups = useMemo(() => {
    const g = new Map<string, Line[]>()
    for (const l of lines) {
      const key = l.natureId == null ? 'none' : String(l.natureId)
      g.set(key, [...(g.get(key) ?? []), l])
    }
    return [...g.entries()]
  }, [lines])

  const setGroupNature = (key: string, natureId: number | null) => {
    setLines((prev) => prev.map((l) => {
      if ((l.natureId == null ? 'none' : String(l.natureId)) !== key) return l
      const nature = natureId != null ? ref.natures.find((n) => n.id === natureId) : undefined
      return { ...l, natureId, lots: [...new Set([...l.lots, ...(nature?.lots ?? [])])] }
    }))
  }
  const toggleGroupLot = (key: string, code: number) => {
    setLines((prev) => prev.map((l) => {
      if ((l.natureId == null ? 'none' : String(l.natureId)) !== key) return l
      return { ...l, lots: l.lots.includes(code) ? l.lots.filter((c) => c !== code) : [...l.lots, code] }
    }))
  }

  // ---- étape 2 : entreprises
  const isisList = useMemo(() => [...new Set(lines.map((l) => isisOf(l.orderNumber)).filter((x): x is string => !!x))], [lines, byNumber]) // eslint-disable-line react-hooks/exhaustive-deps
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
      setErr(null)
      setProgress('Corrections proposées : elles seront validées par le Super Admin.')
    } catch (e) { setErr(errMsg(e)) } finally { setBusy(false) }
  }

  // ---- étape 3 : aperçu
  const [previewIndex, setPreviewIndex] = useState(0)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const current = lines[previewIndex]
  useEffect(() => {
    if (step !== 2 || !current) return
    let url: string | null = null
    let alive = true
    ;(async () => {
      try {
        const order = byNumber.get(current.orderNumber)
        if (!order) return
        const { nature, risks, measures } = sheetFor(current, ref)
        const bytes = await buildPlanPdf({
          orderNumber: order.order_number,
          lotNames: current.lots.map((c) => ref.lotNameByCode.get(c) ?? `Lot ${c}`),
          taskLabel: nature?.label ?? order.nature_text ?? '',
          activity: order.nature_text ?? order.description ?? '',
          zone: [order.address, order.city, order.tranche_name].filter(Boolean).join(' · '),
          period: periodText(order.order_number),
          companyLabel: companyLabel(order.isis_code),
          risks: [...risks.keys()].map((c) => ref.riskLabel.get(c) ?? c),
          measures: [...measures].map((c) => ({
            family: ref.measures.find((m) => m.code === c)?.family ?? 'Autres',
            label: ref.measures.find((m) => m.code === c)?.label ?? c,
          })),
          redactor: redactorOf(),
          date: new Date().toLocaleDateString('fr-FR'),
        })
        const blob = new Blob([bytes as BlobPart], { type: 'application/pdf' })
        url = URL.createObjectURL(blob)
        if (alive) setPreviewUrl(url); else URL.revokeObjectURL(url)
      } catch (e) { if (alive) setErr(errMsg(e)) }
    })()
    return () => { alive = false; if (url) URL.revokeObjectURL(url); setPreviewUrl(null) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, previewIndex, current?.orderNumber, current?.natureId, current?.lots.join(','), edits, periods])

  // ---- étape 4 : création des fiches et export ZIP
  const exportAll = async () => {
    setBusy(true); setErr(null); setProgress(null)
    const zip = new JSZip()
    const used = new Map<string, number>()
    const failures: string[] = []
    let done = 0
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      const order = byNumber.get(line.orderNumber)
      if (!order) continue
      setProgress(`Fiche ${i + 1} / ${lines.length} : ${line.orderNumber}`)
      try {
        const { nature, risks, measures } = sheetFor(line, ref)
        const { error } = await supabase.rpc('save_plan', {
          p_order: order.order_number,
          p_nature_id: nature && !nature.pending ? nature.id : null,
          p_proposal_id: nature?.pending ? nature.proposalId ?? null : null,
          p_lots: line.lots.map((code) => ({
            code, source: ref.natures.some((n) => n.id === line.natureId && n.lots.includes(code)) ? 'NATURE' : 'AUTO_ANALYSIS', confidence: null,
          })),
          p_risks: [...risks].map(([code, origin]) => ({ code, checked: true, origin })),
          p_measures: [...measures].map((code) => ({ code, checked: true, origin: 'AUTO' })),
        })
        if (error) throw new Error(error.message)
        const per = periods.get(order.order_number) ?? defaultPeriod(order.order_date)
        const { error: pErr } = await supabase.rpc('set_plan_period', { p_order: order.order_number, p_start: per.start, p_end: per.end })
        if (pErr) throw new Error(pErr.message)

        const base = planFileName(template, {
          entreprise: companyLabel(order.isis_code) || order.order_number,
          commande: order.order_number,
          secteur: order.sector_code ?? '',
        })
        const count = used.get(base) ?? 0
        used.set(base, count + 1)
        const name = count ? base.replace(/\.pdf$/, ` (${count + 1}).pdf`) : base

        const bytes = await buildPlanPdf({
          orderNumber: order.order_number,
          lotNames: line.lots.map((c) => ref.lotNameByCode.get(c) ?? `Lot ${c}`),
          taskLabel: nature?.label ?? order.nature_text ?? '',
          activity: order.nature_text ?? order.description ?? '',
          zone: [order.address, order.city, order.tranche_name].filter(Boolean).join(' · '),
          period: periodText(order.order_number),
          companyLabel: companyLabel(order.isis_code),
          risks: [...risks.keys()].map((c) => ref.riskLabel.get(c) ?? c),
          measures: [...measures].map((c) => ({
            family: ref.measures.find((m) => m.code === c)?.family ?? 'Autres',
            label: ref.measures.find((m) => m.code === c)?.label ?? c,
          })),
          redactor: redactorOf(),
          date: new Date().toLocaleDateString('fr-FR'),
        })
        zip.file(name, bytes)
        done++
      } catch (e) {
        failures.push(`${line.orderNumber} : ${errMsg(e)}`)
      }
    }
    try {
      if (done > 0) {
        const blob = await zip.generateAsync({ type: 'blob' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `fiches_plans_prevention_${new Date().toISOString().slice(0, 10)}.zip`
        document.body.appendChild(a); a.click(); a.remove()
        setTimeout(() => URL.revokeObjectURL(url), 1000)
      }
      setBusy(false)
      if (failures.length) setErr(`${failures.length} fiche(s) non créée(s) :\n${failures.join('\n')}`)
      if (done > 0) onDone(`${done} fiche(s) créée(s) et exportée(s).${failures.length ? ` ${failures.length} en erreur.` : ''}`)
    } catch (e) { setBusy(false); setErr(errMsg(e)) }
  }

  const natureOptions = useMemo(() => {
    const byGroup = new Map<string, NatureRef[]>()
    for (const n of ref.natures) {
      const k = n.groupLabel ?? 'Autres'
      byGroup.set(k, [...(byGroup.get(k) ?? []), n])
    }
    return [...byGroup.entries()]
  }, [ref])

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4" role="dialog" aria-modal="true">
      <div className="my-8 w-full max-w-4xl space-y-4 rounded-lg border border-border bg-card p-5 shadow-lg">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="mr-auto font-semibold">Création groupée de fiches · {lines.length} commande(s)</h2>
          <Button variant="ghost" onClick={onClose} disabled={busy}>Fermer</Button>
        </div>

        <div className="flex flex-wrap gap-2 text-sm">
          {STEPS.map((s, i) => (
            <Badge key={s} tone={i === step ? 'ok' : 'default'}>{i + 1}. {s}</Badge>
          ))}
        </div>

        {err && <Notice tone="error">{err}</Notice>}
        {progress && <Notice tone="ok">{progress}</Notice>}

        {step === 0 && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Une ligne par nature commandée. Le lot suggéré est coché ; modifiez la nature ou les lots pour tout le groupe.</p>
            {groups.map(([key, items]) => {
              const nature = key !== 'none' ? ref.natures.find((n) => String(n.id) === key) : undefined
              const lotsOfGroup = new Set(items.flatMap((l) => l.lots))
              return (
                <Card key={key}>
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <select className={fieldClass + ' flex-1 min-w-[260px]'} value={nature?.id ?? ''}
                      onChange={(e) => setGroupNature(key, e.target.value ? Number(e.target.value) : null)}>
                      <option value="">— Aucune nature —</option>
                      {natureOptions.map(([g, ns]) => (
                        <optgroup key={g} label={g}>
                          {ns.map((n) => <option key={n.id} value={n.id}>{n.label}{n.pending ? ' (en attente)' : ''}</option>)}
                        </optgroup>
                      ))}
                    </select>
                    <Badge>{items.length} commande(s)</Badge>
                  </div>
                  <div className="mb-2 text-xs text-muted-foreground">{items.map((l) => l.orderNumber).join(', ')}</div>
                  <div className="flex flex-wrap gap-1">
                    {ref.lots.map((lot) => {
                      const on = items.every((l) => l.lots.includes(lot.code))
                      const some = !on && lotsOfGroup.has(lot.code)
                      return (
                        <button key={lot.code} type="button" onClick={() => toggleGroupLot(key, lot.code)}
                          className={`rounded-md border px-2 py-1 text-xs ${on ? 'border-primary bg-primary/10 font-medium' : some ? 'border-dashed border-border' : 'border-border text-muted-foreground'}`}>
                          {on ? '✓ ' : ''}{lot.name}
                        </button>
                      )
                    })}
                  </div>
                </Card>
              )
            })}
          </div>
        )}

        {step === 1 && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Complétez le nom et l’email OS manquants. Les corrections sont proposées au Super Admin ; la fiche peut être créée sans elles.</p>
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-sm">
                <thead className="bg-muted text-left text-xs text-muted-foreground">
                  <tr><th className="px-3 py-2">N° entreprise</th><th className="px-3 py-2">Nom</th><th className="px-3 py-2">Email OS</th><th className="px-3 py-2">Commandes</th></tr>
                </thead>
                <tbody>
                  {isisList.map((isis) => {
                    const c = companyOf(isis)
                    const count = lines.filter((l) => isisOf(l.orderNumber) === isis).length
                    return (
                      <tr key={isis} className="border-t border-border">
                        <td className="px-3 py-2 font-mono text-xs">{isis}</td>
                        <td className="px-3 py-2"><input className={fieldClass} value={c.name} onChange={(e) => setEdit(isis, 'name', e.target.value)} placeholder="Nom de l’entreprise" /></td>
                        <td className="px-3 py-2"><input className={fieldClass} value={c.os_email} onChange={(e) => setEdit(isis, 'os_email', e.target.value)} placeholder="Email OS" /></td>
                        <td className="px-3 py-2">{count}{!c.name.trim() || !c.os_email.trim() ? <span className="ml-2"><Badge tone="warn">à compléter</Badge></span> : null}</td>
                      </tr>
                    )
                  })}
                  {!isisList.length && <tr><td className="px-3 py-3 text-muted-foreground" colSpan={4}>Aucune entreprise sur ces commandes.</td></tr>}
                </tbody>
              </table>
            </div>
            <Button variant="ghost" onClick={() => void proposeCorrections()} disabled={busy || !edits.size}>Proposer les corrections au Super Admin</Button>
          </div>
        )}

        {step === 2 && (
          <div className="grid gap-3 md:grid-cols-[260px_1fr]">
            <div className="max-h-[70vh] space-y-1 overflow-y-auto rounded-md border border-border p-2">
              {lines.map((l, i) => (
                <button key={l.orderNumber} type="button" onClick={() => setPreviewIndex(i)}
                  className={`block w-full rounded px-2 py-1 text-left text-xs ${i === previewIndex ? 'bg-primary/10 font-medium' : 'hover:bg-muted'}`}>
                  {l.orderNumber} · {companyLabel(isisOf(l.orderNumber)) || '—'}
                </button>
              ))}
            </div>
            <div className="min-h-[70vh] rounded-md border border-border">
              {previewUrl ? (
                <iframe title="Aperçu de la fiche" src={previewUrl} className="h-[70vh] w-full" />
              ) : (
                <p className="p-4 text-sm text-muted-foreground">Génération de l’aperçu…</p>
              )}
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Chaque fiche est enregistrée puis passe à « À envoyer ». Les PDF sont regroupés dans un fichier ZIP nommé selon le modèle défini par le Super Admin.
            </p>
            <div className="rounded-md border border-border p-3 font-mono text-xs">
              {lines.slice(0, 5).map((l) => {
                const o = byNumber.get(l.orderNumber)
                return <div key={l.orderNumber}>{planFileName(template, { entreprise: companyLabel(o?.isis_code ?? null) || l.orderNumber, commande: l.orderNumber, secteur: o?.sector_code ?? '' })}</div>
              })}
              {lines.length > 5 && <div className="text-muted-foreground">… {lines.length - 5} autre(s)</div>}
            </div>
            {identityMissing && (
              <Notice tone="error">Votre identité est incomplète : renseignez prénom, nom, téléphone et mail via « Mon profil » avant de créer des fiches.</Notice>
            )}
            <div className="overflow-x-auto rounded-md border border-border">
              <table className="w-full text-sm">
                <thead className="bg-muted text-left text-xs text-muted-foreground">
                  <tr><th className="px-3 py-2">Commande</th><th className="px-3 py-2">Début</th><th className="px-3 py-2">Fin</th></tr>
                </thead>
                <tbody>
                  {lines.map((l) => {
                    const per = periods.get(l.orderNumber) ?? defaultPeriod(byNumber.get(l.orderNumber)?.order_date ?? null)
                    return (
                      <tr key={l.orderNumber} className="border-t border-border">
                        <td className="px-3 py-2 font-mono text-xs">{l.orderNumber}</td>
                        <td className="px-3 py-2"><input type="date" className={fieldClass} value={per.start}
                          onChange={(e) => setPeriods((prev) => new Map(prev).set(l.orderNumber, defaultPeriod(e.target.value)))} /></td>
                        <td className="px-3 py-2"><input type="date" className={fieldClass} value={per.end}
                          onChange={(e) => setPeriods((prev) => new Map(prev).set(l.orderNumber, { start: per.start, end: e.target.value }))} /></td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-muted-foreground">Par défaut : du jour de la commande à deux mois plus tard. Modifiable pour chaque fiche.</p>
            <Button onClick={() => void exportAll()} disabled={busy || !lines.length || identityMissing}>
              {busy ? 'Création en cours…' : `Créer les ${lines.length} fiche(s) et exporter le ZIP`}
            </Button>
          </div>
        )}

        <div className="flex items-center gap-2 border-t border-border pt-3">
          <Button variant="ghost" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0 || busy}>Précédent</Button>
          <span className="mr-auto" />
          {step < STEPS.length - 1 && (
            <Button onClick={() => setStep((s) => s + 1)} disabled={busy || !lines.length}>Suivant</Button>
          )}
        </div>
      </div>
    </div>
  )
}
