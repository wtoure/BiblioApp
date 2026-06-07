/**
 * Migration Firebase Firestore → Supabase
 * Espace: comoe  |  ~1800 livres, ~10 users, 0 prêts
 *
 * Usage: node migrate-firebase-to-supabase.js
 */

const https = require('https');

// ─── Config ───────────────────────────────────────────────────────────────────
// Migration terminée — clé révoquée. Ne relancer que si nécessaire avec une nouvelle clé.
const FB_KEY      = process.env.FB_KEY || '';
const FB_PROJECT  = 'comoe-biblio-f28d7';
const FS_ROOT     = `https://firestore.googleapis.com/v1/projects/${FB_PROJECT}/databases/(default)/documents`;
// ID Firebase de l'espace ComoéBiblio (document auto-généré dans _spaces/)
const FB_SPACE_ID = 'f9a0-60a0-5274';
// Code Supabase cible — même ID opaque pour éviter l'énumération des espaces
const SB_SPACE_ID = 'f9a0-60a0-5274';

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

// PostgREST exige que tous les objets d'un batch aient exactement les mêmes clés.
// On collecte toutes les clés distinctes et on comble les manquants avec null.
function normalizeRows(rows) {
  if (!rows || rows.length === 0) return rows;
  const allKeys = [...new Set(rows.flatMap(r => Object.keys(r)))];
  return rows.map(r => {
    const out = {};
    for (const k of allKeys) out[k] = r[k] !== undefined ? r[k] : null;
    return out;
  });
}

