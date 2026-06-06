/**
 * Migration Firebase Firestore → Supabase
 * Espace: comoe  |  ~1800 livres, ~10 users, 0 prêts
 *
 * Usage: node migrate-firebase-to-supabase.js
 */

const https = require('https');

// ─── Config ───────────────────────────────────────────────────────────────────
const FB_KEY     = 'AIzaSyBIqsfTSS3ypsHc_dQrKhYpB8pIbF9adBY';
const FB_PROJECT = 'comoe-biblio-f28d7';
const FS_ROOT    = `https://firestore.googleapis.com/v1/projects/${FB_PROJECT}/databases/(default)/documents`;
const SPACE_ID   = 'comoe';

const SB_URL = 'https://ktknaajjtmhevsafrpjv.supabase.co';
const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt0a25hYWpqdG1oZXZzYWZycGp2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA3NjQzMTMsImV4cCI6MjA5NjM0MDMxM30.-g5AA1lnvMYEOp9HrHayTant_FXKhJRoW65oX9JOwJ4';

// ─── HTTP helpers ──────────────────────────────────────────────────────────────
function httpRequest(url, method = 'GET', body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const opts = {
      hostname: u.hostname, path: u.pathname + u.search,
      method, headers: { ...headers }
    };
    if (body) {
      const buf = Buffer.from(JSON.stringify(body), 'utf8');
      opts.headers['Content-Type'] = 'application/json';
      opts.headers['Content-Length'] = buf.length;
    }
    const req = https.request(opts, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, body: data }); }
      });
    });
    req.on('error', reject);
    if (body) req.write(Buffer.from(JSON.stringify(body), 'utf8'));
    req.end();
  });
}

// ─── Firebase helpers ─────────────────────────────────────────────────────────
async function fbAuth() {
  const r = await httpRequest(
    `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${FB_KEY}`,
    'POST', { returnSecureToken: true }
  );
  if (!r.body.idToken) throw new Error('Firebase auth failed: ' + JSON.stringify(r.body));
  console.log('  Firebase auth OK');
  return r.body.idToken;
}

function fromFsVal(v) {
  if (v === undefined || v === null) return null;
  if (v.stringValue  !== undefined) return v.stringValue;
  if (v.integerValue !== undefined) return parseInt(v.integerValue);
  if (v.doubleValue  !== undefined) return parseFloat(v.doubleValue);
  if (v.booleanValue !== undefined) return v.booleanValue;
  if (v.nullValue    !== undefined) return null;
  if (v.timestampValue !== undefined) return v.timestampValue;
  if (v.arrayValue   !== undefined) return (v.arrayValue.values || []).map(fromFsVal);
  if (v.mapValue     !== undefined) return fromFsFields(v.mapValue.fields || {});
  return null;
}

function fromFsFields(fields) {
  const obj = {};
  for (const k in fields) obj[k] = fromFsVal(fields[k]);
  return obj;
}

async function fbGetAll(token, path) {
  const docs = [];
  let pageToken = null;
  let page = 0;
  do {
    const url = `${FS_ROOT}/${path}` + (pageToken ? `?pageToken=${pageToken}` : '');
    const r = await httpRequest(url, 'GET', null, { Authorization: `Bearer ${token}` });
    if (r.status === 429) throw new Error('Quota Firebase épuisé. Réessayez demain.');
    if (r.status !== 200) throw new Error(`Firebase ${path} → HTTP ${r.status}: ${JSON.stringify(r.body)}`);
    if (r.body.documents) {
      for (const doc of r.body.documents) {
        const id = doc.name.split('/').pop();
        docs.push({ id, ...fromFsFields(doc.fields || {}) });
      }
    }
    pageToken = r.body.nextPageToken || null;
    page++;
    if (page % 5 === 0) process.stdout.write(`    ...${docs.length} docs lus\n`);
  } while (pageToken);
  return docs;
}

async function fbGetDoc(token, path) {
  const r = await httpRequest(`${FS_ROOT}/${path}`, 'GET', null, { Authorization: `Bearer ${token}` });
  if (r.status === 404) return null;
  if (r.status === 429) throw new Error('Quota Firebase épuisé.');
  if (r.status !== 200) return null;
  const id = r.body.name ? r.body.name.split('/').pop() : null;
  return { id, ...fromFsFields(r.body.fields || {}) };
}

