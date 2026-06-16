#!/usr/bin/env node
/* ════════════════════════════════════════════════════════════════
   ComoéBiblio — Provisionnement initial des comptes d'authentification
   (Solution A). À exécuter UNE FOIS, en local, par le propriétaire.

   Pour chaque membre existant qui a un email valide et n'est pas encore
   lié à un compte auth, ce script :
     1. crée le compte auth + envoie l'email d'invitation,
     2. renseigne users.auth_id.

   Les membres SANS email sont listés en fin : l'admin devra saisir leur
   email dans l'app puis cliquer « Inviter » (Edge Function invite-user).

   Idempotent : relançable sans risque (saute les comptes déjà liés /
   les emails déjà enregistrés).

   ── Usage (PowerShell) ──────────────────────────────────────────
     $env:SB_SERVICE_KEY="<clé service_role du dashboard Supabase>"
     # optionnel : URL de redirection après invitation (page set-password)
     $env:SB_REDIRECT="https://comoebiblio.netlify.app/set-password"
     node provision-auth.js
   ════════════════════════════════════════════════════════════════ */

const SB_URL = 'https://ktknaajjtmhevsafrpjv.supabase.co'
const SERVICE_KEY = process.env.SB_SERVICE_KEY
const SPACE_ID = process.env.SB_SPACE || 'f9a0-60a0-5274'
const REDIRECT = process.env.SB_REDIRECT || 'https://comoebiblio.netlify.app/set-password'

if (!SERVICE_KEY) {
  console.error('❌ Variable SB_SERVICE_KEY manquante. Récupérez la clé service_role')
  console.error('   dans Supabase → Settings → API, puis :')
  console.error('   $env:SB_SERVICE_KEY="..." ; node provision-auth.js')
  process.exit(1)
}

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

async function main() {
  const { createClient } = await import('@supabase/supabase-js')
  const admin = createClient(SB_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data: users, error } = await admin
    .from('users')
    .select('id, abbrev, prenom, nom, role, email, auth_id, disabled')
    .eq('space_code', SPACE_ID)
  if (error) {
    console.error('❌ Lecture users échouée :', error.message)
    process.exit(1)
  }

  console.log(`\n📋 ${users.length} membre(s) dans l'espace ${SPACE_ID}\n`)

  const sansEmail = []
  let invited = 0
  let linked = 0
  let skipped = 0

  for (const u of users) {
    const label = `#${u.id} ${u.prenom} ${u.nom} (${u.abbrev})`
    const email = (u.email || '').trim().toLowerCase()

    if (u.auth_id) {
      console.log(`⏭️  ${label} — déjà lié`)
      skipped++
      continue
    }
    if (!email || !EMAIL_RE.test(email)) {
      console.log(`⚠️  ${label} — email manquant/invalide → à inviter depuis l'app`)
      sansEmail.push(label)
      continue
    }

    const { data: inv, error: invErr } = await admin.auth.admin.inviteUserByEmail(email, {
      data: { space_code: SPACE_ID, app_user_id: u.id },
      redirectTo: REDIRECT,
    })

    let authId = inv?.user?.id
    if (invErr) {
      // Email déjà présent dans auth → récupérer l'id via un lien de récupération
      const { data: link, error: lErr } = await admin.auth.admin.generateLink({
        type: 'recovery',
        email,
        options: { redirectTo: REDIRECT },
      })
      if (lErr || !link?.user) {
        console.log(`❌ ${label} — ${invErr.message}`)
        continue
      }
      authId = link.user.id
      console.log(`🔗 ${label} — compte auth existant, lien établi (réinit à faire)`)
      linked++
    } else {
      console.log(`✉️  ${label} — invitation envoyée à ${email}`)
      invited++
    }

    const { error: upErr } = await admin
      .from('users')
      .update({ auth_id: authId, email })
      .eq('id', u.id)
      .eq('space_code', SPACE_ID)
    if (upErr) console.log(`   ⚠️ liaison auth_id échouée : ${upErr.message}`)
  }

  console.log(`\n──────────────────────────────────────────`)
  console.log(`✉️  Invitations envoyées : ${invited}`)
  console.log(`🔗 Comptes reliés        : ${linked}`)
  console.log(`⏭️  Déjà liés (sautés)    : ${skipped}`)
  if (sansEmail.length) {
    console.log(`\n⚠️  ${sansEmail.length} membre(s) SANS email — à inviter depuis l'app après saisie de leur email :`)
    sansEmail.forEach((l) => console.log('   • ' + l))
  }
  console.log('')
}

main().catch((e) => {
  console.error('❌', e)
  process.exit(1)
})
