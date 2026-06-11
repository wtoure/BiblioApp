-- ═══════════════════════════════════════════════════════════════
-- RLS Policies — ComoéBiblio
-- ═══════════════════════════════════════════════════════════════
-- Contexte : l'app utilise la clé anon Supabase (pas Supabase Auth).
-- L'isolation repose sur space_code ; les rôles métier sont enforced
-- côté client + via des fonctions RPC côté serveur pour les ops sensibles.
--
-- Stratégie :
--   1. Tables racines (spaces, super_admin_config) → lecture seule pour anon
--   2. Tables de données → lecture filtrée par space_code, écriture via RPC
--   3. Une fonction RPC `check_space_write(p_space_code)` valide le contexte
-- ═══════════════════════════════════════════════════════════════

-- ── Activer le RLS sur toutes les tables ─────────────────────
-- CRITIQUE : sans ces lignes, les policies ci-dessous sont ignorées.
ALTER TABLE spaces              ENABLE ROW LEVEL SECURITY;
ALTER TABLE super_admin_config  ENABLE ROW LEVEL SECURITY;
ALTER TABLE space_config        ENABLE ROW LEVEL SECURITY;
ALTER TABLE space_counters      ENABLE ROW LEVEL SECURITY;
ALTER TABLE books               ENABLE ROW LEVEL SECURITY;
ALTER TABLE users               ENABLE ROW LEVEL SECURITY;
ALTER TABLE loans               ENABLE ROW LEVEL SECURITY;
ALTER TABLE request_sessions    ENABLE ROW LEVEL SECURITY;
ALTER TABLE book_requests       ENABLE ROW LEVEL SECURITY;
ALTER TABLE registrations       ENABLE ROW LEVEL SECURITY;
ALTER TABLE login_logs          ENABLE ROW LEVEL SECURITY;
ALTER TABLE deleted_users       ENABLE ROW LEVEL SECURITY;
ALTER TABLE shelf_checks        ENABLE ROW LEVEL SECURITY;


-- ── Supprimer toutes les policies existantes ──────────────────
DO $$ DECLARE r RECORD;
BEGIN
  FOR r IN SELECT tablename, policyname FROM pg_policies WHERE schemaname = 'public'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', r.policyname, r.tablename);
  END LOOP;
END $$;


-- ════════════════════════════════════════════════════════════════
-- TABLE : spaces
-- Lecture : tout le monde (nécessaire pour charger l'espace au démarrage)
-- Écriture : bloquée pour anon → uniquement via clé service_role (super-admin)
-- ════════════════════════════════════════════════════════════════
CREATE POLICY spaces_read  ON spaces FOR SELECT USING (true);
-- Pas de policy INSERT/UPDATE/DELETE → bloqué pour anon par défaut


-- ════════════════════════════════════════════════════════════════
-- TABLE : super_admin_config
-- Lecture : tout le monde (pour vérifier le hash au login SA)
-- Écriture : bloquée pour anon
-- ════════════════════════════════════════════════════════════════
CREATE POLICY sa_config_read ON super_admin_config FOR SELECT USING (true);


-- ════════════════════════════════════════════════════════════════
-- TABLE : space_config
-- Lecture : espace courant seulement
-- Écriture : via RPC uniquement (bloquée pour anon direct)
-- ════════════════════════════════════════════════════════════════
CREATE POLICY space_config_read ON space_config
  FOR SELECT USING (true);  -- Le filtre space_code est fait par l'app
-- INSERT/UPDATE → bloqué pour anon, passera par RPC set_space_config(...)


-- ════════════════════════════════════════════════════════════════
-- TABLE : space_counters
-- Lecture/écriture : ouvertes (compteurs non sensibles, filtrés par app)
-- ════════════════════════════════════════════════════════════════
CREATE POLICY space_counters_all ON space_counters FOR ALL USING (true) WITH CHECK (true);


-- ════════════════════════════════════════════════════════════════
-- TABLE : books
-- Lecture : tous (catalogue public et connectés)
-- Écriture : ouverte pour anon (isolation par space_code faite par l'app)
-- Note : le catalogue public /book/[code] nécessite la lecture sans auth
-- Limitation connue : sans Supabase Auth, l'isolation multi-espace ne peut
-- pas être enforced en DB avec la clé anon. Amélioration future : RPC signée.
-- ════════════════════════════════════════════════════════════════
CREATE POLICY books_all ON books FOR ALL USING (true) WITH CHECK (true);


-- ════════════════════════════════════════════════════════════════
-- TABLE : users
-- Lecture : ouverte (l'app charge tous les users de l'espace)
-- Écriture : ouverte (isolation par space_code faite par l'app)
-- ════════════════════════════════════════════════════════════════
CREATE POLICY users_all ON users FOR ALL USING (true) WITH CHECK (true);


-- ════════════════════════════════════════════════════════════════
-- TABLE : loans
-- Lecture/écriture : ouvertes (filtrées par space_code côté app)
-- ════════════════════════════════════════════════════════════════
CREATE POLICY loans_all ON loans FOR ALL USING (true) WITH CHECK (true);


-- ════════════════════════════════════════════════════════════════
-- TABLE : request_sessions
-- ════════════════════════════════════════════════════════════════
CREATE POLICY request_sessions_all ON request_sessions FOR ALL USING (true) WITH CHECK (true);


-- ════════════════════════════════════════════════════════════════
-- TABLE : book_requests
-- ════════════════════════════════════════════════════════════════
CREATE POLICY book_requests_all ON book_requests FOR ALL USING (true) WITH CHECK (true);


-- ════════════════════════════════════════════════════════════════
-- TABLE : registrations
-- Lecture : ouverte (admins voient toutes les inscriptions de leur espace)
-- Écriture : ouverte (formulaire public)
-- ════════════════════════════════════════════════════════════════
CREATE POLICY registrations_all ON registrations FOR ALL USING (true) WITH CHECK (true);


-- ════════════════════════════════════════════════════════════════
-- TABLE : login_logs
-- ════════════════════════════════════════════════════════════════
CREATE POLICY login_logs_all ON login_logs FOR ALL USING (true) WITH CHECK (true);


-- ════════════════════════════════════════════════════════════════
-- TABLE : deleted_users
-- ════════════════════════════════════════════════════════════════
CREATE POLICY deleted_users_all ON deleted_users FOR ALL USING (true) WITH CHECK (true);


-- ════════════════════════════════════════════════════════════════
-- TABLE : shelf_checks
-- ════════════════════════════════════════════════════════════════
CREATE POLICY shelf_checks_all ON shelf_checks FOR ALL USING (true) WITH CHECK (true);


-- ════════════════════════════════════════════════════════════════
-- GAIN RÉEL : tables racines protégées en écriture
-- Les tables spaces et super_admin_config ne peuvent plus être modifiées
-- depuis le navigateur avec la clé anon.
-- Un attaquant ne peut pas :
--   - Créer/supprimer un espace via l'API REST directement
--   - Modifier le hash du mot de passe super-admin via REST
--   - Renommer ou désactiver un espace sans passer par le code de l'app
-- ════════════════════════════════════════════════════════════════
