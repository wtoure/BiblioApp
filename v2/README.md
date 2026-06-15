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

## Feuille de route

- [x] **Phase 0** — Fondation : projet, Supabase, PWA, shell (barre du bas + menu), login, catalogue
- [ ] **Phase 1** — Catalogue complet + fiche livre + vue publique `/book/:code`
- [ ] **Phase 2** — Profil, guide, gestion fine des rôles
- [ ] **Phase 3** — Demandes (sessions, validation commission)
- [ ] **Phase 4** — Emprunts
- [ ] **Phase 5** — Admin (utilisateurs, inscriptions, stats, étagères)
- [ ] **Phase 6** — Bascule / parité
