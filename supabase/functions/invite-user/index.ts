// Fonction serveur « invite-user » : un Super Admin crée un compte et obtient un lien à envoyer.
// Le lien ouvre une session ; l'utilisateur complète ensuite son mot de passe et son identité (metadata needs_setup).
import { createClient } from 'npm:@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

const ROLES = ['SUPER_ADMIN', 'RESPONSABLE', 'CHARGE_OPERATIONS']

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

    // Lecture du profil : une erreur de lecture doit être signalée comme telle, pas confondue avec un refus de droits.
    const { data: admin, error: adminErr } = await service.from('profiles').select('role,is_active').eq('user_id', me.user.id).maybeSingle()
    if (adminErr) return json({ error: `Lecture du profil impossible : ${adminErr.message}` }, 500)
    if (!admin || !admin.is_active || admin.role !== 'SUPER_ADMIN') return json({ error: 'Réservé au Super Admin' }, 403)

    const body = (await req.json().catch(() => ({}))) as {
      email?: string; role?: string; operator_code?: string | null; sector_codes?: string[]; redirect_to?: string | null
    }
    const email = (body.email ?? '').trim().toLowerCase()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: 'Adresse e-mail invalide' }, 400)
    const role = body.role ?? 'CHARGE_OPERATIONS'
    if (!ROLES.includes(role)) return json({ error: 'Rôle invalide' }, 400)
    const sectors = (body.sector_codes ?? []).map((s) => String(s).trim()).filter(Boolean)

    const { data: created, error: createErr } = await service.auth.admin.createUser({
      email, email_confirm: true, user_metadata: { needs_setup: true },
    })
    if (createErr || !created.user) {
      const msg = createErr?.message ?? 'Création impossible'
      return json({ error: /already|registered|exists/i.test(msg) ? 'Un compte existe déjà pour cette adresse' : msg }, 409)
    }
    const userId = created.user.id

    // Le trigger crée le profil ; on fixe ici le rôle et les périmètres demandés.
    const { error: profErr } = await service.from('profiles').update({
      role, operator_code: body.operator_code?.trim() || null, sector_codes: sectors, is_active: true,
    }).eq('user_id', userId)
    if (profErr) return json({ error: profErr.message }, 500)

    const { data: link, error: linkErr } = await service.auth.admin.generateLink({
      type: 'magiclink', email,
      options: body.redirect_to ? { redirectTo: body.redirect_to } : undefined,
    })
    if (linkErr || !link.properties?.action_link) return json({ error: linkErr?.message ?? 'Lien impossible à générer' }, 500)

    await service.from('audit_logs').insert({
      actor_user_id: me.user.id,
      subject_user_id: userId,
      action: 'USER_INVITED',
      entity: 'profiles',
      entity_id: userId,
      payload: { email, role, sector_codes: sectors, operator_code: body.operator_code ?? null },
    })

    return json({ user_id: userId, email, action_link: link.properties.action_link })
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Erreur serveur' }, 500)
  }
})
