-- ════════════════════════════════════════════════════════════════
-- ComoéBiblio — Colonne "featuredDays" (durée d'affichage des livres mis en avant)
-- À exécuter dans : Supabase Dashboard → SQL Editor
-- ════════════════════════════════════════════════════════════════
--
-- Durée (en jours) pendant laquelle un livre « mis en avant » reste épinglé
-- en début de catalogue, comptée depuis sa date d'ajout (addedAt).
-- 0 = illimité (toujours en tête) — comportement par défaut.
-- Nom de colonne en camelCase entre guillemets (compat. clés JS).
-- ════════════════════════════════════════════════════════════════

alter table public.space_config
  add column if not exists "featuredDays" int not null default 0;
