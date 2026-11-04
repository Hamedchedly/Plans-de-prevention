import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { fetchOperatorCodes } from '../lib/operators'
import { Button, Card, Notice, errMsg, fieldClass } from './ui'
import { MultiSelect } from './MultiSelect'

interface Preview { total: number; par_charge: { code: string | null; n: number }[] }

/** Archive les commandes d'une tranche de dates pour tous les chargés ou une sélection. Elles sortent des KPIs. */
export default function ArchivePeriodCard() {
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [operators, setOperators] = useState<string[]>([])
  const [codes, setCodes] = useState<string[]>([])
  const [preview, setPreview] = useState<Preview | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => { fetchOperatorCodes().then(setCodes).catch((e) => setErr(errMsg(e))) }, [])

  const reset = () => { setPreview(null); setConfirming(false) }
  const valid = from !== '' && to !== '' && from <= to

  const call = (dryRun: boolean) => supabase.rpc('archive_orders_by_period', {
    p_from: from, p_to: to, p_operators: operators, p_dry_run: dryRun,
  })

  const runPreview = async () => {
    setBusy(true); setErr(null); setMsg(null); setConfirming(false)
    try {
      const { data, error } = await call(true)
      if (error) throw error
      setPreview(data as Preview)
    } catch (e) { setErr(errMsg(e)) } finally { setBusy(false) }
  }

  const archive = async () => {
    setBusy(true); setErr(null); setMsg(null)
    try {
      const { data, error } = await call(false)
      if (error) throw error
      const res = data as Preview & { archived?: number }
      setMsg(`${res.archived ?? res.total} commande(s) archivée(s). Elles ne sont plus comptées dans les KPIs des chargés.`)
      reset()
    } catch (e) { setErr(errMsg(e)) } finally { setBusy(false) }
  }

  const scope = operators.length === 0 ? 'tous les chargés' : operators.join(', ')

  return (
    <Card className="space-y-4">
      <div>
        <h2 className="font-semibold">Archiver par période</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Choisissez une tranche de dates de commande et les chargés concernés. Les commandes archivées restent consultables,
          mais ne sont plus comptabilisées dans les KPIs. Vérifiez l’aperçu avant d’archiver.
        </p>
      </div>
      {err && <Notice tone="error">{err}</Notice>}
      {msg && <Notice tone="ok">{msg}</Notice>}
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="mb-1 block text-xs text-muted-foreground">Du</label>
          <input type="date" className={fieldClass} value={from} onChange={(e) => { setFrom(e.target.value); reset() }} />
        </div>
        <div>
          <label className="mb-1 block text-xs text-muted-foreground">Au</label>
          <input type="date" className={fieldClass} value={to} onChange={(e) => { setTo(e.target.value); reset() }} />
        </div>
        <div className="min-w-48">
          <label className="mb-1 block text-xs text-muted-foreground">Chargés</label>
          <MultiSelect label="Chargés" options={codes} value={operators} placeholder="Tous les chargés"
            onChange={(next) => { setOperators(next); reset() }} />
        </div>
        <Button variant="ghost" onClick={() => void runPreview()} disabled={!valid || busy}>
          {busy && !confirming ? 'Calcul…' : 'Prévisualiser'}
        </Button>
      </div>
      {!valid && from && to && <p className="text-xs text-destructive">La date de fin doit suivre la date de début.</p>}
      {preview && (
        <div className="space-y-3 rounded-2xl bg-muted/50 p-3 text-sm">
          <p>
            <strong>{preview.total}</strong> commande(s) du {from} au {to}, pour {scope}.
          </p>
          {preview.par_charge.length > 0 && (
            <p className="text-xs text-muted-foreground">
              {preview.par_charge.map((c) => `${c.code ?? 'sans chargé'} : ${c.n}`).join(' · ')}
            </p>
          )}
          {preview.total > 0 && !confirming && (
            <Button variant="danger" onClick={() => setConfirming(true)} disabled={busy}>Archiver ces {preview.total} commande(s)</Button>
          )}
          {confirming && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-muted-foreground">Confirmer l’archivage de {preview.total} commande(s) ?</span>
              <Button onClick={() => void archive()} disabled={busy}>{busy ? 'En cours…' : 'Confirmer'}</Button>
              <Button variant="ghost" onClick={reset} disabled={busy}>Annuler</Button>
            </div>
          )}
        </div>
      )}
    </Card>
  )
}
