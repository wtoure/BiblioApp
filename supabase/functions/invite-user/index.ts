// ════════════════════════════════════════════════════════════════
// Edge Function : invite-user  (modèle Code + mot de passe)
// Rôle : un ADMIN d'un espace provisionne OU réinitialise le compte
//        d'authentification d'un membre. L'IDENTIFIANT de connexion est
//        le CODE du membre (abbrev), transformé en e-mail technique
//        `{code}.{space}@comoebiblio.app` côté Auth. La fonction GÉNÈRE
//        un mot de passe temporaire (sauf reset_password=false), l'applique
//        au compte auth (création ou mise à jour), lie le compte à la ligne
//        `users` (auth_id), puis RENVOIE ce mot de passe à l'admin.
//
//        Aucun e-mail réel n'est requis ni envoyé → indépendant du SMTP.
//        L'e-mail réel éventuel de la ligne `users` reste un simple contact.
//
// Entrée : { space_code, user_id, reset_password? }
//   • reset_password (défaut true) : régénère un mot de passe.
//   • reset_password=false : resynchronise seulement l'e-mail technique
//     (utile quand le CODE change) sans toucher au mot de passe existant.
//
// Sécurité :
//   • Clé service_role (injectée par Supabase, JAMAIS commitée).
//   • Vérifie que l'appelant est admin actif de l'espace avant d'agir.
//
// Déploiement :  supabase functions deploy invite-user
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

// E-mail technique déterministe dérivé du code + espace.
// Doit rester identique côté client (app.js _authEmail, v2 authEmail).
function codeToAuthEmail(code: string, space: string): string {
  const c = String(code || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '')
  const s = String(space || '').trim().toLowerCase()
  return `${c}.${s}@comoebiblio.app`
}

// Mot de passe temporaire lisible (10 caractères, sans I/l/O/0/1 ambigus).
function genPassword(): string {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'
  const arr = new Uint32Array(10)
  crypto.getRandomValues(arr)
  let p = ''
  for (let i = 0; i < 10; i++) p += chars[arr[i] % chars.length]
  return p
}

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
    const resetPassword = body.reset_password !== false // défaut true
    if (!space_code || userId === undefined || userId === null)
      return json(400, { error: 'Paramètres manquants (space_code, user_id).' })

    // 3. Autorisation : l'appelant doit être admin actif de l'espace
    const { data: adminRow } = await admin
      .from('users')
      .select('id, role, disabled')
      .eq('auth_id', caller.user.id)
      .eq('space_code', space_code)
      .maybeSingle()
    if (!adminRow || adminRow.role !== 'admin' || adminRow.disabled)
      return json(403, { error: "Réservé à un administrateur de l'espace." })

    // 4. Ligne cible — on lit le CODE (abbrev) qui devient l'identifiant
    const { data: target, error: tErr } = await admin
      .from('users')
      .select('id, space_code, auth_id, abbrev')
      .eq('id', userId)
      .eq('space_code', space_code)
      .maybeSingle()
    if (tErr || !target) return json(404, { error: 'Compte cible introuvable.' })
    if (!target.abbrev) return json(400, { error: 'Ce compte n’a pas de code (abbrev).' })

    const authEmail = codeToAuthEmail(target.abbrev, space_code)
    const meta = { space_code, app_user_id: target.id, code: target.abbrev }
    let authId: string | null = target.auth_id ?? null
    let created = false
    let password: string | null = null

    // 5. Créer le compte auth si nécessaire, sinon récupérer son id
    if (!authId) {
      password = genPassword()
      const { data: cr, error: crErr } = await admin.auth.admin.createUser({
        email: authEmail,
        password,
        email_confirm: true,
        user_metadata: meta,
      })
      if (!crErr && cr?.user) {
        authId = cr.user.id
        created = true
      } else {
        // E-mail technique déjà pris (compte orphelin) → le retrouver.
        const m = (crErr?.message || '').toLowerCase()
        if (m.includes('already') || m.includes('registered') || m.includes('exist')) {
          const { data: link } = await admin.auth.admin.generateLink({ type: 'recovery', email: authEmail })
          if (link?.user) authId = link.user.id
        }
        if (!authId) return json(500, { error: crErr?.message || 'Création du compte impossible.' })
      }
    }

    // 6. Mettre à jour le compte existant : e-mail technique (sync code) + mot de passe
    if (!created && authId) {
      const patch: { email: string; email_confirm: true; password?: string } = {
        email: authEmail,
        email_confirm: true,
      }
      if (resetPassword) {
        password = genPassword()
        patch.password = password
      }
      const { error: upErr } = await admin.auth.admin.updateUserById(authId, patch)
      if (upErr) return json(500, { error: upErr.message })
    }

    // 7. Lier la ligne users (auth_id). L'e-mail réel (contact) n'est pas modifié ici.
    await admin
      .from('users')
      .update({ auth_id: authId })
      .eq('id', target.id)
      .eq('space_code', space_code)

    return json(200, { ok: true, password, code: target.abbrev, created, auth_id: authId })
  } catch (e) {
    return json(500, { error: (e as Error).message })
  }
})
