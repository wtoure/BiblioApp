# ComoéBiblio — v2 (mobile, React PWA)

Version **mobile** de ComoéBiblio, en React + Vite + Supabase, destinée à **Vercel**.
Elle est **indépendante** de l'app actuelle (vanilla JS, à la racine du dépôt, sur Netlify) :
les deux partagent la **même base Supabase**, mais aucun fichier n'est partagé.

| | App actuelle (desktop) | App v2 (mobile) |
|---|---|---|
| Dossier | racine du dépôt | `v2/` |
| Stack | HTML + JS vanilla | React + Vite + TS + Tailwind |
| Hébergement | Netlify | Vercel |
| Backend | Supabase (partagé) | Supabase (partagé) |

> La v2 **ne lit/écrit que la base Supabase existante** ; elle ne modifie pas l'app actuelle.

## Démarrer en local

```bash
cd v2
npm install
npm run dev
# → http://localhost:5173
```

Connexion : utilise un **code de connexion** (abbrev) existant de l'espace
`f9a0-60a0-5274` (ex. `admin2026`).

## Build de production

```bash
npm run build       # génère dist/
npm run preview     # prévisualise le build
```

## Déploiement Vercel

1. Importer le dépôt sur Vercel.
2. **Root Directory** : `v2`
3. Framework détecté : **Vite**. Build : `npm run build`, Output : `dist`.
4. (Optionnel) Variables d'environnement :
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   (sinon les valeurs publiques par défaut sont utilisées)

## État (voir PROGRESS.md pour le détail)

- [x] **Phase 0** — Fondation : projet, Supabase, PWA, shell, login, catalogue
- [x] **Phase 1** — Catalogue + filtres avancés + fiche livre + vue publique `/book/:code`
- [x] **Phase 2** — Profil (lecture), guide, gardes d'accès par rôle
- [x] **Phase 3** — Demandes : liste, filtres, stats, sessions, validation/rejet *(écriture à relire)*
- [x] **Phase 4** — Emprunts : onglets statut, valider/retour/rejet *(écriture à relire)*
- [x] **Phase 5** — Admin : utilisateurs (toggle), inscriptions (lecture), statistiques
- [ ] **Reste à faire** — flux de **création/édition** (créer demande/emprunt, valider inscription→compte,
  éditer profil, saisie catalogue, étagères, paramètres) + **compteurs** `space_counters` + **realtime**.
  ⚠️ Ces écritures doivent être **relues et testées** avant de connecter la v2 aux vrais utilisateurs.

> **Lecture : complète. Validations : fonctionnelles (à relire). Créations/éditions : à finir.**
