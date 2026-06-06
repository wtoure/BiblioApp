# ComoéBiblio — Contexte projet pour Claude

## Vue d'ensemble

Application web **SPA vanilla JS** de gestion de bibliothèque pour le Centre Culturel Comoé (Côte d'Ivoire).
- **Pas de build system** — HTML + CSS + JS bruts, servis statiquement
- **Backend : Supabase** (PostgreSQL + Realtime) — migré depuis Firebase Firestore en juin 2026
- **Hébergement : Netlify** — routing SPA via `_redirects`
- **Auteur** : wtoure (tourewilfried1@gmail.com / tourefantoma@gmail.com)

---

## Fichiers

| Fichier | Rôle |
|---------|------|
| `index.html` | Point d'entrée unique — toute l'UI est dans ce fichier |
| `app.js` | Logique complète (~6 300 lignes) — données, rendu, routing, API |
| `style.css` | Styles |
| `admin.html` | Page super-admin séparée (sans Firebase/Supabase) |
| `_redirects` | Routing SPA Netlify : `/* /index.html 200` |
| `migrate-firebase-to-supabase.js` | Script de migration des données Firebase → Supabase (Node.js) |

---

## Supabase

```
URL  : https://ktknaajjtmhevsafrpjv.supabase.co
KEY  : eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt0a25hYWpqdG1oZXZzYWZycGp2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA3NjQzMTMsImV4cCI6MjA5NjM0MDMxM30.-g5AA1lnvMYEOp9HrHayTant_FXKhJRoW65oX9JOwJ4
```

Credentials Firebase conservés pour la migration (projet `comoe-biblio-f28d7`) :
```
FB_KEY     : AIzaSyBIqsfTSS3ypsHc_dQrKhYpB8pIbF9adBY
FB_PROJECT : comoe-biblio-f28d7
```

---

## Schéma base de données (13 tables)

Toutes les tables portent une colonne `space_code` (FK vers `spaces.code`) sauf `spaces`, `super_admin_config`.
Les noms de colonnes **camelCase sont entre guillemets** dans SQL pour préserver la compatibilité avec les clés d'objets JS.

| Table | PK | Description |
|-------|----|-------------|
| `spaces` | `code` (text) | Espaces/bibliothèques |
| `super_admin_config` | `id=1` | Hash SHA-256 du mot de passe super-admin |
| `space_config` | `space_code` | Config de l'espace (pas de colonne `id`) |
| `space_counters` | `space_code` | Compteurs auto-incrémentés (pas de colonne `id`) |
| `users` | `id` (int) | Membres |
| `books` | `id` (int) | Livres |
| `loans` | `id` (text `L_…`) | Prêts |
| `request_sessions` | `id` (int) | Sessions de demandes |
| `book_requests` | `id` (int) | Demandes de livres |
| `registrations` | `id` (text `reg_…`) | Inscriptions publiques |
| `login_logs` | `id` (int) | Journal de connexions |
| `deleted_users` | `id` (serial) | Utilisateurs supprimés (archive) |
| `shelf_checks` | `id` (int) | Vérifications d'étagères |

**Cas spéciaux `space_config` et `space_counters`** : PK = `space_code`, pas de colonne `id`.
Les fonctions `sbGetDoc('config', ...)` et `sbGetDoc('counters', ...)` filtrent par `space_code` uniquement.

**RLS** : activée, politique `allow_all` (permissive) — à restreindre ultérieurement.

---

## Routing URL

```
/                    → SPACE_ID = DEFAULT_SPACE ('comoe') — interface admin/login
/[code]              → SPACE_ID = code — interface admin/login de l'espace
/book/[code]         → IS_PUBLIC_VIEW = true — catalogue public sans connexion
/~admin              → Super-admin (gestion de tous les espaces)
```

- **En local** (Python http.server) : seul `http://localhost:8080/` fonctionne
- **Sur Netlify** : tous les chemins fonctionnent grâce au `_redirects`
- `/book/[code]` n'est **pas testable localement** avec Python http.server

---

## Architecture app.js

### Données in-memory (chargées au démarrage depuis Supabase)
```js
let books=[], users=[], loans=[], requests=[], sessions=[]
let loginLog=[], deletedUsers=[], shelfChecks=[], registrations=[]
let cfg = { openAll, openUntil, propMotif, currentSessionId, ... }
let nxB, nxU, nxR, nxS, nxL, nxSC, nxReg  // compteurs
let curUser = null  // utilisateur connecté
```

### Fonctions Supabase principales

```js
sbGetAll(col)              // lecture collection (filtrée par space_code)
sbGetDoc(col, id)          // lecture document unique
sbGetDocRoot(col, id)      // lecture table racine (spaces / super_admin_config)
sbGetAllRoot(col)          // lecture de tous les espaces
sbSet(col, id, data)       // upsert document
sbSetRoot(col, id, data)   // upsert table racine
sbUpd(col, id, data)       // update partiel
sbDel(col, id)             // suppression
sbBatchSet(col, docs)      // upsert en lots de 500
sbBatchDel(col, ids)       // suppression par lots
sbSaveCounters()           // sauvegarde nxB/nxU/... dans space_counters
sbSaveCfg()                // sauvegarde cfg dans space_config
```

### Mapping collections → tables
```js
loginLog      → login_logs
deletedUsers  → deleted_users
shelfChecks   → shelf_checks
requests      → book_requests
sessions      → request_sessions
config        → space_config
counters      → space_counters
// autres (books, users, loans, registrations) : nom identique
```

### Realtime (Supabase Realtime `postgres_changes`)
Remplace le `onSnapshot` Firebase. Canal : `space-[SPACE_ID]`.
Écoute les tables : `books`, `loans`, `users`, `book_requests`, `request_sessions`, `registrations`, `shelf_checks`.
Handler : `_handleRT(col, payload)` — met à jour le tableau in-memory et appelle `_refreshView([col])`.

---

## Rôles utilisateurs

| Rôle | Accès |
|------|-------|
| `admin` | Tout |
| `commission` | Catalogue académique + spirituel, demandes |
| `enrol` | Catalogue académique + spirituel, inscriptions |
| `member` | Catalogue académique, demandes |
| `resident` | Catalogue académique |
| `validator` | Validation des prêts |

Types de catalogue : `academique` / `spirituel` (colonne `catType` dans `books`).

---

## Super-admin

- Accessible via `/~admin` (code `~admin` sur la page de connexion)
- Mot de passe stocké sous forme de hash SHA-256 dans `super_admin_config.pwdHash` (Supabase)
- Hash par défaut si absent : `SA_DEFAULT_HASH` (défini dans app.js)
- Fonctionnalités : créer/désactiver des espaces, changer le mot de passe

---

## Données actuelles (Supabase)

À la date de la migration (juin 2026), l'état de la base test :
- Espace `comoe` : Bibliothèque Centre Comoé — actif
- 3 livres de test (Le Petit Prince, L'Alchimiste, Bofoya Kunde)
- 1 utilisateur : `admin` / role `admin`

**Migration Firebase en attente** : ~1 800 livres réels et ~10 utilisateurs réels sont dans Firebase (`comoe-biblio-f28d7`).
Script prêt : `migrate-firebase-to-supabase.js` — à lancer avec `node migrate-firebase-to-supabase.js` quand le quota Firebase sera réinitialisé (quotidien, ~8h heure CIV).

---

## Développement local

```powershell
# Démarrer le serveur local
cd c:\projet\ComoeBiblio
python -m http.server 8080

# URL de test (admin)
http://localhost:8080/
# Login : admin

# Test de la migration Firebase → Supabase
node migrate-firebase-to-supabase.js
```

**Limitation locale** : la page publique `/book/comoe` n'est pas accessible en local — uniquement sur Netlify.

---

## Déploiement Netlify

- Dépôt GitHub connecté à Netlify
- `_redirects` : `/* /index.html 200` — routing SPA
- Aucune étape de build — publication directe des fichiers statiques
- Variables d'environnement : aucune (credentials hardcodés dans app.js — clé anon publique)

---

## Points d'attention

1. **Pas de TypeScript, pas de bundler** — tout est vanilla JS dans un seul fichier de 6 300 lignes.
2. **camelCase dans SQL** : les colonnes comme `catType`, `openAll`, `nxB` doivent être entre guillemets dans les requêtes SQL directes.
3. **`space_config` et `space_counters` ont `space_code` comme PK** (pas de colonne `id`) — traitement spécial dans `sbGetDoc`, `sbSet`, `sbUpd`.
4. **Compteurs manuels** : l'app gère `nxB`, `nxU`, etc. en mémoire et les persiste via `sbSaveCounters()` — pas d'auto-increment PostgreSQL pour les IDs des livres/utilisateurs.
5. **IDs livres et users** sont des entiers. IDs loans sont des strings (`L_timestamp`). IDs registrations sont des strings (`reg_timestamp`).
6. **`_bumpSync` et `_bumpSyncBatch`** sont des no-ops (vestige du mécanisme Firebase sync_versions — supprimé).
7. **Le panel Quota Firebase** (`rQuotaPanel`) a été supprimé — la fonction retourne vide, l'onglet retiré de index.html.
