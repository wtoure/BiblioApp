-- ════════════════════════════════════════════════════════════════
-- ComoéBiblio — Fichier 2/2 — Durcissement RLS (OPTIONNEL, À TESTER)
-- ════════════════════════════════════════════════════════════════
--
-- ⚠️  NE PAS appliquer en production avant d'avoir validé le nouveau
--     flux de connexion (Solution A). L'authentification fonctionne
--     déjà avec la politique `allow_all` actuelle ; ce fichier est un
--     RENFORCEMENT facultatif, à tester d'abord sur un espace de test.
--
-- Modèle visé :
--   • Catalogue public (anon)  : SELECT sur spaces / books / space_config
--   • Inscription publique (anon) : INSERT sur registrations
--   • Tout le reste            : réservé aux utilisateurs authentifiés
--   • Écritures sensibles       : admin de l'espace (is_space_admin)
--
-- Pour REVENIR EN ARRIÈRE (rollback) en cas de blocage, ré-exécuter le
-- bloc « allow_all » en bas de ce fichier.
-- ════════════════════════════════════════════════════════════════

-- ─── Lecture publique du catalogue (anon + authenticated) ───
drop policy if exists allow_all on public.spaces;
create policy spaces_read on public.spaces
  for select using (true);
create policy spaces_admin_write on public.spaces
  for all to authenticated using (true) with check (true);

drop policy if exists allow_all on public.space_config;
create policy cfg_read on public.space_config
  for select using (true);
create policy cfg_admin_write on public.space_config
  for all to authenticated
  using (is_space_admin(space_code)) with check (is_space_admin(space_code));

drop policy if exists allow_all on public.books;
create policy books_read on public.books
  for select using (true);
create policy books_auth_write on public.books
  for all to authenticated using (true) with check (true);

-- ─── Inscription publique : INSERT anon autorisé, lecture/maj réservées ───
drop policy if exists allow_all on public.registrations;
create policy reg_insert_public on public.registrations
  for insert with check (status = 'pending');
create policy reg_auth_read on public.registrations
  for select to authenticated using (true);
create policy reg_admin_write on public.registrations
  for all to authenticated
  using (is_space_admin(space_code)) with check (is_space_admin(space_code));

-- ─── users : un membre se voit lui-même ; un admin voit tout l'espace ───
drop policy if exists allow_all on public.users;
create policy users_self_read on public.users
  for select to authenticated
  using (auth_id = auth.uid() or is_space_admin(space_code));
create policy users_self_update on public.users
  for update to authenticated
  using (auth_id = auth.uid() or is_space_admin(space_code))
  with check (auth_id = auth.uid() or is_space_admin(space_code));
create policy users_admin_insert on public.users
  for insert to authenticated with check (is_space_admin(space_code));
create policy users_admin_delete on public.users
  for delete to authenticated using (is_space_admin(space_code));

-- ─── Tables « authentifié » (lecture/écriture pour tout compte connecté) ───
do $$
declare t text;
begin
  foreach t in array array[
    'space_counters','loans','book_requests','request_sessions',
    'login_logs','deleted_users','shelf_checks'
  ] loop
    execute format('drop policy if exists allow_all on public.%I', t);
    execute format(
      'create policy %I on public.%I for all to authenticated using (true) with check (true)',
      t||'_auth', t);
  end loop;
end $$;

-- super_admin_config : lecture pour vérifier le hash (anon, page ~admin),
-- écriture authentifiée uniquement.
drop policy if exists allow_all on public.super_admin_config;
create policy sa_read on public.super_admin_config for select using (true);
create policy sa_write on public.super_admin_config
  for all to authenticated using (true) with check (true);

-- ════════════════════════════════════════════════════════════════
-- ROLLBACK — décommenter et exécuter pour tout rouvrir (allow_all)
-- ════════════════════════════════════════════════════════════════
-- do $$ declare t text; begin
--   foreach t in array array['spaces','super_admin_config','space_config',
--     'space_counters','users','books','request_sessions','book_requests',
--     'loans','registrations','login_logs','deleted_users','shelf_checks'] loop
--     execute format('drop policy if exists %I on public.%I', t||'_read', t);
--     -- … (recréer la policy permissive)
--     execute format('create policy allow_all on public.%I using (true) with check (true)', t);
--   end loop;
-- end $$;
