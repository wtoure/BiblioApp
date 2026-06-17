// ════════════════════════════════════════════════════════════════
// Edge Function : sa-set-admin
// Rôle : depuis la page SUPER-ADMIN (admin.html), définir/réinitialiser le
//        mot de passe de connexion d'un administrateur de bibliothèque.
//        Fonctionne pour un compte auth EXISTANT comme NOUVEAU (contrairement
//        à signUp qui ne peut pas changer le mot de passe d'un compte existant).
//
// Autorisation : le mot de passe maître super-admin est transmis et vérifié
//        (SHA-256) contre super_admin_config.pwdHash. La clé service_role
//        (injectée par Supabase) n'est jamais exposée au client.
//
// Déploiement : supabase functions deploy sa-set-admin
//        (ou Dashboard → Edge Functions → New function → coller → Deploy)
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
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

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
    const email = String(body.email ?? '').trim().toLowerCase()
    const password = String(body.password ?? '')
    if (!saPassword || !space_code || !email || !password)
      return json(400, { error: 'Paramètres manquants (sa_password, space_code, email, password).' })
    if (!EMAIL_RE.test(email)) return json(400, { error: 'Email invalide.' })
    if (password.length < 8) return json(400, { error: 'Mot de passe : 8 caractères minimum.' })

    // 1. Autorisation : vérifier le mot de passe maître super-admin
    const { data: saCfg } = await admin
      .from('super_admin_config')
      .select('pwdHash')
      .eq('id', 1)
      .maybeSingle()
    if (!saCfg?.pwdHash) return json(403, { error: 'Super-admin non configuré.' })
    if ((await sha256Hex(saPassword)) !== saCfg.pwdHash)
      return json(403, { error: 'Mot de passe super-admin invalide.' })

    // 2. Créer ou mettre à jour le compte auth (mot de passe + e-mail confirmé)
    let authId: string | null = null
    let created = false
    const { data: cr, error: crErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    })
    if (!crErr && cr?.user) {
      authId = cr.user.id
      created = true
    } else {
      const m = (crErr?.message || '').toLowerCase()
      if (m.includes('already') || m.includes('registered') || m.includes('exist')) {
        const { data: link } = await admin.auth.admin.generateLink({ type: 'recovery', email })
        if (link?.user) {
          authId = link.user.id
          const { error: upErr } = await admin.auth.admin.updateUserById(authId, {
            password,
            email_confirm: true,
          })
          if (upErr) return json(500, { error: upErr.message })
        }
      }
      if (!authId) return json(500, { error: crErr?.message || 'Création du compte impossible.' })
    }

    // 3. Lier la ligne users de l'admin (par e-mail dans l'espace, sinon id=1)
    const { data: linked } = await admin
      .from('users')
      .update({ auth_id: authId, email })
      .eq('space_code', space_code)
      .eq('email', email)
      .select('id')
    if (!linked || linked.length === 0) {
      await admin
        .from('users')
        .update({ auth_id: authId, email })
        .eq('space_code', space_code)
        .eq('id', 1)
    }

    return json(200, { ok: true, created })
  } catch (e) {
    return json(500, { error: (e as Error).message })
  }
})
