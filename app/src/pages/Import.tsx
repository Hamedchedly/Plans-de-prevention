import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { mapCommande, mapSuivi, readRows, sha256, type ImportKind } from '../lib/importers'
import { Button, Card, Notice, errMsg, fieldClass } from '../components/ui'
import { logActivity, logError } from '../lib/activity'
import ImportDuplicates from '../components/ImportDuplicates'

const chunk = <T,>(xs: T[], n = 200) => Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n))
const check = (res: { error: { message: string } | null }) => { if (res.error) throw new Error(res.error.message) }

export default function ImportPage() {
  const { profile } = useAuth()
  const [kind, setKind] = useState<ImportKind>('COMMANDES')
  const [busy, setBusy] = useState(false)
  const [log, setLog] = useState<string[]>([])
  const [err, setErr] = useState<string | null>(null)

  const importCommandes = async (rows: Record<string, unknown>[], importId: string) => {
    const byNumber = new Map<string, NonNullable<ReturnType<typeof mapCommande>>>()
    for (const r of rows) {
      const m = mapCommande(r)
      if (m) byNumber.set(m.order_number, m)
    }
    const numbers = [...byNumber.keys()]
    const existing = new Set<string>()
    for (const part of chunk(numbers, 200)) {
      const res = await supabase.from('orders').select('order_number').in('order_number', part)
      check(res)
      ;(res.data ?? []).forEach((x: { order_number: string }) => existing.add(x.order_number))
    }
    // upsert ne touche que les colonnes source : les décisions (périmètre, lots, risques, mesures) sont conservées
    for (const part of chunk([...byNumber.values()], 200)) {
      check(await supabase.from('orders').upsert(part, { onConflict: 'order_number' }))
    }
    let base = 1
    for (const part of chunk(rows, 100)) {
      check(await supabase.from('import_rows').insert(part.map((raw, i) => ({
        import_id: importId, row_no: base + i, order_number: mapCommande(raw)?.order_number ?? null, raw,
      }))))
      base += part.length
    }
    const inserted = numbers.filter((n) => !existing.has(n)).length
    const updated = numbers.length - inserted
    const scoped = await supabase.rpc('apply_scope_rules')
    check(scoped)
    // audit importé : applique ENVOYE / SIGNE aux commandes nouvelles ou encore non qualifiées (les décisions prises ne sont pas écrasées)
    const audited = await supabase.rpc('apply_order_audit')
    check(audited)
    return { inserted, updated, scopeRecalculated: scoped.data as number, auditApplied: (audited.data as number) ?? 0 }
  }

  const importSuivi = async (rows: Record<string, unknown>[], importId: string) => {
    const mapped = rows.map((r, i) => ({ ...mapSuivi(r), row_no: i + 1 })).filter((m) => m.order_number)
    for (const part of chunk(mapped, 200)) {
      check(await supabase.from('budget_tracking').insert(part.map((m) => ({
        import_id: importId, row_no: m.row_no, order_number: m.order_number, raw: m.raw,
      }))))
    }
    return { inserted: mapped.length, updated: 0, scopeRecalculated: 0, auditApplied: 0 }
  }

  const onFile = async (file: File) => {
    setBusy(true); setErr(null); setLog([])
    let importId: string | null = null
    try {
      const buf = await file.arrayBuffer()
      const sha = await sha256(buf)
      const dup = await supabase.from('imports').select('id').eq('kind', kind).eq('file_sha256', sha).maybeSingle()
      check(dup)
      if (dup.data) { setLog(['Ce fichier a déjà été importé : aucune modification.']); return }

      const rows = readRows(buf)
      const ins = await supabase.from('imports').insert({
        kind, file_name: file.name, file_sha256: sha, row_count: rows.length, status: 'EN_COURS', created_by: profile?.user_id,
      }).select('id').single()
      check(ins)
      importId = (ins.data as { id: string }).id

      const res = kind === 'COMMANDES' ? await importCommandes(rows, importId) : await importSuivi(rows, importId)
      check(await supabase.from('imports').update({
        status: 'TERMINE', inserted_count: res.inserted, updated_count: res.updated,
        summary: { scope_recalculated: res.scopeRecalculated },
      }).eq('id', importId))
      // Adresse réelle : reprise du suivi budgétaire (l'import des commandes réécrit l'adresse source)
      const addressed = await supabase.rpc('apply_budget_addresses')
      check(addressed)
      void logActivity('IMPORT', kind, importId, { file: file.name, summary: `${res.inserted} nouvelles, ${res.updated} mises à jour` })
      setLog([
        `${rows.length} lignes lues dans « ${file.name} ».`,
        `${res.inserted} nouvelle(s) ligne(s), ${res.updated} mise(s) à jour (données source uniquement).`,
        `Adresse reprise du suivi budgétaire sur ${(addressed.data as number) ?? 0} commande(s).`,
        ...(kind === 'COMMANDES' ? [
          `Périmètre recalculé sur ${res.scopeRecalculated} commande(s) non fixée(s) manuellement.`,
          `Audit appliqué à ${res.auditApplied} commande(s) (envoyé ou signé, si encore non qualifiée).`,
        ] : []),
      ])
    } catch (e) {
      logError('import ' + kind, e)
      setErr(errMsg(e))
      if (importId) await supabase.from('imports').update({ status: 'ERREUR', summary: { error: errMsg(e) } }).eq('id', importId)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Card>
        <h1 className="mb-1 text-lg font-semibold">Import des exports</h1>
        <p className="mb-4 text-sm text-muted-foreground">
          Un fichier identique à un import précédent est ignoré. Les décisions prises (périmètre, lots, risques, mesures) ne sont jamais écrasées.
        </p>
        <label className="mb-1 block text-xs text-muted-foreground">Type d’export</label>
        <select className={`${fieldClass} mb-4`} value={kind} onChange={(e) => setKind(e.target.value as ImportKind)} disabled={busy}>
          <option value="COMMANDES">Commandes (ANM_COMD_TRAV_ER)</option>
          <option value="SUIVI_BUDGET">Suivi budgétaire (ANM_SUIVTRXSECT)</option>
        </select>
        <input type="file" accept=".xlsx,.xls" disabled={busy} className="block w-full text-sm"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) void onFile(f); e.currentTarget.value = '' }} />
        {busy && <p className="mt-3 text-sm text-muted-foreground">Import en cours…</p>}
      </Card>
      {err && <Notice tone="error">{err}</Notice>}
      {log.length > 0 && <Notice tone="ok">{log.map((l) => <div key={l}>{l}</div>)}</Notice>}
      <Button variant="ghost" onClick={() => setLog([])} disabled={busy || log.length === 0}>Effacer le message</Button>
      <ImportDuplicates />
    </div>
  )
}
