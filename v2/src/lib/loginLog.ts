import { supabase } from './supabase'
import { SPACE_ID } from './space'
import { nextId } from './counters'
import type { User } from './types'

/** Détection simple de l'appareil à partir du user-agent. */
function detectDevice(): string {
  const ua = navigator.userAgent
  if (/iPad|Tablet/i.test(ua)) return '📱 Tablette'
  if (/Mobi|Android|iPhone/i.test(ua)) return '📱 Mobile'
  return '💻 Ordinateur'
}

/** Détection simple du navigateur à partir du user-agent. */
function detectBrowser(): string {
  const ua = navigator.userAgent
  if (/Edg\//.test(ua)) return 'Edge'
  if (/OPR\/|Opera/.test(ua)) return 'Opera'
  if (/Chrome\//.test(ua) && !/Edg\//.test(ua)) return 'Chrome'
  if (/Firefox\//.test(ua)) return 'Firefox'
  if (/Safari\//.test(ua) && !/Chrome\//.test(ua)) return 'Safari'
  return 'Autre'
}

/**
 * Journalise une connexion dans `login_logs` (miroir du log desktop, app.js).
 * Best-effort : une erreur n'empêche jamais la connexion (échec silencieux).
 */
export async function logLogin(user: User): Promise<void> {
  try {
    const id = await nextId('nxL')
    const now = new Date()
    const entry = {
      id,
      space_code: SPACE_ID,
      userId: user.id,
      abbrev: user.abbrev,
      name: `${user.prenom} ${user.nom}`,
      role: user.role,
      date: now.toLocaleDateString('fr-FR'),
      time: now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
      device: detectDevice(),
      browser: detectBrowser(),
    }
    await supabase.from('login_logs').insert(entry)
  } catch {
    // Journalisation non bloquante — on ignore les erreurs.
  }
}