async function sbUpsertBatch(table, rows) {
  if (!rows || rows.length === 0) return;
  const normalized = normalizeRows(rows);
  const BATCH = 500;
  for (let i = 0; i < normalized.length; i += BATCH) {
    const chunk = normalized.slice(i, i + BATCH);
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
      process.stdout.write(`    ${table}: ${Math.min(i + BATCH, normalized.length)}/${normalized.length} insérés\n`);
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
  console.log(`║  Firebase space: ${FB_SPACE_ID}  ║`);
  console.log('╚══════════════════════════════════════════════╝\n');

  // 1. Auth Firebase
  console.log('1. Authentification Firebase...');
  const token = await fbAuth();

  // 2. Espace (métadonnées dans _spaces/{FB_SPACE_ID})
  console.log('\n2. Espace...');
  const space = await fbGetDoc(token, `_spaces/${FB_SPACE_ID}`);
  if (!space) throw new Error(`Espace Firebase introuvable : _spaces/${FB_SPACE_ID}`);
  const spaceRow = {
    code:    SB_SPACE_ID,
    name:    space.name    || 'Bibliothèque Centre Comoé',
    short:   space.short   || 'ComoéBiblio',
    tagline: space.tagline || 'Bibliothèque · Centre Culturel Comoé',
    color:   space.color   || '#22806B',
    active:  space.active  !== false,
  };
  await sbUpsertBatch('spaces', [spaceRow]);
  console.log(`  Espace importé → space_code="${SB_SPACE_ID}".`);

  // 3. Config (données sous spaces/{FB_SPACE_ID}/config/main)
  console.log('\n3. Configuration...');
  const config = await fbGetDoc(token, `spaces/${FB_SPACE_ID}/config/main`);
  if (config) {
    const { id: _id, contactNumber, ...cfgFields } = config;
    // contactNumber (Firebase) → contact (Supabase) si contact absent
    if (contactNumber && !cfgFields.contact) cfgFields.contact = contactNumber;
    // Colonnes connues de space_config — évite les champs Firebase inexistants dans le schéma
    const KNOWN_CFG = ['space_code','openAll','openUntil','propMotif','currentSessionId',
      'logoB64','loanOpen','pdfFields','catAccess','contact','contactName',
      'meetingPlace','meetingTime','countryCode','shortLink','accentColor'];
    const safeFields = {};
    KNOWN_CFG.forEach(k => { if (cfgFields[k] !== undefined) safeFields[k] = cfgFields[k]; });
    await sbUpsertBatch('space_config', [{ space_code: SB_SPACE_ID, ...safeFields }]);
    console.log('  Config importée.');
  } else {
    console.log('  Aucune config trouvée — valeurs par défaut conservées.');
  }

  // 4. Compteurs (sous spaces/{FB_SPACE_ID}/counters/main)
  console.log('\n4. Compteurs...');
  const counters = await fbGetDoc(token, `spaces/${FB_SPACE_ID}/counters/main`);
  if (counters) {
    const { id: _id, ...cntFields } = counters;
    await sbUpsertBatch('space_counters', [{ space_code: SB_SPACE_ID, ...cntFields }]);
    console.log('  Compteurs importés.');
  } else {
    console.log('  Aucun compteur trouvé — valeurs par défaut conservées.');
  }

  // 5. Utilisateurs (sous spaces/{FB_SPACE_ID}/users)
  console.log('\n5. Utilisateurs...');
  const fbUsers = await fbGetAll(token, `spaces/${FB_SPACE_ID}/users`);
  console.log(`  ${fbUsers.length} utilisateurs trouvés.`);
  // Colonnes connues de la table users — on ignore les champs Firebase hors schéma
  const KNOWN_USERS = ['id','space_code','abbrev','prenom','nom','role','canPropose',
    'propUntil','disabled','photoB64','profession','whatsapp','commune','email',
    'expiresAt','neverExpires','canLoan','tabs','spiritualAccess','assignedShelves',
    'createdAt','updatedAt'];
  const NOW = new Date().toISOString();
  const userRows = fbUsers.map(u => {
    const row = {
      space_code:       SB_SPACE_ID,
      id:               parseInt(u.id) || parseInt(u.num) || undefined,
      abbrev:           u.abbrev || '',
      prenom:           u.prenom || '',
      nom:              u.nom || '',
      role:             u.role || 'member',
      canPropose:       u.canPropose === true,
      propUntil:        u.propUntil || null,
      disabled:         u.disabled === true,
      photoB64:         u.photoB64 || null,
      profession:       u.profession || '',
      whatsapp:         u.whatsapp || '',
      commune:          u.commune || '',
      email:            u.email || null,
      expiresAt:        u.expiresAt || null,
      neverExpires:     u.neverExpires === true,
      canLoan:          u.canLoan === true,
      tabs:             u.tabs || [],
      spiritualAccess:  u.spiritualAccess === true,
      assignedShelves:  u.assignedShelves || [],
      createdAt:        u.createdAt || NOW,
      updatedAt:        u.updatedAt || null,
    };
    return row;
  }).filter(u => u.id);
  await sbUpsertBatch('users', userRows);

  // 6. Livres (~1 810 docs sous spaces/{FB_SPACE_ID}/books)
  console.log('\n6. Livres...');
  const fbBooks = await fbGetAll(token, `spaces/${FB_SPACE_ID}/books`);
  console.log(`  ${fbBooks.length} livres trouvés.`);
  // Colonnes connues de la table books — on force les valeurs par défaut des colonnes NOT NULL
  const KNOWN_BOOKS = ['id','space_code','titre','auteur','cat','catType','lang','salle',
    'placard','etagere','annee','expl','ancienNouv','etat','editeur','resume','emoji',
    'featured','status','borrowedBy','borrowedUntil','activeLoans','addedAt','updatedAt',
    'updatedBy','version','lastModifiedBy','lastModifiedAt','lastModifiedRole'];
  const bookRows = fbBooks.map(b => {
    const row = { space_code: SB_SPACE_ID };
    row.id          = parseInt(b.id) || undefined;
    row.titre       = b.titre || '';
    row.auteur      = b.auteur || '';
    row.cat         = b.cat || 'Général';
    row.catType     = b.catType || 'academique';
    row.lang        = b.lang || '';
    row.salle       = b.salle || '';
    row.placard     = b.placard || '';
    row.etagere     = b.etagere || '';
    row.expl        = parseInt(b.expl) || 1;
    row.activeLoans = parseInt(b.activeLoans) || 0;
    row.version     = parseInt(b.version) || 1;
    row.annee       = b.annee ? parseInt(b.annee) : null;
    row.featured    = b.featured === true;   // NOT NULL DEFAULT false
    row.status      = b.status || 'available';
    row.emoji       = b.emoji || '📖';
    row.ancienNouv  = b.ancienNouv || '';
    row.etat        = b.etat || '';
    row.editeur     = b.editeur || '';
    row.resume      = b.resume || '';
    // Champs optionnels
    KNOWN_BOOKS.forEach(k => {
      if (!(k in row) && b[k] !== undefined) row[k] = b[k];
    });
    return row;
  }).filter(b => b.id);
  await sbUpsertBatch('books', bookRows);

  // 7. Prêts
  console.log('\n7. Prêts...');
  const fbLoans = await fbGetAll(token, `spaces/${FB_SPACE_ID}/loans`);
  console.log(`  ${fbLoans.length} prêts trouvés.`);
  if (fbLoans.length > 0) {
    const KNOWN_LOANS = ['id','space_code','bookId','bookTitle','userId','userAbbrev',
      'userName','status','dueDate','requestedAt','approvedAt','returnedAt','validatedAt','validatedBy'];
    const loanRows = fbLoans.map(l => {
      const row = { space_code: SB_SPACE_ID };
      KNOWN_LOANS.forEach(k => { if (l[k] !== undefined) row[k] = l[k]; });
      return row;
    }).filter(l => l.id);
    await sbUpsertBatch('loans', loanRows);
  }

  // 8. Sessions de demande
  console.log('\n8. Sessions de demande...');
  const fbSessions = await fbGetAll(token, `spaces/${FB_SPACE_ID}/sessions`);
  console.log(`  ${fbSessions.length} sessions trouvées.`);
  if (fbSessions.length > 0) {
    const sesRows = fbSessions.map(s => ({
      ...s, id: parseInt(s.id), space_code: SB_SPACE_ID
    })).filter(s => s.id);
    await sbUpsertBatch('request_sessions', sesRows);
  }

  // 9. Demandes de livres
  console.log('\n9. Demandes de livres...');
  const fbRequests = await fbGetAll(token, `spaces/${FB_SPACE_ID}/requests`);
  console.log(`  ${fbRequests.length} demandes trouvées.`);
  if (fbRequests.length > 0) {
    const validUserIds = new Set(userRows.map(u => u.id));
    const reqRows = fbRequests.map(r => ({
      ...r, id: parseInt(r.id), space_code: SB_SPACE_ID,
      sessionId: r.sessionId ? parseInt(r.sessionId) : null,
      // dem → null si l'utilisateur référencé n'existe pas dans la migration
      dem: r.dem && validUserIds.has(parseInt(r.dem)) ? parseInt(r.dem) : null,
    })).filter(r => r.id);
    await sbUpsertBatch('book_requests', reqRows);
  }

  // 10. Inscriptions
  console.log('\n10. Inscriptions...');
  const fbRegs = await fbGetAll(token, `spaces/${FB_SPACE_ID}/registrations`);
  console.log(`  ${fbRegs.length} inscriptions trouvées.`);
  if (fbRegs.length > 0) {
    const KNOWN_REGS = ['id','space_code','prenom','nom','whatsapp','commune','profession',
      'email','status','submittedAt','assignedRole','createdAbbrev','createdUserId','processedAt'];
    const regRows = fbRegs.map(r => {
      const row = { space_code: SB_SPACE_ID };
      KNOWN_REGS.forEach(k => { if (r[k] !== undefined) row[k] = r[k]; });
      return row;
    }).filter(r => r.id);
    await sbUpsertBatch('registrations', regRows);
  }

  // 11. Logs de connexion
  console.log('\n11. Logs de connexion...');
  const fbLogs = await fbGetAll(token, `spaces/${FB_SPACE_ID}/loginLog`);
  console.log(`  ${fbLogs.length} logs trouvés.`);
  if (fbLogs.length > 0) {
    const logRows = fbLogs.map(l => ({
      ...l, id: parseInt(l.id), space_code: SB_SPACE_ID,
      userId: l.userId ? parseInt(l.userId) : null,
    })).filter(l => l.id);
    await sbUpsertBatch('login_logs', logRows);
  }

  // 12. Utilisateurs supprimés
  console.log('\n12. Utilisateurs supprimés...');
  const fbDeleted = await fbGetAll(token, `spaces/${FB_SPACE_ID}/deletedUsers`);
  console.log(`  ${fbDeleted.length} entrées.`);
  if (fbDeleted.length > 0) {
    const delRows = fbDeleted.map(d => ({ ...d, space_code: SB_SPACE_ID }));
    await sbUpsertBatch('deleted_users', delRows);
  }

  // 13. Vérifications d'étagères
  console.log('\n13. Vérifications d\'étagères...');
  const fbChecks = await fbGetAll(token, `spaces/${FB_SPACE_ID}/shelfChecks`);
  console.log(`  ${fbChecks.length} vérifications.`);
  if (fbChecks.length > 0) {
    const validUserIds = new Set(userRows.map(u => u.id));
    const checkRows = fbChecks.map(c => ({
      ...c, id: parseInt(c.id), space_code: SB_SPACE_ID,
      userId: c.userId && validUserIds.has(parseInt(c.userId)) ? parseInt(c.userId) : null,
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
  } else {
    console.log('  Hash super-admin absent dans Firebase — inchangé dans Supabase.');
  }

  // ─── Résumé ───────────────────────────────────────────────────────────────
  console.log('\n╔══════════════════════════════════════════════╗');
  console.log('║           MIGRATION TERMINÉE ✓               ║');
  console.log('╚══════════════════════════════════════════════╝');
  console.log(`
  Résumé :
  - Espace       : 1 (${SB_SPACE_ID})
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
