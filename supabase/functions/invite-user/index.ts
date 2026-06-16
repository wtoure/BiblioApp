// ════════════════════════════════════════════════════════════════
// Edge Function : invite-user
// Rôle : un ADMIN d'un espace provisionne le compte d'authentification
//        d'un membre (création + email d'invitation) puis lie ce compte
//        à la ligne `users` correspondante (colonne auth_id).
//
// Sécurité :
//   • Utilise la clé service_role (injectée par Supabase, JAMAIS commitée).
//   • Vérifie que l'appelant est bien admin de l'espace avant d'agir.
//
// Déploiement :  supabase functions deploy invite-user
// Appel (client) : supabase.functions.invoke('invite-user', { body })
// ════════════════════════════════════════════════════════════════
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(status: number, obj: unknown): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json(405, { error: 'Méthode non autorisée.' })

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
    const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    // 1. Identité de l'appelant (JWT transmis par supabase.functions.invoke)
    const jwt = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '')
    if (!jwt) return json(401, { error: 'Non authentifié.' })
    const { data: caller, error: cErr } = await admin.auth.getUser(jwt)
    if (cErr || !caller?.user) return json(401, { error: 'Session invalide.' })

    // 2. Entrée
    const body = await req.json().catch(() => ({}))
    const space_code = String(body.space_code ?? '').trim()
    const userId = body.user_id
    const email = String(body.email ?? '').trim().toLowerCase()
    const redirectTo = String(body.redirect_to ?? '').trim() || undefined
    if (!space_code || userId === undefined || userId === null || !email)
      return json(400, { error: 'Paramètres manquants (space_code, user_id, email).' })
    if (!EMAIL_RE.test(email)) return json(400, { error: 'Email invalide.' })

    // 3. Autorisation : l'appelant doit être admin actif de l'espace
    const { data: adminRow } = await admin
      .from('users')
      .select('id, role, disabled')
      .eq('auth_id', caller.user.id)
      .eq('space_code', space_code)
      .maybeSingle()
    if (!adminRow || adminRow.role !== 'admin' || adminRow.disabled)
      return json(403, { error: "Réservé à un administrateur de l'espace." })

    // 4. Ligne cible à rattacher
    const { data: target, error: tErr } = await admin
      .from('users')
      .select('id, space_code, auth_id')
      .eq('id', userId)
      .eq('space_code', space_code)
      .maybeSingle()
    if (tErr || !target) return json(404, { error: 'Compte cible introuvable.' })

    // 5. Inviter : crée le compte auth + envoie l'email d'invitation
    const meta = { space_code, app_user_id: target.id }
    const { data: inv, error: invErr } = await admin.auth.admin.inviteUserByEmail(email, {
      data: meta,
      redirectTo,
    })

    if (!invErr && inv?.user) {
      await admin
        .from('users')
        .update({ auth_id: inv.user.id, email })
        .eq('id', target.id)
        .eq('space_code', space_code)
      return json(200, { ok: true, invited: true, auth_id: inv.user.id })
    }

    // 6. L'email possède déjà un compte auth → on relie la ligne et on
    //    signale au client de déclencher une réinitialisation de mot de passe.
    const msg = (invErr?.message || '').toLowerCase()
    const status = (invErr as { status?: number } | null)?.status
    if (msg.includes('already') || msg.includes('exist') || status === 422) {
      const { data: link, error: lErr } = await admin.auth.admin.generateLink({
        type: 'recovery',
        email,
        options: { redirectTo },
      })
      if (lErr || !link?.user)
        return json(409, { error: 'Email déjà utilisé ; liaison impossible : ' + (lErr?.message || '') })
      await admin
        .from('users')
        .update({ auth_id: link.user.id, email })
        .eq('id', target.id)
        .eq('space_code', space_code)
      return json(200, { ok: true, invited: false, alreadyExisted: true, auth_id: link.user.id })
    }

    return json(500, { error: invErr?.message || "Échec de l'invitation." })
  } catch (e) {
    return json(500, { error: (e as Error).message })
  }
})
