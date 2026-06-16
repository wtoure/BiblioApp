import type { Role } from './types'

export interface NavItem {
  to: string
  label: string
  icon: string
}

/**
 * Destinations principales de la barre du bas selon le rôle.
 * Ordre = priorité ; on garde les 4 premières + un bouton "Plus".
 */
export function bottomNavItems(role: Role, tabs: string[] = []): NavItem[] {
  const has = (k: string) => role === 'admin' || tabs.includes(k)
  const items: NavItem[] = [{ to: '/catalogue', label: 'Catalogue', icon: '📚' }]

  if (role === 'commission' || role === 'admin' || role === 'resident')
    items.push({ to: '/demandes', label: 'Demandes', icon: '📋' })
  if (role === 'admin' || role === 'validator' || has('loans_validator'))
    items.push({ to: '/emprunts', label: 'Emprunts', icon: '📖' })
  if (role === 'admin') items.push({ to: '/admin', label: 'Admin', icon: '🛠️' })
  else if (has('members') || has('stats'))
    items.push({ to: '/admin', label: 'Gestion', icon: '⚙️' })
  if (role === 'enrol') items.push({ to: '/saisie', label: 'Saisie', icon: '📝' })
  if (role === 'commission') items.push({ to: '/stats', label: 'Stats', icon: '📊' })

  return items.slice(0, 4)
}

/**
 * Contrôle d'accès par route, fidèle aux gardes desktop
 * (showCom / showLoans / showAdm / showStat / showCA).
 * Les routes communes (catalogue, fiche, profil, guide) sont toujours permises.
 */
export function canAccess(path: string, role: Role, tabs: string[] = []): boolean {
  const has = (k: string) => role === 'admin' || tabs.includes(k)
  switch (path) {
    case '/demandes':
      return role === 'commission' || role === 'admin' || role === 'resident'
    case '/emprunts':
      return role === 'admin' || role === 'validator' || has('loans_validator')
    case '/admin':
      return role === 'admin' || has('members') || has('stats')
    case '/stats':
      return role === 'admin' || role === 'commission' || has('stats')
    case '/saisie':
      return role === 'enrol' || role === 'admin'
    case '/proposer':
      return ['member', 'resident', 'commission', 'admin'].includes(role)
    default:
      return true
  }
}
