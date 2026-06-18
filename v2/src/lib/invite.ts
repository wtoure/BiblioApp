import { supabase } from './supabase'
import { SPACE_ID } from './space'

export interface InviteResult {
  ok: boolean
  /** Mot de passe temporaire généré (à communiquer au membre par WhatsApp). */
  password?: string
  /** true si le compte auth vient d'être créé, false si réinitialisé. */
  created?: boolean
  error?: string
}

/**
 * Crée l'accès d'un membre OU réinitialise son mot de passe via l'Edge
 * Function `invite-user` (service_role). L'identifiant de connexion est le
 * CODE du membre (résolu côté fonction). Aucun e-mail n'est requis ni
 * envoyé — la fonction renvoie un mot de passe temporaire que l'admin
 * communique au membre (par WhatsApp). L'appelant doit être admin (vérifié
 * côté fonction).
 *
 * @param resetPassword `false` resynchronise seulement l'e-mail technique
 *   (sans changer le mot de passe) — utilisé quand le code change.
 */
export async function inviteMember(userId: number, resetPassword = true): Promise<InviteResult> {
  const { data, error } = await supabase.functions.invoke('invite-user', {
    body: { space_code: SPACE_ID, user_id: userId, reset_password: resetPassword },
  })

  if (error) {
    // FunctionsHttpError : le corps JSON d'erreur est dans context (une Response).
    let msg = error.message
    const ctx = (error as { context?: unknown }).context
    if (ctx instanceof Response) {
      try {
        const body = await ctx.clone().json()
        if (body?.error) msg = body.error
      } catch {
        /* corps non-JSON — on garde error.message */
      }
    }
    return { ok: false, error: msg }
  }
  if (data?.error) return { ok: false, error: data.error }

  return { ok: true, password: data?.password, created: !!data?.created }
}
