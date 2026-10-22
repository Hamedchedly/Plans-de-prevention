import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { supabase } from '../lib/supabase'
import { Button, Card, EmptyState, Notice, fieldClass } from '../components/ui'
import { DEFAULT_ALERT, DEFAULT_FOOTER } from '../lib/planPdf'
import { DEFAULT_GROUP_MAIL_CORPS, DEFAULT_GROUP_MAIL_OBJET, DEFAULT_MAIL_CORPS, DEFAULT_MAIL_OBJET } from '../lib/sheet'
import { ChevronDown, Download, UserCheck } from 'lucide-react'

/** Export CSV compatible Excel (séparateur ;, BOM UTF-8). */
export function downloadCsv(filename: string, rows: (string | number | null | undefined)[][]) {
  const esc = (v: string | number | null | undefined) => {
    const t = v == null ? '' : String(v)
    return /[";\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t
  }
  const body = rows.map((r) => r.map(esc).join(';')).join('\r\n')
  const url = URL.createObjectURL(new Blob(['\uFEFF' + body], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

type Creator = { code: string; orders: number; user_id: string | null; full_name: string | null; phone: string | null; email: string | null; role: string | null; is_active: boolean | null }
type Creators = { ACTIF_COMPLET: Creator[]; ACTIF_INCOMPLET: Creator[]; INACTIF: Creator[]; NON_INSCRIT: Creator[] }

const GROUPS: { key: keyof Creators; title: string; hint: string; tone: 'ok' | 'warn' | 'off' | 'default' }[] = [
  { key: 'ACTIF_COMPLET', title: 'Comptes actifs, identité complète', hint: 'Prêts pour la personne à alerter.', tone: 'ok' },
  { key: 'ACTIF_INCOMPLET', title: 'Comptes actifs, identité incomplète', hint: 'Compléter prénom, nom, téléphone et mail (ou via Utilisateurs).', tone: 'warn' },
  { key: 'INACTIF', title: 'Comptes désactivés', hint: 'Réactiver le compte pour qu’il apparaisse comme contact.', tone: 'off' },
  { key: 'NON_INSCRIT', title: 'Non inscrits', hint: 'Aucun compte : envoyer une invitation depuis Utilisateurs.', tone: 'default' },
]

/** Chargés d'opérations créateurs de commandes, groupés par état du compte (fonction list_order_creators). */
export function CreatorsSection() {
  const [data, setData] = useState<Creators | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const load = async () => {
    setLoading(true); setErr(null)
    const { data: d, error } = await supabase.rpc('list_order_creators')
    setLoading(false)
    if (error) { setErr(error.message); return }
    setData(d as Creators)
  }
  useEffect(() => { void load() }, [])

  const total = useMemo(() => (data ? GROUPS.filter((g) => g.key !== 'NON_INSCRIT').reduce((a, g) => a + data[g.key].length, 0) : 0), [data])
  // Groupes vides masqués : une seule ligne de rappel au lieu de plusieurs « Aucun chargé »
  // Les non inscrits sont dans une section dédiée, repliée en bas de page
  const visible = data ? GROUPS.filter((g) => g.key !== 'NON_INSCRIT' && data[g.key].length > 0) : []

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="font-semibold">Chargés d’opérations créateurs de commandes</h2>
            <p className="text-sm text-muted-foreground">{total} chargé(s) inscrit(s) ayant créé des commandes. Les contacts alimentent « Personne à alerter » des fiches.</p>
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => void load()} disabled={loading}>Actualiser</Button>
            <Button variant="ghost" disabled={!data} onClick={() => data && downloadCsv('chargés_operations.csv', [
              ['Groupe', 'Code', 'Commandes', 'Nom', 'Téléphone', 'Mail'],
              ...GROUPS.flatMap((g) => data[g.key].map((c) => [g.title, c.code, c.orders, c.full_name, c.phone, c.email])),
            ])}><Download className="h-4 w-4" aria-hidden="true" />CSV</Button>
          </div>
        </div>
      </Card>
      {err && <Notice tone="error">{err}</Notice>}
      {loading && !data && <p className="text-sm text-muted-foreground">Chargement…</p>}
      {data && visible.map((g) => (
        <Card key={g.key} className="p-0">
          <div className="border-b border-border px-4 py-3">
            <h3 className="text-sm font-semibold">{g.title} <span className="font-normal text-muted-foreground">({data[g.key].length})</span></h3>
            <p className="text-xs text-muted-foreground">{g.hint}</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">Code</th>
                  <th className="px-3 py-2 font-medium">Commandes</th>
                  <th className="px-3 py-2 font-medium">Nom</th>
                  <th className="px-3 py-2 font-medium">Téléphone</th>
                  <th className="px-3 py-2 font-medium">Mail</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {[...data[g.key]].sort((x, y) => y.orders - x.orders).map((c) => (
                  <tr key={c.code}>
                    <td className="px-3 py-2 font-mono text-xs">{c.code}</td>
                    <td className="px-3 py-2">{c.orders}</td>
                    <td className="px-3 py-2">{c.full_name ?? <span className="text-amber-700">à renseigner</span>}</td>
                    <td className="px-3 py-2">{c.phone ?? <span className="text-amber-700">—</span>}</td>
                    <td className="px-3 py-2">{c.email ?? <span className="text-amber-700">—</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ))}
    </div>
  )
}

/** Section repliable (native, accessible au clavier). */
export function Folded({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <details className="group rounded-lg border border-border bg-card">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3">
        <span>
          <span className="block text-sm font-semibold">{title}</span>
          {hint && <span className="block text-xs text-muted-foreground">{hint}</span>}
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 transition-transform group-open:rotate-180" aria-hidden="true" />
      </summary>
      <div className="border-t border-border p-4">{children}</div>
    </details>
  )
}

/** Codes chargés ayant créé des commandes sans compte : repliés, en bas de la page utilisateurs. */
export function NonRegisteredCreators() {
  const [rows, setRows] = useState<Creator[] | null>(null)
  const [err, setErr] = useState<string | null>(null)
  useEffect(() => {
    void supabase.rpc('list_order_creators').then(({ data, error }) => {
      if (error) { setErr(error.message); return }
      setRows(((data as Creators | null)?.NON_INSCRIT ?? []).slice().sort((a, b) => b.orders - a.orders))
    })
  }, [])
  if (err) return <Notice tone="error">{err}</Notice>
  if (!rows) return null
  return (
    <Folded title={`Non inscrits (${rows.length})`} hint="Chargés ayant créé des commandes, sans compte : à inviter via « Inviter un utilisateur ».">
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">Tous les chargés créateurs ont un compte.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr><th className="px-3 py-2 font-medium">Code</th><th className="px-3 py-2 font-medium">Commandes</th></tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((c) => (
                <tr key={c.code}><td className="px-3 py-2 font-mono text-xs">{c.code}</td><td className="px-3 py-2">{c.orders}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Folded>
  )
}

type Kpi = {
  perimetre: { dans_perimetre: number; hors_perimetre: number; forcees: number; exclusions_en_attente: number }
  statuts: Record<string, number>
  fiches_creees_periode: number; envoyees_periode: number; retours_periode: number
  delai_moyen_retour_jours: number | null
  par_charge: { code: string; dans_perimetre: number; a_qualifier: number; fiches: number; envoyees: number; retournees: number; delai_jours: number | null }[]
}

const isoDay = (d: Date) => d.toISOString().slice(0, 10)

/** Tableau de bord : périmètre, avancement des fiches et délais, par période et par chargé. */
export function KpiSection() {
  const today = new Date()
  const [from, setFrom] = useState(isoDay(new Date(today.getTime() - 30 * 86400000)))
  const [to, setTo] = useState(isoDay(today))
  const [kpi, setKpi] = useState<Kpi | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const load = async () => {
    setBusy(true); setErr(null)
    const toExclusive = new Date(new Date(to).getTime() + 86400000).toISOString()
    const { data, error } = await supabase.rpc('kpi_summary', { p_from: new Date(from).toISOString(), p_to: toExclusive })
    setBusy(false)
    if (error) { setErr(error.message); return }
    setKpi(data as Kpi)
  }
  // Chargement unique au montage : `load` ne lit que des états de cette section.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void load() }, [])

  const cards: { label: string; value: string | number; hint?: string }[] = kpi ? [
    { label: 'Dans le périmètre', value: kpi.perimetre.dans_perimetre, hint: `${kpi.perimetre.hors_perimetre} hors périmètre` },
    { label: 'À qualifier', value: kpi.statuts.NON_QUALIFIEE ?? 0 },
    { label: 'Fiches créées (période)', value: kpi.fiches_creees_periode },
    { label: 'Envoyées (période)', value: kpi.envoyees_periode, hint: `${kpi.statuts.EN_ATTENTE_RETOUR ?? 0} en attente de retour` },
    { label: 'Retours reçus (période)', value: kpi.retours_periode, hint: `${kpi.statuts.ARCHIVEE ?? 0} archivées au total` },
    { label: 'Délai moyen d’envoi → retour', value: kpi.delai_moyen_retour_jours == null ? '—' : `${kpi.delai_moyen_retour_jours} j` },
    { label: 'Exclusions en attente', value: kpi.perimetre.exclusions_en_attente, hint: `${kpi.perimetre.forcees} forcées à la main` },
  ] : []

  return (
    <div className="space-y-4">
      <Card className="flex flex-wrap items-end gap-3">
        <label className="space-y-1">
          <span className="block text-xs text-muted-foreground">Du</span>
          <input type="date" className={`${fieldClass} md:w-44`} value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label className="space-y-1">
          <span className="block text-xs text-muted-foreground">Au</span>
          <input type="date" className={`${fieldClass} md:w-44`} value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
        <Button onClick={() => void load()} disabled={busy || !from || !to || from > to}>Afficher</Button>
        <Button variant="ghost" disabled={!kpi} onClick={() => kpi && downloadCsv(`indicateurs_${from}_${to}.csv`, [
          ['Indicateur', 'Valeur'],
          ['Dans le périmètre', kpi.perimetre.dans_perimetre],
          ['Hors périmètre', kpi.perimetre.hors_perimetre],
          ['Forcées à la main', kpi.perimetre.forcees],
          ['Exclusions en attente', kpi.perimetre.exclusions_en_attente],
          ['À qualifier', kpi.statuts.NON_QUALIFIEE ?? 0],
          ['Fiches créées (période)', kpi.fiches_creees_periode],
          ['Envoyées (période)', kpi.envoyees_periode],
          ['Retours reçus (période)', kpi.retours_periode],
          ['Délai moyen envoi → retour (jours)', kpi.delai_moyen_retour_jours ?? ''],
          [],
          ['Chargé', 'Dans le périmètre', 'À qualifier', 'Fiches', 'Envoyées', 'Retournées', 'Délai moyen (jours)'],
          ...kpi.par_charge.map((r) => [r.code, r.dans_perimetre, r.a_qualifier, r.fiches, r.envoyees, r.retournees, r.delai_jours ?? '']),
        ])}><Download className="h-4 w-4" aria-hidden="true" />CSV</Button>
        <p className="w-full text-xs text-muted-foreground">
          Les dates de fiche viennent du journal : les fiches créées avant ce journal n’ont pas de date de rédaction.
        </p>
      </Card>
      {err && <Notice tone="error">{err}</Notice>}
      {kpi && (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {cards.map((c) => (
              <Card key={c.label} className="p-4">
                <div className="text-xs text-muted-foreground">{c.label}</div>
                <div className="mt-1 text-2xl font-semibold tracking-tight text-foreground">{c.value}</div>
                {c.hint && <div className="mt-1 text-xs text-muted-foreground">{c.hint}</div>}
              </Card>
            ))}
          </div>
          <Card className="p-0">
            <div className="border-b border-border px-4 py-3">
              <h3 className="text-sm font-semibold">Par chargé d’opérations</h3>
            </div>
            {kpi.par_charge.length === 0 ? (
              <EmptyState icon={UserCheck} title="Aucune commande dans le périmètre." />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 font-medium">Chargé</th>
                      <th className="px-3 py-2 font-medium">Dans le périmètre</th>
                      <th className="px-3 py-2 font-medium">À qualifier</th>
                      <th className="px-3 py-2 font-medium">Fiches</th>
                      <th className="px-3 py-2 font-medium">Envoyées</th>
                      <th className="px-3 py-2 font-medium">Retournées</th>
                      <th className="px-3 py-2 font-medium">Délai moyen</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {kpi.par_charge.map((r) => (
                      <tr key={r.code}>
                        <td className="px-3 py-2 font-mono text-xs">{r.code}</td>
                        <td className="px-3 py-2">{r.dans_perimetre}</td>
                        <td className="px-3 py-2">{r.a_qualifier}</td>
                        <td className="px-3 py-2">{r.fiches}</td>
                        <td className="px-3 py-2">{r.envoyees}</td>
                        <td className="px-3 py-2">{r.retournees}</td>
                        <td className="px-3 py-2">{r.delai_jours == null ? '—' : `${r.delai_jours} j`}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  )
}

type TemplateTab = 'unique' | 'groupe' | 'pdf'
const TEMPLATE_TABS: { key: TemplateTab; label: string }[] = [
  { key: 'unique', label: 'Mail : envoi unique' },
  { key: 'groupe', label: 'Mail : envoi groupé' },
  { key: 'pdf', label: 'PDF' },
]
const MAIL_UNIQUE_HELP = '{secteur}, {commande}, {entreprise}, {nature}, {periode}, {redacteur}'
const MAIL_GROUP_HELP = '{entreprise}, {nombre} (nombre de commandes), {liste} (une ligne par commande : numéro, nature, période), {redacteur}'
const TEMPLATE_KEYS: { key: string; tab: TemplateTab; label: string; multiline: boolean; help: string; def: string }[] = [
  { key: 'mail_objet', tab: 'unique', label: 'Objet du mail', multiline: false, help: MAIL_UNIQUE_HELP, def: DEFAULT_MAIL_OBJET },
  { key: 'mail_corps', tab: 'unique', label: 'Corps du mail', multiline: true, help: MAIL_UNIQUE_HELP, def: DEFAULT_MAIL_CORPS },
  { key: 'mail_groupe_objet', tab: 'groupe', label: 'Objet du mail', multiline: false, help: MAIL_GROUP_HELP, def: DEFAULT_GROUP_MAIL_OBJET },
  { key: 'mail_groupe_corps', tab: 'groupe', label: 'Corps du mail', multiline: true, help: MAIL_GROUP_HELP, def: DEFAULT_GROUP_MAIL_CORPS },
  { key: 'pdf_procedure_alerte', tab: 'pdf', label: 'Procédure d’alerte (PDF)', multiline: false, help: 'Texte libre affiché dans la case « Procédure d’alerte »', def: DEFAULT_ALERT },
  { key: 'pdf_pied_de_page', tab: 'pdf', label: 'Pied de page (PDF)', multiline: false, help: '{secteur}, {commande}, {entreprise}, {nature}, {redacteur}', def: DEFAULT_FOOTER },
]

/** Modèles de mail et de PDF, modifiables par le Super Admin. */
export function TemplatesSection() {
  const [values, setValues] = useState<Record<string, string>>({})
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [tab, setTab] = useState<TemplateTab>('unique')

  useEffect(() => {
    void Promise.all(TEMPLATE_KEYS.map(async (t) => {
      const { data } = await supabase.rpc('app_setting_get', { p_key: t.key })
      return [t.key, typeof data === 'string' && data.trim() ? data : t.def] as const
    })).then((rows) => setValues(Object.fromEntries(rows)))
  }, [])

  const save = async (key: string) => {
    setBusy(key); setErr(null); setMsg(null)
    const { error } = await supabase.rpc('app_setting_set', { p_key: key, p_value: values[key] ?? '' })
    setBusy(null)
    if (error) setErr(error.message); else setMsg('Modèle enregistré. Il s’applique aux prochains envois et exports.')
  }

  return (
    <div className="space-y-4">
      {err && <Notice tone="error">{err}</Notice>}
      {msg && <Notice tone="ok">{msg}</Notice>}
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Types de modèles">
        {TEMPLATE_TABS.map((t) => (
          <button key={t.key} type="button" role="tab" aria-selected={tab === t.key} onClick={() => setTab(t.key)}
            className={`rounded-md border px-3 py-1.5 text-sm ${tab === t.key ? 'border-primary bg-primary/10 font-semibold' : 'border-border text-muted-foreground hover:text-foreground'}`}>
            {t.label}
          </button>
        ))}
      </div>
      {TEMPLATE_KEYS.filter((t) => t.tab === tab).map((t) => (
        <Card key={t.key}>
          <h2 className="font-semibold">{t.label}</h2>
          <p className="mb-2 text-xs text-muted-foreground">Variables : {t.help}</p>
          <div className="space-y-2">
            {t.multiline ? (
              <textarea className={`${fieldClass} h-auto min-h-[160px] py-2`} value={values[t.key] ?? ''} onChange={(e) => setValues({ ...values, [t.key]: e.target.value })} />
            ) : (
              <input className={fieldClass} value={values[t.key] ?? ''} onChange={(e) => setValues({ ...values, [t.key]: e.target.value })} />
            )}
            <Button onClick={() => void save(t.key)} disabled={busy === t.key || !(values[t.key] ?? '').trim()}>Enregistrer</Button>
          </div>
        </Card>
      ))}
    </div>
  )
}
