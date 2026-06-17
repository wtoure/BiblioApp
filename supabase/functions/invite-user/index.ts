// ════════════════════════════════════════════════════════════════
// Edge Function : invite-user  (mode Option B — sans e-mail)
// Rôle : un ADMIN d'un espace provisionne OU réinitialise le compte
//        d'authentification d'un membre. La fonction GÉNÈRE un mot de
//        passe temporaire, l'applique au compte auth (création ou mise à
//        jour), lie le compte à la ligne `users` (auth_id), puis RENVOIE
//        ce mot de passe à l'admin (à communiquer par WhatsApp).
//
//        Aucun e-mail n'est envoyé → indépendant du SMTP (cf. Option B).
//
// Sécurité :
//   • Clé service_role (injectée par Supabase, JAMAIS commitée).
//   • Vérifie que l'appelant est admin actif de l'espace avant d'agir.
//
// Déploiement :  supabase functions deploy invite-user
//                (ou Dashboard → Edge Functions → invite-user → coller → Deploy)
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
    const email = String(body.email ?? '').trim().toLowerCase()
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

    // 5. Générer le mot de passe temporaire + appliquer au compte auth
    const password = genPassword()
    const meta = { space_code, app_user_id: target.id }
    let authId: string | null = target.auth_id ?? null
    let created = false

    if (!authId) {
      // Tenter une création directe (e-mail confirmé → connexion immédiate).
      const { data: cr, error: crErr } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: meta,
      })
      if (!crErr && cr?.user) {
        authId = cr.user.id
        created = true
      } else {
        // Compte déjà existant pour cet e-mail → récupérer son id.
        const m = (crErr?.message || '').toLowerCase()
        if (m.includes('already') || m.includes('registered') || m.includes('exist')) {
          const { data: link } = await admin.auth.admin.generateLink({ type: 'recovery', email })
          if (link?.user) authId = link.user.id
        }
        if (!authId) return json(500, { error: crErr?.message || 'Création du compte impossible.' })
      }
    }

    if (!created && authId) {
      // Compte existant → définir le nouveau mot de passe temporaire.
      const { error: upErr } = await admin.auth.admin.updateUserById(authId, {
        password,
        email_confirm: true,
      })
      if (upErr) return json(500, { error: upErr.message })
    }

    // 6. Lier la ligne users (auth_id + email)
    await admin
      .from('users')
      .update({ auth_id: authId, email })
      .eq('id', target.id)
      .eq('space_code', space_code)

    return json(200, { ok: true, password, email, created, auth_id: authId })
  } catch (e) {
    return json(500, { error: (e as Error).message })
  }
})
