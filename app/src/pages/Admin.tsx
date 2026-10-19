import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { getReferentiel } from '../lib/refdata'
import { importReferentielV4 } from '../lib/referentiel'
import { checkReferentielFile, downloadJson, exportReferentiel, lastReferentielLoad } from '../lib/referentielIO'
import type { AlertRow, Profile, Role } from '../lib/types'
import { Badge, Button, Card, Notice, PageHeader, errMsg, fieldClass } from '../components/ui'
import { CompaniesSection, CompanyProposalsSection } from './AdminCompanies'
import { DataSection } from './AdminData'
import { startImpersonation } from '../lib/impersonation'
import ProfileDialog from '../components/ProfileDialog'
import { CreatorsSection, Folded, NonRegisteredCreators, TemplatesSection } from './AdminOps'
import ImportPage from './Import'
import { adminPageLabel, visibleAdminGroups } from '../lib/adminNav'
import { ControlsSection } from './AdminControls'

/** Une page d'administration, choisie par l'adresse (/administration/:section). */
export default function Admin({ section }: { section: string }) {
  const { can, profile } = useAuth()
  const isSuper = can('SUPER_ADMIN')
  const allowed = visibleAdminGroups(isSuper).some((g) => g.pages.some((p) => p.key === section))
  return (
    <div className="space-y-5">
      <PageHeader title={adminPageLabel(section)} subtitle="Administration" />
      {!allowed && <Notice tone="error">Cette page n’est pas accessible avec votre rôle.</Notice>}
      {allowed && section === 'alertes' && <AlertsSection />}
      {allowed && section === 'controles' && <ControlsSection />}
      {allowed && section === 'validations' && <><ValidationsSection /><CompanyProposalsSection /></>}
      {allowed && section === 'tracabilite' && <TraceSection />}
      {allowed && section === 'perimetre' && <ScopeSection />}
      {allowed && section === 'referentiels' && <ReferentielSection userId={profile?.user_id ?? ''} />}
      {allowed && section === 'entreprises' && <CompaniesSection />}
      {allowed && section === 'donnees' && <DataSection />}
      {allowed && section === 'fichiers' && <FileNameSection />}
      {allowed && section === 'modeles' && <TemplatesSection />}
      {allowed && section === 'utilisateurs' && <>
        <CreatorsSection />
        {isSuper && <UsersSection />}
        <NonRegisteredCreators />
      </>}
      {allowed && section === 'import' && <ImportPage />}
    </div>
  )
}

