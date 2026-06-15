export const DEFAULT_SPACE = 'f9a0-60a0-5274'

/**
 * Résout le code de l'espace (bibliothèque) depuis l'URL.
 *   /                 → DEFAULT_SPACE
 *   /:code            → code
 *   /book/:code       → code (vue publique)
 * Replié sur DEFAULT_SPACE en local ou si absent.
 */
export function resolveSpaceId(pathname: string = window.location.pathname): string {
  const parts = pathname.split('/').filter(Boolean)
  if (parts.length === 0) return DEFAULT_SPACE
  if (parts[0] === 'book') return parts[1] ? decodeURIComponent(parts[1]).toLowerCase() : DEFAULT_SPACE
  return decodeURIComponent(parts[0]).toLowerCase()
}

export const SPACE_ID = resolveSpaceId()
