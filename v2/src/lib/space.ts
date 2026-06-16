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

/**
 * Résout le code de l'espace (bibliothèque) depuis l'URL.
 *   /                       → DEFAULT_SPACE
 *   /login, /catalogue, …   → DEFAULT_SPACE (routes internes de l'app)
 *   /book/:code             → code (vue publique)
 * Replié sur DEFAULT_SPACE en local ou si absent.
 */
export function resolveSpaceId(pathname: string = window.location.pathname): string {
  const parts = pathname.split('/').filter(Boolean)
  if (parts.length === 0) return DEFAULT_SPACE
  if (parts[0] === 'book') return parts[1] ? decodeURIComponent(parts[1]).toLowerCase() : DEFAULT_SPACE
  if (APP_ROUTES.has(parts[0].toLowerCase())) return DEFAULT_SPACE
  return decodeURIComponent(parts[0]).toLowerCase()
}

export const SPACE_ID = resolveSpaceId()
