import { useEffect, useState } from 'react'
import { useAuth } from '../lib/auth'
import { fetchOperatorCodes } from '../lib/operators'
import { fetchAllBanners, removeBanner, saveBanner, type SiteBannerItem } from '../lib/banner'
import { fetchNotifications, sendNotification, type SiteNotification } from '../lib/notifications'
import {
  TEMPLATE_VARIABLES, fetchChargeRecipients, fetchLastCommandesImport, fetchPlanStats, fetchTemplates, fillMailTemplate,
  buildRecap, buildRecapHtml, mailtoUrl, saveTemplate, type ChargeRecipient, type CommTemplate, type LastImport, type PlanStats, type TemplateKind,
} from '../lib/communications'
import { Badge, Button, Card, Notice, PageHeader, errMsg, fieldClass } from '../components/ui'
import { MultiSelect } from '../components/MultiSelect'

export type CommTab = 'notifications' | 'mails' | 'modeles' | 'bandeau'
const TABS: { key: CommTab; label: string }[] = [
  { key: 'notifications', label: 'Notifications' },
  { key: 'mails', label: 'Mails' },
  { key: 'modeles', label: 'Modèles' },
  { key: 'bandeau', label: 'Bandeau du site' },
]
const KIND_LABEL: Record<TemplateKind, string> = { IMPORT: 'Après import', LIBRE: 'Libre' }