function AlertsSection() {
  const { can } = useAuth()
  const [rows, setRows] = useState<AlertRow[]>([])
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [proposals, setProposals] = useState<Record<string, string>>({})
  const [editing, setEditing] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [filter, setFilter] = useState<'OUVERTES' | 'VALIDEES' | 'TOUTES'>('OUVERTES')

  const load = async () => {
    const { data, error } = await supabase.from('alerts').select('*').order('code')
    if (error) setErr(error.message); else setRows((data ?? []) as AlertRow[])
  }
  useEffect(() => { void load() }, [])

  const decide = async (code: string, status: 'VALIDE' | 'IGNORE') => {
    const { error } = await supabase.rpc('decide_alert', { p_code: code, p_status: status, p_comment: drafts[code] ?? null })
    if (error) setErr(error.message); else { setErr(null); void load() }
  }
  /** « Modifier » : enregistre la proposition corrigée et le commentaire. */
  const saveEdit = async (a: AlertRow) => {
    const { error } = await supabase.rpc('decide_alert_edit', {
      p_code: a.code, p_status: 'MODIFIE', p_comment: drafts[a.code] ?? null, p_proposal: proposals[a.code] ?? a.proposal,
    })
    if (error) { setErr(error.message); return }
    setErr(null); setEditing(null); void load()
  }

  /** Choix proposés : le premier est la proposition (statut VALIDE), les autres sont des modifications (MODIFIE). */
  const choose = async (a: AlertRow, option: string, index: number) => {
    const { error } = await supabase.rpc('decide_alert_edit', {
      p_code: a.code, p_status: index === 0 ? 'VALIDE' : 'MODIFIE', p_comment: drafts[a.code] ?? null, p_proposal: option,
    })
    if (error) { setErr(error.message); return }
    setErr(null); void load()
  }

  const open = (a: AlertRow) => a.status === 'A_VALIDER' || a.status === 'APPLIQUE_A_VALIDER'
  const shown = filter === 'OUVERTES' ? rows.filter(open) : filter === 'VALIDEES' ? rows.filter((a) => a.status === 'VALIDE') : rows
  const tone = (s: AlertRow['status']) => (s === 'VALIDE' ? 'ok' : s === 'IGNORE' ? 'off' : s === 'MODIFIE' ? 'warn' : 'default') as 'ok' | 'off' | 'warn' | 'default'
  const canDecide = can('RESPONSABLE', 'SUPER_ADMIN')

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <h2 className="mr-auto font-semibold">Alertes d’incohérence ({shown.length})</h2>
        <select className={fieldClass + ' w-auto'} value={filter} onChange={(e) => setFilter(e.target.value as 'OUVERTES' | 'VALIDEES' | 'TOUTES')}>
          <option value="OUVERTES">À traiter</option>
          <option value="VALIDEES">Validées</option>
          <option value="TOUTES">Toutes</option>
        </select>
      </div>
      {err && <Notice tone="error">{err}</Notice>}
      {!canDecide && <Notice>Réservé aux responsables.</Notice>}
      {shown.map((a) => (
        <Card key={a.code}>
          <div className="mb-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span className="font-mono">{a.code}</span><Badge>{a.type}</Badge><Badge tone={tone(a.status)}>{a.status.replace(/_/g, ' ')}</Badge>
          </div>
          <div className="text-sm font-medium">{a.object}</div>
          <p className="mt-1 text-sm">{a.finding}</p>
          {editing === a.code ? (
            <div className="mt-2 space-y-2">
              <label className="block text-xs text-muted-foreground">Proposition</label>
              <textarea className={fieldClass + ' min-h-[80px] w-full'} value={proposals[a.code] ?? a.proposal}
                onChange={(e) => setProposals({ ...proposals, [a.code]: e.target.value })} />
              <input className={fieldClass + ' w-full'} placeholder="Commentaire (optionnel)" value={drafts[a.code] ?? ''}
                onChange={(e) => setDrafts({ ...drafts, [a.code]: e.target.value })} />
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => void saveEdit(a)} disabled={!canDecide}>Enregistrer la modification</Button>
                <Button variant="ghost" onClick={() => setEditing(null)}>Annuler</Button>
              </div>
            </div>
          ) : (
            <>
              <p className="mt-1 text-sm text-muted-foreground">Proposition : {a.proposal}</p>
              {a.decision_comment && <p className="mt-1 text-xs text-muted-foreground">Commentaire : {a.decision_comment}</p>}
              {a.options && a.options.length > 0 && (
                <div className="mt-3 space-y-1.5">
                  <p className="text-xs font-medium text-muted-foreground">Choisir :</p>
                  {a.options.map((o, i) => (
                    <Button key={o} variant="ghost" className="h-auto w-full justify-start whitespace-normal py-2 text-left" onClick={() => void choose(a, o, i)} disabled={!canDecide}>{o}</Button>
                  ))}
                </div>
              )}
              <div className="mt-3 flex flex-wrap gap-2">
                <input className={fieldClass + ' flex-1 min-w-[200px]'} placeholder="Commentaire (optionnel)" value={drafts[a.code] ?? ''}
                  onChange={(e) => setDrafts({ ...drafts, [a.code]: e.target.value })} />
                <Button onClick={() => void decide(a.code, 'VALIDE')} disabled={!canDecide}>Valider</Button>
                <Button variant="ghost" onClick={() => { setProposals({ ...proposals, [a.code]: proposals[a.code] ?? a.proposal }); setEditing(a.code) }} disabled={!canDecide}>Modifier</Button>
                <Button variant="ghost" onClick={() => void decide(a.code, 'IGNORE')} disabled={!canDecide}>Ignorer</Button>
              </div>
            </>
          )}
        </Card>
      ))}
      {shown.length === 0 && <Notice>Aucune alerte dans cette vue.</Notice>}
    </div>
  )
}

interface Proposal {
  id: number; kind: 'NATURE_NOUVELLE' | 'NATURE_REGLE' | 'CORPS_NAAC'; nature_id: number | null
  payload: { label?: string; lots?: number[]; risks?: string[]; measures?: string[]; naac?: string; corps_label?: string; lot_code?: number }
  reason: string | null; created_by: string; created_at: string
}

