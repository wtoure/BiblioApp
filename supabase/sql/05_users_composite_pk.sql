-- ════════════════════════════════════════════════════════════════
-- ComoéBiblio — Clé primaire composite (space_code, id) sur public.users
-- ════════════════════════════════════════════════════════════════
--
-- BUG CORRIGÉ : la table users avait une clé primaire GLOBALE sur `id`.
-- Or chaque bibliothèque crée ses membres avec des id réutilisés (admin = 1,
-- puis 2, 3… via des compteurs PAR ESPACE). Avec une PK globale, créer une
-- 2e bibliothèque (admin id=1) ÉCRASAIT l'admin id=1 d'une autre bibliothèque
-- (upsert), et la supprimer (CASCADE) le SUPPRIMAIT.
--
-- Cette migration isole les id par espace : (space_code, id) devient la PK.
-- Le code applicatif filtre déjà toujours par space_code → aucun changement
-- de code nécessaire.
--
-- ⚠️ À LIRE puis exécuter dans Supabase → SQL Editor. Exécuter AVANT le script
--    de récupération de l'admin (06).
-- ════════════════════════════════════════════════════════════════

-- 1. Supprimer les contraintes FK qui référencent users(id).
--    (L'intégrité référentielle est gérée côté application ; ces FK
--     empêchent le changement de clé primaire.)
do $$
declare r record;
begin
  for r in
    select conrelid::regclass as tbl, conname
    from pg_constraint
    where contype = 'f' and confrelid = 'public.users'::regclass
  loop
    execute format('alter table %s drop constraint %I', r.tbl, r.conname);
  end loop;
end $$;

-- 2. Remplacer la PK (id) par (space_code, id).
do $$
declare pk text;
begin
  select conname into pk
  from pg_constraint
  where contype = 'p' and conrelid = 'public.users'::regclass;
  if pk is not null then
    execute format('alter table public.users drop constraint %I', pk);
  end if;
end $$;

alter table public.users
  add constraint users_pkey primary key (space_code, id);

-- Vérification :
-- select conname, contype from pg_constraint where conrelid='public.users'::regclass;
