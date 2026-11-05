import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../lib/auth'
import {
  downloadCsv, fetchTrashCandidates, fetchTrashedCompanies, fetchTrashedOrders, purgeCompanies, purgeOrders,
  restoreCompanies, restoreOrders, trashCompanies, type TrashCandidate, type TrashedCompany,
} from '../lib/corbeille'
import type { MatchedOrder } from '../lib/ordersBulk'
import { Badge, Button, Card, Notice, errMsg, fieldClass } from './ui'

type Pending = 'restore-orders' | 'restore-companies' | 'trash-companies' | null
interface PurgeTarget { kind: 'orders' | 'companies'; keys: string[] }

const PURGE_WORD = 'PURGER'
const toggleIn = (set: Set<string>, key: string): Set<string> => {
  const next = new Set(set)
  if (next.has(key)) next.delete(key); else next.add(key)
  return next
}

/** Corbeille : commandes et entreprises mises de côté. Restaurable ; la purge est une étape distincte. */
export default function CorbeillePanel() {
  const { profile } = useAuth()
  const isSuper = profile?.role === 'SUPER_ADMIN'
  const canManage = isSuper || profile?.role === 'RESPONSABLE'

  const [orders, setOrders] = useState<MatchedOrder[] | null>(null)
  const [companies, setCompanies] = useState<TrashedCompany[] | null>(null)
  const [candidates, setCandidates] = useState<TrashCandidate[] | null>(null)
  const [selOrders, setSelOrders] = useState<Set<string>>(new Set())
  const [selCompanies, setSelCompanies] = useState<Set<string>>(new Set())
  const [selCandidates, setSelCandidates] = useState<Set<string>>(new Set())
  const [pending, setPending] = useState<Pending>(null)
  const [target, setTarget] = useState<PurgeTarget | null>(null)
  const [backupDone, setBackupDone] = useState(false)
  const [typed, setTyped] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const [o, c, cand] = await Promise.all([
        fetchTrashedOrders(), fetchTrashedCompanies(), canManage ? fetchTrashCandidates() : Promise.resolve([]),
      ])
      setOrders(o); setCompanies(c); setCandidates(cand)
    } catch (e) { setErr(errMsg(e)) }
  }, [canManage])

  useEffect(() => { void load() }, [load])

  const resetAfter = () => {
    setPending(null); setTarget(null); setBackupDone(false); setTyped('')
    setSelOrders(new Set()); setSelCompanies(new Set()); setSelCandidates(new Set())
  }

  /** Exécute une action, puis recharge les listes. */
  const run = async (fn: () => Promise<number>, label: string) => {
    setBusy(true); setErr(null); setMsg(null)
    try {
      const n = await fn()
      setMsg(`${n} ${label}.`)
      resetAfter()
      await load()
    } catch (e) { setErr(errMsg(e)) } finally { setBusy(false) }
  }

  const chosenOrders = (orders ?? []).filter((o) => selOrders.has(o.order_number))
  const chosenCompanies = (companies ?? []).filter((c) => selCompanies.has(c.isis_code))
  const purgeableOrders = chosenOrders.filter((o) => !o.purged_at)
  const purgeableCompanies = chosenCompanies.filter((c) => !c.purged_at)

  const startPurge = (kind: 'orders' | 'companies', keys: string[]) => {
    setTarget({ kind, keys }); setBackupDone(false); setTyped(''); setPending(null); setMsg(null); setErr(null)
  }

  const backup = () => {
    if (!target) return
    const stamp = new Date().toISOString().slice(0, 10)
    if (target.kind === 'orders') {
      downloadCsv(`sauvegarde-commandes-${stamp}.csv`, chosenOrders.map((o) => ({
        commande: o.order_number, date: o.order_date, chargé: o.operator_code, secteur: o.sector_code,
        mise_en_corbeille: o.trashed_at, purgée: o.purged_at ? 'oui' : 'non',
      })))
    } else {
      downloadCsv(`sauvegarde-entreprises-${stamp}.csv`, chosenCompanies.map((c) => ({
        isis: c.isis_code, nom: c.name, mise_en_corbeille: c.trashed_at, purgée: c.purged_at ? 'oui' : 'non',
      })))
    }
    setBackupDone(true)
  }

  const confirmPurge = () => {
    if (!target) return
    const keys = target.keys
    void run(
      () => (target.kind === 'orders' ? purgeOrders(keys) : purgeCompanies(keys)),
      target.kind === 'orders' ? 'commande(s) purgée(s)' : 'entreprise(s) purgée(s)',
    )
  }

  const purgeReady = backupDone && typed === PURGE_WORD && !busy

  return (
    <Card className="space-y-6">
      <div>
        <h2 className="font-semibold">Corbeille</h2>
        <p className="text-sm text-muted-foreground">
          Un élément mis en corbeille peut être restauré. La purge est une étape distincte, réservée au Super Admin : elle exige une sauvegarde
          et la saisie de « {PURGE_WORD} ». Elle ne supprime rien de la base.
        </p>
      </div>
      {err && <Notice tone="error">{err}</Notice>}
      {msg && <Notice tone="ok">{msg}</Notice>}

      {/* Commandes en corbeille */}
      <section className="space-y-3">
        <h3 className="text-sm font-medium">Commandes en corbeille ({orders?.length ?? '…'})</h3>
        {orders && orders.length === 0 && <p className="text-sm text-muted-foreground">Aucune commande en corbeille.</p>}
        {orders && orders.length > 0 && (
          <>
            <div className="max-h-72 overflow-auto rounded-2xl border border-border">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-muted/50 text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="w-10 px-3 py-2" />
                    <th className="px-3 py-2 font-medium">Commande</th>
                    <th className="px-3 py-2 font-medium">Chargé</th>
                    <th className="px-3 py-2 font-medium">Secteur</th>
                    <th className="px-3 py-2 font-medium">État</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((o) => (
                    <tr key={o.order_number} className="border-t border-border">
                      <td className="px-3 py-2">
                        <input type="checkbox" aria-label={`Sélectionner ${o.order_number}`} checked={selOrders.has(o.order_number)}
                          onChange={() => setSelOrders(toggleIn(selOrders, o.order_number))} />
                      </td>
                      <td className="px-3 py-2 font-mono text-xs">{o.order_number}</td>
                      <td className="px-3 py-2">{o.operator_code ?? '—'}</td>
                      <td className="px-3 py-2">{o.sector_code ?? '—'}</td>
                      <td className="px-3 py-2">{o.purged_at ? <Badge tone="off">Purgée</Badge> : <Badge tone="info">Corbeille</Badge>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {canManage && selOrders.size > 0 && pending !== 'restore-orders' && (
              <div className="flex flex-wrap gap-2">
                <Button variant="ghost" disabled={busy} onClick={() => setPending('restore-orders')}>
                  Restaurer ({chosenOrders.length})
                </Button>
                {isSuper && purgeableOrders.length > 0 && target?.kind !== 'orders' && (
                  <Button variant="ghost" disabled={busy} onClick={() => startPurge('orders', purgeableOrders.map((o) => o.order_number))}>
                    Purger ({purgeableOrders.length})
                  </Button>
                )}
              </div>
            )}
            {pending === 'restore-orders' && (
              <div className="flex flex-wrap items-center gap-2 rounded-2xl bg-muted/50 p-2 text-sm">
                <span>Restaurer {chosenOrders.length} commande(s) ?</span>
                <Button disabled={busy} onClick={() => void run(() => restoreOrders(chosenOrders.map((o) => o.order_number)), 'commande(s) restaurée(s)')}>Confirmer</Button>
                <Button variant="ghost" disabled={busy} onClick={() => setPending(null)}>Annuler</Button>
              </div>
            )}
            {isSuper && target?.kind === 'orders' && (
              <PurgeBox
                count={target.keys.length} backupDone={backupDone} typed={typed} busy={busy} ready={purgeReady}
                onBackup={backup} onType={setTyped} onConfirm={confirmPurge} onCancel={() => setTarget(null)}
              />
            )}
            <p className="text-xs text-muted-foreground">
              Suppression définitive : non disponible. Elle supprimerait des lignes importées, ce que le projet interdit sans validation explicite.
            </p>
          </>
        )}
      </section>

      {/* Entreprises en corbeille */}
      <section className="space-y-3">
        <h3 className="text-sm font-medium">Entreprises en corbeille ({companies?.length ?? '…'})</h3>
        {companies && companies.length === 0 && <p className="text-sm text-muted-foreground">Aucune entreprise en corbeille.</p>}
        {companies && companies.length > 0 && (
          <>
            <div className="max-h-56 overflow-auto rounded-2xl border border-border">
              <table className="w-full text-sm">
                <tbody>
                  {companies.map((c) => (
                    <tr key={c.isis_code} className="border-t border-border first:border-t-0">
                      <td className="w-10 px-3 py-2">
                        <input type="checkbox" aria-label={`Sélectionner ${c.name ?? c.isis_code}`} checked={selCompanies.has(c.isis_code)}
                          onChange={() => setSelCompanies(toggleIn(selCompanies, c.isis_code))} />
                      </td>
                      <td className="px-3 py-2">{c.name ?? '—'} <span className="font-mono text-xs text-muted-foreground">{c.isis_code}</span></td>
                      <td className="px-3 py-2">{c.purged_at ? <Badge tone="off">Purgée</Badge> : <Badge tone="info">Corbeille</Badge>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {canManage && selCompanies.size > 0 && pending !== 'restore-companies' && (
              <div className="flex flex-wrap gap-2">
                <Button variant="ghost" disabled={busy} onClick={() => setPending('restore-companies')}>
                  Restaurer ({chosenCompanies.length})
                </Button>
                {isSuper && purgeableCompanies.length > 0 && target?.kind !== 'companies' && (
                  <Button variant="ghost" disabled={busy} onClick={() => startPurge('companies', purgeableCompanies.map((c) => c.isis_code))}>
                    Purger ({purgeableCompanies.length})
                  </Button>
                )}
              </div>
            )}
            {pending === 'restore-companies' && (
              <div className="flex flex-wrap items-center gap-2 rounded-2xl bg-muted/50 p-2 text-sm">
                <span>Restaurer {chosenCompanies.length} entreprise(s) ?</span>
                <Button disabled={busy} onClick={() => void run(() => restoreCompanies(chosenCompanies.map((c) => c.isis_code)), 'entreprise(s) restaurée(s)')}>Confirmer</Button>
                <Button variant="ghost" disabled={busy} onClick={() => setPending(null)}>Annuler</Button>
              </div>
            )}
            {isSuper && target?.kind === 'companies' && (
              <PurgeBox
                count={target.keys.length} backupDone={backupDone} typed={typed} busy={busy} ready={purgeReady}
                onBackup={backup} onType={setTyped} onConfirm={confirmPurge} onCancel={() => setTarget(null)}
              />
            )}
          </>
        )}
      </section>

      {/* Candidates à la corbeille */}
      {canManage && (
        <section className="space-y-3">
          <h3 className="text-sm font-medium">Entreprises sans commande active ({candidates?.length ?? '…'})</h3>
          <p className="text-xs text-muted-foreground">Entreprises qu’aucune commande active ne référence. Elles peuvent être mises en corbeille.</p>
          {candidates && candidates.length === 0 && <p className="text-sm text-muted-foreground">Aucune entreprise candidate.</p>}
          {candidates && candidates.length > 0 && (
            <>
              <div className="max-h-56 overflow-auto rounded-2xl border border-border">
                <table className="w-full text-sm">
                  <tbody>
                    {candidates.map((c) => (
                      <tr key={c.isis_code} className="border-t border-border first:border-t-0">
                        <td className="w-10 px-3 py-2">
                          <input type="checkbox" aria-label={`Sélectionner ${c.name ?? c.isis_code}`} checked={selCandidates.has(c.isis_code)}
                            onChange={() => setSelCandidates(toggleIn(selCandidates, c.isis_code))} />
                        </td>
                        <td className="px-3 py-2">{c.name ?? '—'} <span className="font-mono text-xs text-muted-foreground">{c.isis_code}</span></td>
                        <td className="px-3 py-2 text-xs text-muted-foreground">{c.orders_total} commande(s) au total</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {selCandidates.size > 0 && pending !== 'trash-companies' && (
                <Button variant="ghost" disabled={busy} onClick={() => setPending('trash-companies')}>
                  Mettre en corbeille ({selCandidates.size})
                </Button>
              )}
              {pending === 'trash-companies' && (
                <div className="flex flex-wrap items-center gap-2 rounded-2xl bg-muted/50 p-2 text-sm">
                  <span>Mettre {selCandidates.size} entreprise(s) en corbeille ?</span>
                  <Button disabled={busy} onClick={() => void run(() => trashCompanies([...selCandidates]), 'entreprise(s) mise(s) en corbeille')}>Confirmer</Button>
                  <Button variant="ghost" disabled={busy} onClick={() => setPending(null)}>Annuler</Button>
                </div>
              )}
            </>
          )}
        </section>
      )}
    </Card>
  )
}

function PurgeBox(props: {
  count: number; backupDone: boolean; typed: string; busy: boolean; ready: boolean
  onBackup: () => void; onType: (v: string) => void; onConfirm: () => void; onCancel: () => void
}) {
  return (
    <div className="space-y-3 rounded-2xl border border-destructive/40 bg-destructive/5 p-3 text-sm">
      <p><strong>Purge de {props.count} élément(s)</strong>. Étape 1 : télécharger la sauvegarde. Étape 2 : saisir « {PURGE_WORD} ».</p>
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" disabled={props.busy} onClick={props.onBackup}>
          {props.backupDone ? 'Sauvegarde téléchargée' : 'Télécharger la sauvegarde (CSV)'}
        </Button>
        <input className={fieldClass} placeholder={PURGE_WORD} aria-label="Confirmation de purge" value={props.typed}
          onChange={(e) => props.onType(e.target.value)} disabled={!props.backupDone} />
        <Button disabled={!props.ready} onClick={props.onConfirm}>Purger</Button>
        <Button variant="ghost" disabled={props.busy} onClick={props.onCancel}>Annuler</Button>
      </div>
    </div>
  )
}