/** Communications (Administration) : notifications, mails aux chargés, modèles et bandeau du site. */
export function CommunicationsPage({ tab, onTab }: { tab: CommTab; onTab: (t: CommTab) => void }) {
  const subtitle: Record<CommTab, string> = {
    notifications: 'Messages affichés dans la cloche et envoyés sur les appareils abonnés.',
    mails: 'Préparer les mails aux chargés, par exemple après un import.',
    modeles: 'Modèles de mails réutilisables, avec variables.',
    bandeau: 'Messages affichés tout en haut du site, défilant de droite à gauche.',
  }
  return (
    <div className="space-y-6">
      <PageHeader title="Communications" subtitle={subtitle[tab]} />
      <div role="tablist" aria-label="Communications" className="flex w-fit flex-wrap gap-1 rounded-full bg-muted p-1">
        {TABS.map((t) => (
          <button key={t.key} type="button" role="tab" aria-selected={tab === t.key} onClick={() => onTab(t.key)}
            className={`rounded-full px-4 py-1.5 text-sm ${tab === t.key ? 'bg-card font-medium shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'notifications' && <NotificationsTab />}
      {tab === 'mails' && <MailsTab />}
      {tab === 'modeles' && <TemplatesTab />}
      {tab === 'bandeau' && <BannerTab />}
    </div>
  )
}

/** Section d'administration « Communications ». */
export function CommunicationsSection() {
  const [tab, setTab] = useState<CommTab>('notifications')
  return <CommunicationsPage tab={tab} onTab={setTab} />
}

/* ---------- Notifications du site ---------- */

function recipientLabel(n: SiteNotification): string {
  if (n.audience === 'TOUS') return 'Tous les utilisateurs actifs'
  return `Chargés ${n.operator_codes.join(', ')} et responsables`
}

function NotificationsTab() {
  const { profile } = useAuth()
  const userId = profile?.user_id ?? ''
  const isSuper = profile?.role === 'SUPER_ADMIN'
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [audience, setAudience] = useState<'TOUS' | 'CHOIX'>('TOUS')
  const [operators, setOperators] = useState<string[]>([])
  const [codes, setCodes] = useState<string[]>([])
  const [history, setHistory] = useState<SiteNotification[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const refresh = () => { fetchNotifications(userId).then(setHistory).catch((e) => setErr(errMsg(e))) }

  useEffect(() => {
    if (!userId) return
    refresh()
    fetchOperatorCodes().then(setCodes).catch((e) => setErr(errMsg(e)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId])

  const canSend = isSuper && title.trim() !== '' && (audience === 'TOUS' || operators.length > 0) && !busy

  const send = async () => {
    setBusy(true); setErr(null); setMsg(null)
    try {
      await sendNotification({ title, body, audience, operators })
      setMsg('Notification envoyée.')
      setTitle(''); setBody('')
      refresh()
    } catch (e) { setErr(errMsg(e)) } finally { setBusy(false) }
  }

  const options = [
    { key: 'TOUS' as const, label: 'Tous les utilisateurs', hint: 'Chaque utilisateur actif' },
    { key: 'CHOIX' as const, label: 'Chargés choisis', hint: 'Les chargés sélectionnés et les responsables' },
  ]

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card className="space-y-4">
        <h2 className="font-semibold">Nouvelle notification</h2>
        {!isSuper && <Notice tone="info">Seul le Super Admin peut envoyer une notification. Vous consultez l’historique.</Notice>}
        {err && <Notice tone="error">{err}</Notice>}
        {msg && <Notice tone="ok">{msg}</Notice>}
        <div>
          <label className="mb-1 block text-xs text-muted-foreground">Titre</label>
          <input className={fieldClass} value={title} onChange={(e) => setTitle(e.target.value)} disabled={!isSuper} placeholder="ex. Réunion sécurité jeudi" />
        </div>
        <div>
          <label className="mb-1 block text-xs text-muted-foreground">Message</label>
          <textarea className={`${fieldClass} min-h-24`} value={body} onChange={(e) => setBody(e.target.value)} disabled={!isSuper} />
        </div>
        <div>
          <p className="mb-2 text-xs text-muted-foreground">Destinataires</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {options.map((o) => (
              <button key={o.key} type="button" disabled={!isSuper} aria-pressed={audience === o.key} onClick={() => setAudience(o.key)}
                className={`rounded-2xl border p-3 text-left transition-colors disabled:opacity-60 ${audience === o.key ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted'}`}>
                <div className="text-sm font-medium">{o.label}</div>
                <div className="mt-0.5 text-xs text-muted-foreground">{o.hint}</div>
              </button>
            ))}
          </div>
          {audience === 'CHOIX' && (
            <div className="mt-3 max-w-xs">
              <MultiSelect label="Chargés" options={codes} value={operators} placeholder="Choisir les chargés"
                onChange={setOperators} />
            </div>
          )}
        </div>
        <Button onClick={() => void send()} disabled={!canSend}>{busy ? 'Envoi…' : 'Envoyer la notification'}</Button>
      </Card>

      <Card className="space-y-3">
        <h2 className="font-semibold">Historique</h2>
        {history === null ? <p className="text-sm text-muted-foreground">Chargement…</p>
          : history.length === 0 ? <p className="text-sm text-muted-foreground">Aucune notification envoyée.</p>
          : history.slice(0, 30).map((n) => (
            <div key={n.id} className="border-t border-border pt-3 first:border-t-0 first:pt-0">
              <div className="flex items-start justify-between gap-2">
                <div className="text-sm font-medium">{n.title}</div>
                <Badge tone={n.kind === 'IMPORT' ? 'info' : 'default'}>{n.kind === 'IMPORT' ? 'Import' : 'Manuel'}</Badge>
              </div>
              {n.body && <p className="mt-0.5 whitespace-pre-line text-xs text-muted-foreground">{n.body}</p>}
              <p className="mt-1.5 text-xs">
                <span className="text-muted-foreground">Destinataires : </span>
                <span className="font-medium">{recipientLabel(n)}</span>
              </p>
              <p className="text-[11px] text-muted-foreground">{new Date(n.created_at).toLocaleString('fr-FR')}</p>
            </div>
          ))}
      </Card>
    </div>
  )
}

/* ---------- Mails aux chargés ---------- */

/** Année des plans réalisés affichés dans les mails. */
const PLANS_YEAR = new Date().getFullYear()
const SAMPLE = {
  prenom: 'Léa', chargé: 'Léa Martin', code: 'LMA', nouvelles: 12, sans_plan: 5, realises: 120, reste: 45, annee: PLANS_YEAR,
  recap: buildRecap([{ name: 'Léa Martin', code: 'LMA', nouvelles: 12, realises: 120, reste: 45 }], PLANS_YEAR),
  fichier: 'ANM_COMD_TRAV_ER.xlsx', date: '05/11/2026', redacteur: 'Vous',
}
/** Dans un mail collectif, {prenom} devient « toute l’équipe ». */
const COLLECTIVE_PRENOM = 'toute l’équipe'
/** Au-delà, certaines messageries tronquent un mailto : on propose de copier le texte. */
const LONG_BODY = 1800

function MailsTab() {
  const { profile } = useAuth()
  const [templates, setTemplates] = useState<CommTemplate[]>([])
  const [templateId, setTemplateId] = useState('')
  const [last, setLast] = useState<LastImport | null | undefined>(undefined)
  const [recipients, setRecipients] = useState<ChargeRecipient[]>([])
  const [stats, setStats] = useState<Record<string, PlanStats>>({})
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [opened, setOpened] = useState<Set<string>>(new Set())
  const [mode, setMode] = useState<'chacun' | 'tous'>('chacun')
  const [copied, setCopied] = useState(false)
  const [tableCopied, setTableCopied] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([fetchTemplates(), fetchLastCommandesImport(), fetchChargeRecipients(), fetchPlanStats(PLANS_YEAR)])
      .then(([tpl, imp, rec, st]) => {
        setTemplates(tpl)
        setStats(st)
        setTemplateId((tpl.find((t) => t.kind === 'IMPORT') ?? tpl[0])?.id ?? '')
        setLast(imp)
        setRecipients(rec)
        // Par défaut : les chargés qui ont reçu de nouvelles commandes.
        setSelected(new Set(rec.filter((r) => (imp?.newByOperator?.[r.code]?.nouvelles ?? 0) > 0).map((r) => r.code)))
      })
      .catch((e) => setErr(errMsg(e)))
  }, [])

  const template = templates.find((t) => t.id === templateId)
  const redacteur = profile?.full_name || profile?.email || ''
  const nouvellesOf = (code: string) => last?.newByOperator?.[code]?.nouvelles ?? 0
  const sansPlanOf = (code: string): number | null => last?.newByOperator?.[code]?.sans_plan ?? null

  const statsOf = (code: string): PlanStats => stats[code] ?? { realises: 0, reste: 0 }
  const rowOf = (r: ChargeRecipient) => ({ name: r.name, code: r.code, nouvelles: nouvellesOf(r.code), ...statsOf(r.code) })
  const rows = recipients.map(rowOf)
  const recap = buildRecap(rows, PLANS_YEAR)
  const totalNouvelles = rows.reduce((sum, r) => sum + r.nouvelles, 0)
  const totalSansPlan = rows.reduce((sum, r) => sum + (sansPlanOf(r.code) ?? 0), 0)
  const totalRealises = rows.reduce((sum, r) => sum + r.realises, 0)
  const totalReste = rows.reduce((sum, r) => sum + r.reste, 0)
  const fichier = last?.file_name ?? ''
  const date = last ? new Date(last.created_at).toLocaleDateString('fr-FR') : ''

  // Mail individuel : chaque chargé ne voit que sa propre ligne.
  const varsOf = (r: ChargeRecipient): Record<string, string | number> => ({
    prenom: r.firstName, chargé: r.name, code: r.code,
    nouvelles: last ? nouvellesOf(r.code) : '—',
    sans_plan: last && sansPlanOf(r.code) !== null ? (sansPlanOf(r.code) as number) : '—',
    realises: statsOf(r.code).realises, reste: statsOf(r.code).reste, annee: PLANS_YEAR,
    recap: buildRecap([rowOf(r)], PLANS_YEAR), fichier, date, redacteur,
  })
  // Mail collectif : la liste de tous les chargés et les totaux.
  const collectiveVars = (): Record<string, string | number> => ({
    prenom: COLLECTIVE_PRENOM, chargé: COLLECTIVE_PRENOM, code: '',
    nouvelles: last ? totalNouvelles : '—', sans_plan: last ? totalSansPlan : '—',
    realises: totalRealises, reste: totalReste, annee: PLANS_YEAR,
    recap, fichier, date, redacteur,
  })

  const emails = recipients.filter((r) => r.email).map((r) => r.email as string)
  const collective = template
    ? { subject: fillMailTemplate(template.subject, collectiveVars()), body: fillMailTemplate(template.body, collectiveVars()) }
    : null

  const toggle = (code: string) => setSelected((prev) => {
    const next = new Set(prev)
    if (next.has(code)) next.delete(code); else next.add(code)
    return next
  })
  const firstSelected = recipients.find((r) => selected.has(r.code))

  /** Copie le tableau en HTML (collage dans Outlook) ; texte brut en repli. */
  const copyTable = async () => {
    try {
      if (typeof ClipboardItem !== 'undefined') {
        await navigator.clipboard.write([new ClipboardItem({
          'text/html': new Blob([buildRecapHtml(rows, PLANS_YEAR)], { type: 'text/html' }),
          'text/plain': new Blob([recap], { type: 'text/plain' }),
        })])
      } else {
        await navigator.clipboard.writeText(recap)
      }
      setTableCopied(true)
    } catch { setErr('Copie impossible dans ce navigateur.') }
  }

  const copyCollective = async () => {
    if (!collective) return
    try {
      await navigator.clipboard.writeText(`Objet : ${collective.subject}\n\n${collective.body}`)
      setCopied(true)
    } catch { setErr('Copie impossible dans ce navigateur.') }
  }

  const modeBtn = (key: 'chacun' | 'tous', label: string) => (
    <button type="button" aria-pressed={mode === key} onClick={() => { setMode(key); setCopied(false); setTableCopied(false) }}
      className={`rounded-full px-4 py-1.5 text-sm ${mode === key ? 'bg-card font-medium shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>
      {label}
    </button>
  )

  return (
    <div className="space-y-4">
      {err && <Notice tone="error">{err}</Notice>}
      {last === null && <Notice tone="warn">Aucun import de commandes terminé pour l’instant.</Notice>}
      {last && !last.newByOperator && (
        <Notice tone="warn">Le détail par chargé n’est pas disponible pour le dernier import (il précède cette mise à jour). Les chiffres apparaîtront au prochain import d’un nouveau fichier.</Notice>
      )}
      {last && last.newByOperator && (
        <p className="text-sm text-muted-foreground">
          Dernier import : <strong className="text-foreground">{last.file_name}</strong> · {new Date(last.created_at).toLocaleString('fr-FR')}
        </p>
      )}

      <Card className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="inline-flex rounded-full bg-muted p-1">
            {modeBtn('chacun', 'Un mail par chargé')}
            {modeBtn('tous', 'Un mail pour tous')}
          </div>
          <div className="min-w-64">
            <label className="mb-1 block text-xs text-muted-foreground">Modèle</label>
            <select className={fieldClass} value={templateId} onChange={(e) => { setTemplateId(e.target.value); setCopied(false) }}>
              {templates.map((t) => <option key={t.id} value={t.id}>{t.name} ({KIND_LABEL[t.kind]})</option>)}
            </select>
          </div>
        </div>

        {mode === 'tous' && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Un seul mail adressé à {emails.length} chargé(s). Le récapitulatif reprend, pour chacun, les nouvelles commandes importées, les plans réalisés en {PLANS_YEAR} et le reste à faire.
            </p>
            {collective ? (
              <>
                <div className="rounded-2xl bg-muted/50 p-3 text-sm">
                  <p className="font-medium">{collective.subject}</p>
                  <pre className="mt-2 overflow-x-auto whitespace-pre font-mono text-xs text-muted-foreground">{collective.body}</pre>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {emails.length > 0 ? (
                    <a href={mailtoUrl(emails.join(','), collective.subject, collective.body)}
                      onClick={() => setOpened(new Set(recipients.map((r) => r.code)))}
                      className="inline-flex h-10 items-center rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground hover:opacity-90">
                      Ouvrir le mail pour tous
                    </a>
                  ) : <Badge tone="warn">Aucune adresse de chargé</Badge>}
                  <Button variant="ghost" onClick={() => void copyCollective()}>{copied ? 'Texte copié' : 'Copier le texte'}</Button>
                  <Button variant="ghost" onClick={() => void copyTable()}>{tableCopied ? 'Tableau copié' : 'Copier le tableau (Outlook)'}</Button>
                </div>
                {collective.body.length > LONG_BODY && (
                  <Notice tone="warn">Le texte est long : certaines messageries tronquent le mail ouvert. Utilisez « Copier le texte » si besoin.</Notice>
                )}
              </>
            ) : <Notice tone="info">Choisissez un modèle.</Notice>}
          </div>
        )}

        <div className="overflow-x-auto rounded-2xl border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
              <tr>
                {mode === 'chacun' && <th className="w-10 px-3 py-2" />}
                <th className="px-3 py-2 font-medium">Chargé</th>
                <th className="px-3 py-2 font-medium">Adresse</th>
                <th className="px-3 py-2 text-right font-medium">Nouvelles</th>
                <th className="px-3 py-2 text-right font-medium">Sans plan</th>
                <th className="px-3 py-2 text-right font-medium">Réalisés {PLANS_YEAR}</th>
                <th className="px-3 py-2 text-right font-medium">Reste à faire</th>
                {mode === 'chacun' && <th className="px-3 py-2" />}
              </tr>
            </thead>
            <tbody>
              {recipients.map((r) => {
                const vars = varsOf(r)
                const subject = template ? fillMailTemplate(template.subject, vars) : ''
                const body = template ? fillMailTemplate(template.body, vars) : ''
                return (
                  <tr key={r.code} className="border-t border-border">
                    {mode === 'chacun' && (
                      <td className="px-3 py-2">
                        <input type="checkbox" aria-label={`Sélectionner ${r.name}`} checked={selected.has(r.code)} onChange={() => toggle(r.code)} />
                      </td>
                    )}
                    <td className="px-3 py-2">
                      <div className="font-medium">{r.name}</div>
                      <div className="text-xs text-muted-foreground">{r.code}</div>
                    </td>
                    <td className="px-3 py-2">
                      {r.email ? <span className="break-all">{r.email}</span> : <Badge tone="warn">Pas d’adresse</Badge>}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{last ? nouvellesOf(r.code) : '—'}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{last && sansPlanOf(r.code) !== null ? sansPlanOf(r.code) : '—'}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{statsOf(r.code).realises}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{statsOf(r.code).reste}</td>
                    {mode === 'chacun' && (
                      <td className="px-3 py-2 text-right">
                        {opened.has(r.code) ? <Badge tone="ok">Ouvert</Badge> : r.email && template && selected.has(r.code) ? (
                          <a href={mailtoUrl(r.email, subject, body)}
                            onClick={() => setOpened((prev) => new Set(prev).add(r.code))}
                            className="inline-flex h-8 items-center rounded-full bg-primary px-3 text-xs font-medium text-primary-foreground hover:opacity-90">
                            Ouvrir le mail
                          </a>
                        ) : null}
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {mode === 'chacun' && template && firstSelected && (
          <details className="rounded-2xl bg-muted/50 p-3 text-sm">
            <summary className="cursor-pointer text-xs font-medium text-muted-foreground">Aperçu pour {firstSelected.name}</summary>
            <p className="mt-2 font-medium">{fillMailTemplate(template.subject, varsOf(firstSelected))}</p>
            <p className="mt-2 whitespace-pre-line text-muted-foreground">{fillMailTemplate(template.body, varsOf(firstSelected))}</p>
          </details>
        )}
      </Card>
    </div>
  )
}

/* ---------- Modèles de mails ---------- */

interface Draft { id?: string; kind: TemplateKind; name: string; subject: string; body: string }

function TemplatesTab() {
  const { profile } = useAuth()
  const isManager = profile?.role === 'SUPER_ADMIN' || profile?.role === 'RESPONSABLE'
  const [list, setList] = useState<CommTemplate[] | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const load = () => { fetchTemplates().then(setList).catch((e) => setErr(errMsg(e))) }
  useEffect(() => { load() }, [])

  const edit = (t: CommTemplate) => { setDraft({ id: t.id, kind: t.kind, name: t.name, subject: t.subject, body: t.body }); setMsg(null) }
  const save = async () => {
    if (!draft) return
    setBusy(true); setErr(null); setMsg(null)
    try {
      const id = await saveTemplate(draft)
      setDraft({ ...draft, id })
      setMsg('Modèle enregistré.')
      load()
    } catch (e) { setErr(errMsg(e)) } finally { setBusy(false) }
  }

  const sample = (text: string) => fillMailTemplate(text, SAMPLE)

  return (
    <div className="space-y-6">
    <Card className="space-y-2 text-sm">
      <h2 className="font-semibold">Comment modifier un modèle</h2>
      <ol className="list-decimal space-y-1 pl-5 text-muted-foreground">
        <li>Choisissez un modèle à gauche, ou créez-en un avec « Nouveau ».</li>
        <li>Modifiez l’objet et le corps comme un texte ordinaire. Un élément entre accolades, comme <code className="rounded bg-muted px-1">{'{prenom}'}</code>, est remplacé à l’envoi.</li>
        <li>Le tableau par chargé s’insère à l’emplacement de <code className="rounded bg-muted px-1">{'{recap}'}</code>. Dans le mail pour tous, il contient toute l’équipe ; dans le mail individuel, seulement la ligne du chargé.</li>
        <li>Un nom de variable mal écrit (par exemple <code className="rounded bg-muted px-1">{'{Prenom}'}</code>, avec une majuscule) n’est pas remplacé : il apparaît tel quel dans le mail. Respectez les noms de la liste ci-dessous.</li>
        <li>Vérifiez l’aperçu en bas de l’éditeur, puis enregistrez. Le modèle est utilisé dans l’onglet Mail dès l’enregistrement.</li>
      </ol>
    </Card>
    <div className="grid gap-6 lg:grid-cols-[18rem_1fr]">
      <Card className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Modèles</h2>
          {isManager && <Button variant="ghost" size="sm" onClick={() => { setDraft({ kind: 'LIBRE', name: '', subject: '', body: '' }); setMsg(null) }}>Nouveau</Button>}
        </div>
        {list === null ? <p className="text-sm text-muted-foreground">Chargement…</p>
          : list.length === 0 ? <p className="text-sm text-muted-foreground">Aucun modèle.</p>
          : list.map((t) => (
            <button key={t.id} type="button" onClick={() => edit(t)}
              className={`block w-full rounded-2xl border p-3 text-left ${draft?.id === t.id ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted'}`}>
              <div className="text-sm font-medium">{t.name}</div>
              <div className="text-xs text-muted-foreground">{KIND_LABEL[t.kind]}</div>
            </button>
          ))}
      </Card>

      <Card className="space-y-4">
        {!draft ? <p className="text-sm text-muted-foreground">Choisissez un modèle à modifier, ou créez-en un.</p> : (
          <>
            <h2 className="font-semibold">{draft.id ? 'Modifier le modèle' : 'Nouveau modèle'}</h2>
            {!isManager && <Notice tone="info">Seul un Responsable ou le Super Admin peut enregistrer un modèle.</Notice>}
            {err && <Notice tone="error">{err}</Notice>}
            {msg && <Notice tone="ok">{msg}</Notice>}
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">Nom</label>
                <input className={fieldClass} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} disabled={!isManager} />
              </div>
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">Type</label>
                <select className={fieldClass} value={draft.kind} onChange={(e) => setDraft({ ...draft, kind: e.target.value as TemplateKind })} disabled={!isManager}>
                  <option value="IMPORT">Après import</option>
                  <option value="LIBRE">Libre</option>
                </select>
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">Objet</label>
              <input className={fieldClass} value={draft.subject} onChange={(e) => setDraft({ ...draft, subject: e.target.value })} disabled={!isManager} />
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">Corps du mail</label>
              <textarea className={`${fieldClass} min-h-40`} value={draft.body} onChange={(e) => setDraft({ ...draft, body: e.target.value })} disabled={!isManager} />
            </div>
            <div className="text-xs text-muted-foreground">
              <p className="mb-1 font-medium text-foreground">Variables disponibles</p>
              <ul className="grid gap-1 sm:grid-cols-2">
                {TEMPLATE_VARIABLES.map((v) => <li key={v.key}><code className="rounded bg-muted px-1">{`{${v.key}}`}</code> {v.label}</li>)}
              </ul>
            </div>
            <div className="rounded-2xl bg-muted/50 p-3 text-sm">
              <p className="text-xs font-medium text-muted-foreground">Aperçu</p>
              <p className="mt-1 font-medium">{sample(draft.subject)}</p>
              <pre className="mt-2 overflow-x-auto whitespace-pre font-mono text-xs text-muted-foreground">{sample(draft.body)}</pre>
            </div>
            <Button onClick={() => void save()} disabled={!isManager || busy || draft.name.trim() === ''}>{busy ? 'Enregistrement…' : 'Enregistrer le modèle'}</Button>
          </>
        )}
      </Card>
    </div>
    </div>
  )
}

