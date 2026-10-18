// Fonction serveur « impersonate » : permet à un Super Admin d'ouvrir une session à la place d'un utilisateur.
// Vérifie l'administrateur, la cible, journalise le début dans audit_logs, puis renvoie un jeton de connexion à usage unique.
import { createClient } from 'npm:@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

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

    const { data: admin } = await service.from('profiles').select('role,is_active').eq('user_id', me.user.id).maybeSingle()
    if (!admin || !admin.is_active || admin.role !== 'SUPER_ADMIN') return json({ error: 'Réservé au Super Admin' }, 403)

    const body = (await req.json().catch(() => ({}))) as { user_id?: string }
    if (!body.user_id || body.user_id === me.user.id) return json({ error: 'Cible invalide' }, 400)

    const { data: target } = await service.from('profiles').select('email,role,is_active').eq('user_id', body.user_id).maybeSingle()
    if (!target || !target.email) return json({ error: 'Profil introuvable' }, 404)
    if (!target.is_active) return json({ error: 'Ce compte est désactivé' }, 400)
    if (target.role === 'SUPER_ADMIN') return json({ error: 'Un Super Admin ne peut pas être ouvert ainsi' }, 403)

    const { data: link, error: linkErr } = await service.auth.admin.generateLink({ type: 'magiclink', email: target.email })
    if (linkErr || !link.properties?.hashed_token) return json({ error: linkErr?.message ?? 'Session impossible' }, 500)

    await service.from('audit_logs').insert({
      actor_user_id: me.user.id,
      subject_user_id: body.user_id,
      action: 'IMPERSONATION_START',
      entity: 'profiles',
      entity_id: body.user_id,
      payload: { target_email: target.email, admin_email: me.user.email ?? null },
    })

    return json({ token_hash: link.properties.hashed_token, email: target.email })
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Erreur serveur' }, 500)
  }
})
