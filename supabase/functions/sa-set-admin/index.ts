// ════════════════════════════════════════════════════════════════
// Edge Function : sa-set-admin  (modèle Code + mot de passe)
// Rôle : depuis la page SUPER-ADMIN (admin.html), définir/réinitialiser le
//        CODE et/ou le mot de passe de connexion de l'administrateur d'une
//        bibliothèque. L'identifiant de connexion est le CODE (abbrev),
//        transformé en e-mail technique `{code}.{space}@comoebiblio.app`.
//
//        Fonctionne pour un compte auth EXISTANT comme NOUVEAU.
//
// Entrée : { sa_password, space_code, code, password? }
//   • code     : nouveau code de connexion de l'admin (abbrev).
//   • password : optionnel. Si fourni → (re)définit le mot de passe.
//                Si absent et le compte existe → resynchronise seulement
//                l'e-mail technique (utile quand le code change).
//                Si absent et le compte n'existe pas → erreur (mot de passe
//                requis pour créer l'accès).
//
// Autorisation : le mot de passe maître super-admin est transmis et vérifié
//        (SHA-256) contre super_admin_config.pwdHash.
//
// Déploiement : supabase functions deploy sa-set-admin
// ════════════════════════════════════════════════════════════════
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
function json(status: number, obj: unknown): Response {
  return new Response(JSON.stringify(obj), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })
}

// E-mail technique déterministe (identique côté invite-user et clients).
function codeToAuthEmail(code: string, space: string): string {
  const c = String(code || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '')
  const s = String(space || '').trim().toLowerCase()
  return `${c}.${s}@comoebiblio.app`
}

async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('')
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

    const body = await req.json().catch(() => ({}))
    const saPassword = String(body.sa_password ?? '')
    const space_code = String(body.space_code ?? '').trim()
    const code = String(body.code ?? '').trim().toLowerCase().replace(/[^a-z0-9]/g, '')
    const password = String(body.password ?? '')
    if (!saPassword || !space_code || !code)
      return json(400, { error: 'Paramètres manquants (sa_password, space_code, code).' })
    if (password && password.length < 8)
      return json(400, { error: 'Mot de passe : 8 caractères minimum.' })

    // 1. Autorisation : vérifier le mot de passe maître super-admin
    const { data: saCfg } = await admin
      .from('super_admin_config')
      .select('pwdHash')
      .eq('id', 1)
      .maybeSingle()
    if (!saCfg?.pwdHash) return json(403, { error: 'Super-admin non configuré.' })
    if ((await sha256Hex(saPassword)) !== saCfg.pwdHash)
      return json(403, { error: 'Mot de passe super-admin invalide.' })

    const authEmail = codeToAuthEmail(code, space_code)

    // 2. Récupérer/relier la ligne admin (id=1) et son auth_id éventuel
    const { data: adminRow } = await admin
      .from('users')
      .select('id, auth_id')
      .eq('space_code', space_code)
      .eq('id', 1)
      .maybeSingle()
    let authId: string | null = adminRow?.auth_id ?? null
    let created = false

    // 3. Créer / mettre à jour le compte auth (e-mail technique = code)
    if (!authId) {
      if (!password)
        return json(400, { error: 'Mot de passe requis pour créer l’accès de cet admin.' })
      const { data: cr, error: crErr } = await admin.auth.admin.createUser({
        email: authEmail,
        password,
        email_confirm: true,
        user_metadata: { space_code, code },
      })
      if (!crErr && cr?.user) {
        authId = cr.user.id
        created = true
      } else {
        const m = (crErr?.message || '').toLowerCase()
        if (m.includes('already') || m.includes('registered') || m.includes('exist')) {
          const { data: link } = await admin.auth.admin.generateLink({ type: 'recovery', email: authEmail })
          if (link?.user) authId = link.user.id
        }
        if (!authId) return json(500, { error: crErr?.message || 'Création du compte impossible.' })
      }
    }

    if (!created && authId) {
      const patch: { email: string; email_confirm: true; password?: string } = {
        email: authEmail,
        email_confirm: true,
      }
      if (password) patch.password = password
      const { error: upErr } = await admin.auth.admin.updateUserById(authId, patch)
      if (upErr) return json(500, { error: upErr.message })
    }

    // 4. Mettre à jour la ligne admin : code (abbrev) + auth_id
    await admin
      .from('users')
      .update({ abbrev: code, auth_id: authId })
      .eq('space_code', space_code)
      .eq('id', 1)

    return json(200, { ok: true, created, code })
  } catch (e) {
    return json(500, { error: (e as Error).message })
  }
})