// ─── Supabase helpers ─────────────────────────────────────────────────────────
async function sbUpsertBatch(table, rows) {
  if (!rows || rows.length === 0) return;
  const BATCH = 500;
  for (let i = 0; i < rows.length; i += BATCH) {
    const chunk = rows.slice(i, i + BATCH);
    const r = await httpRequest(
      `${SB_URL}/rest/v1/${table}`,
      'POST', chunk,
      {
        apikey: SB_KEY,
        Authorization: `Bearer ${SB_KEY}`,
        Prefer: 'resolution=merge-duplicates,return=minimal'
      }
    );
    if (r.status >= 400) {
      console.error(`  ERREUR upsert ${table} [${i}-${i+chunk.length}]: HTTP ${r.status}`, JSON.stringify(r.body).slice(0, 200));
    } else {
      process.stdout.write(`    ${table}: ${Math.min(i + BATCH, rows.length)}/${rows.length} insérés\n`);
    }
  }
}

async function sbDelete(table, col, val) {
  await httpRequest(
    `${SB_URL}/rest/v1/${table}?${col}=eq.${val}`,
    'DELETE', null,
    { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` }
  );
}

// ─── Migration ────────────────────────────────────────────────────────────────
async function migrate() {
  console.log('\n╔══════════════════════════════════════════════╗');
  console.log('║  Migration Firebase → Supabase  [comoe]      ║');
  console.log('╚══════════════════════════════════════════════╝\n');

  // 1. Auth Firebase
  console.log('1. Authentification Firebase...');
  const token = await fbAuth();

  // 2. Espace
  console.log('\n2. Espace "comoe"...');
  const space = await fbGetDoc(token, `_spaces/${SPACE_ID}`);
  if (!space) throw new Error('Espace comoe introuvable dans Firebase');
  const spaceRow = {
    code:    SPACE_ID,
    name:    space.name    || 'Bibliothèque Centre Comoé',
    short:   space.short   || 'ComoéBiblio',
    tagline: space.tagline || 'Bibliothèque · Centre Culturel Comoé',
    color:   space.color   || '#22806B',
    active:  space.active  !== false,
  };
  await sbUpsertBatch('spaces', [spaceRow]);
  console.log(`  Espace "${SPACE_ID}" importé.`);

  // 3. Config
  console.log('\n3. Configuration...');
  const config = await fbGetDoc(token, `_spaces/${SPACE_ID}/config/main`);
  if (config) {
    const { id: _id, ...cfgFields } = config;
    await sbUpsertBatch('space_config', [{ space_code: SPACE_ID, ...cfgFields }]);
    console.log('  Config importée.');
  }

  // 4. Compteurs
  console.log('\n4. Compteurs...');
  const counters = await fbGetDoc(token, `_spaces/${SPACE_ID}/counters/main`);
  if (counters) {
    const { id: _id, ...cntFields } = counters;
    await sbUpsertBatch('space_counters', [{ space_code: SPACE_ID, ...cntFields }]);
    console.log('  Compteurs importés.');
  }

  // 5. Utilisateurs
  console.log('\n5. Utilisateurs...');
  const fbUsers = await fbGetAll(token, `_spaces/${SPACE_ID}/users`);
  console.log(`  ${fbUsers.length} utilisateurs trouvés.`);
  const userRows = fbUsers.map(u => ({
    ...u,
    id: parseInt(u.id) || parseInt(u.num) || undefined,
    space_code: SPACE_ID,
  })).filter(u => u.id);
  await sbUpsertBatch('users', userRows);

  // 6. Livres (le plus gros lot)
  console.log('\n6. Livres (~1800)...');
  const fbBooks = await fbGetAll(token, `_spaces/${SPACE_ID}/books`);
  console.log(`  ${fbBooks.length} livres trouvés.`);
  const bookRows = fbBooks.map(b => ({
    ...b,
    id: parseInt(b.id) || undefined,
    space_code: SPACE_ID,
    expl:        parseInt(b.expl) || 1,
    activeLoans: parseInt(b.activeLoans) || 0,
    version:     parseInt(b.version) || 1,
    annee:       b.annee ? parseInt(b.annee) : null,
  })).filter(b => b.id);
  await sbUpsertBatch('books', bookRows);

  // 7. Prêts
  console.log('\n7. Prêts...');
  const fbLoans = await fbGetAll(token, `_spaces/${SPACE_ID}/loans`);
  console.log(`  ${fbLoans.length} prêts trouvés.`);
  if (fbLoans.length > 0) {
    const loanRows = fbLoans.map(l => ({ ...l, space_code: SPACE_ID }));
    await sbUpsertBatch('loans', loanRows);
  }

  // 8. Sessions de demande
  console.log('\n8. Sessions de demande...');
  const fbSessions = await fbGetAll(token, `_spaces/${SPACE_ID}/sessions`);
  console.log(`  ${fbSessions.length} sessions trouvées.`);
  if (fbSessions.length > 0) {
    const sesRows = fbSessions.map(s => ({
      ...s, id: parseInt(s.id), space_code: SPACE_ID
    })).filter(s => s.id);
    await sbUpsertBatch('request_sessions', sesRows);
  }

  // 9. Demandes de livres
  console.log('\n9. Demandes de livres...');
  const fbRequests = await fbGetAll(token, `_spaces/${SPACE_ID}/requests`);
  console.log(`  ${fbRequests.length} demandes trouvées.`);
  if (fbRequests.length > 0) {
    const reqRows = fbRequests.map(r => ({
      ...r, id: parseInt(r.id), space_code: SPACE_ID,
      sessionId: r.sessionId ? parseInt(r.sessionId) : null,
      dem: r.dem ? parseInt(r.dem) : null,
    })).filter(r => r.id);
    await sbUpsertBatch('book_requests', reqRows);
  }

  // 10. Inscriptions
  console.log('\n10. Inscriptions...');
  const fbRegs = await fbGetAll(token, `_spaces/${SPACE_ID}/registrations`);
  console.log(`  ${fbRegs.length} inscriptions trouvées.`);
  if (fbRegs.length > 0) {
    const regRows = fbRegs.map(r => ({ ...r, space_code: SPACE_ID }));
    await sbUpsertBatch('registrations', regRows);
  }

  // 11. Logs de connexion
  console.log('\n11. Logs de connexion...');
  const fbLogs = await fbGetAll(token, `_spaces/${SPACE_ID}/loginLog`);
  console.log(`  ${fbLogs.length} logs trouvés.`);
  if (fbLogs.length > 0) {
    const logRows = fbLogs.map(l => ({
      ...l, id: parseInt(l.id), space_code: SPACE_ID,
      userId: l.userId ? parseInt(l.userId) : null,
    })).filter(l => l.id);
    await sbUpsertBatch('login_logs', logRows);
  }

  // 12. Utilisateurs supprimés
  console.log('\n12. Utilisateurs supprimés...');
  const fbDeleted = await fbGetAll(token, `_spaces/${SPACE_ID}/deletedUsers`);
  console.log(`  ${fbDeleted.length} entrées.`);
  if (fbDeleted.length > 0) {
    const delRows = fbDeleted.map(d => ({ ...d, space_code: SPACE_ID }));
    await sbUpsertBatch('deleted_users', delRows);
  }

  // 13. Vérifications d'étagères
  console.log('\n13. Vérifications d\'étagères...');
  const fbChecks = await fbGetAll(token, `_spaces/${SPACE_ID}/shelfChecks`);
  console.log(`  ${fbChecks.length} vérifications.`);
  if (fbChecks.length > 0) {
    const checkRows = fbChecks.map(c => ({
      ...c, id: parseInt(c.id), space_code: SPACE_ID,
      userId: c.userId ? parseInt(c.userId) : null,
      booksCount: parseInt(c.booksCount) || 0,
      missingCount: parseInt(c.missingCount) || 0,
      modifiedCount: parseInt(c.modifiedCount) || 0,
    })).filter(c => c.id);
    await sbUpsertBatch('shelf_checks', checkRows);
  }

  // 14. Super admin hash
  console.log('\n14. Super-admin...');
  const sa = await fbGetDoc(token, `_spaces/__superadmin__`);
  if (sa && sa.pwdHash) {
    await sbUpsertBatch('super_admin_config', [{ id: 1, pwdHash: sa.pwdHash, updatedAt: new Date().toISOString() }]);
    console.log('  Hash super-admin importé.');
  }

  // ─── Résumé ───────────────────────────────────────────────────────────────
  console.log('\n╔══════════════════════════════════════════════╗');
  console.log('║           MIGRATION TERMINÉE ✓               ║');
  console.log('╚══════════════════════════════════════════════╝');
  console.log(`
  Résumé :
  - Espace       : 1
  - Config       : 1
  - Compteurs    : 1
  - Utilisateurs : ${userRows.length}
  - Livres       : ${bookRows.length}
  - Prêts        : ${fbLoans.length}
  - Sessions     : ${fbSessions.length}
  - Demandes     : ${fbRequests.length}
  - Inscriptions : ${fbRegs.length}
  - Logs         : ${fbLogs.length}
  `);
}

migrate().catch(err => {
  console.error('\n[ERREUR FATALE]', err.message);
  if (err.message.includes('Quota')) {
    console.error('\nLe quota Firebase journalier est épuisé.');
    console.error('Relancez ce script demain matin (quota reset à ~8h heure de Côte d\'Ivoire).\n');
  }
  process.exit(1);
});
