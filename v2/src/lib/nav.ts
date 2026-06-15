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
