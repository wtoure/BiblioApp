# PROGRESS — Migration mobile v2 (source de vérité)

> Ce fichier est la **mémoire** du travail autonome. À lire au début de chaque
> itération, à mettre à jour + committer à la fin de chaque tâche.
> Référence fonctionnelle : `../app.js` (desktop). Ne jamais modifier hors de `v2/`.

## Règles
- Une tâche à la fois, petit périmètre.
- `npm run build` DOIT passer avant tout commit.
- Commit + push après CHAQUE tâche cochée.
- Vérification = build qui passe + relecture du code. **Jamais** de test d'écriture contre la base de production.

---

## Phase 0 — Fondation
- [x] Projet Vite + React + TS + Tailwind, PWA, client Supabase
- [x] Auth par code (abbrev) + restauration de session
- [x] Shell : barre du bas (par rôle) + feuille « Plus » + en-tête
- [x] SectionPicker (`<select>` natif)

## Phase 1 — Catalogue
- [x] Liste paginée (1800+ livres), recherche, filtre Académique/Spirituel
- [x] Fiche livre `/livre/:id`
- [x] Vue publique `/book/:code` (sans connexion)
- [x] Filtres avancés (langue, salle, nouveautés) — cf. catalogue desktop
- [ ] Pagination/scroll infini si lenteur sur 1800+ items

## Phase 2 — Profil & rôles
- [x] Page « Mon profil » (infos, photo, déconnexion) — lecture seule ; édition (écriture) à faire avec relecture
- [x] Guide d'utilisation (capacités personnalisées par rôle, porté de _userCapabilities)
- [x] Gardes fines par rôle sur chaque route (canAccess + composant Access, fidèle à showCom/showLoans/showAdm/showStat/showCA)
- [x] Réalignement de la barre du bas et du menu « Plus » selon le rôle exact (bottomNavItems mirroir de bNav)

## Phase 3 — Demandes (commission/membre/résident)
- [x] Liste des demandes + filtres par statut + stats
- [ ] Créer une demande (membre) — à compléter (les membres n'atteignent pas /demandes ; flux depuis catalogue à porter)
- [x] Sessions de demandes (liste lecture : statut, motif, compteur)
- [x] Validation/rejet (commission) — ÉCRITURE LIVE (changeStatus → book_requests) — À RELIRE avant prod
- [ ] Suppression de session (cf. `delSess`) — à compléter (écriture, à relire)

## Phase 4 — Emprunts
- [ ] Demande d'emprunt (résident/membre autorisé) — à compléter (flux côté emprunteur)
- [x] Validation / retour / rejet (validator/admin) — ÉCRITURE LIVE (setStatus → loans) — À RELIRE
- [x] Statuts de prêt (onglets À valider / En cours / Retours / Historique)

## Phase 5 — Admin
- [x] Utilisateurs (liste, recherche, activer/désactiver — ÉCRITURE LIVE à relire). Dernière connexion : à ajouter.
- [x] Inscriptions publiques (liste lecture). Validation → création de compte : à compléter (counters/abbrev) & relire.
- [x] Statistiques (livres, membres, emprunts, demandes) — page /stats (commission) + section admin
- [ ] Étagères / vérifications — à faire
- [ ] Paramètres de l'espace (contact, catAccess, etc.) — à faire

## Phase 6 — Parité & corrections
- [x] Revue d'ensemble vs `app.js` — voir « Écarts connus » ci-dessous
- [x] Liste des écarts connus documentée
- [ ] Vérifs responsive sur appareils réels (à faire par l'utilisateur)

### Écarts connus (v2 vs desktop) — à compléter / relire
- **Lecture : complète** sur catalogue, fiche, demandes, sessions, emprunts, utilisateurs, inscriptions, stats.
- **Écritures de validation : implémentées (LIVE, à relire)** : valider/rejeter une demande, valider/retourner/rejeter un emprunt, activer/désactiver un utilisateur.
- **Flux de création/édition NON portés (à faire) :**
  - Créer une demande (membre) + ouvrir/fermer/supprimer une session (counters nxR/nxS)
  - Demander un emprunt (emprunteur) + gestion des compteurs nxL
  - Valider une inscription → création de compte (abbrev + counters nxU)
  - Éditer son profil (écriture users)
  - « Saisie » enrôleur : ajout/édition/import de livres (counters nxB)
  - Étagères / vérifications, paramètres d'espace (catAccess, contact…)
  - Realtime (Supabase) non branché — la v2 rafraîchit via TanStack Query (staleTime)
- **Compteurs** : la logique nxB/nxU/nxR/nxS/nxL (space_counters) doit être portée avant d'activer les créations.

## Phase 7 — Finalisation
- [x] README v2 à jour (état + déploiement Vercel)
- [x] Commit récapitulatif
- [ ] « MIGRATION v2 COMPLÈTE » — PAS ENCORE : lecture + validations OK ; création/édition à finir et relire avant bascule

---

### Journal (dernière action)
- 2026-06-16 — Migration menée jusqu'à Phase 5 + bilan Phase 6/7 en un seul passage (à la demande de l'utilisateur).
  Faites : catalogue+filtres, fiche, vue publique, profil(lecture), guide, gardes rôle, demandes (liste/validation),
  emprunts (liste/validation/retour), admin (users toggle, inscriptions lecture, stats).
  RESTE (création/édition + compteurs + realtime) — voir « Écarts connus ». NE PAS marquer COMPLÈTE.
  Prochaine itération logique : porter les compteurs (space_counters) puis les flux de création.
