-- ════════════════════════════════════════════════════════════════
-- ComoéBiblio — Solution A : authentification Supabase (email + mot de passe)
-- Fichier 1/2 — Lien comptes auth ↔ table users
-- À exécuter dans : Supabase Dashboard → SQL Editor
-- ════════════════════════════════════════════════════════════════

-- 1. Colonne de liaison vers auth.users (uuid).
--    Une ligne `users` (membre d'un espace) est rattachée à un compte
--    d'authentification Supabase via cet identifiant.
alter table public.users
  add column if not exists auth_id uuid references auth.users(id) on delete set null;

create index if not exists users_auth_id_idx on public.users(auth_id);

-- Recherche par email (sensible à la casse côté SQL : on normalise en minuscules
-- à l'écriture côté application — voir runbook).
create index if not exists users_email_idx on public.users(lower(email));

-- 2. Garde-fou : un même compte auth ne peut être lié qu'une fois par espace.
--    (Un même email peut exister dans plusieurs espaces → plusieurs lignes users,
--     mais une seule par (space_code, auth_id).)
create unique index if not exists users_space_auth_uniq
  on public.users(space_code, auth_id)
  where auth_id is not null;

-- 3. Fonction utilitaire : résoudre la ligne users de l'appelant authentifié
--    dans un espace donné. Utilisée par les politiques RLS (fichier 02) et
--    pratique pour le débogage.
create or replace function public.current_app_user(p_space text)
returns public.users
language sql
stable
security definer
set search_path = public
as $$
  select * from public.users
  where auth_id = auth.uid() and space_code = p_space
  limit 1
$$;

-- 4. Helper : l'appelant est-il admin (ou membre habilité) dans l'espace ?
create or replace function public.is_space_admin(p_space text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.users
    where auth_id = auth.uid()
      and space_code = p_space
      and role = 'admin'
      and disabled = false
  )
$$;

-- NOTE : l'email reste nullable au niveau colonne pour ne PAS casser les
-- anciens enregistrements historiques. L'obligation d'email est imposée
-- côté application (inscription publique + création de compte) et par
-- l'Edge Function `invite-user` (qui refuse un email vide).