/* ---------- Bandeau du site ---------- */

interface BannerDraft { id?: string; message: string; active: boolean; position: number }

function BannerTab() {
  const { profile } = useAuth()
  const isManager = profile?.role === 'SUPER_ADMIN' || profile?.role === 'RESPONSABLE'
  const [list, setList] = useState<SiteBannerItem[] | null>(null)
  const [draft, setDraft] = useState<BannerDraft | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null)

  const load = () => { fetchAllBanners().then(setList).catch((e) => setErr(errMsg(e))) }

  const remove = async (id: string) => {
    setBusy(true); setErr(null); setMsg(null)
    try {
      await removeBanner(id)
      setConfirmRemove(null)
      if (draft?.id === id) setDraft(null)
      setMsg('Message retiré du bandeau.')
      load()
    } catch (e) { setErr(errMsg(e)) } finally { setBusy(false) }
  }
  useEffect(() => { load() }, [])

  const save = async (d: BannerDraft) => {
    setBusy(true); setErr(null); setMsg(null)
    try {
      const id = await saveBanner(d)
      setDraft({ ...d, id })
      setMsg('Bandeau enregistré.')
      load()
    } catch (e) { setErr(errMsg(e)) } finally { setBusy(false) }
  }

  const newDraft = () => { setDraft({ message: '', active: true, position: (list?.length ?? 0) + 1 }); setMsg(null) }
  const shown = (list ?? []).filter((b) => b.active && b.id !== draft?.id).map((b) => b.message)
  const preview = draft && draft.active && draft.message.trim() ? [...shown, draft.message.trim()] : shown

  return (
    <div className="grid gap-6 lg:grid-cols-[20rem_1fr]">
      <Card className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Messages</h2>
          {isManager && <Button variant="ghost" size="sm" onClick={newDraft}>Nouveau</Button>}
        </div>
        {list === null ? <p className="text-sm text-muted-foreground">Chargement…</p>
          : list.length === 0 ? <p className="text-sm text-muted-foreground">Aucun message. Le bandeau reste masqué.</p>
          : list.map((b) => (
            <div key={b.id} className={`rounded-2xl border p-3 ${draft?.id === b.id ? 'border-primary bg-primary/5' : 'border-border'}`}>
              <button type="button" onClick={() => { setDraft({ id: b.id, message: b.message, active: b.active, position: b.position }); setMsg(null) }}
                className="block w-full text-left">
                <div className="text-sm">{b.message}</div>
                <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                  <Badge tone={b.active ? 'ok' : 'off'}>{b.active ? 'Affiché' : 'Masqué'}</Badge>
                  Ordre {b.position}
                </div>
              </button>
              {isManager && confirmRemove !== b.id && (
                <div className="mt-2 flex gap-1">
                  <Button variant="ghost" size="sm" disabled={busy}
                    onClick={() => void save({ id: b.id, message: b.message, active: !b.active, position: b.position })}>
                    {b.active ? 'Masquer' : 'Afficher'}
                  </Button>
                  <Button variant="ghost" size="sm" disabled={busy} onClick={() => setConfirmRemove(b.id)}>Retirer</Button>
                </div>
              )}
              {isManager && confirmRemove === b.id && (
                <div className="mt-2 space-y-2 rounded-xl bg-muted/50 p-2 text-xs">
                  <p>Retirer ce message du bandeau ? Il ne sera plus affiché (il reste archivé en base).</p>
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => void remove(b.id)} disabled={busy}>Confirmer</Button>
                    <Button size="sm" variant="ghost" onClick={() => setConfirmRemove(null)} disabled={busy}>Annuler</Button>
                  </div>
                </div>
              )}
            </div>
          ))}
      </Card>

      <Card className="space-y-4">
        {!draft ? <p className="text-sm text-muted-foreground">Choisissez un message, ou créez-en un.</p> : (
          <>
            <h2 className="font-semibold">{draft.id ? 'Modifier le message' : 'Nouveau message'}</h2>
            {!isManager && <Notice tone="info">Seul un Responsable ou le Super Admin peut modifier le bandeau.</Notice>}
            {err && <Notice tone="error">{err}</Notice>}
            {msg && <Notice tone="ok">{msg}</Notice>}
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">Message</label>
              <textarea className={`${fieldClass} min-h-20`} maxLength={240} value={draft.message}
                onChange={(e) => setDraft({ ...draft, message: e.target.value })} disabled={!isManager} />
              <p className="mt-1 text-xs text-muted-foreground">{draft.message.length}/240 caractères</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">Ordre d’affichage</label>
                <input type="number" min={1} className={fieldClass} value={draft.position} disabled={!isManager}
                  onChange={(e) => setDraft({ ...draft, position: Math.max(1, Number(e.target.value) || 1) })} />
              </div>
              <label className="flex items-end gap-2 pb-2 text-sm">
                <input type="checkbox" checked={draft.active} disabled={!isManager} onChange={(e) => setDraft({ ...draft, active: e.target.checked })} />
                Afficher dans le bandeau
              </label>
            </div>
            <div>
              <p className="mb-1 text-xs text-muted-foreground">Aperçu du bandeau</p>
              <div className="overflow-hidden rounded-2xl bg-primary px-4 py-2 text-sm text-primary-foreground">
                {preview.length > 0 ? preview.join('   •   ') : 'Aucun message affiché.'}
              </div>
            </div>
            <Button onClick={() => void save(draft)} disabled={!isManager || busy || draft.message.trim() === ''}>
              {busy ? 'Enregistrement…' : 'Enregistrer'}
            </Button>
          </>
        )}
      </Card>
    </div>
  )
}