/** Ce que le Super Admin doit valider avant généralisation : propositions de référentiel et demandes d'exclusion. */
function ValidationsSection() {
  const [proposals, setProposals] = useState<Proposal[]>([])
  const [requests, setRequests] = useState<{ order_number: string; scope_request_reason: string | null; scope_request_by: string | null }[]>([])
  const [lots, setLots] = useState<Record<number, string>>({})
  const [emails, setEmails] = useState<Record<string, string>>({})
  const [comments, setComments] = useState<Record<string, string>>({})
  const [err, setErr] = useState<string | null>(null)

  const load = async () => {
    setErr(null)
    const [p, r, l, pr] = await Promise.all([
      supabase.from('referential_proposals').select('id,kind,nature_id,payload,reason,created_by,created_at').eq('status', 'EN_ATTENTE').order('created_at'),
      supabase.from('orders').select('order_number,scope_request_reason,scope_request_by').eq('scope_request_status', 'EN_ATTENTE'),
      supabase.from('lots').select('code,name'),
      supabase.from('profiles').select('user_id,email'),
    ])
    const e = [p, r, l, pr].find((x) => x.error)?.error
    if (e) { setErr(e.message); return }
    setProposals((p.data ?? []) as Proposal[])
    setRequests((r.data ?? []) as typeof requests)
    setLots(Object.fromEntries((l.data ?? []).map((x: { code: number; name: string }) => [x.code, x.name])))
    setEmails(Object.fromEntries((pr.data ?? []).map((x: { user_id: string; email: string | null }) => [x.user_id, x.email ?? x.user_id])))
  }
  // Chargement unique au montage : `load` ne lit que des états de cette section.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void load() }, [])

  const [adjust, setAdjust] = useState<Record<number, { label: string; lots: number[]; lot?: number }>>({})
  const adjustFor = (p: Proposal) => adjust[p.id] ?? { label: p.payload.label ?? '', lots: p.payload.lots ?? [], lot: p.payload.lot_code }

  const decideProposal = async (p: Proposal, approve: boolean, modified = false) => {
    const c = comments[`p${p.id}`] ?? null
    const a = adjustFor(p)
    let error: { message: string } | null = null
    if (p.kind === 'CORPS_NAAC') {
      ({ error } = await supabase.rpc('decide_corps_naac', { p_id: p.id, p_approve: approve, p_comment: c, p_lot: modified ? a.lot ?? null : null }))
    } else {
      const adjusted = modified && approve
        ? { ...p.payload, label: a.label.trim(), lots: a.lots }
        : undefined
      ;({ error } = await supabase.rpc('decide_referential', {
        p_id: p.id, p_status: approve ? (modified ? 'AJUSTEE' : 'APPROUVEE') : 'REFUSEE', p_comment: c, p_adjusted: adjusted ?? null,
      }))
    }
    if (error) setErr(error.message); else void load()
  }

  const decideRequest = async (orderNumber: string, approve: boolean) => {
    const { error } = await supabase.rpc('decide_scope_exclusion', { p_order: orderNumber, p_approve: approve, p_comment: comments[`o${orderNumber}`] ?? null })
    if (error) setErr(error.message); else void load()
  }

  const describe = (p: Proposal) => {
    const names = (ids: number[] = []) => ids.map((i) => lots[i] ?? i).join(', ') || '—'
    if (p.kind === 'CORPS_NAAC') return `Correspondance ${p.payload.naac} · « ${p.payload.corps_label} » → ${lots[p.payload.lot_code ?? 0] ?? '—'}`
    if (p.kind === 'NATURE_NOUVELLE') return `Nouvelle nature : « ${p.payload.label} » · lots : ${names(p.payload.lots)}`
    return `Règle de la nature n°${p.nature_id} · lots : ${names(p.payload.lots)} · risques : ${(p.payload.risks ?? []).join(', ') || '—'}`
  }

  return (
    <div className="space-y-4">
      <h2 className="font-semibold">Validations en attente</h2>
      <p className="text-sm text-muted-foreground">Rien n’est généralisé aux autres utilisateurs avant votre décision. Vous pouvez approuver, refuser ou commenter.</p>
      {err && <Notice tone="error">{err}</Notice>}

      <h3 className="pt-2 text-sm font-semibold">Référentiel ({proposals.length})</h3>
      {proposals.map((p) => (
        <Card key={p.id}>
          <div className="mb-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <Badge>{p.kind === 'NATURE_NOUVELLE' ? 'Nouvelle nature' : p.kind === 'NATURE_REGLE' ? 'Règle de nature' : 'Correspondance NAAC'}</Badge>
            <span>par {emails[p.created_by] ?? p.created_by}</span>
            <span>{new Date(p.created_at).toLocaleString('fr-FR')}</span>
          </div>
          <p className="text-sm">{describe(p)}</p>
          {p.reason && <p className="mt-1 text-xs text-muted-foreground">Motif : {p.reason}</p>}
          {p.kind === 'CORPS_NAAC' ? (
            <div className="mt-2 flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">Lot retenu :</span>
              <select className={fieldClass + ' w-auto'} value={adjustFor(p).lot ?? ''} onChange={(e) => setAdjust({ ...adjust, [p.id]: { ...adjustFor(p), lot: Number(e.target.value) } })}>
                {Object.entries(lots).map(([code, name]) => <option key={code} value={code}>{name}</option>)}
              </select>
            </div>
          ) : (
            <div className="mt-2 space-y-2">
              {p.kind === 'NATURE_NOUVELLE' && (
                <input className={fieldClass} value={adjustFor(p).label} onChange={(e) => setAdjust({ ...adjust, [p.id]: { ...adjustFor(p), label: e.target.value } })} />
              )}
              <div className="grid grid-cols-1 gap-1 sm:grid-cols-3 text-sm">
                {Object.entries(lots).map(([code, name]) => {
                  const on = adjustFor(p).lots.includes(Number(code))
                  return (
                    <label key={code} className="flex items-center gap-2">
                      <input type="checkbox" checked={on} onChange={() => {
                        const cur = adjustFor(p).lots
                        const next = on ? cur.filter((x) => x !== Number(code)) : [...cur, Number(code)]
                        setAdjust({ ...adjust, [p.id]: { ...adjustFor(p), lots: next } })
                      }} />
                      {name}
                    </label>
                  )
                })}
              </div>
            </div>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            <input className={fieldClass + ' min-w-[200px] flex-1'} placeholder="Commentaire (optionnel)" value={comments[`p${p.id}`] ?? ''}
              onChange={(e) => setComments({ ...comments, [`p${p.id}`]: e.target.value })} />
            <Button onClick={() => void decideProposal(p, true)}>Approuver</Button>
            <Button variant="ghost" onClick={() => void decideProposal(p, true, true)}>Approuver avec modifications</Button>
            <Button variant="ghost" onClick={() => void decideProposal(p, false)}>Refuser</Button>
          </div>
        </Card>
      ))}
      {proposals.length === 0 && <Notice>Aucune proposition de référentiel en attente.</Notice>}

      <h3 className="pt-2 text-sm font-semibold">Exclusions du périmètre ({requests.length})</h3>
      {requests.map((r) => (
        <Card key={r.order_number}>
          <div className="font-mono text-xs text-muted-foreground">{r.order_number}</div>
          <p className="mt-1 text-sm">Motif : {r.scope_request_reason ?? '—'}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <input className={fieldClass + ' min-w-[200px] flex-1'} placeholder="Commentaire (optionnel)" value={comments[`o${r.order_number}`] ?? ''}
              onChange={(e) => setComments({ ...comments, [`o${r.order_number}`]: e.target.value })} />
            <Button onClick={() => void decideRequest(r.order_number, true)}>Exclure</Button>
            <Button variant="ghost" onClick={() => void decideRequest(r.order_number, false)}>Garder dans le périmètre</Button>
          </div>
        </Card>
      ))}
      {requests.length === 0 && <Notice>Aucune demande d’exclusion en attente.</Notice>}
    </div>
  )
}

interface TraceRow {
  entry_id: number; occurred_at: string; actor_user_id: string | null; actor_email: string | null; action: string
  category: string; entity: string; entity_id: string; summary: string; payload: unknown; highlighted: boolean; highlight_note: string | null
}

const esc = (v: unknown) => String(v ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] ?? c))

