import { supabase } from './supabase'
import { SPACE_ID } from './space'

export interface InviteResult {
  ok: boolean
  invited?: boolean
  alreadyExisted?: boolean
  error?: string
}

/**
 * Invite (ou relie) le compte d'authentification d'un membre via l'Edge
 * Function `invite-user` (service_role, côté serveur). L'appelant doit être
 * admin de l'espace — vérifié côté fonction.
 *
 * Si le compte auth existe déjà, on déclenche en complément un email de
 * réinitialisation de mot de passe pour que le membre puisse (re)définir
 * son accès.
 */
export async function inviteMember(userId: number, email: string): Promise<InviteResult> {
  const trimmed = email.trim().toLowerCase()
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(trimmed)) {
    return { ok: false, error: 'E-mail invalide.' }
  }

  const { data, error } = await supabase.functions.invoke('invite-user', {
    body: {
      space_code: SPACE_ID,
      user_id: userId,
      email: trimmed,
      redirect_to: window.location.origin + '/set-password',
    },
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

  // Compte préexistant : envoyer aussi un email de réinitialisation.
  if (data?.alreadyExisted) {
    await supabase.auth.resetPasswordForEmail(trimmed, {
      redirectTo: window.location.origin + '/set-password',
    })
  }

  return { ok: true, invited: !!data?.invited, alreadyExisted: !!data?.alreadyExisted }
}
