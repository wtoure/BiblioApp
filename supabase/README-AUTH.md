# ComoéBiblio — Migration vers l'authentification Supabase (Solution A)

Authentification **email + mot de passe** pour tous les membres, sur les deux
applications (desktop `index.html`/`app.js` et mobile `v2/`). Email **obligatoire**
à l'inscription, **invitation par l'admin** après validation, et **réinitialisation
de mot de passe** par email.

> ⚠️ Ce document décrit les étapes **côté production** (SQL, Edge Function, réglages
> Auth) que **vous** appliquez. Le code applicatif est déjà livré dans le dépôt.
> Aucune commande de ce dépôt ne touche la prod automatiquement.

---

## Vue d'ensemble du flux

```
Inscription publique (email OBLIGATOIRE)
        │
        ▼
Admin valide  ──►  Edge Function invite-user (service_role)
        │                 │
        │                 ├─ crée le compte auth + envoie l'email d'invitation
        │                 └─ users.auth_id ← id du compte auth
        ▼
Membre clique le lien d'invitation  ──►  page /set-password  ──►  définit son mot de passe
        │
        ▼
Connexion : email + mot de passe  (signInWithPassword)
        │
        ▼
Résolution de la ligne `users` par auth_id (dans l'espace courant)

Mot de passe oublié : /forgot-password  ──►  email de réinitialisation  ──►  /set-password
```

---

## Étapes de déploiement (dans l'ordre)

### 1. SQL — lien comptes auth ↔ users
Supabase Dashboard → **SQL Editor** → exécuter :
```
supabase/sql/01_auth_link.sql
```
Ajoute `users.auth_id`, les index, et les fonctions `current_app_user` / `is_space_admin`.

### 2. Réglages Auth
Dashboard → **Authentication → Providers → Email** :
- **Confirm email** : **OFF** (connexion immédiate — choix retenu, public WhatsApp-first).
- Activer **Email** comme provider (mot de passe).

Dashboard → **Authentication → URL Configuration → Redirect URLs**, ajouter les
URLs des pages set-password des deux apps, par ex. :
```
https://comoebiblio.netlify.app/set-password
https://comoebiblio.netlify.app/?setpw=1
http://localhost:8080/?setpw=1
http://localhost:5173/set-password
```
(adapter aux domaines réels Netlify/Vercel)

> **SMTP** : l'envoi d'emails (invitation + réinitialisation) utilise le SMTP du
> projet. Le SMTP intégré Supabase est limité/àdébit réduit — pour la prod,
> configurer un SMTP dédié dans **Authentication → Emails → SMTP Settings**.

### 3. Edge Function `invite-user`
Avec le Supabase CLI (une fois, en local) :
```bash
supabase login
supabase link --project-ref ktknaajjtmhevsafrpjv
supabase functions deploy invite-user
```
`SUPABASE_URL` et `SUPABASE_SERVICE_ROLE_KEY` sont injectés automatiquement dans
la fonction — **rien à committer**.

### 4. Provisionner les comptes existants (une fois)
```powershell
$env:SB_SERVICE_KEY="<clé service_role — Settings → API>"
$env:SB_REDIRECT="https://comoebiblio.netlify.app/set-password"
node provision-auth.js
```
- Envoie une invitation aux membres ayant un email valide et lie leur `auth_id`.
- Liste les membres **sans email** : l'admin saisira leur email dans l'app puis
  cliquera **« Inviter »**.

> **Bootstrap admin** : assurez-vous que l'admin (`admin2026`) a un email en base
> AVANT de lancer le script, pour qu'il reçoive son invitation et puisse ensuite
> inviter les autres depuis l'interface.

### 5. (Optionnel, plus tard) Durcissement RLS
`supabase/sql/02_rls_hardening.sql` — **à tester sur un espace de test d'abord**.
Non requis pour que l'authentification fonctionne (la politique `allow_all`
actuelle reste fonctionnelle). Contient un bloc de rollback.

---

## Vérification

1. Lancer `node provision-auth.js` → vérifier les invitations envoyées.
2. Ouvrir l'email d'invitation d'un compte de test → lien → `/set-password` → définir le mot de passe.
3. Se connecter avec email + mot de passe sur **desktop** et sur **mobile (v2)**.
4. Tester « Mot de passe oublié » → email reçu → `/set-password` → nouveau mot de passe.
5. Depuis l'admin : valider une nouvelle inscription → le membre reçoit l'invitation.
6. Tester un membre **sans email** : saisir son email dans l'admin → « Inviter ».

---

## Notes de sécurité

- La clé **service_role** n'est **jamais** dans le code ni le dépôt : uniquement
  dans l'environnement de l'Edge Function et en variable locale pour le script.
- L'Edge Function vérifie que l'appelant est **admin de l'espace** avant d'inviter.
- La clé **anon** reste publique par design (client-side).
- `users.email` reste *nullable* en base (compatibilité historique) ; l'obligation
  est imposée côté application et par l'Edge Function.
