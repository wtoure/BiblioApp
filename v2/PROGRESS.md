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
- [ ] Guide d'utilisation
- [ ] Gardes fines par rôle sur chaque route (member/resident/enrol/validator/commission/admin)
- [ ] Réalignement de la barre du bas et du menu « Plus » selon le rôle exact (cf. `bNav`/`bBottomNav`)

## Phase 3 — Demandes (commission/membre/résident)
- [ ] Liste des demandes + filtres par statut
- [ ] Créer une demande (membre) — logique `app.js`
- [ ] Sessions de demandes (ouverture/fermeture/historique)
- [ ] Validation/rejet (commission) — écritures : implémenter, NE PAS tester contre prod
- [ ] Suppression de session (cf. `delSess`)

## Phase 4 — Emprunts
- [ ] Demande d'emprunt (résident/membre autorisé)
- [ ] Validation / retour / rejet (validator/admin)
- [ ] Statuts de prêt (pending/active/pending_return/returned/rejected)

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
- 2026-06-16 — Page « Mon profil » (lecture seule : avatar/photoB64, infos whatsapp/commune/profession/email, déconnexion). Colonnes users vérifiées (photoB64, pas d'anneeArrivee). Build OK. Prochaine : Phase 2 — Guide d'utilisation.
