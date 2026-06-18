export const DEFAULT_SPACE = 'f9a0-60a0-5274'

/**
 * Segments de route INTERNES à l'app (pas des codes d'espace).
 * Sans cette liste, un rafraîchissement sur /login, /catalogue, etc. ferait
 * croire que « login »/« catalogue » est le code de l'espace → requêtes vides
 * (« Code de connexion inconnu »). L'app authentifiée est mono-espace
 * (DEFAULT_SPACE) ; seule la vue publique /book/:code porte un code explicite,
 * et elle le lit via useParams (indépendamment de SPACE_ID).
 */
const APP_ROUTES = new Set([
  'login',
  'catalogue',
  'livre',
  'demandes',
  'emprunts',
  'admin',
  'stats',
  'saisie',
  'profil',
  'guide',
  'installer',
  'proposer',
])

const STORAGE_KEY = 'cb_space'

/** Bibliothèque mémorisée (choisie par l'utilisateur ou héritée d'un lien). */
export function getStoredSpace(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
}
export function setStoredSpace(code: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, code.trim().toLowerCase())
  } catch {
    /* localStorage indisponible — ignoré */
  }
}
export function clearStoredSpace(): void {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    /* ignoré */
  }
}

/** Code d'espace explicitement présent dans l'URL (sinon null). */
export function explicitUrlSpace(pathname: string = window.location.pathname): string | null {
  const parts = pathname.split('/').filter(Boolean)
  if (parts[0] === 'book') return parts[1] ? decodeURIComponent(parts[1]).toLowerCase() : null
  if (parts.length > 0 && !APP_ROUTES.has(parts[0].toLowerCase()))
    return decodeURIComponent(parts[0]).toLowerCase()
  return null
}

/**
 * Résout le code de l'espace (bibliothèque) :
 *   /book/:code  ou  /:code  → code explicite (et mémorisé)
 *   /login, /catalogue, /, … → bibliothèque mémorisée, sinon DEFAULT_SPACE
 * Permet de gérer plusieurs bibliothèques : la dernière choisie/visitée est
 * conservée pour les visites suivantes (multi-espaces).
 */
export function resolveSpaceId(pathname: string = window.location.pathname): string {
  const explicit = explicitUrlSpace(pathname)
  if (explicit) return explicit
  return getStoredSpace() || DEFAULT_SPACE
}

// Si l'URL porte un code explicite, on le mémorise pour les prochaines visites.
const _explicit = explicitUrlSpace()
if (_explicit) setStoredSpace(_explicit)

export const SPACE_ID = resolveSpaceId()

/**
 * Identifiant de connexion = CODE (abbrev) transformé en e-mail technique
 * déterministe pour Supabase Auth. DOIT rester identique côté Edge Functions
 * (invite-user / sa-set-admin) et desktop (app.js _authEmail).
 */
export function authEmail(code: string, space: string = SPACE_ID): string {
  const c = String(code || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '')
  const s = String(space || '').trim().toLowerCase()
  return `${c}.${s}@comoebiblio.app`
}
