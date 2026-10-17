import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { getReferentiel } from '../lib/refdata'
import { importReferentielV4 } from '../lib/referentiel'
import type { AlertRow, Profile, Role } from '../lib/types'
import { Badge, Button, Card, Notice, errMsg, fieldClass } from '../components/ui'

type Section = 'perimetre' | 'referentiels' | 'alertes' | 'utilisateurs'

const SECTIONS: { key: Section; label: string; superOnly: boolean }[] = [
  { key: 'alertes', label: 'Alertes', superOnly: false },
  { key: 'perimetre', label: 'Périmètre', superOnly: true },
  { key: 'referentiels', label: 'Référentiels', superOnly: true },
  { key: 'utilisateurs', label: 'Utilisateurs', superOnly: true },
]

export default function Admin() {
  const { can, profile } = useAuth()
  const isSuper = can('SUPER_ADMIN')
  const visible = SECTIONS.filter((s) => !s.superOnly || isSuper)
  const [section, setSection] = useState<Section>(visible[0].key)
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {visible.map((s) => (
          <Button key={s.key} variant={section === s.key ? 'primary' : 'ghost'} onClick={() => setSection(s.key)}>{s.label}</Button>
        ))}
      </div>
      {section === 'alertes' && <AlertsSection />}
      {section === 'perimetre' && isSuper && <ScopeSection />}
      {section === 'referentiels' && isSuper && <ReferentielSection userId={profile?.user_id ?? ''} />}
      {section === 'utilisateurs' && isSuper && <UsersSection />}
    </div>
  )
}

function AlertsSection() {
  const { can } = useAuth()
  const [rows, setRows] = useState<AlertRow[]>([])
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [err, setErr] = useState<string | null>(null)
  const [filter, setFilter] = useState<'OUVERTES' | 'TOUTES'>('OUVERTES')

  const load = async () => {
    const { data, error } = await supabase.from('alerts').select('*').order('code')
    if (error) setErr(error.message); else setRows((data ?? []) as AlertRow[])
  }
  useEffect(() => { void load() }, [])

  const decide = async (code: string, status: 'VALIDE' | 'MODIFIE' | 'IGNORE') => {
    const { error } = await supabase.rpc('decide_alert', { p_code: code, p_status: status, p_comment: drafts[code] ?? null })
    if (error) setErr(error.message); else { setErr(null); void load() }
  }

  const open = (a: AlertRow) => a.status === 'A_VALIDER' || a.status === 'APPLIQUE_A_VALIDER'
  const shown = filter === 'OUVERTES' ? rows.filter(open) : rows
  const tone = (s: AlertRow['status']) => (s === 'VALIDE' ? 'ok' : s === 'IGNORE' ? 'off' : s === 'MODIFIE' ? 'warn' : 'default') as 'ok' | 'off' | 'warn' | 'default'

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <h2 className="mr-auto font-semibold">Alertes d’incohérence ({shown.length})</h2>
        <select className={fieldClass + ' w-auto'} value={filter} onChange={(e) => setFilter(e.target.value as 'OUVERTES' | 'TOUTES')}>
          <option value="OUVERTES">À traiter</option>
          <option value="TOUTES">Toutes</option>
        </select>
      </div>
      {err && <Notice tone="error">{err}</Notice>}
      {!can('RESPONSABLE', 'SUPER_ADMIN') && <Notice>Réservé aux responsables.</Notice>}
      {shown.map((a) => (
        <Card key={a.code}>
          <div className="mb-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span className="font-mono">{a.code}</span><Badge>{a.type}</Badge><Badge tone={tone(a.status)}>{a.status.replace(/_/g, ' ')}</Badge>
          </div>
          <div className="text-sm font-medium">{a.object}</div>
          <p className="mt-1 text-sm">{a.finding}</p>
          <p className="mt-1 text-sm text-muted-foreground">Proposition : {a.proposal}</p>
          {a.decision_comment && <p className="mt-1 text-xs text-muted-foreground">Commentaire : {a.decision_comment}</p>}
          <div className="mt-3 flex flex-wrap gap-2">
            <input className={fieldClass + ' flex-1 min-w-[200px]'} placeholder="Commentaire (optionnel)" value={drafts[a.code] ?? ''}
              onChange={(e) => setDrafts({ ...drafts, [a.code]: e.target.value })} />
            <Button onClick={() => void decide(a.code, 'VALIDE')} disabled={!can('RESPONSABLE', 'SUPER_ADMIN')}>Valider</Button>
            <Button variant="ghost" onClick={() => void decide(a.code, 'MODIFIE')} disabled={!can('RESPONSABLE', 'SUPER_ADMIN')}>Modifier</Button>
            <Button variant="ghost" onClick={() => void decide(a.code, 'IGNORE')} disabled={!can('RESPONSABLE', 'SUPER_ADMIN')}>Ignorer</Button>
          </div>
        </Card>
      ))}
      {shown.length === 0 && <Notice>Aucune alerte à traiter.</Notice>}
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
  const run = async () => {
    setBusy(true); setErr(null); setMsg(null)
    try {
      setMsg(await importReferentielV4(userId))
      await getReferentiel(true)
    } catch (e) { setErr(errMsg(e)) } finally { setBusy(false) }
  }
  return (
    <Card className="max-w-xl space-y-3">
      <h2 className="font-semibold">Référentiel V4 (proposé, non validé)</h2>
      <p className="text-sm text-muted-foreground">
        Charge lots, risques, mesures, règles risque→mesure, défauts par lot, natures, vocabulaire et alertes.
        Relançable sans doublon ; les décisions déjà prises sur les alertes sont conservées.
      </p>
      {err && <Notice tone="error">{err}</Notice>}
      {msg && <Notice tone="ok">{msg}</Notice>}
      <Button onClick={() => void run()} disabled={busy}>{busy ? 'Chargement…' : 'Charger / recharger le référentiel'}</Button>
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

  const save = async (u: Profile) => {
    setErr(null); setMsg(null)
    const { error } = await supabase.rpc('admin_set_profile', {
      p_user_id: u.user_id, p_role: u.role, p_operator_code: u.operator_code || null,
      p_sector_codes: u.sector_codes, p_is_active: u.is_active,
    })
    if (error) setErr(error.message); else setMsg(`Profil de ${u.email ?? u.user_id} enregistré.`)
  }

  return (
    <div className="space-y-3">
      <h2 className="font-semibold">Utilisateurs et droits</h2>
      <p className="text-sm text-muted-foreground">Un compte doit d’abord être créé dans Supabase Auth ; son profil apparaît ici automatiquement.</p>
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
                <td className="px-3 py-2 text-right"><Button onClick={() => void save(u)}>Enregistrer</Button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
