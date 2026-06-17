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
 * Function `invite-user` (service_role). Option B : aucun e-mail n'est
 * envoyé — la fonction renvoie un mot de passe temporaire que l'admin
 * communique au membre (par WhatsApp). L'appelant doit être admin (vérifié
 * côté fonction).
 */
export async function inviteMember(userId: number, email: string): Promise<InviteResult> {
  const trimmed = email.trim().toLowerCase()
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(trimmed)) {
    return { ok: false, error: 'E-mail invalide.' }
  }

  const { data, error } = await supabase.functions.invoke('invite-user', {
    body: { space_code: SPACE_ID, user_id: userId, email: trimmed },
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
