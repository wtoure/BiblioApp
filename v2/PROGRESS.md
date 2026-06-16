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
- [ ] Utilisateurs (liste, dernière connexion, activer/désactiver)
- [ ] Inscriptions publiques (validation → création de compte)
- [ ] Statistiques
- [ ] Étagères / vérifications
- [ ] Paramètres de l'espace (contact, catAccess, etc.)

## Phase 6 — Parité & corrections
- [ ] Revue section par section vs `app.js` (rôles, filtres, statuts, compteurs)
- [ ] Liste des écarts connus + correction
- [ ] Vérifs responsive (320 / 375 / 768) + zones de sécurité

## Phase 7 — Finalisation
- [ ] README v2 à jour, instructions de déploiement Vercel vérifiées
- [ ] Commit récapitulatif final
- [ ] Écrire « MIGRATION v2 COMPLÈTE » ci-dessous et arrêter la boucle

---

### Journal (dernière action)
- 2026-06-16 — PHASE 2 TERMINÉE : Guide personnalisé (capabilities.ts) + gardes par rôle (canAccess + composant Access sur /demandes /emprunts /admin /stats /saisie). Build OK. Prochaine : PHASE 3 — Demandes (lire app.js : rComT, sessions, opProp/clProp, chgSt, delRq, delSess). Écritures → coder mais marquer « à relire ».
