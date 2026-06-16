import type { User } from './types'

export interface Capability {
  icon: string
  title: string
  desc: string
}

/**
 * Capacités de l'utilisateur selon son rôle — porté de `_userCapabilities`
 * (app.js desktop). Sert au Guide d'utilisation personnalisé.
 */
export function userCapabilities(u: User): Capability[] {
  const caps: Capability[] = [
    { icon: '📚', title: 'Consulter le catalogue', desc: 'Rechercher et parcourir les livres.' },
  ]
  const tabs = u.tabs ?? []

  if (u.role === 'admin') {
    caps.push(
      { icon: '📖', title: 'Gérer le catalogue', desc: 'Ajouter, modifier et retirer des livres.' },
      { icon: '🤝', title: 'Gérer les emprunts', desc: "Valider les demandes d'emprunt et les retours." },
      { icon: '📋', title: 'Traiter les demandes', desc: 'Approuver ou rejeter les propositions de livres.' },
      { icon: '👥', title: 'Gérer les membres', desc: 'Créer, modifier et désactiver les comptes.' },
      { icon: '✍️', title: 'Valider les inscriptions', desc: "Approuver les nouvelles demandes d'inscription." },
      { icon: '📚', title: 'Gérer les étagères', desc: 'Affecter les gestionnaires et suivre les vérifications.' },
      { icon: '📊', title: 'Voir les statistiques', desc: 'Tableau de bord et suivi.' },
      { icon: '🎨', title: "Personnaliser l'application", desc: 'Logo, thème et paramètres généraux.' },
    )
    return caps
  }

  if (u.role === 'resident') {
    caps.push(
      { icon: '🤝', title: 'Emprunter des livres', desc: 'Emprunter directement, sans validation préalable.' },
      { icon: '📝', title: 'Proposer des livres', desc: 'Suggérer de nouveaux ouvrages pour la bibliothèque.' },
    )
  } else if (u.role === 'commission') {
    caps.push(
      { icon: '📋', title: 'Traiter les demandes', desc: 'Approuver ou rejeter les propositions de livres.' },
      { icon: '📝', title: 'Proposer des livres', desc: 'Suggérer de nouveaux ouvrages.' },
    )
  } else if (u.role === 'enrol') {
    caps.push({ icon: '📖', title: 'Enrichir le catalogue', desc: 'Ajouter et modifier des fiches de livres.' })
  } else {
    // member
    if (u.canPropose !== false)
      caps.push({ icon: '📝', title: 'Proposer des livres', desc: 'Suggérer de nouveaux ouvrages à la bibliothèque.' })
    if (u.canLoan)
      caps.push({ icon: '🤝', title: 'Emprunter des livres', desc: 'Vous êtes autorisé à emprunter des ouvrages.' })
  }

  // Onglets admin délégués
  if (tabs.includes('loans_validator'))
    caps.push({ icon: '🤝', title: 'Valider les emprunts', desc: "Gérer les demandes d'emprunt et les retours." })
  if (tabs.includes('members'))
    caps.push({ icon: '👥', title: 'Gérer les membres', desc: 'Consulter et gérer les comptes membres.' })
  if (tabs.includes('stats'))
    caps.push({ icon: '📊', title: 'Voir les statistiques', desc: 'Accéder au tableau de bord.' })
  if (tabs.includes('shelf_mgr'))
    caps.push({ icon: '📚', title: 'Vérifier les étagères', desc: 'Marquer comme vérifiées les étagères dont vous avez la charge.' })

  return caps
}

export const ROLE_LABEL: Record<string, string> = {
  admin: 'Administrateur',
  commission: 'Commission',
  enrol: 'Enrôleur',
  member: 'Membre',
  resident: 'Résident',
  validator: 'Validateur',
}
