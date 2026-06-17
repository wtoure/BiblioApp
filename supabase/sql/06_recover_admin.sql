-- ════════════════════════════════════════════════════════════════
-- ComoéBiblio — Récupération de l'administrateur d'une bibliothèque
-- ════════════════════════════════════════════════════════════════
--
-- À exécuter APRÈS 05_users_composite_pk.sql.
-- Sert à recréer une ligne admin perdue suite au bug de collision d'id
-- (ex. l'admin de Comoé disparu après création/suppression d'une autre biblio).
--
-- ⚠️ Remplacez les valeurs en MAJUSCULES avant d'exécuter.
-- ════════════════════════════════════════════════════════════════

-- 1. Diagnostic : voir les membres restants de la bibliothèque.
select id, space_code, abbrev, email, role, disabled
from public.users
where space_code = 'f9a0-60a0-5274'   -- ← code de votre bibliothèque
order by id;

-- 2. Si l'admin est absent (ou à corriger), le (re)créer.
--    L'e-mail DOIT être celui du compte Supabase Auth déjà créé pour cet admin
--    (Authentication → Users) — c'est lui qui permet la connexion.
insert into public.users
  (id, space_code, abbrev, prenom, nom, role, disabled, "neverExpires", "canPropose", email,
   tabs, "assignedShelves", "spiritualAccess", "canLoan")
values
  (1, 'f9a0-60a0-5274', 'admin2026', 'Administrateur', 'Comoé', 'admin',
   false, true, true, 'VOTRE_EMAIL_ADMIN',
   '[]'::jsonb, '[]'::jsonb, true, false)
on conflict (space_code, id) do update
  set role = 'admin',
      disabled = false,
      abbrev = excluded.abbrev,
      email = excluded.email,
      "neverExpires" = true;

-- 3. Vérifier que l'admin existe bien désormais.
-- select id, space_code, abbrev, email, role from public.users
-- where space_code = 'f9a0-60a0-5274' and role = 'admin';
