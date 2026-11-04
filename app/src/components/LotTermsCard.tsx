import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { getReferentiel, type Referentiel } from '../lib/refdata'
import { Badge, Button, Card, Notice, errMsg, fieldClass } from './ui'

interface TermRow { term: string; lot_code: number; active: boolean }

/** Termes qui rattachent une commande à un lot (ex. « volet roulant » → MENUISERIES EXTERIEURES). Désactivation, jamais suppression. */
export default function LotTermsCard() {
  const [rows, setRows] = useState<TermRow[] | null>(null)
  const [lots, setLots] = useState<Referentiel['lots']>([])
  const [term, setTerm] = useState('')
  const [lot, setLot] = useState<number | ''>('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const lotName = (code: number) => lots.find((l) => l.code === code)?.name ?? `Lot ${code}`

  const load = async () => {
    const { data, error } = await supabase.from('lot_terms').select('term,lot_code,active').order('term')
    if (error) throw error
    setRows((data ?? []) as TermRow[])
  }

  useEffect(() => {
    void Promise.all([getReferentiel(), load()])
      .then(([ref]) => setLots(ref.lots))
      .catch((e) => setErr(errMsg(e)))
  }, [])

  const set = async (t: string, code: number, active: boolean, label: string) => {
    setBusy(true); setErr(null); setMsg(null)
    try {
      const { error } = await supabase.rpc('set_lot_term', { p_term: t, p_lot: code, p_active: active })
      if (error) throw error
      await load()
      setMsg(label)
      await getReferentiel(true)
    } catch (e) { setErr(errMsg(e)) } finally { setBusy(false) }
  }

  const add = async () => {
    if (term.trim() === '' || lot === '') return
    await set(term, lot, true, `Terme « ${term.trim().toLowerCase()} » ajouté.`)
    setTerm('')
  }

  return (
    <Card className="max-w-xl space-y-4">
      <div>
        <h2 className="font-semibold">Termes de lots</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Un terme présent dans la description ou la nature d’une commande la rattache au lot indiqué. Un terme désactivé
          n’est plus utilisé pour les suggestions, mais reste enregistré.
        </p>
      </div>
      {err && <Notice tone="error">{err}</Notice>}
      {msg && <Notice tone="ok">{msg}</Notice>}
      <div className="flex flex-wrap items-end gap-2">
        <div>
          <label className="mb-1 block text-xs text-muted-foreground">Terme</label>
          <input className={fieldClass} value={term} onChange={(e) => setTerm(e.target.value)} placeholder="ex. store banne" />
        </div>
        <div className="min-w-56">
          <label className="mb-1 block text-xs text-muted-foreground">Lot</label>
          <select className={fieldClass} value={lot} onChange={(e) => setLot(e.target.value === '' ? '' : Number(e.target.value))}>
            <option value="">Choisir un lot…</option>
            {lots.map((l) => <option key={l.code} value={l.code}>{l.code} · {l.name}</option>)}
          </select>
        </div>
        <Button onClick={() => void add()} disabled={busy || term.trim() === '' || lot === ''}>Ajouter</Button>
      </div>
      {rows === null ? (
        <p className="text-sm text-muted-foreground">Chargement…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">Aucun terme enregistré.</p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
              <tr><th className="px-3 py-2 font-medium">Terme</th><th className="px-3 py-2 font-medium">Lot</th><th className="px-3 py-2 font-medium">Statut</th><th className="px-3 py-2" /></tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={`${r.term}|${r.lot_code}`} className="border-t border-border">
                  <td className="px-3 py-2">{r.term}</td>
                  <td className="px-3 py-2">{lotName(r.lot_code)}</td>
                  <td className="px-3 py-2"><Badge tone={r.active ? 'ok' : 'off'}>{r.active ? 'Actif' : 'Désactivé'}</Badge></td>
                  <td className="px-3 py-2 text-right">
                    <Button variant="ghost" size="sm" disabled={busy}
                      onClick={() => void set(r.term, r.lot_code, !r.active, r.active ? `Terme « ${r.term} » désactivé.` : `Terme « ${r.term} » réactivé.`)}>
                      {r.active ? 'Désactiver' : 'Réactiver'}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  )
}