/** Traçabilité : toutes les entrées, catégorisées, filtrables, avec surbrillance et exports PDF séparés. */
function TraceSection() {
  const today = new Date()
  const monthAgo = new Date(Date.now() - 30 * 86400000)
  const [from, setFrom] = useState(monthAgo.toISOString().slice(0, 10))
  const [to, setTo] = useState(today.toISOString().slice(0, 10))
  const [user, setUser] = useState('')
  const [category, setCategory] = useState('')
  const [onlyErrors, setOnlyErrors] = useState(false)
  const [onlyHighlighted, setOnlyHighlighted] = useState(false)
  const [rows, setRows] = useState<TraceRow[]>([])
  const [users, setUsers] = useState<{ user_id: string; email: string | null }[]>([])
  const [err, setErr] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const load = async () => {
    setLoading(true); setErr(null)
    const { data, error } = await supabase.rpc('traceability', {
      p_from: new Date(from).toISOString(),
      p_to: new Date(new Date(to).getTime() + 86400000).toISOString(),
      p_user: user || null, p_category: null, p_only_errors: onlyErrors,
    })
    setLoading(false)
    if (error) { setErr(error.message); return }
    setRows((data ?? []) as TraceRow[])
  }
  useEffect(() => {
    void (async () => {
      const { data } = await supabase.from('profiles').select('user_id,email').order('email')
      setUsers((data ?? []) as { user_id: string; email: string | null }[])
    })()
    void load()
  // Chargement unique au montage : `load` ne lit que des états de cette section.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const categories = [...new Set(rows.map((r) => r.category))].sort()
  const visible = rows.filter((r) => (!category || r.category === category) && (!onlyHighlighted || r.highlighted))

  const toggleHighlight = async (r: TraceRow) => {
    const note = r.highlighted ? null : window.prompt('Note pour l’examen ultérieur (optionnel) :') ?? ''
    if (!r.highlighted && note === null) return
    const { error } = await supabase.rpc('set_trace_highlight', { p_entry: r.entry_id, p_on: !r.highlighted, p_note: note })
    if (error) setErr(error.message); else void load()
  }

  const printPdf = (title: string, list: TraceRow[]) => {
    const w = window.open('', '_blank')
    if (!w) { setErr('Autorisez les fenêtres pop-up pour exporter le PDF.'); return }
    const body = list.map((r) => `<tr class="${r.highlighted ? 'hl' : ''}">
      <td>${esc(new Date(r.occurred_at).toLocaleString('fr-FR'))}</td><td>${esc(r.actor_email ?? '—')}</td>
      <td>${esc(r.category)}</td><td>${esc(r.action)}</td><td>${esc(r.summary)}</td>
      <td>${r.highlighted ? esc('⚑ ' + (r.highlight_note ?? '')) : ''}</td></tr>`).join('')
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title>
      <style>body{font-family:Arial,sans-serif;font-size:11px;margin:16px}h1{font-size:16px}
      table{border-collapse:collapse;width:100%}th,td{border:1px solid #ccc;padding:4px;text-align:left;vertical-align:top}
      th{background:#eee}tr.hl td{background:#fff3c4}</style></head><body>
      <h1>${esc(title)}</h1><p>Période : ${esc(from)} au ${esc(to)} · ${list.length} entrée(s) · généré le ${esc(new Date().toLocaleString('fr-FR'))}</p>
      <table><thead><tr><th>Date</th><th>Utilisateur</th><th>Catégorie</th><th>Action</th><th>Détail</th><th>Surbrillance</th></tr></thead>
      <tbody>${body}</tbody></table></body></html>`)
    w.document.close()
    w.focus(); w.print()
  }

  const isCommandes = (r: TraceRow) => r.category.startsWith('Nature') || ['Suivi des plans', 'Périmètre', 'Erreurs'].includes(r.category)
  const isConnexionsAjouts = (r: TraceRow) => ['Connexions', 'Imports', 'Référentiel'].includes(r.category)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div><label className="mb-1 block text-xs text-muted-foreground">Du</label><input type="date" className={fieldClass} value={from} onChange={(e) => setFrom(e.target.value)} /></div>
        <div><label className="mb-1 block text-xs text-muted-foreground">Au</label><input type="date" className={fieldClass} value={to} onChange={(e) => setTo(e.target.value)} /></div>
        <div>
          <label className="mb-1 block text-xs text-muted-foreground">Utilisateur</label>
          <select className={fieldClass} value={user} onChange={(e) => setUser(e.target.value)}>
            <option value="">Tous</option>
            {users.map((u) => <option key={u.user_id} value={u.user_id}>{u.email ?? u.user_id}</option>)}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs text-muted-foreground">Catégorie</label>
          <select className={fieldClass} value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">Toutes</option>
            {categories.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={onlyErrors} onChange={(e) => setOnlyErrors(e.target.checked)} />Erreurs seulement</label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={onlyHighlighted} onChange={(e) => setOnlyHighlighted(e.target.checked)} />Surbrillance seulement</label>
        <Button variant="ghost" onClick={() => void load()} disabled={loading}>{loading ? 'Chargement…' : 'Appliquer'}</Button>
        <span className="flex-1" />
        <Button variant="ghost" onClick={() => printPdf('Activité sur les commandes', visible.filter(isCommandes))}>PDF : activité commandes</Button>
        <Button variant="ghost" onClick={() => printPdf('Connexions et ajouts', visible.filter(isConnexionsAjouts))}>PDF : connexions et ajouts</Button>
      </div>
      {err && <Notice tone="error">{err}</Notice>}
      <div className="overflow-x-auto rounded-lg border border-border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted text-left text-xs text-muted-foreground">
            <tr><th className="px-3 py-2">Date</th><th className="px-3 py-2">Utilisateur</th><th className="px-3 py-2">Catégorie</th><th className="px-3 py-2">Action</th><th className="px-3 py-2">Détail</th><th className="px-3 py-2" /></tr>
          </thead>
          <tbody>
            {visible.slice(0, 500).map((r) => (
              <tr key={r.entry_id} className={`border-t border-border align-top ${r.highlighted ? 'bg-amber-50' : ''} ${r.action === 'ERROR' ? 'text-red-700' : ''}`}>
                <td className="px-3 py-2 whitespace-nowrap">{new Date(r.occurred_at).toLocaleString('fr-FR')}</td>
                <td className="px-3 py-2">{r.actor_email ?? '—'}</td>
                <td className="px-3 py-2"><Badge>{r.category}</Badge></td>
                <td className="px-3 py-2 font-mono text-xs">{r.action}</td>
                <td className="px-3 py-2">{r.summary}{r.highlight_note && <div className="text-xs text-amber-800">⚑ {r.highlight_note}</div>}</td>
                <td className="px-3 py-2 text-right"><Button variant="ghost" onClick={() => void toggleHighlight(r)}>{r.highlighted ? 'Retirer' : 'Surligner'}</Button></td>
              </tr>
            ))}
          </tbody>
        </table>
        {visible.length > 500 && <p className="p-3 text-xs text-muted-foreground">500 premières entrées affichées sur {visible.length} : réduisez la période.</p>}
        {!loading && visible.length === 0 && <p className="p-3 text-sm text-muted-foreground">Aucune entrée sur cette sélection.</p>}
      </div>
    </div>
  )
}

function ScopeSection() {
  const [values, setValues] = useState('GT, GE, CP')
  const [current, setCurrent] = useState<string[]>([])
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    void (async () => {
      const { data, error } = await supabase.from('scope_rules').select('values,mode,active').eq('active', true)
      if (error) { setErr(error.message); return }
      const inc = (data ?? []).filter((r: { mode: string }) => r.mode === 'INCLUDE').flatMap((r: { values: string[] }) => r.values)
      setCurrent(inc)
      if (inc.length) setValues(inc.join(', '))
    })()
  }, [])

  const save = async () => {
    setErr(null); setMsg(null)
    const list = values.split(',').map((v) => v.trim().toUpperCase()).filter(Boolean)
    const { data, error } = await supabase.rpc('set_scope_rules', { p_rules: [{ mode: 'INCLUDE', values: list }] })
    if (error) setErr(error.message)
    else { setCurrent(list); setMsg(`Périmètre enregistré : ${data} commande(s) recalculée(s).`) }
  }

  return (
    <Card className="max-w-xl space-y-3">
      <h2 className="font-semibold">Périmètre (codes NAAC inclus)</h2>
      <p className="text-sm text-muted-foreground">Les commandes dont le code NAAC n’est pas listé passent hors périmètre. Une commande sortie à la main n’est jamais recalculée.</p>
      <input className={fieldClass} value={values} onChange={(e) => setValues(e.target.value)} />
      <p className="text-xs text-muted-foreground">Actuellement : {current.length ? current.join(', ') : 'aucune règle (tout est dans le périmètre)'}</p>
      {err && <Notice tone="error">{err}</Notice>}
      {msg && <Notice tone="ok">{msg}</Notice>}
      <Button onClick={() => void save()}>Enregistrer le périmètre</Button>
    </Card>
  )
}

function ReferentielSection({ userId }: { userId: string }) {
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [last, setLast] = useState<Awaited<ReturnType<typeof lastReferentielLoad>> | undefined>(undefined)

  const refreshLast = () => { lastReferentielLoad().then(setLast).catch((e) => setErr(errMsg(e))) }
  useEffect(() => { refreshLast() }, [])

  const run = async (task: () => Promise<string>) => {
    setBusy(true); setErr(null); setMsg(null)
    try {
      setMsg(await task())
      await getReferentiel(true)
      refreshLast()
    } catch (e) { setErr(errMsg(e)) } finally { setBusy(false) }
  }

  const exportRef = () => run(async () => {
    const data = await exportReferentiel()
    downloadJson(`referentiel_${new Date().toISOString().slice(0, 10)}.json`, data)
    return `Référentiel exporté (${data.lots.length} lots, ${data.risks.length} risques, ${data.measures.length} mesures, ${data.natures.length} natures).`
  })

  const importFile = async (file: File) => {
    await run(async () => {
      const data = checkReferentielFile(JSON.parse(await file.text()))
      return `Fichier « ${file.name} » : ${await importReferentielV4(userId, data)}`
    })
  }

  return (
    <Card className="max-w-xl space-y-4">
      <div>
        <h2 className="font-semibold">Référentiel</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {last === undefined ? 'Chargement de la date…' : last
            ? <>Dernier chargement : <strong>{new Date(last.created_at).toLocaleString('fr-FR')}</strong> · version « {last.label} »{last.by ? ` · par ${last.by}` : ''}</>
            : 'Jamais chargé dans la base.'}
        </p>
      </div>
      <p className="text-sm text-muted-foreground">
        Charger lit le référentiel intégré à l’application (lots, risques, mesures, natures, vocabulaire, alertes).
        Relançable sans doublon ; les décisions déjà prises sur les alertes sont conservées.
        Importer accepte un fichier au même format ; Exporter télécharge le référentiel actuel de la base.
      </p>
      {err && <Notice tone="error">{err}</Notice>}
      {msg && <Notice tone="ok">{msg}</Notice>}
      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={() => void run(async () => importReferentielV4(userId))} disabled={busy}>{busy ? 'En cours…' : 'Charger le référentiel intégré'}</Button>
        <Button variant="ghost" onClick={() => void exportRef()} disabled={busy}>Exporter</Button>
        <label className={`inline-flex h-10 cursor-pointer items-center rounded-full bg-card px-5 text-sm font-medium shadow-sm hover:bg-muted ${busy ? 'pointer-events-none opacity-50' : ''}`}>
          Importer un fichier
          <input type="file" accept="application/json,.json" className="sr-only" disabled={busy}
            onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void importFile(f) }} />
        </label>
      </div>
    </Card>
  )
}

const FILE_NAME_DEFAULT = '{entreprise}_{commande}_{secteur}_Plan de prévention'

/** Modèle de nom des fichiers PDF exportés (variables : {entreprise}, {commande}, {secteur}). */
function FileNameSection() {
  const [template, setTemplate] = useState(FILE_NAME_DEFAULT)
  const [err, setErr] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    void supabase.rpc('app_setting_get', { p_key: 'file_name_template' }).then(({ data, error }) => {
      if (error) setErr(error.message)
      else if (typeof data === 'string' && data.trim()) setTemplate(data)
    })
  }, [])

  const save = async () => {
    setBusy(true); setErr(null); setMsg(null)
    const { error } = await supabase.rpc('app_setting_set', { p_key: 'file_name_template', p_value: template })
    setBusy(false)
    if (error) setErr(error.message); else setMsg('Modèle enregistré. Il s’applique aux prochains exports.')
  }

  const example = template
    .split('{entreprise}').join('SERRURIER TEST')
    .split('{commande}').join('5132550')
    .split('{secteur}').join('S11') + '.pdf'

  return (
    <Card>
      <h2 className="mb-2 font-semibold">Nom des fichiers de fiches</h2>
      <p className="mb-3 text-sm text-muted-foreground">
        Variables : <code>{'{entreprise}'}</code> (nom, ou numéro si le nom est absent), <code>{'{commande}'}</code>, <code>{'{secteur}'}</code>.
      </p>
      {err && <Notice tone="error">{err}</Notice>}
      {msg && <Notice tone="ok">{msg}</Notice>}
      <div className="space-y-2">
        <input className={fieldClass} value={template} onChange={(e) => setTemplate(e.target.value)} />
        <p className="text-xs text-muted-foreground">Exemple : {example}</p>
        <Button onClick={() => void save()} disabled={busy || !template.trim()}>Enregistrer le modèle</Button>
      </div>
    </Card>
  )
}

function UsersSection() {
  const [users, setUsers] = useState<Profile[]>([])
  const [err, setErr] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)

  const load = async () => {
    const { data, error } = await supabase.from('profiles').select('*').order('email')
    if (error) setErr(error.message); else setUsers((data ?? []) as Profile[])
  }
  useEffect(() => { void load() }, [])

  const patch = (id: string, p: Partial<Profile>) => setUsers(users.map((u) => (u.user_id === id ? { ...u, ...p } : u)))

  const { session } = useAuth()
  const [identityFor, setIdentityFor] = useState<string | null>(null)
  const canImpersonate = (u: Profile) => !!session && u.user_id !== session.user.id && u.is_active && u.role !== 'SUPER_ADMIN'
  const impersonate = async (u: Profile) => {
    if (!session) return
    if (!window.confirm(`Vous allez vous connecter à la place de ${u.email ?? 'cet utilisateur'}. Votre session actuelle sera fermée et l’opération est journalisée. Continuer ?`)) return
    setErr(null); setMsg(null)
    try {
      await startImpersonation({ user_id: u.user_id, email: u.email }, { id: session.user.id, email: session.user.email ?? null })
    } catch (e) { setErr(errMsg(e)) }
  }

  const save = async (u: Profile) => {
    setErr(null); setMsg(null)
    const { error } = await supabase.rpc('admin_set_profile', {
      p_user_id: u.user_id, p_role: u.role, p_operator_code: u.operator_code || null,
      p_sector_codes: u.sector_codes, p_is_active: u.is_active,
    })
    if (error) setErr(error.message); else setMsg(`Profil de ${u.email ?? u.user_id} enregistré.`)
  }

  const blank = { email: '', role: 'CHARGE_OPERATIONS' as Role, operator: '', sectors: 'S11' }
  const [draft, setDraft] = useState(blank)
  const [inviting, setInviting] = useState(false)
  const [invite, setInvite] = useState<{ email: string; link: string } | null>(null)
  const [copied, setCopied] = useState(false)

  const createInvite = async () => {
    setErr(null); setMsg(null); setInvite(null); setCopied(false)
    setInviting(true)
    try {
      const { data, error } = await supabase.functions.invoke('invite-user', {
        body: {
          email: draft.email, role: draft.role, operator_code: draft.operator || null,
          sector_codes: draft.sectors.split(',').map((s) => s.trim()).filter(Boolean),
        },
      })
      if (error) {
        const body = await (error as { context?: Response }).context?.json?.().catch(() => null) as { error?: string } | null
        throw new Error(body?.error ?? error.message)
      }
      const res = data as { email: string; link: string }
      setInvite({ email: res.email, link: res.link })
      setDraft(blank)
      await load()
    } catch (e) { setErr(errMsg(e)) } finally { setInviting(false) }
  }

  /** Compte jamais configuré uniquement (le serveur refuse les autres) : nouveau lien ou suppression. */
  const manageUser = async (u: Profile, action: 'new_link' | 'delete') => {
    if (action === 'delete' && !window.confirm(`Supprimer définitivement le compte ${u.email ?? ''} ? Il n’a pas encore été configuré.`)) return
    setErr(null); setMsg(null); setInvite(null); setCopied(false)
    try {
      const { data, error } = await supabase.functions.invoke('manage-user', {
        body: { action, user_id: u.user_id },
      })
      if (error) {
        const body = await (error as { context?: Response }).context?.json?.().catch(() => null) as { error?: string } | null
        throw new Error(body?.error ?? error.message)
      }
      if (action === 'new_link') {
        const res = data as { email: string; link: string }
        setInvite({ email: res.email, link: res.link })
      } else {
        setMsg(`Compte ${u.email ?? ''} supprimé.`)
        await load()
      }
    } catch (e) { setErr(errMsg(e)) }
  }

  const copyLink = async () => {
    if (!invite) return
    try { await navigator.clipboard.writeText(invite.link); setCopied(true) } catch { setCopied(false) }
  }

  return (
    <div className="space-y-3">
      <h2 className="font-semibold">Utilisateurs et droits</h2>
      {identityFor && <ProfileDialog userId={identityFor} isSelf={identityFor === session?.user.id} onClose={() => setIdentityFor(null)} />}
      <div className="space-y-3 rounded-lg border border-border bg-card p-4">
        <div>
          <h3 className="text-sm font-semibold">Inviter un utilisateur</h3>
          <p className="text-xs text-muted-foreground">
            Le compte est créé, puis un lien à envoyer est généré. La personne l’ouvre, choisit son mot de passe et complète son identité (nom, prénom, téléphone, e-mail).
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">E-mail</label>
            <input className={fieldClass} type="email" value={draft.email} onChange={(e) => setDraft({ ...draft, email: e.target.value })} />
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">Rôle</label>
            <select className={fieldClass} value={draft.role} onChange={(e) => setDraft({ ...draft, role: e.target.value as Role })}>
              <option value="SUPER_ADMIN">Super Admin</option>
              <option value="RESPONSABLE">Responsable</option>
              <option value="CHARGE_OPERATIONS">Chargé d’opérations</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">Code chargé (UTIC)</label>
            <input className={fieldClass} value={draft.operator} onChange={(e) => setDraft({ ...draft, operator: e.target.value })} />
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">Secteurs (séparés par des virgules)</label>
            <input className={fieldClass} value={draft.sectors} onChange={(e) => setDraft({ ...draft, sectors: e.target.value })} />
          </div>
        </div>
        <Button onClick={() => void createInvite()} disabled={inviting || !draft.email.trim()}>
          {inviting ? 'Création…' : 'Créer le compte et générer le lien'}
        </Button>
        {invite && (
          <div className="space-y-2 rounded-md border border-emerald-300 bg-emerald-50 p-3">
            <p className="text-sm font-semibold">Lien d’invitation pour {invite.email}</p>
            <div className="flex flex-wrap gap-2">
              <input readOnly className={`${fieldClass} min-w-[260px] flex-1 font-mono text-xs`} value={invite.link} onFocus={(e) => e.target.select()} />
              <Button variant="ghost" onClick={() => void copyLink()}>{copied ? 'Copié' : 'Copier le lien'}</Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Ce lien est valable une durée limitée (environ une heure) et ne sert qu’une fois. Si la personne ne l’utilise pas à temps, générez-en un nouveau.
            </p>
          </div>
        )}
      </div>
      <Folded title={`Utilisateurs inscrits (${users.length})`} hint="Droits, code chargé et secteurs de chaque compte, modifiables.">
      <p className="text-sm text-muted-foreground">Les comptes existants apparaissent ci-dessous ; leur profil peut être modifié à tout moment.</p>
      {err && <Notice tone="error">{err}</Notice>}
      {msg && <Notice tone="ok">{msg}</Notice>}
      <div className="overflow-x-auto rounded-lg border border-border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted text-left text-xs text-muted-foreground">
            <tr><th className="px-3 py-2">E-mail</th><th className="px-3 py-2">Rôle</th><th className="px-3 py-2">Code chargé</th><th className="px-3 py-2">Secteurs</th><th className="px-3 py-2">Actif</th><th className="px-3 py-2" /></tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.user_id} className="border-t border-border">
                <td className="px-3 py-2">{u.email ?? '—'}</td>
                <td className="px-3 py-2">
                  <select className={fieldClass} value={u.role} onChange={(e) => patch(u.user_id, { role: e.target.value as Role })}>
                    <option value="SUPER_ADMIN">Super Admin</option>
                    <option value="RESPONSABLE">Responsable</option>
                    <option value="CHARGE_OPERATIONS">Chargé d’opérations</option>
                  </select>
                </td>
                <td className="px-3 py-2"><input className={fieldClass} value={u.operator_code ?? ''} onChange={(e) => patch(u.user_id, { operator_code: e.target.value })} /></td>
                <td className="px-3 py-2"><input className={fieldClass} value={u.sector_codes.join(', ')} onChange={(e) => patch(u.user_id, { sector_codes: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })} /></td>
                <td className="px-3 py-2"><input type="checkbox" checked={u.is_active} onChange={(e) => patch(u.user_id, { is_active: e.target.checked })} /></td>
                <td className="px-3 py-2 text-right whitespace-nowrap">
                  <Button variant="ghost" onClick={() => void impersonate(u)}
                    disabled={!canImpersonate(u)} title={canImpersonate(u) ? '' : 'Indisponible pour ce compte'}>Se connecter en tant que</Button>
                  <Button variant="ghost" onClick={() => setIdentityFor(u.user_id)} className="ml-2">Identité</Button>
                  <Button onClick={() => void save(u)} className="ml-2">Enregistrer</Button>
                  <Button variant="ghost" onClick={() => void manageUser(u, 'new_link')} className="ml-2"
                    title="Pour un compte jamais configuré : génère un nouveau lien de configuration">Nouveau lien</Button>
                  <Button variant="ghost" onClick={() => void manageUser(u, 'delete')} className="ml-2"
                    title="Pour un compte jamais configuré uniquement">Supprimer</Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      </Folded>
    </div>
  )
}
