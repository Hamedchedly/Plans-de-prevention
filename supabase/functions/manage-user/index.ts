// Fonction serveur « manage-user » : un Super Admin renouvelle le lien d'un compte jamais configuré,
// ou supprime ce compte tant que sa configuration (mot de passe, identité) n'est pas terminée.
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

    const { data: admin, error: adminErr } = await service.from('profiles').select('role,is_active').eq('user_id', me.user.id).maybeSingle()
    if (adminErr) return json({ error: `Lecture du profil impossible : ${adminErr.message}` }, 500)
    if (!admin || !admin.is_active || admin.role !== 'SUPER_ADMIN') return json({ error: 'Réservé au Super Admin' }, 403)

    const body = (await req.json().catch(() => ({}))) as { action?: string; user_id?: string; redirect_to?: string | null }
    const userId = (body.user_id ?? '').trim()
    if (!userId) return json({ error: 'Compte manquant' }, 400)

    const { data: target, error: targetErr } = await service.auth.admin.getUserById(userId)
    if (targetErr || !target.user) return json({ error: 'Compte introuvable' }, 404)
    // Seuls les comptes dont la configuration n'est pas terminée peuvent être relancés ou supprimés.
    if (target.user.user_metadata?.needs_setup !== true) {
      return json({ error: 'Ce compte a déjà été configuré : utilisez « Actif » pour le désactiver' }, 409)
    }
    const email = target.user.email ?? ''

    if (body.action === 'new_link') {
      const { data: link, error: linkErr } = await service.auth.admin.generateLink({
        type: 'magiclink', email,
        options: body.redirect_to ? { redirectTo: body.redirect_to } : undefined,
      })
      if (linkErr || !link.properties?.action_link) return json({ error: linkErr?.message ?? 'Lien impossible à générer' }, 500)
      await service.from('audit_logs').insert({
        actor_user_id: me.user.id, subject_user_id: userId, action: 'USER_LINK_RENEWED', entity: 'profiles', entity_id: userId, payload: { email },
      })
      return json({ user_id: userId, email, action_link: link.properties.action_link })
    }

    if (body.action === 'delete') {
      // profiles.user_id référence auth.users avec ON DELETE CASCADE : supprimer le compte Auth supprime le profil.
      const { error: delErr } = await service.auth.admin.deleteUser(userId)
      if (delErr) return json({ error: `Suppression du compte impossible : ${delErr.message}` }, 500)
      await service.from('audit_logs').insert({
        actor_user_id: me.user.id, subject_user_id: null, action: 'USER_DELETED_PENDING', entity: 'profiles', entity_id: userId, payload: { email },
      })
      return json({ deleted: true, email })
    }

    return json({ error: 'Action inconnue' }, 400)
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Erreur serveur' }, 500)
  }
})
