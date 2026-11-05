// Fonction serveur « push-notify » : envoie une notification du site sur les appareils abonnés (Web Push),
// même lorsque le site est fermé. Seul le créateur de la notification peut la pousser, et une seule fois.
import { createClient } from 'npm:@supabase/supabase-js@2'
import webpush from 'npm:web-push@3.6.7'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

const MANAGER_ROLES = ['SUPER_ADMIN', 'RESPONSABLE']

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Méthode non autorisée' }, 405)
  try {
    const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
    const service = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
      db: { schema: 'plans_prevention' },
      auth: { persistSession: false, autoRefreshToken: false },
    })

    const { data: me, error: meErr } = await service.auth.getUser(token)
    if (meErr || !me.user) return json({ error: 'Non authentifié' }, 401)

    const body = (await req.json().catch(() => ({}))) as { notification_id?: string }
    const id = (body.notification_id ?? '').trim()
    if (!id) return json({ error: 'Notification manquante' }, 400)

    const { data: note, error: noteErr } = await service.from('notifications')
      .select('id,title,body,audience,operator_codes,created_by,pushed_at').eq('id', id).maybeSingle()
    if (noteErr) return json({ error: noteErr.message }, 500)
    if (!note) return json({ error: 'Notification introuvable' }, 404)
    if (note.created_by !== me.user.id) return json({ error: 'Seul l’auteur peut envoyer cette notification' }, 403)
    if (note.pushed_at) return json({ sent: 0, already: true })

    // Réservation : une notification n'est poussée qu'une seule fois, même si l'appel est répété.
    const { data: claimed, error: claimErr } = await service.from('notifications')
      .update({ pushed_at: new Date().toISOString() }).eq('id', id).is('pushed_at', null).select('id')
    if (claimErr) return json({ error: claimErr.message }, 500)
    if (!claimed || claimed.length === 0) return json({ sent: 0, already: true })

    // Destinataires : même règle d'audience que la cloche (TOUS, ou chargés choisis + responsables).
    const { data: profiles, error: profErr } = await service.from('profiles')
      .select('user_id,role,operator_code,is_active').eq('is_active', true)
    if (profErr) return json({ error: profErr.message }, 500)
    const recipients = (profiles ?? []).filter((p) =>
      note.audience === 'TOUS'
      || MANAGER_ROLES.includes(p.role as string)
      || (p.operator_code != null && (note.operator_codes as string[]).includes(p.operator_code as string)))
    const userIds = recipients.map((p) => p.user_id as string)
    if (userIds.length === 0) return json({ sent: 0, failed: 0, expired: 0 })

    const { data: subs, error: subErr } = await service.from('push_subscriptions')
      .select('id,endpoint,p256dh,auth').in('user_id', userIds).is('revoked_at', null)
    if (subErr) return json({ error: subErr.message }, 500)

    webpush.setVapidDetails(
      Deno.env.get('VAPID_SUBJECT')!,
      Deno.env.get('VAPID_PUBLIC_KEY')!,
      Deno.env.get('VAPID_PRIVATE_KEY')!,
    )
    const payload = JSON.stringify({ title: note.title, body: note.body ?? '', url: '/' })

    let sent = 0
    let failed = 0
    let expired = 0
    await Promise.all((subs ?? []).map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 86400 })
        sent++
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode
        // 404 / 410 : l'abonnement n'existe plus côté navigateur, on le désactive.
        if (status === 404 || status === 410) {
          expired++
          await service.from('push_subscriptions').update({ revoked_at: new Date().toISOString() }).eq('id', s.id)
        } else {
          failed++
        }
      }
    }))

    return json({ sent, failed, expired })
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Erreur inattendue' }, 500)
  }
})
