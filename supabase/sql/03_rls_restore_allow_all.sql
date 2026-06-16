-- ════════════════════════════════════════════════════════════════
-- ComoéBiblio — Rollback RLS : restaurer la politique permissive allow_all
-- À exécuter dans : Supabase Dashboard → SQL Editor
-- ════════════════════════════════════════════════════════════════
--
-- À utiliser si le durcissement 02_rls_hardening.sql a été appliqué et
-- bloque des écritures légitimes (ex. inscription publique → erreur
-- « new row violates row-level security policy for table registrations »).
--
-- Ce script SUPPRIME toutes les politiques existantes sur les 13 tables
-- puis recrée la politique permissive `allow_all` (USING true / CHECK true),
-- qui correspond au modèle de sécurité documenté (CLAUDE.md : RLS activée,
-- politique allow_all — à restreindre ultérieurement).
-- Idempotent : peut être ré-exécuté sans risque.
-- ════════════════════════════════════════════════════════════════

do $$
declare
  t text;
  p record;
  tables text[] := array[
    'spaces','super_admin_config','space_config','space_counters',
    'users','books','request_sessions','book_requests','loans',
    'registrations','login_logs','deleted_users','shelf_checks'
  ];
begin
  foreach t in array tables loop
    -- 1. Supprimer TOUTES les politiques existantes (quel que soit leur nom).
    for p in
      select policyname from pg_policies
      where schemaname = 'public' and tablename = t
    loop
      execute format('drop policy if exists %I on public.%I', p.policyname, t);
    end loop;

    -- 2. S'assurer que la RLS est activée.
    execute format('alter table public.%I enable row level security', t);

    -- 3. Recréer la politique permissive.
    execute format(
      'create policy allow_all on public.%I using (true) with check (true)', t);
  end loop;
end $$;

-- Vérification : lister les politiques restantes (doit afficher allow_all partout)
-- select tablename, policyname, cmd from pg_policies
-- where schemaname='public' order by tablename;
