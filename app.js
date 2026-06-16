/* ═══════════════════════════════════════════════════════════════
   SUPABASE — Backend PostgreSQL
   Fonctionne sur Netlify, GitHub Pages, partout.
═══════════════════════════════════════════════════════════════ */
/* ═══════════════════════════════════════════════════════════════
   MULTI-ESPACES — Les centres sont gérés dans Supabase.
   Table racine : spaces (colonne code)
   Accès super-admin : /{code}  où code = '~admin'
═══════════════════════════════════════════════════════════════ */

/* Échappe le HTML pour prévenir les XSS dans les innerHTML */
function esc(s){if(s==null)return'';const d=document.createElement('div');d.textContent=String(s);return d.innerHTML;}

/* Tagged template : échappe automatiquement toutes les interpolations.
   Utiliser safe(expr) pour les fragments HTML de confiance (ex: rBdg(), sBdg()).
   Usage : el.innerHTML = html`<div>${b.titre} ${safe(rBdg(b.role))}</div>` */
function html(strings,...vals){return strings.reduce((out,str,i)=>{if(i>=vals.length)return out+str;const v=vals[i];if(v==null)return out+str;if(typeof v==='object'&&v.__html===true)return out+str+v.v;return out+str+esc(v);},'')}
function safe(v){return{__html:true,v:v??''}}

/* Lecture du code depuis l'URL */
/* ════════════════════════════════════════════════════════════
   CODE PAR DÉFAUT — Espace Supabase par défaut
   Code opaque (difficile à deviner) pour éviter l'énumération
   entre bibliothèques.
════════════════════════════════════════════════════════════ */
const DEFAULT_SPACE = 'f9a0-60a0-5274';

/* Capture SYNCHRONE des jetons d'invitation / réinitialisation, AVANT que le
   SDK Supabase ne les consomme et n'efface le hash de l'URL.
   Supabase utilise selon la config :
     • flux implicite  : #access_token=…&refresh_token=…&type=invite|recovery
     • flux token_hash : ?token_hash=…&type=invite|recovery
     • flux PKCE       : ?code=…
   On lit hash ET query pour couvrir tous les cas. */
const _recoveryTokens = (function(){
  const out = {};
  const grab = (sp) => {
    if(sp.get('access_token'))  out.access_token  = sp.get('access_token');
    if(sp.get('refresh_token')) out.refresh_token = sp.get('refresh_token');
    if(sp.get('token_hash'))    out.token_hash    = sp.get('token_hash');
    if(sp.get('code'))          out.code          = sp.get('code');
    if(sp.get('type'))          out.type          = sp.get('type');
    if(sp.get('error'))         out.error         = sp.get('error_description') || sp.get('error');
  };
  try{ grab(new URLSearchParams(window.location.hash.replace(/^#/,''))); }catch(_){}
  try{ grab(new URLSearchParams(window.location.search)); }catch(_){}
  return out;
})();

/* Détection SYNCHRONE du flux invitation / réinitialisation de mot de passe. */
const _isRecoveryFlow = !!(_recoveryTokens.access_token || _recoveryTokens.token_hash
    || _recoveryTokens.type === 'invite' || _recoveryTokens.type === 'recovery'
    || _recoveryTokens.error)
  || new URLSearchParams(window.location.search).get('setpw') === '1';

/* Détection du mode et de l'espace depuis l'URL
   /book/[code]  → catalogue public sans connexion
   /[code]       → app complète avec connexion
   /             → page d'accueil neutre */
const _urlParts = window.location.pathname.split('/').filter(Boolean).filter(p=>!/\.(html?|php|asp)$/i.test(p));
const IS_PUBLIC_VIEW = _urlParts[0] === 'book'; /* /book/[code] → vue publique */

const SPACE_ID = (function(){
  const proto = window.location.protocol;
  const host  = window.location.hostname;
  const isLocal = proto === 'file:' || host === 'localhost' || host === '127.0.0.1';
  if(proto === 'file:') return DEFAULT_SPACE;

  if(IS_PUBLIC_VIEW){
    /* /book/[code] → l'espace est le 2e segment */
    return _urlParts[1] ? decodeURIComponent(_urlParts[1]).toLowerCase() : DEFAULT_SPACE;
  }
  /* /[code] → l'espace est le 1er segment */
  if(isLocal && _urlParts.length === 0) return DEFAULT_SPACE;
  if(_urlParts[0]) return decodeURIComponent(_urlParts[0]).toLowerCase();
  /* Lien d'invitation/réinitialisation sans code espace → espace par défaut.
     Supabase place le token dans le fragment (#access_token=…&type=invite). */
  const hasAuthToken = window.location.hash.includes('access_token') || new URLSearchParams(window.location.search).get('setpw');
  return hasAuthToken ? DEFAULT_SPACE : null;
})();

/* ── URL de l'application mobile v2 (React) ──────────────────────────
   Remplir après déploiement Netlify de v2/ en tant que site séparé.
   Exemple : 'https://comoebiblio-app.netlify.app'
   Laisser vide ('') pour désactiver la redirection mobile.
────────────────────────────────────────────────────────────────────── */
const V2_URL = '';

/* Redirection automatique mobile → v2.
   On ne redirige PAS si un token auth est présent dans l'URL
   (lien d'invitation ou réinitialisation) : le flux PASSWORD_RECOVERY
   doit se terminer ici avant tout. */
(function(){
  if(!V2_URL) return;
  const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  if(!isMobile) return;
  const hasAuthToken = window.location.hash.includes('access_token') || new URLSearchParams(window.location.search).get('setpw');
  if(hasAuthToken) return;
  window.location.replace(V2_URL + window.location.pathname);
})();

/* Super-admin : le mot de passe N'EST PAS stocké ici.
   Il est stocké sous forme de hash SHA-256 dans Supabase :
   Table : super_admin_config / champ : pwdHash */
const SUPER_ADMIN_CODE = '~admin';

/* Espace courant (chargé depuis Supabase) */
let SPACE = null;

/* ── Supabase credentials ── */
const SB_URL = 'https://ktknaajjtmhevsafrpjv.supabase.co';
const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt0a25hYWpqdG1oZXZzYWZycGp2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA3NjQzMTMsImV4cCI6MjA5NjM0MDMxM30.-g5AA1lnvMYEOp9HrHayTant_FXKhJRoW65oX9JOwJ4';
let sb = null;

function _initSb(){
  if(sb)return;
  sb = supabase.createClient(SB_URL, SB_KEY);
  /* Lien d'invitation / réinitialisation : Supabase établit une session de
     récupération à partir du fragment d'URL → proposer la définition du mot de passe. */
  try{
    sb.auth.onAuthStateChange((event)=>{
      if(event==='PASSWORD_RECOVERY')openSetPwd();
    });
  }catch(_){}
}

/* ── Établit (ou rétablit) la session de récupération à partir des jetons
   capturés au chargement. Idempotent pour le flux implicite (setSession avec
   access/refresh peut être rappelé sans risque). Renvoie {ok, error?}. ── */
async function _establishRecoverySession(){
  _initSb();
  /* Déjà une session active ? */
  try{ const {data:{session}}=await sb.auth.getSession(); if(session)return {ok:true}; }catch(_){}
  /* Lien expiré / déjà utilisé : erreur explicite renvoyée par Supabase. */
  if(_recoveryTokens.error) return {ok:false,error:_recoveryTokens.error};
  /* 1) Flux implicite — le plus fiable (jetons JWT, ré-applicables). */
  if(_recoveryTokens.access_token && _recoveryTokens.refresh_token){
    try{
      const {error}=await sb.auth.setSession({
        access_token:_recoveryTokens.access_token,
        refresh_token:_recoveryTokens.refresh_token
      });
      if(!error){const {data:{session}}=await sb.auth.getSession();if(session)return {ok:true};}
      else return {ok:false,error:error.message};
    }catch(e){return {ok:false,error:e.message};}
  }
  /* 2) Flux token_hash — verifyOtp (jeton à usage unique). */
  if(_recoveryTokens.token_hash){
    try{
      const {error}=await sb.auth.verifyOtp({token_hash:_recoveryTokens.token_hash,type:_recoveryTokens.type||'recovery'});
      if(!error){const {data:{session}}=await sb.auth.getSession();if(session)return {ok:true};}
      else return {ok:false,error:error.message};
    }catch(e){return {ok:false,error:e.message};}
  }
  /* 3) Flux PKCE — exchangeCodeForSession (jeton à usage unique). */
  if(_recoveryTokens.code){
    try{
      const {error}=await sb.auth.exchangeCodeForSession(_recoveryTokens.code);
      if(!error){const {data:{session}}=await sb.auth.getSession();if(session)return {ok:true};}
      else return {ok:false,error:error.message};
    }catch(e){return {ok:false,error:e.message};}
  }
  return {ok:false,error:'Aucune session de récupération valide.'};
}

/* ── Mapping noms collections → tables Supabase ── */
function _colToTable(col){
  const m={
    loginLog:'login_logs', deletedUsers:'deleted_users',
    shelfChecks:'shelf_checks', requests:'book_requests',
    sessions:'request_sessions', config:'space_config',
    counters:'space_counters'
  };
  return m[col]||col;
}

/* ── Lecture de toutes les lignes d'une collection (espace courant) ── */
async function sbGetAll(col){
  _initSb();
  const tbl=_colToTable(col);
  const PAGE=1000;
  let all=[],from=0;
  while(true){
    const {data,error}=await sb.from(tbl).select('*').eq('space_code',SPACE_ID).range(from,from+PAGE-1);
    if(error)throw new Error(error.message);
    all.push(...(data||[]));
    if(!data||data.length<PAGE)break;
    from+=PAGE;
  }
  return all;
}

/* ── Lecture d'un document unique ── */
async function sbGetDoc(col,id){
  _initSb();
  const tbl=_colToTable(col);
  /* space_config et space_counters n'ont pas de colonne id — leur PK est space_code */
  if(col==='config'||col==='counters'){
    const {data,error}=await sb.from(tbl).select('*').eq('space_code',SPACE_ID).maybeSingle();
    if(error)throw new Error(error.message);
    return data;
  }
  const {data,error}=await sb.from(tbl).select('*').eq('id',id).eq('space_code',SPACE_ID).maybeSingle();
  if(error)throw new Error(error.message);
  return data;
}

/* ── Lecture racine (_spaces → table spaces, __superadmin__ → super_admin_config) ── */
async function sbGetDocRoot(col,id){
  _initSb();
  if(col==='_spaces'){
    const {data,error}=await sb.from('spaces').select('*').eq('code',id).maybeSingle();
    if(error)throw new Error(error.message);
    return data;
  }
  /* __superadmin__ */
  const {data}=await sb.from('super_admin_config').select('*').eq('id',1).maybeSingle();
  return data;
}

/* ── Lecture de toutes les bibliothèques (super-admin) ── */
async function sbGetAllRoot(col){
  _initSb();
  const {data}=await sb.from('spaces').select('*');
  return data||[];
}

/* ── Écriture racine (spaces ou super_admin_config) ── */
async function sbSetRoot(col,id,data){
  _initSb();
  if(col==='_spaces'){
    const {error}=await sb.from('spaces').upsert({...data,code:id},{onConflict:'code'});
    if(error)throw new Error(error.message);
  } else {
    const {error}=await sb.from('super_admin_config').upsert({id:1,...data});
    if(error)throw new Error(error.message);
  }
}

/* ── Écriture / remplacement d'un document ── */
async function sbSet(col,id,data){
  _initSb();
  const tbl=_colToTable(col);
  /* space_config et space_counters n'ont pas de colonne id */
  if(col==='config'||col==='counters'){
    const {error}=await sb.from(tbl).upsert({...data,space_code:SPACE_ID});
    if(error)throw new Error(error.message);
    return;
  }
  const {error}=await sb.from(tbl).upsert({...data,id,space_code:SPACE_ID});
  if(error)throw new Error(error.message);
}

/* ── Mise à jour partielle ── */
async function sbUpd(col,id,data){
  _initSb();
  if(!Object.keys(data).length)return;
  const tbl=_colToTable(col);
  /* space_config et space_counters n'ont pas de colonne id */
  if(col==='config'||col==='counters'){
    const {error}=await sb.from(tbl).update(data).eq('space_code',SPACE_ID);
    if(error){console.warn('sbUpd error:',error.message);throw new Error(error.message);}
    return;
  }
  const {error}=await sb.from(tbl).update(data).eq('id',id).eq('space_code',SPACE_ID);
  if(error){console.warn('sbUpd error:',error.message);throw new Error(error.message);}
}

/* ── Suppression ── */
async function sbDel(col,id){
  _initSb();
  const tbl=_colToTable(col);
  const {error}=await sb.from(tbl).delete().eq('id',id).eq('space_code',SPACE_ID);
  if(error)console.warn('sbDel error:',error.message);
}

/* ── Écriture en lot ── */
async function sbBatchSet(col,docs){
  if(!docs||!docs.length)return;
  _initSb();
  const tbl=_colToTable(col);
  const enriched=docs.map(d=>({...d,space_code:SPACE_ID}));
  for(let i=0;i<enriched.length;i+=500){
    const {error}=await sb.from(tbl).upsert(enriched.slice(i,i+500));
    if(error)throw new Error(error.message);
  }
}

/* ── Suppression en lot ── */
async function sbBatchDel(col,ids){
  if(!ids||!ids.length)return;
  _initSb();
  const tbl=_colToTable(col);
  const {error}=await sb.from(tbl).delete().in('id',ids.map(String)).eq('space_code',SPACE_ID);
  if(error)console.warn('sbBatchDel error:',error.message);
}

/* sbSaveCounters : n'écrit que si les compteurs ont réellement changé. */
let _lastSavedCounters='';
async function sbSaveCounters(){
  const current=JSON.stringify({nxB,nxU,nxR,nxS,nxL,nxSC,nxReg});
  if(current===_lastSavedCounters)return;
  _initSb();
  const {error}=await sb.from('space_counters')
    .upsert({space_code:SPACE_ID,nxB,nxU,nxR,nxS,nxL,nxSC,nxReg});
  if(!error)_lastSavedCounters=current;
}

/* ID utilisateur anti-collision : max(ids existants, nxU) + 1. */
function _nextUserId(){
  let maxId=nxU-1;
  users.forEach(u=>{const n=parseInt(u.id);if(!isNaN(n)&&n>maxId)maxId=n;});
  const newId=maxId+1;
  nxU=newId+1;
  return newId;
}

/* ID livre anti-collision : max(ids existants, nxB) + 1.
   Évite qu'un nxB obsolète n'écrase un livre existant via upsert. */
function _nextBookId(){
  let maxId=nxB-1;
  books.forEach(b=>{const n=parseInt(b.id);if(!isNaN(n)&&n>maxId)maxId=n;});
  const newId=maxId+1;
  nxB=newId+1;
  return newId;
}

/* Déduplique un tableau d'objets par leur id (garde la dernière occurrence) */
function _dedupById(arr){
  const map=new Map();
  arr.forEach(x=>map.set(String(x.id),x));
  return [...map.values()];
}
async function sbSaveCfg(){
  _initSb();
  const {error}=await sb.from('space_config').upsert({space_code:SPACE_ID,...cfg});
  if(error)throw new Error(error.message);
}

/* Enregistrer le contact du chargé de bibliothèque (affiché sur la page publique) */
async function saveContact(){
  const num=document.getElementById('adm-contact')?.value.trim()||'';
  const name=document.getElementById('adm-contact-name')?.value.trim()||'';
  const place=document.getElementById('adm-meeting-place')?.value.trim()||'';
  const time=document.getElementById('adm-meeting-time')?.value.trim()||'';
  const countryCode=document.getElementById('adm-country-code')?.value.trim()||'';
  const shortLink=document.getElementById('adm-short-link')?.value.trim()||'';
  cfg.contact=num;cfg.contactName=name;cfg.meetingPlace=place;cfg.meetingTime=time;
  cfg.countryCode=countryCode;cfg.shortLink=shortLink;
  const msg=document.getElementById('adm-contact-msg');
  try{
    await sbUpd('config','main',{contact:num,contactName:name,meetingPlace:place,meetingTime:time,countryCode:countryCode,shortLink});
    _cachePut({config:cfg});
    if(msg){msg.style.color='#16a34a';msg.textContent='✅ Enregistré';setTimeout(()=>{if(msg)msg.textContent='';},3000);}
  }catch(e){if(msg){msg.style.color='#dc2626';msg.textContent='Erreur : '+e.message;}}
}

/* ═══════════════════════════════════════════════════════════════
   IN-MEMORY DATA (chargé depuis Supabase au démarrage)
═══════════════════════════════════════════════════════════════ */
let books=[], users=[], requests=[], sessions=[], loginLog=[],deletedUsers=[],loans=[],shelfChecks=[],registrations=[];
let cfg={openAll:false,openUntil:null,propMotif:'',currentSessionId:null,logoB64:null,loanOpen:false,pdfFields:['num','titre','auteur','desc','demandeur'],catAccess:{member:['academique'],commission:['academique','spirituel'],resident:['academique'],enrol:['academique','spirituel'],admin:['academique','spirituel']},catTypes:[]};
let curUser=null, bfSrc='adm', bfEid=null, ufEid=null;
let nxB=13, nxU=7, nxR=3, nxS=2, nxL=1, nxSC=1, nxReg=1;

/* ── Catalogues disponibles : builtins + catalogues custom créés par l'admin ── */
const _CAT_BUILTINS=[
  {id:'academique',label:'Académique',emoji:'📚',builtin:true},
  {id:'spirituel', label:'Spirituel', emoji:'🕊️',builtin:true,requiresIndivAccess:true}
];
function _getCatTypes(){
  const custom=(cfg.catTypes||[]).filter(t=>t&&t.id&&!['academique','spirituel'].includes(t.id));
  return [..._CAT_BUILTINS,...custom];
}
function _populateCatTypeSelect(){
  const el=document.getElementById('bfct');if(!el)return;
  const cur=el.value;
  el.innerHTML=_getCatTypes().map(t=>`<option value="${esc(t.id)}">${esc(t.emoji)} ${esc(t.label)}</option>`).join('');
  if(cur&&[...el.options].some(o=>o.value===cur))el.value=cur;
}
let impRaw=[], impHdr=[], impMap=[], impParsed=[];

/* Données par défaut (premier lancement) */
const DEFAULT_BOOKS=[
  {id:1,catType:'academique',titre:"Things Fall Apart",auteur:"Chinua Achebe",cat:"Littérature africaine",salle:"Salle du bas",placard:"A",etagere:"1",lang:"Anglais",annee:1958,expl:1,ancienNouv:"Ancien",etat:"Bon",editeur:"Heinemann",resume:"Roman fondateur de la littérature africaine.",emoji:"🌍",status:"available"},
  {id:2,titre:"L'Aventure ambiguë",auteur:"Cheikh Hamidou Kane",cat:"Littérature",salle:"Salle du bas",placard:"B",etagere:"2",lang:"Français",annee:1961,expl:2,ancienNouv:"Ancien",etat:"Bon",editeur:"Julliard",resume:"Samba Diallo, écartelé entre foi islamique et philosophie occidentale.",emoji:"🕌",status:"available"},
  {id:3,titre:"Gouverneurs de la rosée",auteur:"Jacques Roumain",cat:"Roman",salle:"Salle du bas",placard:"B",etagere:"3",lang:"Français",annee:1944,expl:1,ancienNouv:"Ancien",etat:"Moyen",editeur:"Éd. Français Réunis",resume:"Manuel revient en Haïti.",emoji:"🌿",status:"available"},
  {id:4,titre:"L'Enfant noir",auteur:"Camara Laye",cat:"Autobiographie",salle:"Salle du bas",placard:"C",etagere:"1",lang:"Français",annee:1953,expl:1,ancienNouv:"Ancien",etat:"Bon",editeur:"Plon",resume:"Récit autobiographique d'une enfance en Guinée.",emoji:"✨",status:"available"},
  {id:5,titre:"Une si longue lettre",auteur:"Mariama Bâ",cat:"Roman",salle:"Salle du bas",placard:"B",etagere:"1",lang:"Français",annee:1979,expl:2,ancienNouv:"Ancien",etat:"Bon",editeur:"NEA",resume:"Roman féministe pionnier.",emoji:"✉️",status:"available"},
  {id:6,titre:"Les Soleils des indépendances",auteur:"Ahmadou Kourouma",cat:"Littérature africaine",salle:"Salle du bas",placard:"A",etagere:"2",lang:"Français",annee:1968,expl:1,ancienNouv:"Ancien",etat:"Moyen",editeur:"Univ. Montréal",resume:"Fama, prince malinké déchu.",emoji:"☀️",status:"available"},
  {id:7,titre:"Histoire de la Côte d'Ivoire",auteur:"Harris Memel-Fotê",cat:"Histoire",salle:"Salle du bas",placard:"D",etagere:"1",lang:"Français",annee:1998,expl:1,ancienNouv:"Nouveau",etat:"Bon",editeur:"AMI",resume:"Référence sur l'histoire de la Côte d'Ivoire.",emoji:"📜",status:"available"},
  {id:8,titre:"Intelligence artificielle",auteur:"Russell & Norvig",cat:"Informatique",salle:"Salle du bas",placard:"E",etagere:"1",lang:"Anglais",annee:2020,expl:1,ancienNouv:"Nouveau",etat:"Bon",editeur:"Pearson",resume:"La référence en IA.",emoji:"🤖",status:"available"},
  {id:9,titre:"Le Petit Prince",auteur:"Antoine de Saint-Exupéry",cat:"Jeunesse / Philosophie",salle:"Salle du bas",placard:"F",etagere:"1",lang:"Français",annee:1943,expl:3,ancienNouv:"Ancien",etat:"Bon",editeur:"Gallimard",resume:"Conte philosophique sur l'amour et l'amitié.",emoji:"🌹",status:"available"},
  {id:10,titre:"Droit des affaires OHADA",auteur:"Y.R. Kalieu Elongo",cat:"Droit",salle:"Salle du bas",placard:"G",etagere:"2",lang:"Français",annee:2015,expl:2,ancienNouv:"Nouveau",etat:"Bon",editeur:"PUA",resume:"Manuel complet sur le droit OHADA.",emoji:"⚖️",status:"available"},
  {id:11,titre:"Le Goût des études",auteur:"Massimo Piatteli Palmarini",cat:"Roman",salle:"Salle du bas",placard:"I",etagere:"5",lang:"Français",annee:null,expl:1,ancienNouv:"Nouveau",etat:"Bon",editeur:"",resume:"Comment acquérir le goût des études.",emoji:"📖",status:"available"},
  {id:12,titre:"El arte de la guerra",auteur:"Sun Tzu",cat:"Œuvre littéraire",salle:"Salle du bas",placard:"G",etagere:"1",lang:"Espagnol",annee:null,expl:1,ancienNouv:"Ancien",etat:"Bon",editeur:"",resume:"Traité de stratégie et d'art militaire.",emoji:"⚔️",status:"available"},
];
const DEFAULT_USERS=[
  {id:1,abbrev:'admin',prenom:'Administrateur',nom:'Bibliothèque',role:'admin',canPropose:true,propUntil:null,disabled:false},
  {id:2,abbrev:'com1',prenom:'Kouadio Serge',nom:'KOFFI',role:'commission',canPropose:true,propUntil:null,disabled:false},
  {id:3,abbrev:'enrol1',prenom:'Bamba Yves',nom:'COULIBALY',role:'enrol',canPropose:false,propUntil:null,disabled:false},
  {id:4,abbrev:'ama',prenom:'Amani Louise',nom:'BROU',role:'member',canPropose:true,propUntil:null,disabled:false},
  {id:5,abbrev:'sax',prenom:'Touré Wilfried',nom:'SAXUM',role:'member',canPropose:false,propUntil:null,disabled:false},
  {id:6,abbrev:'res1',prenom:'Konan Paul',nom:'YEBOU',role:'resident',canPropose:false,propUntil:null,disabled:false},
];

/* ═══════════════════════════════════════════════════════════════
   LOADING / ERROR UI
═══════════════════════════════════════════════════════════════ */
function showLoading(msg=''){
  const ol=document.getElementById('fb-loading');
  if(!ol)return;
  if(msg){ol.style.display='flex';document.getElementById('fb-loading-msg').textContent=msg;}
  else ol.style.display='flex';
}
function hideLoading(){
  const ol=document.getElementById('fb-loading');
  if(ol){
    ol.style.opacity='0';
    setTimeout(()=>{ol.style.display='none';ol.style.opacity='1';},300);
  }
}
function showFbError(msg,detail=''){
  _hideSplash();
  const el=document.getElementById('fb-error');
  if(!el)return;
  el.style.display='block';
  el.querySelector('span').innerHTML='<strong>'+esc(msg)+'</strong>'+(detail?'<br><small style="opacity:.75;font-size:12px">'+detail+'</small>':'');
}

function showNotFound(){
  _hideSplash();
  hideLoading();
  document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'));
  const nf=document.getElementById('v-notfound');
  if(nf)nf.classList.add('active');
  const urlEl=document.getElementById('nf-url-display');
  if(urlEl)urlEl.textContent='Code : '+(SPACE_ID||'(aucun)');
}
function showWelcome(){
  hideLoading();
  document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'));
  const wv=document.getElementById('v-welcome');
  if(wv){wv.classList.add('active');return;}
  /* Créer dynamiquement la page d'accueil si elle n'existe pas */
  const div=document.createElement('div');
  div.id='v-welcome';
  div.style.cssText='min-height:100vh;display:flex;align-items:center;justify-content:center;background:linear-gradient(145deg,#0a0a0f,#1a1a28);padding:24px;text-align:center';
  div.innerHTML=`
    <div style="max-width:480px">
      <div style="width:80px;height:80px;background:linear-gradient(135deg,#6366f1,#8b5cf6);border-radius:22px;display:flex;align-items:center;justify-content:center;font-size:36px;margin:0 auto 24px;box-shadow:0 12px 40px rgba(99,102,241,.4)">📚</div>
      <h1 style="font-family:'Cormorant Garamond',serif;font-size:40px;color:white;margin-bottom:12px;letter-spacing:-.5px">Biblio<span style="color:#a5b4fc">App</span></h1>
      <p style="color:rgba(255,255,255,.5);font-size:15px;line-height:1.7;margin-bottom:32px">Plateforme de gestion de bibliothèques.<br>Accédez à votre espace via le lien fourni par votre bibliothèque.</p>
      <div style="background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.1);border-radius:14px;padding:20px 24px;color:rgba(255,255,255,.4);font-size:13px;line-height:1.8">
        🔗 Format d'accès : <code style="background:rgba(255,255,255,.08);padding:2px 8px;border-radius:5px;color:#a5b4fc">votresite.netlify.app/<strong>code-biblio</strong></code>
      </div>
    </div>`;
  document.body.appendChild(div);
}
/* ── Applique le thème du centre à l'interface ── */
function applySpaceTheme(){
  /* Ne jamais appliquer sur la page super-admin */
  if(!SPACE||SPACE_ID===SUPER_ADMIN_CODE)return;
  document.title=SPACE.short+' — '+SPACE.name;
  document.querySelectorAll('.nbr').forEach(el=>{
    const logoSpan=el.querySelector('[id^="nbr-logo-"]');
    const txt=logoSpan?logoSpan.outerHTML:'';
    el.innerHTML=txt+`<span style="font-family:'Cormorant Garamond',serif">${esc(SPACE.short)}</span>`;
  });
  const loginTitle=document.getElementById('login-title');
  if(loginTitle)loginTitle.innerHTML=esc(SPACE.short).replace(/([A-ZÀÂÉÈÊËÎÏÔÙÛÜÇ][a-zàâéèêëîïôùûüç]+)([A-ZÀÂÉÈÊËÎÏÔÙÛÜÇ].*)/, '$1<span>$2</span>');
  const loginSub=document.getElementById('login-tagline');
  if(loginSub)loginSub.textContent=SPACE.tagline;
  if(SPACE.color)applyColorVars(SPACE.color);
  /* Mettre à jour le sous-titre de l'espace admin */
  const admName=document.getElementById('adm-space-name');
  if(admName)admName.textContent='Responsable de la bibliothèque · '+(SPACE.name||SPACE.short||SPACE.code);
  /* Favicon dynamique généré via canvas */
  try{
    const c=document.createElement('canvas');c.width=32;c.height=32;
    const ctx=c.getContext('2d');
    const color=SPACE.color||'#22806B';
    ctx.fillStyle=color;
    ctx.beginPath();ctx.roundRect(0,0,32,32,8);ctx.fill();
    ctx.fillStyle='white';ctx.font='bold 20px sans-serif';
    ctx.textAlign='center';ctx.textBaseline='middle';
    ctx.fillText('📚',16,17);
    let link=document.querySelector('link[rel="icon"]');
    if(!link){link=document.createElement('link');link.rel='icon';document.head.appendChild(link);}
    link.href=c.toDataURL();
  }catch(e){}
}

async function loadAllData(){
  const dbg=[];

  /* ── Vue publique /book/[code] : afficher le shell IMMÉDIATEMENT sans auth ── */
  if(IS_PUBLIC_VIEW){
    /* Forcer l'affichage de vpub — style inline + class (double sécurité) */
    hideLoading();
    /* Cacher TOUTES les vues */
    document.querySelectorAll('.view').forEach(v=>{v.classList.remove('active');v.style.display='none';});
    /* Afficher vpub avec style inline — indépendant du CSS */
    let vpubEl=document.getElementById('vpub');
    if(!vpubEl){
      /* vpub absent du HTML déployé → le créer dynamiquement */
      vpubEl=document.createElement('div');vpubEl.id='vpub';vpubEl.className='view';
      document.body.insertBefore(vpubEl,document.body.firstChild);
    }
    vpubEl.style.cssText='display:block!important;min-height:100vh;background:var(--bg,#f8fafc);font-family:inherit';
    vpubEl.classList.add('active');
    /* Injecter le shell minimal si le contenu est absent */
    if(!document.getElementById('pub-cgrid')){
      vpubEl.innerHTML=`
        <nav style="background:var(--navy,#1c4370);color:white;padding:0 20px;height:60px;display:flex;align-items:center;justify-content:space-between;position:sticky;top:0;z-index:100">
          <span style="font-size:18px;font-weight:700">📚 ComoéBiblio</span>
          <div style="display:flex;gap:8px">
            <button onclick="openPubRegister()" style="background:#22c55e;color:white;font-size:13px;padding:7px 14px;border:none;border-radius:8px;cursor:pointer;font-family:inherit;white-space:nowrap;font-weight:600">✍️ S'inscrire</button>
            <a id="pub-login-btn" href="#" style="color:white;font-size:13px;padding:7px 14px;border:1px solid rgba(255,255,255,.4);border-radius:8px;text-decoration:none;white-space:nowrap">🔑 Connexion</a>
          </div>
        </nav>
        <div style="padding:20px 20px 8px">
          <h2 id="pub-hero-title" style="font-size:22px;color:var(--navy,#1c4370);margin-bottom:4px">Catalogue de la Bibliothèque</h2>
          <p style="color:#64748b;font-size:13px;margin:0">Consultation libre · Catalogue académique</p>
        </div>
        <div id="pub-filters-wrap"></div>
        <div id="pub-cgrid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:12px;padding:0 20px 40px"></div>`;
      /* Bouton connexion */
      const btn=document.getElementById('pub-login-btn');
      if(btn){const loginUrl=window.location.href.replace('/book/'+SPACE_ID,'/'+SPACE_ID)+'?login=1';
        btn.href=loginUrl;btn.onclick=e=>{e.preventDefault();window.location.href=loginUrl;};}
    }
    const _g=()=>document.getElementById('pub-cgrid');
    const _status=(icon,msg,detail='')=>{
      const g=_g();
      if(g)g.innerHTML=html`<div style="grid-column:1/-1;text-align:center;padding:48px 16px">
        <div style="font-size:32px;margin-bottom:10px">${icon}</div>
        <div style="font-size:14px;color:var(--g600);font-weight:500">${msg}</div>
        ${safe(detail?`<div style="font-size:12px;color:var(--g400);margin-top:6px;max-width:400px;margin-left:auto;margin-right:auto;line-height:1.6">${esc(detail)}</div>`:'')}

      </div>`;
    };
    _status('📚','Chargement du catalogue…');

    /* Tout le flux dans une fonction async auto-appelée avec gestion d'erreur totale */
    (async()=>{
      _initSb();

      /* Étape 1 : Lire l'espace pour le nom de la bibliothèque (optionnel) */
      try{
        const ck='cb_space_'+SPACE_ID;
        let sp=null;
        try{const c=JSON.parse(localStorage.getItem(ck)||'null');
          if(c&&c._ts&&Date.now()-c._ts<3600000)sp=c;}catch(e){}
        if(!sp){
          sp=await sbGetDocRoot('_spaces',SPACE_ID);
          if(sp){try{localStorage.setItem(ck,JSON.stringify({...sp,_ts:Date.now()}));}catch(e){}}
        }
        if(sp&&sp.active!==false){
          SPACE=sp;applySpaceTheme();
          const t=document.getElementById('pub-hero-title');
          if(t)t.textContent='Catalogue — '+(sp.name||'Bibliothèque');
        }
      }catch(e){/* L'espace n'est pas critique pour afficher les livres */}

      /* Lire la config pour récupérer le contact du chargé de bibliothèque */
      try{
        const cfgDoc=await sbGetDoc('config',SPACE_ID);
        if(cfgDoc){
          if(cfgDoc.contact)_pubContactData={number:cfgDoc.contact,name:cfgDoc.contactName||''};
          _pubMeeting={place:cfgDoc.meetingPlace||'',time:cfgDoc.meetingTime||'',countryCode:cfgDoc.countryCode||'',shortLink:cfgDoc.shortLink||''};
        }
      }catch(e){/* contact optionnel */}

      /* Étape 2 : Lire TOUS les livres depuis Supabase */
      _status('📖','Récupération des livres…');
      let docs=[];
      try{
        docs=await sbGetAll('books');
      }catch(netErr){
        _status('📡','Erreur réseau','Impossible de joindre Supabase.<br><code style="font-size:10px">'+netErr.message+'</code>');
        return;
      }

      /* Étape 5 : Filtrer et afficher */
      _pubBooks=docs.filter(b=>b.status!=='retired'&&b.status!=='missing'&&(b.catType||'academique')==='academique');
      if(!_pubBooks.length){
        _status('📭','Catalogue vide','Aucun livre académique disponible pour le moment.');
        return;
      }
      const cats=[...new Set(_pubBooks.map(b=>b.cat).filter(Boolean))].sort();
      const dl=document.getElementById('pub-dl-cat');
      if(dl)dl.innerHTML=cats.map(c=>html`<option value="${c}"></option>`).join('');
      const loginUrl=window.location.href.replace('/book/'+SPACE_ID,'/'+SPACE_ID)+'?login=1';
      document.querySelectorAll('.pub-login-link').forEach(el=>{
        el.href=loginUrl;el.onclick=e=>{e.preventDefault();window.location.href=loginUrl;};
      });
      _renderPubFilters();
      rPubCat();
      if(_pubContactData)_renderPubContact(_pubContactData.number,_pubContactData.name);
    })();
    return;
  }

  try{
    /* ── 0. Init Supabase ── */
    dbg.push('0. Init Supabase…');
    showLoading('Connexion…');
    _initSb();
    dbg.push('0. Supabase OK');
    console.log('[CB]',dbg[dbg.length-1]);

    /* ── 1. Panneau super-admin ── */
    if(SPACE_ID===SUPER_ADMIN_CODE){
      hideLoading();
      showSuperAdmin();
      return;
    }

    /* ── 2. Pas de code dans l'URL → page d'accueil neutre ── */
    if(!SPACE_ID){
      hideLoading();
      showWelcome();
      return;
    }

    /* ── 3. Lecture _spaces/{SPACE_ID} — avec cache localStorage (TTL 1h) ── */
    dbg.push('3. Lecture _spaces/'+SPACE_ID+'...');
    showLoading('Vérification du centre…');
    /* Tentative de lecture depuis le cache pour économiser 1 lecture Supabase/session */
    const _spacesCacheKey='cb_space_'+SPACE_ID;
    let spaceDoc=null;
    try{
      const cached=JSON.parse(localStorage.getItem(_spacesCacheKey)||'null');
      if(cached&&cached._ts&&Date.now()-cached._ts<3600000){spaceDoc=cached;dbg.push('3. _spaces depuis cache localStorage (0 lecture)');}
    }catch(e){}
    if(!spaceDoc){
      spaceDoc=await sbGetDocRoot('_spaces',SPACE_ID);
      if(spaceDoc){try{localStorage.setItem(_spacesCacheKey,JSON.stringify({...spaceDoc,_ts:Date.now()}));}catch(e){}}
    }
    dbg.push('3. _spaces OK — doc: '+(spaceDoc?JSON.stringify(spaceDoc).substring(0,60):'null'));
    console.log('[CB]',dbg[dbg.length-1]);
    /* Auto-migration : si c'est le code par défaut et qu'il n'existe pas encore dans spaces → le créer */
    if(!spaceDoc && SPACE_ID===DEFAULT_SPACE){
      const defaultSpaceData={code:DEFAULT_SPACE,name:'Bibliothèque Centre Culturel Comoé',
        short:'ComoéBiblio',tagline:'Bibliothèque · Centre Culturel Comoé',
        color:'#22806B',active:true,createdAt:new Date().toISOString()};
      try{await sbSetRoot('_spaces',DEFAULT_SPACE,defaultSpaceData);}catch(e){console.warn('Migration spaces/'+DEFAULT_SPACE+':',e);}
      spaceDoc=defaultSpaceData;
    }
    /* Espace trouvé mais désactivé */
    if(spaceDoc&&spaceDoc.active===false){
      hideLoading();showNotFound();return;
    }
    /* Espace introuvable */
    if(!spaceDoc||!spaceDoc.code){
      hideLoading();showNotFound();return;
    }
    SPACE=spaceDoc;
    applySpaceTheme();
    /* ── Phase 1 : NE PAS charger users[] au démarrage (sécurité) ── */
    hideLoading();

    /* ── Si ?login=1 : venu de la page publique → formulaire de connexion obligatoire ── */
    const forceLogin=new URLSearchParams(window.location.search).get('login')==='1';
    if(forceLogin){
      /* Nettoyer l'URL sans recharger la page */
      window.history.replaceState({},'',window.location.pathname);
      sv('vl');
      return;
    }

    /* ── Lien d'invitation / réinitialisation → définir le mot de passe ── */
    if(_isRecoveryFlow){
      hideLoading();
      const rec=await _establishRecoverySession();
      if(rec.ok){
        openSetPwd();
        return;
      }
      /* Session de récupération impossible (lien expiré/déjà utilisé). */
      alert('Ce lien a expiré ou a déjà été utilisé. Demandez un nouveau lien depuis « Mot de passe oublié ? » ou à l\'administrateur.');
      try{window.history.replaceState({},'',location.pathname);}catch(_){}
      sv('vl');return;
    }

    /* ── Restaurer la session via Supabase Auth ── */
    try{
      const {data:{session}}=await sb.auth.getSession();
      if(session){
        showLoading('Restauration de session…');
        const userDoc=await _resolveAppUser();
        const todaySessStr=new Date().toISOString().split('T')[0];
        const expired=userDoc&&userDoc.expiresAt&&userDoc.expiresAt<todaySessStr&&!userDoc.neverExpires&&userDoc.role!=='admin'&&userDoc.role!=='resident'&&userDoc.role!=='commission';
        if(userDoc&&!userDoc.disabled&&!expired){
          curUser=userDoc;
          await loadRestData();
          hideLoading();
          try{
            const tabs=curUser.tabs||[];
            const lastView=localStorage.getItem('cb_lastview');
            const lastTab=localStorage.getItem('cb_lasttab');
            if(lastView==='vadm'&&(curUser.role==='admin'||tabs.length>0)){
              if(curUser.role==='admin')resetAdmTabs();
              showAdm();
              _restoreLastTab(lastTab);
            }else if(lastView==='vca'){
              showCA();
            }else if(lastView==='vc'){
              showCat();
            }else{
              if(curUser.role==='admin'){resetAdmTabs();showAdm();_restoreLastTab(lastTab);}
              else showCat();
            }
          }catch(e2){try{sv('vc');sChip('a0','n0');}catch(_){}}
          return;
        } else {
          if(expired&&userDoc)sbUpd('users',userDoc.id,{disabled:true}).catch(()=>{});
          await sb.auth.signOut().catch(()=>{});
          hideLoading();
        }
      }
    }catch(sesErr){
      console.warn('[Session] Erreur restauration:', sesErr.message);
      hideLoading();
    }
    /* ── Pas de session valide → formulaire de connexion ── */
    sv('vl');
  }catch(e){
    hideLoading();
    const raw=e.message||String(e);
    console.error('[ComoéBiblio] Erreur Supabase :', raw);
    if(raw.includes('SPACE_NOT_FOUND')){showNotFound();return;}
    let msg='⚠️ Erreur de connexion';
    let detail='Erreur : <code>'+esc(raw)+'</code>';
    if(raw.includes('Failed to fetch')||raw.includes('NetworkError')||raw.includes('net::ERR')){
      msg='📡 Connexion impossible.';
      detail='Vérifiez votre connexion internet. La page va se recharger dans 8 secondes…';
      setTimeout(()=>{if(document.getElementById('fb-error')?.style.display!=='none')location.reload();},8000);
    }
    const journal=dbg.length?'<br><br><small style="opacity:.6;font-size:11px">Journal : '+esc(dbg.join(' → '))+'</small>':'';
    showFbError(msg, detail+journal);
  }
}
let dataReady = false;

/* ═══════════════════════════════════════════════════════════════
   QUOTA TRACKING — Comptage opérations (localStorage, réinitialisé chaque jour)
═══════════════════════════════════════════════════════════════ */
function _qTrack(){/* no-op — quota tracking supprimé (spécifique Firebase) */}

/* Supabase Realtime notifie automatiquement tous les clients — pas de bump nécessaire */
async function _bumpSync(){}
async function _bumpSyncBatch(){}

/* ═══════════════════════════════════════════════════════════════
   CACHE localStorage — Évite les re-lectures Supabase au démarrage
   Clé : cb_data_{SPACE_ID}  /  TTL : 24h
═══════════════════════════════════════════════════════════════ */
const _CACHE_TTL=24*60*60*1000;
const _CACHE_VER='v3'; /* incrémenter pour invalider tous les caches clients */
let _cacheKey; /* initialisé après SPACE_ID connu */

function _cacheGet(){
  try{
    if(!_cacheKey)_cacheKey='cb_data_'+_CACHE_VER+'_'+SPACE_ID;
    const raw=localStorage.getItem(_cacheKey);
    if(!raw)return null;
    const c=JSON.parse(raw);
    if(!c||Date.now()-(c.ts||0)>_CACHE_TTL)return null;
    return c;
  }catch(e){return null;}
}
function _cachePut(updates){
  try{
    if(!_cacheKey)_cacheKey='cb_data_'+_CACHE_VER+'_'+SPACE_ID;
    const existing=_cacheGet()||{ts:Date.now(),sv:{},books:[],loans:[],users:[],requests:[],sessions:[],config:null,counters:null};
    const merged={...existing,...updates,ts:Date.now()};
    localStorage.setItem(_cacheKey,JSON.stringify(merged));
  }catch(e){console.warn('[Cache]',e.message);}
}
function _cacheApply(c){
  const CA_DEFAULT={member:['academique'],commission:['academique','spirituel'],resident:['academique'],enrol:['academique','spirituel'],admin:['academique','spirituel']};
  if(Array.isArray(c.books)&&c.books.length>0)books=c.books;
  if(Array.isArray(c.loans))loans=c.loans;
  if(Array.isArray(c.users)&&c.users.length>0){
    users=_dedupById(c.users.map(u=>({...u,id:parseInt(u.id)||u.id})));
    if(curUser){const f=users.find(u=>u.id==curUser.id);if(f)curUser={...f};}
  }
  if(Array.isArray(c.requests))requests=c.requests;
  if(Array.isArray(c.sessions))sessions=c.sessions;
  if(Array.isArray(c.shelfChecks))shelfChecks=c.shelfChecks;
  if(Array.isArray(c.registrations))registrations=c.registrations;
  if(c.config&&typeof c.config==='object'){
    cfg=Object.assign({openAll:false,openUntil:null,propMotif:'',currentSessionId:null,logoB64:null,loanOpen:false,pdfFields:['num','titre','auteur','desc','demandeur'],catAccess:CA_DEFAULT,catTypes:[]},c.config);
    if(!cfg.catAccess)cfg.catAccess=CA_DEFAULT;
    if(!Array.isArray(cfg.catTypes))cfg.catTypes=[];
    if(cfg.logoB64)applyLogo(cfg.logoB64);
  }
  if(c.counters&&typeof c.counters==='object'){const d=c.counters;nxB=d.nxB||nxB;nxU=d.nxU||nxU;nxR=d.nxR||nxR;nxS=d.nxS||nxS;nxL=d.nxL||nxL;nxSC=d.nxSC||nxSC;nxReg=d.nxReg||nxReg;}
  /* Auto-repair des compteurs depuis le cache des livres/users (évite les ID dupliqués au rechargement) */
  const _cmax=(arr)=>arr.reduce((m,x)=>{const n=parseInt(x.id);return(!isNaN(n)&&n>m)?n:m;},0);
  if(books.length){const m=_cmax(books)+1;if(nxB<m)nxB=m;}
  if(users.length){const m=_cmax(users)+1;if(nxU<m)nxU=m;}
  if(requests.length){const m=_cmax(requests)+1;if(nxR<m)nxR=m;}
  if(sessions.length){const m=_cmax(sessions)+1;if(nxS<m)nxS=m;}
  /* Retourner les collections manquantes/vides → seront re-fetché depuis Supabase */
  const missing=[];
  if(!books.length)missing.push('books');
  if(!users.length)missing.push('users');
  if(missing.length)console.warn('[Cache] Collections absentes ou vides:',missing,'→ re-fetch Supabase');
  return missing;
}

/* ═══════════════════════════════════════════════════════════════
   SYNCHRONISATION TEMPS RÉEL — Supabase Realtime (postgres_changes)
   Cache localStorage pour démarrage instantané
═══════════════════════════════════════════════════════════════ */
let _rtChannel=null;
const _unsubs=[];

/* ── Garde de sécurité : fonctions admin uniquement ── */
function _requireAdmin(fn=''){
  if(!curUser||curUser.role!=='admin'){
    console.warn('[Sécurité] Accès refusé à '+fn+' — rôle insuffisant');
    return false;
  }
  return true;
}
function _requirePrivileged(fn=''){
  if(!curUser){console.warn('[Sécurité] Non connecté');return false;}
  const ok=curUser.role==='admin'||curUser.role==='commission'||(curUser.tabs||[]).length>0;
  if(!ok)console.warn('[Sécurité] Accès refusé à '+fn);
  return ok;
}
let _rtDot=null;
let _rtOnline=false; /* flag fiable pour les tests — pas de problème de format CSS */
function _ensureRtDot(){
  if(_rtDot)return;
  _rtDot=document.createElement('span');
  _rtDot.id='rt-dot';
  _rtDot.style.cssText='position:fixed;bottom:14px;left:14px;width:10px;height:10px;border-radius:50%;background:#94a3b8;z-index:9997;transition:background .5s,box-shadow .5s;cursor:default';
  _rtDot.title='Synchronisation…';
  document.body.appendChild(_rtDot);
}
function _setRtStatus(online){
  _ensureRtDot();
  _rtOnline=!!online;
  if(online){_rtDot.style.background='#22c55e';_rtDot.style.boxShadow='0 0 0 3px rgba(34,197,94,.25)';_rtDot.title='Connecté — temps réel actif';}
  else{_rtDot.style.background='#ef4444';_rtDot.style.boxShadow='0 0 0 3px rgba(239,68,68,.25)';_rtDot.title='Hors ligne';}
}

/* ── Toast ── */
let _syncToast=null;
function _showSyncToast(msg){
  if(!msg)return;
  if(!_syncToast){_syncToast=document.createElement('div');_syncToast.style.cssText='position:fixed;bottom:18px;right:18px;background:#1c4370;color:white;padding:8px 16px;border-radius:20px;font-size:12px;font-weight:600;z-index:9998;opacity:0;transition:opacity .3s;pointer-events:none;font-family:inherit;box-shadow:0 4px 16px rgba(0,0,0,.25)';document.body.appendChild(_syncToast);}
  _syncToast.textContent=msg;_syncToast.style.opacity='1';
  clearTimeout(_syncToast._t);_syncToast._t=setTimeout(()=>{if(_syncToast)_syncToast.style.opacity='0';},2200);
}

/* ── Re-rendu ciblé ── */
function _getActiveViewId(){const v=document.querySelector('.view.active');return v?v.id:null;}
function _refreshView(cols){
  if(!dataReady||!curUser)return;
  const vid=_getActiveViewId();if(!vid)return;
  updAdmLoansBadge();
  ['nl0','nl1','nl2','nl3','nl-loans-links'].forEach(id=>{const el=document.getElementById(id);if(el&&el.children.length)try{bNav(id,vid);}catch(e){}});
  const hB=cols.includes('books'),hL=cols.includes('loans'),hU=cols.includes('users'),
        hR=cols.includes('requests')||cols.includes('sessions'),hC=cols.includes('config');
  try{
    if(vid==='vc'&&(hB||hC))rCat();
    else if(vid==='vloans'&&(hL||hU))rLoans();
    else if(vid==='vadm'){const ap=document.querySelector('#vadm .ap.active');const pid=ap?ap.id:'';
      const hReg=cols.includes('registrations');
      if(pid==='ap-bk'&&hB)rAdmBk();else if(pid==='ap-rq'&&hR)rAdmRq();
      else if(pid==='ap-us'&&hU)rAdmUs();else if(pid==='ap-loans_adm'&&(hL||hU))rAdmLoans();
      else if(pid==='ap-reg'&&hReg)rAdmRegistrations();
      else if(pid==='ap-st')rAdmStat();}
    else if(vid==='vcom'&&(hR||hB))rComT();
    else if(vid==='vca'&&hB)rCABk();
  }catch(e){console.debug('[RT refresh]',e.message);}
}


/* ── Fetch REST d'une collection + mise en cache ── */
/* _fetchAndCache : met à jour une collection dans le cache.
   Si sv contient l'ID du doc modifié → fetch ciblé (1 lecture).
   Si suppression → retrait du cache local (0 lecture).
   Sinon → fetch complet de la collection (premier chargement). */
async function _fetchAndCache(col, sv){
  const CA_DEFAULT={member:['academique'],commission:['academique','spirituel'],resident:['academique'],enrol:['academique','spirituel'],admin:['academique','spirituel']};

  /* ── Config et Counters : toujours un seul document ── */
  if(col==='config'){
    const d=await sbGetDoc('config',SPACE_ID);
    if(d){cfg=Object.assign({openAll:false,openUntil:null,propMotif:'',currentSessionId:null,logoB64:null,loanOpen:false,pdfFields:['num','titre','auteur','desc','demandeur'],catAccess:CA_DEFAULT,catTypes:[]},d);
      if(!cfg.catAccess)cfg.catAccess=CA_DEFAULT;if(!Array.isArray(cfg.catTypes))cfg.catTypes=[];if(cfg.logoB64)applyLogo(cfg.logoB64);}
    _cachePut({config:cfg});return;
  }
  if(col==='counters'){
    const d=await sbGetDoc('counters',SPACE_ID);
    if(d){nxB=d.nxB||nxB;nxU=d.nxU||nxU;nxR=d.nxR||nxR;nxS=d.nxS||nxS;nxL=d.nxL||nxL;nxSC=d.nxSC||nxSC;nxReg=d.nxReg||nxReg;}
    /* Auto-repair : ajuster les compteurs si inférieurs aux IDs réels */
    const _maxId=(arr)=>arr.reduce((m,x)=>{const n=parseInt(x.id);return(!isNaN(n)&&n>m)?n:m;},0);
    let needsSave=false;
    if(books.length){const m=_maxId(books)+1;if(nxB<m){nxB=m;needsSave=true;}}
    if(users.length){const m=_maxId(users)+1;if(nxU<m){nxU=m;needsSave=true;}}
    if(requests.length){const m=_maxId(requests)+1;if(nxR<m){nxR=m;needsSave=true;}}
    if(sessions.length){const m=_maxId(sessions)+1;if(nxS<m){nxS=m;needsSave=true;}}
    if(loans.length){const m=_maxId(loans)+1;if(nxL<m){nxL=m;needsSave=true;}}
    if(needsSave){_lastSavedCounters='';sbSaveCounters().catch(()=>{});console.log('[CB] Compteurs auto-réparés:',{nxB,nxU,nxR,nxS,nxL});}
    _cachePut({counters:d});return;
  }

  /* ── Collections : fetch ciblé si l'ID du document est connu ── */
  const changedId=sv?sv['_sv_'+col+'_id']||'':'';

  if(changedId.startsWith('DEL:')){
    /* Suppression : retirer le doc du tableau local — 0 lecture Supabase */
    const delId=changedId.slice(4);
    if(col==='books')      books=books.filter(x=>String(x.id)!==delId);
    else if(col==='loans') loans=loans.filter(x=>String(x.id)!==delId);
    else if(col==='users') users=users.filter(x=>String(x.id)!==delId);
    else if(col==='requests') requests=requests.filter(x=>String(x.id)!==delId);
    else if(col==='sessions') sessions=sessions.filter(x=>String(x.id)!==delId);
    else if(col==='registrations') registrations=registrations.filter(x=>String(x.id)!==delId);
    else if(col==='shelfChecks') shelfChecks=shelfChecks.filter(x=>String(x.id)!==delId);
    const _delMap={books,loans,users,requests,sessions,registrations,shelfChecks};
    _cachePut({[col]:_delMap[col]||[]});
    console.log('[RT] Suppression doc',col,delId,'— 0 lecture');
    return;
  }

  if(changedId&&changedId!==''){
    /* Modification connue : fetch du seul document modifié */
    const d=await sbGetDoc(col,changedId);
    if(d){
      /* Normaliser l'id */
      const normId=/^\d+$/.test(String(d.id))?parseInt(d.id):d.id;
      d.id=normId;
      if(col==='books'){
        const idx=books.findIndex(x=>String(x.id)===String(normId));
        if(idx>=0)books[idx]=d;else books.push(d);
      }else if(col==='loans'){
        const idx=loans.findIndex(x=>String(x.id)===String(changedId));
        if(idx>=0)loans[idx]=d;else loans.push(d);
      }else if(col==='users'){
        d.id=parseInt(d.id)||d.id;
        const idx=users.findIndex(x=>String(x.id)===String(changedId));
        if(idx>=0)users[idx]=d;else users.push(d);
        if(curUser&&String(curUser.id)===String(changedId)){
          if(d.disabled&&!curUser.disabled){alert('Votre compte a été désactivé.');doLogout();return;}
          curUser={...d};
        }
      }else if(col==='requests'){
        const idx=requests.findIndex(x=>String(x.id)===String(changedId));
        if(idx>=0)requests[idx]=d;else requests.push(d);
      }else if(col==='sessions'){
        const idx=sessions.findIndex(x=>String(x.id)===String(changedId));
        if(idx>=0)sessions[idx]=d;else sessions.push(d);
      }else if(col==='registrations'){
        /* Fetch ciblé : 1 seule lecture pour la nouvelle inscription
           (le first-fire fix gère la synchro au rechargement) */
        const idx=registrations.findIndex(x=>String(x.id)===String(changedId));
        if(idx>=0)registrations[idx]=d;else if(d)registrations.push(d);
        if(document.getElementById('ap-reg')?.classList.contains('active'))rAdmRegistrations();
      }else if(col==='shelfChecks'){
        const idx=shelfChecks.findIndex(x=>String(x.id)===String(changedId));
        if(idx>=0)shelfChecks[idx]=d;else shelfChecks.push(d);
      }
      const _map={books,loans,users,requests,sessions,registrations,shelfChecks};
      _cachePut({[col]:_map[col]||[]});
      console.log('[RT] Fetch ciblé',col,changedId,'— 1 lecture');
    }
    return;
  }

  /* ── Fetch complet : premier chargement ou changement multiple ── */
  const data=await sbGetAll(col);
  if(col==='books')books=_dedupById(data);
  else if(col==='loans')loans=_dedupById(data);
  else if(col==='users'){users=_dedupById(data.map(u=>({...u,id:parseInt(u.id)||u.id})));
    /* Réparer les comptes permanents — une seule fois par session (pas à chaque fetch) */
    if(!sessionStorage.getItem('_cb_repaired')){
      let repaired=0;
      users.forEach(u=>{
        const isPerm=['admin','resident','commission'].includes(u.role);
        if(isPerm&&(!u.neverExpires||u.expiresAt||u.disabled)){
          u.neverExpires=true;u.expiresAt=null;u.disabled=false;
          sbUpd('users',u.id,{neverExpires:true,expiresAt:null,disabled:false}).catch(()=>{});
          repaired++;
        }
      });
      if(repaired>0)console.log('[Fix]',repaired,'compte(s) réparé(s)');
      sessionStorage.setItem('_cb_repaired','1');
    }
    if(curUser){const f=users.find(u=>u.id==curUser.id);if(f){
      if(f.disabled&&!curUser.disabled){alert('Votre compte a été désactivé.');doLogout();return;}
      curUser={...f};
    }}
    const today=new Date().toISOString().split('T')[0];
    users.forEach(u=>{
      if(u.neverExpires)return;
      if(u.expiresAt&&u.expiresAt<today&&!u.disabled&&!u.neverExpires&&u.role!=='admin'&&u.role!=='resident'&&u.role!=='commission'){
        u.disabled=true;/* MAJ locale : évite de réémettre le même write à chaque fetch */
        sbUpd('users',u.id,{disabled:true}).catch(()=>{});
      }
    });
  }
  else if(col==='requests')requests=_dedupById(data);
  else if(col==='sessions')sessions=_dedupById(data);
  else if(col==='shelfChecks')shelfChecks=_dedupById(data);
  else if(col==='registrations')registrations=_dedupById(data);
  _cachePut({[col]:data});
  console.log('[RT] Fetch complet',col,'—',data.length,'docs');
}

/* ── Démarrer la synchronisation ── */
/* ── Fetch complet de toutes les collections via REST (garanti) ── */
async function _fetchAllREST(){
  const cols=['config','counters','books','loans','users','requests','sessions','shelfChecks','registrations'];
  console.log('[RT] Fetch REST complet…');
  await Promise.all(cols.map(c=>_fetchAndCache(c,null).catch(e=>console.warn('[RT]',c,e.message))));
  console.log('[RT] Prêt — books:',books.length,'users:',users.length,'loans:',loans.length);
}

/* startRealtimeSync : async, garantit que les données sont chargées avant de retourner */
async function startRealtimeSync(){
  if(_rtChannel&&dataReady){console.log('[RT] Déjà actif et prêt');return;}
  if(_rtChannel){sb.removeChannel(_rtChannel);_rtChannel=null;}
  dataReady=false;

  /* ── 1. Cache localStorage ── */
  const cache=_cacheGet();
  if(cache){
    const missing=_cacheApply(cache);
    if(missing.length===0){
      dataReady=true;hideLoading();_setRtStatus(true);
      console.log('[RT] Cache complet — books:',books.length,'users:',users.length);
      /* Refresh silencieux des livres en arrière-plan pour détecter les livres manquants */
      _fetchAndCache('books',null).then(()=>_refreshView(['books'])).catch(()=>{});
    }else{
      try{if(_cacheKey)localStorage.removeItem(_cacheKey);}catch(e){}
      console.warn('[RT] Cache incomplet, invalidé. Manquants:',missing);
    }
  }

  /* ── 2. Pas de cache valide → fetch complet garanti ── */
  if(!dataReady){
    showLoading('Chargement des données…');
    try{
      await _fetchAllREST();
      dataReady=true;hideLoading();_setRtStatus(true);
    }catch(e){
      console.error('[RT] Chargement initial échoué:',e.message);
      hideLoading();
    }
  }

  /* ── 3. Supabase Realtime (non bloquant, l'app est déjà prête) ── */
  _initSb();
  _ensureRtDot();
  const _onOnline=()=>{_setRtStatus(true);_showSyncToast('Reconnecté');};
  const _onOffline=()=>{_setRtStatus(false);_showSyncToast('Hors ligne');};
  window.addEventListener('online',_onOnline);window.addEventListener('offline',_onOffline);
  _unsubs.push(()=>{window.removeEventListener('online',_onOnline);window.removeEventListener('offline',_onOffline);});

  /* Mappage collection app → table Supabase */
  const _rtMap={
    books:'books',loans:'loans',users:'users',
    requests:'book_requests',sessions:'request_sessions',
    registrations:'registrations',shelfChecks:'shelf_checks'
  };
  _rtChannel=sb.channel('space-'+SPACE_ID);
  Object.entries(_rtMap).forEach(([col,tbl])=>{
    _rtChannel.on('postgres_changes',
      {event:'*',schema:'public',table:tbl,filter:`space_code=eq.${SPACE_ID}`},
      payload=>_handleRT(col,payload));
  });
  _rtChannel.on('postgres_changes',
    {event:'*',schema:'public',table:'space_config',filter:`space_code=eq.${SPACE_ID}`},
    payload=>{if(payload.new){cfg=Object.assign({...cfg},payload.new);_cachePut({config:cfg});}_refreshView(['config']);});
  _rtChannel.on('postgres_changes',
    {event:'*',schema:'public',table:'space_counters',filter:`space_code=eq.${SPACE_ID}`},
    payload=>{if(payload.new){const d=payload.new;nxB=d.nxB||nxB;nxU=d.nxU||nxU;nxR=d.nxR||nxR;nxS=d.nxS||nxS;nxL=d.nxL||nxL;nxSC=d.nxSC||nxSC;nxReg=d.nxReg||nxReg;}});
  _rtChannel.subscribe(status=>{
    _setRtStatus(status==='SUBSCRIBED');
    console.log('[RT] Supabase Realtime:',status);
  });
  _unsubs.push(()=>{if(_rtChannel){sb.removeChannel(_rtChannel);_rtChannel=null;}});
  console.log('[RT] Supabase Realtime actif');
}

function _handleRT(col,{eventType,new:n,old:o}){
  const _arrMap={books,loans,users,requests,sessions,registrations,shelfChecks};
  const arr=_arrMap[col];if(!arr)return;
  if(eventType==='INSERT'){
    if(col==='users'&&n.id){n.id=parseInt(n.id)||n.id;}
    if(!arr.find(x=>String(x.id)===String(n.id)))arr.push(n);
  }else if(eventType==='UPDATE'){
    if(col==='users'){
      n.id=parseInt(n.id)||n.id;
      if(curUser&&String(curUser.id)===String(n.id)){
        if(n.disabled&&!curUser.disabled){alert('Votre compte a été désactivé.');doLogout();return;}
        curUser={...n};
      }
    }
    const i=arr.findIndex(x=>String(x.id)===String(n.id));
    if(i>=0)arr[i]=n;else arr.push(n);
  }else if(eventType==='DELETE'){
    const delId=o?.id;
    const i=arr.findIndex(x=>String(x.id)===String(delId));
    if(i>=0)arr.splice(i,1);
  }
  _cachePut({[col]:arr});
  _showSyncToast('🔄 Synchronisé');
  _refreshView([col]);
}

function stopRealtimeSync(){
  _unsubs.forEach(u=>{try{u();}catch(e){}});_unsubs.length=0;
  _rtChannel=null;
  dataReady=false;
  if(_rtDot){_rtDot.style.background='#94a3b8';_rtDot.title='Déconnecté';}
  console.log('[RT] Synchronisation arrêtée');
}

async function loadRestData(){
  if(_unsubs.length&&dataReady)return; /* Déjà actif et données prêtes */
  await startRealtimeSync();           /* Attend REST fetch complet si besoin */
}
function detectDevice(){
  const ua=navigator.userAgent;
  if(/Infinix/i.test(ua))return'📱 Infinix';
  if(/Tecno/i.test(ua))return'📱 Tecno';
  if(/itel/i.test(ua))return'📱 Itel';
  if(/iPhone/i.test(ua))return'📱 iPhone';
  if(/iPad/i.test(ua))return'📱 iPad';
  if(/Android/i.test(ua)){if(/Mobile/i.test(ua))return'📱 Android Mobile';return'📱 Tablette Android';}
  if(/Windows/i.test(ua))return'💻 PC Windows';
  if(/Macintosh/i.test(ua))return'💻 Mac';
  if(/Linux/i.test(ua))return'💻 Linux';
  return'❓ Inconnu';
}
function detectBrowser(){
  const ua=navigator.userAgent;
  if(/Chrome/i.test(ua)&&!/Chromium|Edge|OPR/i.test(ua))return'Chrome';
  if(/Firefox/i.test(ua))return'Firefox';
  if(/Safari/i.test(ua)&&!/Chrome/i.test(ua))return'Safari';
  if(/Edge/i.test(ua))return'Edge';
  if(/OPR|Opera/i.test(ua))return'Opera';
  return'Autre';
}
function fmtDateLong(s){
  if(!s)return'—';
  try{return new Date(s+'T12:00:00').toLocaleDateString('fr-FR',{weekday:'long',day:'2-digit',month:'long',year:'numeric'});}
  catch{return s;}
}
function todayStr(){return new Date().toISOString().split('T')[0];}
function nowMotifPlaceholder(){
  const d=new Date().toLocaleDateString('fr-FR',{day:'2-digit',month:'2-digit',year:'numeric'});
  return`Demandes de livres N°${nxS} à la date du ${d}`;
}
function isPrivileged(){return curUser&&(curUser.role==='admin'||curUser.role==='commission');}

/* Vérifie si l'utilisateur courant peut emprunter */
function canUserLoan(){
  if(!curUser||curUser.disabled)return false;
  /* Bloquer si un retour est en attente de validation admin */
  if(loans.find(l=>l.userId==curUser.id&&l.status==='pending_return'))return false;
  /* Résidents : toujours autorisés (auto-validé, pas de validation admin) */
  if(curUser.role==='resident')return true;
  /* Pour tous les autres rôles : le droit individuel canLoan est OBLIGATOIRE.
     cfg.loanOpen est un affichage global mais ne donne pas accès à quelqu'un
     qui n'a pas le droit individuel accordé par l'administrateur. */
  return !!curUser.canLoan;
}

/* Basculer l'option emprunt membres */
async function toggleLoanOption(enabled){
  const pill=document.getElementById('loan-status-pill');
  const info=document.getElementById('loan-option-info');
  try{
    await sbUpd('config','main',{loanOpen:enabled});
    cfg.loanOpen=enabled;
    if(pill){pill.textContent=enabled?'● Actif':'● Désactivé';pill.style.background=enabled?'#d1fae5':'#ede9fe';pill.style.color=enabled?'#065f46':'#7c3aed';}
    if(info)info.style.display=enabled?'block':'none';
    /* Rafraîchir la liste membres pour afficher/masquer le champ canLoan */
    rAdmUs();
  }catch(e){alert('Erreur : '+e.message);}
}

/* Initialiser l'état du toggle emprunt quand on charge le panneau admin */
function initLoanOptionPanel(){
  const chk=document.getElementById('cfg-loan-open');
  const pill=document.getElementById('loan-status-pill');
  const info=document.getElementById('loan-option-info');
  if(chk)chk.checked=!!cfg.loanOpen;
  if(pill){pill.textContent=cfg.loanOpen?'● Actif':'● Désactivé';pill.style.background=cfg.loanOpen?'#d1fae5':'#ede9fe';pill.style.color=cfg.loanOpen?'#065f46':'#7c3aed';}
  if(info)info.style.display=cfg.loanOpen?'block':'none';
}
function calcExpiresAt(dateStr){
  /* dateStr = YYYY-MM-DD ou vide → utilise aujourd'hui */
  const d=dateStr?new Date(dateStr+'T12:00:00'):new Date();
  const month=d.getMonth()+1; /* 1-12 */
  const year=d.getFullYear();
  if(month>=1&&month<=9) return year+'-12-31';
  return (year+1)+'-12-31';
}

/* ═══════════════════════════════════════════════════════════════
   VIEWS & NAV
═══════════════════════════════════════════════════════════════ */
function sv(id){
  document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  _hideSplash();
  /* Mémoriser la vue courante pour la restauration au rafraîchissement */
  if(curUser&&['vc','vca','vadm'].includes(id)){
    try{localStorage.setItem('cb_lastview',id);}catch(e){}
  }
  try{bBottomNav(id);}catch(e){console.error('[bnav]',e);}
}
/* Masquer l'écran de démarrage une fois qu'une vue est affichée */
function _hideSplash(){
  const sp=document.getElementById('cb-splash');
  if(sp){sp.style.opacity='0';sp.style.transition='opacity .25s';setTimeout(()=>sp.remove(),260);}
}
function bNav(cid,av){
  const c=document.getElementById(cid);if(!c||!curUser)return;
  const r=curUser.role;
  const tabs=curUser.tabs||[];
  const hasTab=k=>r==='admin'||tabs.includes(k);
  if(r==='admin')curUser.spiritualAccess=true;
  let h=`<button type="button" class="nl${av==='vc'?' active':''}" onclick="_closeMobNavAll();showCat()">&#128218; Catalogue</button>`;
  if(r==='commission'||r==='admin'||r==='resident')
    h+=`<button type="button" class="nl${av==='vcom'?' active':''}" onclick="_closeMobNavAll();showCom()">${r==='resident'?'&#128065;&#65039; Consultation':'&#128203; Gestion des demandes'}</button>`;
  if(r==='enrol'||r==='admin')
    h+=`<button type="button" class="nl${av==='vca'?' active':''}" onclick="_closeMobNavAll();showCA()">&#128221; Gestion du catalogue</button>`;
  if(r==='commission'||r==='admin'||hasTab('stats'))
    h+=`<button type="button" class="nl${av==='vstat'?' active':''}" onclick="_closeMobNavAll();showStat()">&#128202; Statistiques</button>`;
  if(r==='admin'&&av!=='vadm')
    h+=`<button type="button" class="nl" onclick="_closeMobNavAll();showAdm()">&#128737;&#65039; Administration</button>`;
  if(r==='admin'||r==='validator'||hasTab('loans_validator')){
    const pendingLoans=loans.filter(l=>l.status==='pending'||l.status==='pending_return').length;
    const badge=pendingLoans>0?` <span style="background:#dc2626;color:white;border-radius:20px;padding:0 6px;font-size:11px;margin-left:2px">${pendingLoans}</span>`:'';
    h+=`<button type="button" class="nl${av==='vloans'?' active':''}" onclick="_closeMobNavAll();showLoans()">&#128214; Emprunts${badge}</button>`;
  }
  if(r!=='admin'&&(hasTab('members')||hasTab('stats')))
    h+=`<button type="button" class="nl${av==='vadm'?' active':''}" onclick="_closeMobNavAll();showAdm()">&#9881;&#65039; Validations</button>`;
  h+=`<button type="button" class="nl" onclick="_closeMobNavAll();openGuide()">&#10067; Guide</button>`;
  c.innerHTML=h;
}
function _closeMobNavAll(){
  document.querySelectorAll('.nls.mob-open').forEach(el=>el.classList.remove('mob-open'));
  const ov=document.getElementById('mob-nav-ov');
  if(ov)ov.classList.remove('visible');
  document.body.classList.remove('mob-nav-lock');
}
function togMobNav(id){
  const el=document.getElementById(id);if(!el)return;
  const isOpening=!el.classList.contains('mob-open');
  if(isOpening){
    document.querySelectorAll('.nls.mob-open').forEach(x=>{if(x!==el)x.classList.remove('mob-open');});
    el.classList.add('mob-open');
    let ov=document.getElementById('mob-nav-ov');
    if(!ov){
      ov=document.createElement('div');
      ov.id='mob-nav-ov';
      ov.className='mob-nav-overlay';
      ov.onclick=_closeMobNavAll;
      document.body.appendChild(ov);
    }
    ov.classList.add('visible');
    document.body.classList.add('mob-nav-lock');
    const onKey=e=>{if(e.key==='Escape'){_closeMobNavAll();document.removeEventListener('keydown',onKey);}};
    document.addEventListener('keydown',onKey);
    if(!el.querySelector('.mob-logout')){
      const btn=document.createElement('button');
      btn.type='button';
      btn.className='nl mob-logout';
      btn.style.cssText='background:rgba(239,68,68,.15);color:#fca5a5;border:none;width:100%;border-radius:8px;padding:10px 14px;font-family:inherit;font-size:13px;font-weight:600;cursor:pointer;text-align:left;margin-top:6px';
      btn.innerHTML='🚪 Déconnexion';
      btn.onclick=()=>{_closeMobNavAll();doLogout();};
      el.appendChild(btn);
    }
  } else {
    _closeMobNavAll();
  }
}
function sChip(ai,ni){
  if(!curUser)return;
  document.getElementById(ai).textContent=((curUser.prenom[0]||'')+(curUser.nom[0]||'')).toUpperCase();
  document.getElementById(ni).textContent=curUser.prenom+' '+curUser.nom;
}

/* ═══════════════════════════════════════════════════════════════
   NAVIGATION MOBILE — Barre du bas + sélecteur de section
   (visibles uniquement sur mobile via CSS ; desktop inchangé)
═══════════════════════════════════════════════════════════════ */
const _VIEW_DRAWER={vc:'nl0',vca:'nl1',vcom:'nl2',vadm:'nl3',vstat:'nl4',vloans:'nl-loans-links'};

/* Barre de navigation fixe en bas : destinations principales selon le rôle
   + bouton "Plus" qui ouvre le tiroir complet de la vue courante. */
function bBottomNav(av){
  const bn=_ensureBottomNav();
  if(!bn)return;
  if(!curUser||!_VIEW_DRAWER[av]){bn.style.display='none';return;}
  bn.style.display='';
  const r=curUser.role,tabs=curUser.tabs||[],hasTab=k=>r==='admin'||tabs.includes(k);
  /* Destinations par ordre de priorité (les 4 premières gardées + "Plus") */
  const items=[{ic:'📚',lb:'Catalogue',vw:'vc',fn:showCat}];
  if(r==='commission'||r==='admin'||r==='resident')items.push({ic:'📋',lb:'Demandes',vw:'vcom',fn:showCom});
  if(r==='admin'||r==='validator'||hasTab('loans_validator'))items.push({ic:'📖',lb:'Emprunts',vw:'vloans',fn:showLoans});
  if(r==='admin')items.push({ic:'🛠️',lb:'Admin',vw:'vadm',fn:showAdm});
  else if(hasTab('members')||hasTab('stats'))items.push({ic:'⚙️',lb:'Gestion',vw:'vadm',fn:showAdm});
  if(r==='enrol')items.push({ic:'📝',lb:'Saisie',vw:'vca',fn:showCA});
  if(r==='commission')items.push({ic:'📊',lb:'Stats',vw:'vstat',fn:showStat});
  const primary=items.slice(0,4);
  bn.innerHTML='';
  primary.forEach(it=>{
    const b=document.createElement('button');
    b.type='button';
    b.className='bni-btn'+(it.vw===av?' active':'');
    b.innerHTML=`<span class="bni">${it.ic}</span><span class="bnl">${it.lb}</span>`;
    b.onclick=()=>{try{it.fn();}catch(e){console.error('[bnav]',e);}};
    bn.appendChild(b);
  });
  const plus=document.createElement('button');
  plus.type='button';plus.className='bni-btn';
  plus.innerHTML='<span class="bni">⋯</span><span class="bnl">Plus</span>';
  plus.onclick=()=>{const d=_VIEW_DRAWER[av];if(d){try{bNav(d,av);}catch(e){}togMobNav(d);}};
  bn.appendChild(plus);
}
function _ensureBottomNav(){
  let bn=document.getElementById('bottomnav');
  if(!bn){
    bn=document.createElement('nav');
    bn.id='bottomnav';bn.className='bnav';
    bn.setAttribute('aria-label','Navigation principale');
    document.body.appendChild(bn);
  }
  return bn;
}

/* Sélecteur de section (remplace la barre d'onglets .anv défilante sur mobile).
   Contrôle natif <select> → tap toujours fiable, aucun conflit de défilement. */
function _refreshSectPicker(nav){
  if(!nav)return;
  let sel=nav._picker;
  if(!sel){
    sel=document.createElement('select');
    sel.className='sect-picker';
    sel.setAttribute('aria-label','Choisir une section');
    sel.addEventListener('change',()=>{const b=(nav._pbtns||[])[+sel.value];if(b)b.click();});
    nav.parentNode.insertBefore(sel,nav);
    nav._picker=sel;
  }
  const btns=[...nav.querySelectorAll('.at')].filter(b=>b.style.display!=='none'&&!b.hidden);
  nav._pbtns=btns;
  sel.innerHTML='';
  btns.forEach((b,i)=>{
    const o=document.createElement('option');
    o.value=i;
    /* Libellé = texte direct du bouton, sans les badges (spans de compteur) */
    let label='';
    b.childNodes.forEach(n=>{if(n.nodeType===3)label+=n.textContent;});
    label=label.replace(/\s+/g,' ').trim();
    o.textContent=label||b.textContent.replace(/\s+/g,' ').trim();
    sel.appendChild(o);
  });
  _syncSectPicker(nav);
}
function _syncSectPicker(nav){
  if(!nav||!nav._picker||!nav._pbtns)return;
  const i=nav._pbtns.findIndex(b=>b.classList.contains('active'));
  if(i>=0)nav._picker.value=String(i);
}
function resetAdmTabs(){
  document.querySelectorAll('#vadm .at').forEach(x=>x.classList.remove('active'));
  document.getElementById('adm-tab-bk').classList.add('active');
  document.querySelectorAll('#vadm .ap').forEach(x=>x.classList.remove('active'));
  document.getElementById('ap-bk').classList.add('active');
}
function resetComTabs(){
  document.querySelectorAll('#vcom .at').forEach(x=>x.classList.remove('active'));
  document.querySelectorAll('#vcom .at')[0].classList.add('active');
  ['dem','sess','auth','mbr'].forEach(id=>{const el=document.getElementById('com-'+id);if(el)el.classList.remove('active');});
  document.getElementById('com-dem').classList.add('active');
}

/* ═══════════════════════════════════════════════════════════════
   AUTH (login applicatif par code)
═══════════════════════════════════════════════════════════════ */
const _RL_WIN=30000;const _RL_MAX=5;
function _rlCheck(key){
  const now=Date.now();
  let arr=JSON.parse(localStorage.getItem(key)||'[]').filter(t=>now-t<_RL_WIN);
  if(arr.length>=_RL_MAX)return Math.ceil((_RL_WIN-(now-arr[0]))/1000);
  arr.push(now);localStorage.setItem(key,JSON.stringify(arr));return 0;
}
function _rlReset(key){localStorage.removeItem(key);}

/* Traduit les erreurs Supabase Auth en français. */
function _authMsg(raw){
  const m=(raw||'').toLowerCase();
  if(m.includes('invalid login credentials'))return 'E-mail ou mot de passe incorrect.';
  if(m.includes('email not confirmed'))return 'E-mail non confirmé. Vérifiez votre boîte mail.';
  if(m.includes('rate')||m.includes('too many'))return 'Trop de tentatives. Réessayez dans quelques minutes.';
  return raw;
}

/* Résout la ligne `users` de l'espace courant rattachée à la session auth active.
   Recherche par auth_id, puis repli par email (avec liaison best-effort). */
async function _resolveAppUser(){
  const {data:authData}=await sb.auth.getUser();
  const au=authData&&authData.user;
  if(!au)return null;
  const byId=await sb.from('users').select('*').eq('space_code',SPACE_ID).eq('auth_id',au.id).limit(1);
  if(byId.data&&byId.data[0]){const u=byId.data[0];u.id=parseInt(u.id)||u.id;return u;}
  if(au.email){
    const byEmail=await sb.from('users').select('*').eq('space_code',SPACE_ID).ilike('email',au.email).limit(1);
    const u=byEmail.data&&byEmail.data[0];
    if(u){
      u.id=parseInt(u.id)||u.id;
      if(!u.auth_id){sb.from('users').update({auth_id:au.id}).eq('id',u.id).eq('space_code',SPACE_ID).then(()=>{},()=>{});}
      return u;
    }
  }
  return null;
}

async function doLogin(){
  const email=(document.getElementById('li-email')?.value||'').trim().toLowerCase();
  const pwd=document.getElementById('li-pwd')?.value||'';
  const errEl=document.getElementById('le');
  const btn=document.getElementById('login-btn');
  errEl.textContent='';
  if(!email||!pwd){errEl.textContent='Veuillez saisir votre e-mail et votre mot de passe.';return;}
  const wait=_rlCheck('cb_rl_login');
  if(wait>0){errEl.textContent='Trop de tentatives. Réessayez dans '+wait+' secondes.';return;}
  if(btn)btn.disabled=true;
  errEl.textContent='Vérification…';
  try{
    _initSb();
    const {error:authErr}=await sb.auth.signInWithPassword({email,password:pwd});
    if(authErr){errEl.textContent=_authMsg(authErr.message);return;}
    const u=await _resolveAppUser();
    if(!u){await sb.auth.signOut();errEl.textContent='Aucun compte membre rattaché à cet e-mail dans cette bibliothèque.';return;}
    if(u.disabled){await sb.auth.signOut();errEl.textContent='Ce compte est désactivé. Contactez l\'administrateur.';return;}
    /* Vérifier expiration du compte */
    const todayLoginStr=new Date().toISOString().split('T')[0];
    if(u.expiresAt&&u.expiresAt<todayLoginStr&&!u.neverExpires&&u.role!=='admin'&&u.role!=='resident'&&u.role!=='commission'){
      sbUpd('users',u.id,{disabled:true}).catch(()=>{});
      await sb.auth.signOut();
      errEl.textContent='Votre compte a expiré le '+u.expiresAt+'. Contactez l\'administrateur.';
      return;
    }
    /* Connexion réussie — la session est gérée par Supabase Auth (localStorage). */
    _rlReset('cb_rl_login');
    curUser=u;
    errEl.textContent='';
    if(document.getElementById('li-email'))document.getElementById('li-email').value='';
    if(document.getElementById('li-pwd'))document.getElementById('li-pwd').value='';
    /* Charger les données puis naviguer */
    await loadRestData();
    if(!users.find(x=>String(x.id)===String(curUser.id))){
      users.push(curUser);
      _cachePut({users});
    }
    try{
      if(u.role==='admin'){resetAdmTabs();showAdm();}else showCat();
    }catch(navErr){console.error('Nav:',navErr);try{sv('vc');sChip('a0','n0');}catch(_){}}
    /* Log de connexion en arrière-plan */
    const logEntry={id:nxL++,userId:u.id,abbrev:u.abbrev,name:u.prenom+' '+u.nom,role:u.role,
      date:new Date().toLocaleDateString('fr-FR'),
      time:new Date().toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'}),
      device:detectDevice(),browser:detectBrowser()};
    loginLog.unshift(logEntry);
    sbSet('loginLog',logEntry.id,logEntry).catch(()=>{});
    sbSaveCounters().catch(()=>{});
  }catch(e){
    errEl.textContent='Erreur : '+e.message;
    console.error('[doLogin]',e);
  }finally{
    if(btn)btn.disabled=false;
  }
}
['li-email','li-pwd'].forEach(idd=>{const el=document.getElementById(idd);if(el)el.addEventListener('keypress',e=>{if(e.key==='Enter')doLogin();});});

/* ── Mot de passe oublié : envoie un email de réinitialisation ── */
async function openForgotPwd(){
  _initSb();
  const email=prompt('Entrez votre e-mail pour recevoir un lien de réinitialisation :','');
  if(email===null)return;
  const em=email.trim().toLowerCase();
  if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em)){alert('E-mail invalide.');return;}
  try{
    const {error}=await sb.auth.resetPasswordForEmail(em,{redirectTo:location.origin+location.pathname+'?setpw=1'});
    if(error)throw new Error(error.message);
    alert('Si un compte existe pour cet e-mail, un lien de réinitialisation vient d\'être envoyé. Vérifiez votre boîte mail (et les spams).');
  }catch(e){alert('Erreur : '+_authMsg(e.message));}
}

/* ── Définir / réinitialiser le mot de passe (session de récupération active) ── */
function openSetPwd(){
  const old=document.getElementById('_setpwd_modal');if(old)old.remove();
  const ov=document.createElement('div');
  ov.id='_setpwd_modal';
  ov.style.cssText='position:fixed;inset:0;background:rgba(15,23,42,.6);z-index:10000;display:flex;align-items:center;justify-content:center;padding:16px';
  ov.innerHTML=html`<div style="background:white;border-radius:16px;width:100%;max-width:400px;box-shadow:0 24px 64px rgba(0,0,0,.25)">
    <div style="background:#1c4370;color:white;padding:22px 20px;border-radius:16px 16px 0 0;font-size:18px;font-weight:700">🔑 Définir mon mot de passe</div>
    <div style="padding:20px">
      <p style="font-size:13px;color:#475569;margin-bottom:14px">Choisissez un mot de passe (8 caractères minimum).</p>
      <div class="fg"><label class="ld">Nouveau mot de passe</label><input class="fi" type="password" id="setpwd-1" autocomplete="new-password"/></div>
      <div class="fg"><label class="ld">Confirmer</label><input class="fi" type="password" id="setpwd-2" autocomplete="new-password"/></div>
      <p id="setpwd-err" style="color:#dc2626;font-size:13px;min-height:16px"></p>
      <button type="button" id="setpwd-btn" onclick="submitSetPwd()" style="width:100%;padding:12px;border:none;background:#1c4370;color:white;border-radius:10px;font-size:14px;font-weight:600;font-family:inherit;cursor:pointer">Valider</button>
    </div>
  </div>`;
  document.body.appendChild(ov);
}
async function submitSetPwd(){
  const p1=document.getElementById('setpwd-1')?.value||'';
  const p2=document.getElementById('setpwd-2')?.value||'';
  const err=document.getElementById('setpwd-err');
  const btn=document.getElementById('setpwd-btn');
  if(err)err.textContent='';
  if(p1.length<8){if(err)err.textContent='Le mot de passe doit contenir au moins 8 caractères.';return;}
  if(p1!==p2){if(err)err.textContent='Les deux mots de passe ne correspondent pas.';return;}
  if(btn)btn.disabled=true;
  try{
    _initSb();
    /* Garantir une session active : si elle a expiré/été perdue depuis
       l'ouverture de la modale, la rétablir à partir des jetons capturés. */
    let hasSession=false;
    try{ const {data:{session}}=await sb.auth.getSession(); hasSession=!!session; }catch(_){}
    if(!hasSession){
      const rec=await _establishRecoverySession();
      if(!rec.ok)throw new Error('Session expirée. Veuillez rouvrir le lien reçu par e-mail (ou en redemander un).');
    }
    const {error}=await sb.auth.updateUser({password:p1});
    if(error)throw new Error(error.message);
    /* Nettoyer l'URL (token de récupération) */
    try{window.history.replaceState({},'',location.pathname);}catch(_){}
    document.getElementById('_setpwd_modal')?.remove();
    const u=await _resolveAppUser();
    if(u&&!u.disabled){
      curUser=u;await loadRestData();
      if(u.role==='admin'){resetAdmTabs();showAdm();}else showCat();
    }else{
      alert('Mot de passe défini ✅. Vous pouvez maintenant vous connecter.');
      await sb.auth.signOut().catch(()=>{});
      sv('vl');
    }
  }catch(e){if(err)err.textContent=_authMsg(e.message);if(btn)btn.disabled=false;}
}

/* ── État du compte auth dans le formulaire membre + bouton Inviter ── */
function _setUfAuthStatus(hasAuth,showBtn){
  const st=document.getElementById('uf-auth-status');
  const btn=document.getElementById('uf-invite-btn');
  if(st)st.innerHTML=showBtn?(hasAuth?'<span style="color:#16a34a">● Compte activé</span>':'<span style="color:#d97706">○ Pas encore invité</span>'):'';
  if(btn){btn.style.display=showBtn?'':'none';btn.textContent=hasAuth?'✉️ Renvoyer l’invitation':'✉️ Inviter';}
}
/* Invite le membre en cours d'édition (enregistre d'abord son e-mail). */
async function invManFromForm(){
  if(!ufEid){alert('Enregistrez d\'abord le compte, puis rouvrez-le pour l\'inviter.');return;}
  const em=(document.getElementById('ufemail')?.value||'').trim().toLowerCase();
  if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em)){alert('Saisissez un e-mail valide avant d\'inviter.');return;}
  const btn=document.getElementById('uf-invite-btn');
  if(btn){btn.disabled=true;btn.textContent='Envoi…';}
  try{
    await sbUpd('users',ufEid,{email:em});
    const i=users.findIndex(u=>String(u.id)===String(ufEid));if(i>=0)users[i].email=em;
    const res=await _inviteMember(ufEid,em);
    if(res.ok){
      if(i>=0){users[i].auth_id=users[i].auth_id||'pending';}
      _setUfAuthStatus(true,true);
      if(res.emailWarning){
        alert('⚠️ Compte relié, mais l\'e-mail n\'a PAS pu être envoyé :\n\n'+res.emailWarning+'\n\nLe membre ne recevra pas de lien. Communiquez-lui plutôt un mot de passe temporaire (créé dans Supabase → Authentication → Users) par WhatsApp.');
      }else{
        alert(res.alreadyExisted?'✅ Compte existant relié — e-mail de réinitialisation envoyé à '+em:'✅ Invitation envoyée à '+em);
      }
    }else{
      alert('❌ Invitation : '+res.error);
    }
  }catch(e){alert('❌ Erreur : '+e.message);}
  finally{
    if(btn)btn.disabled=false;
    const cur=users.find(u=>String(u.id)===String(ufEid));
    _setUfAuthStatus(!!(cur&&cur.auth_id),true);
  }
}

/* ── Inviter un membre (création compte auth via Edge Function invite-user) ── */
async function _inviteMember(userId,email){
  _initSb();
  const em=(email||'').trim().toLowerCase();
  if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em))return{ok:false,error:'E-mail invalide.'};
  try{
    const {data,error}=await sb.functions.invoke('invite-user',{body:{
      space_code:SPACE_ID,user_id:userId,email:em,
      redirect_to:location.origin+location.pathname+'?setpw=1'
    }});
    if(error){
      const ctx=error.context;let msg=error.message;
      try{if(ctx&&typeof ctx.json==='function'){const j=await ctx.json();if(j&&j.error)msg=j.error;}}catch(_){}
      return{ok:false,error:msg};
    }
    if(data&&data.error)return{ok:false,error:data.error};
    let emailWarning=null;
    if(data&&data.alreadyExisted){
      const {error:rstErr}=await sb.auth.resetPasswordForEmail(em,{redirectTo:location.origin+location.pathname+'?setpw=1'});
      if(rstErr){
        /* 429 = SMTP intégré Supabase saturé (limite de quelques emails/heure).
           Solution : configurer un SMTP dédié, ou communiquer un mot de passe par WhatsApp. */
        emailWarning=/rate|429|too many/i.test(rstErr.message)
          ? 'Limite d\'envoi d\'e-mails atteinte (SMTP Supabase). Réessayez plus tard ou configurez un SMTP dédié.'
          : _authMsg(rstErr.message);
      }
    }
    return{ok:true,invited:!!(data&&data.invited),alreadyExisted:!!(data&&data.alreadyExisted),emailWarning};
  }catch(e){return{ok:false,error:e.message};}
}
function doLogout(){stopRealtimeSync();curUser=null;_admUsRefreshed=false;_admLoginLogLoaded=false;loginLog=[];try{_initSb();sb.auth.signOut();}catch(_){}localStorage.removeItem('cb_session');localStorage.removeItem('cb_lastview');localStorage.removeItem('cb_lasttab');sv('vl');}
function showAdm(){
  if(!curUser)return;
  const isAdmin=curUser.role==='admin';
  const tabs=curUser.tabs||[];
  /* Non-admin sans aucun onglet admin autorisé → refuser */
  if(!isAdmin&&!tabs.includes('members')&&!tabs.includes('stats'))return;
  sv('vadm');sChip('a3','n3');
  document.getElementById('nl3').innerHTML='';
  if(!isAdmin){
    /* Masquer les onglets non autorisés */
    const tabMap={bk:false,rq:false,loans_adm:tabs.includes('loans_validator'),im:false,
      us:tabs.includes('members'),reg:false,st:tabs.includes('stats'),cat2:false,shelves:tabs.includes('shelf_mgr'),theme:false,log:false};
    document.querySelectorAll('#vadm .at').forEach(btn=>{
      const t=btn.getAttribute('onclick')?.match(/swT\('([^']+)'/)?.[1];
      if(!t)return;
      btn.style.display=tabMap[t]===true?'':'none';
    });
    /* Activer le premier onglet autorisé */
    const firstKey=Object.entries(tabMap).find(([,v])=>v)?.[0];
    if(firstKey){
      document.querySelectorAll('#vadm .at').forEach(x=>x.classList.remove('active'));
      document.querySelectorAll('#vadm .ap').forEach(x=>x.classList.remove('active'));
      const btn=document.querySelector(`#vadm .at[onclick*="swT('${firstKey}'"]`);
      if(btn)btn.classList.add('active');
      const panel=document.getElementById('ap-'+firstKey);
      if(panel)panel.classList.add('active');
    }
    /* Charger uniquement les modules autorisés */
    if(tabs.includes('members'))rAdmUs();
    if(tabs.includes('stats'))rAdmStat();
    updAdmLoansBadge();
  } else {
    /* Admin complet */
    document.querySelectorAll('#vadm .at').forEach(btn=>btn.style.display='');
    resetAdmTabs();
    rAdmBk();rAdmRq();rAdmUs();rAdmDelUs();rPropSt();rCatAccessPanel();initLoanOptionPanel();updAdmLoansBadge();
    setRegFilter('pending');
    const punEl=document.getElementById('pun');if(punEl)punEl.min=todayStr();
    const admMotifEl=document.getElementById('adm-motif');if(admMotifEl)admMotifEl.value=cfg.propMotif||'';
    const admContactEl=document.getElementById('adm-contact');if(admContactEl)admContactEl.value=cfg.contact||'';
    const admContactNameEl=document.getElementById('adm-contact-name');if(admContactNameEl)admContactNameEl.value=cfg.contactName||'';
    const admMeetPlaceEl=document.getElementById('adm-meeting-place');if(admMeetPlaceEl)admMeetPlaceEl.value=cfg.meetingPlace||'';
    const admMeetTimeEl=document.getElementById('adm-meeting-time');if(admMeetTimeEl)admMeetTimeEl.value=cfg.meetingTime||'';
    const admCountryEl=document.getElementById('adm-country-code');if(admCountryEl)admCountryEl.value=cfg.countryCode||'';
    const admShortLinkEl=document.getElementById('adm-short-link');if(admShortLinkEl)admShortLinkEl.value=cfg.shortLink||'';
    updPDFBtn();
  }
  /* ── Réinitialiser tous les filtres du catalogue pour ce nouvel utilisateur ── */
  sf={t:'',a:'',c:'',l:''};
  catTypeFilter='all';
  catNewOnly=false;
  catFeatOnly=false;
  catPage=1;
  /* Vider les champs de recherche visuellement */
  ['cat-search','cat-f-lng','cat-f-cat'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
  const newOnlyBtn=document.getElementById('cat-new-only');if(newOnlyBtn)newOnlyBtn.classList.remove('active');
  const featBtn=document.getElementById('cat-feat-only');if(featBtn)featBtn.classList.remove('active');
  try{_refreshSectPicker(document.querySelector('#vadm .anv'));}catch(e){}
}

/* ═══════════════════════════════════════════════════════════════
   CATALOGUE
═══════════════════════════════════════════════════════════════ */
let sf={t:'',a:'',c:'',l:''};
let catTypeFilter='all';
function showMyLoans(){
  /* Modal inline plutôt qu'une vue séparée */
  const myLoans=loans.filter(l=>l.userId==curUser?.id&&(l.status==='active'||l.status==='pending'||l.status==='pending_return'));
  const past=loans.filter(l=>l.userId==curUser?.id&&(l.status==='returned'||l.status==='rejected'))
    .sort((a,b)=>(b.requestedAt||'').localeCompare(a.requestedAt||'')).slice(0,5);
  const today=new Date().toISOString().split('T')[0];
  const modal=document.createElement('div');
  modal.id='m-my-loans-overlay';
  modal.style.cssText='position:fixed;inset:0;background:rgba(10,24,40,.72);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px;backdrop-filter:blur(5px)';
  const rows=l=>{
    const late=l.dueDate&&l.dueDate<today&&l.status==='active';
    const days=l.dueDate?Math.ceil((new Date(l.dueDate)-new Date(today))/(86400*1000)):null;
    const isPending=l.status==='pending';
    const isPendingReturn=l.status==='pending_return';
    const statusLine=isPending?'<div style="margin-top:6px;font-size:12px;font-weight:600;color:#92400e;background:#fef9c3;padding:4px 10px;border-radius:20px;display:inline-block">&#9203; Demande en attente de validation</div>':
      isPendingReturn?'<div style="margin-top:6px;font-size:12px;font-weight:600;color:#ea580c;background:#fff7ed;padding:4px 10px;border-radius:20px;display:inline-block">&#9203; Retour déclaré — en attente de confirmation</div>':
      `<div style="font-size:13px;font-weight:600;color:${late?'#dc2626':days!==null&&days<=3?'#d97706':'var(--green)'};margin-top:4px">
        ${late?'&#9888;&#65039; En retard — retour prévu le '+l.dueDate:days===null?'—':days===0?'&#128197; Retour aujourd\'hui !':(days>0?'&#128197; Retour dans '+days+'j ('+l.dueDate+')':'')}</div>`;
    return html`<div style="background:${late?'#fff5f5':isPendingReturn?'#fff7ed':'var(--g50)'};border-radius:10px;padding:14px 16px;border:1.5px solid ${late?'#fca5a5':isPendingReturn?'#fed7aa':'var(--g200)'};margin-bottom:10px">
      <div style="font-weight:600;font-size:15px;color:var(--navy)">${l.bookTitle}</div>
      <div style="font-size:13px;color:var(--g500);margin-top:4px">Demandé le ${l.requestedAt?new Date(l.requestedAt).toLocaleDateString('fr-FR'):'—'}</div>
      ${safe(statusLine)}
      ${safe(l.status==='active'?`<button type="button" onclick="markReturned('${l.id}');document.getElementById('m-my-loans-overlay')?.remove()" style="margin-top:8px;background:var(--green);color:white;border:none;border-radius:7px;padding:6px 14px;font-size:12px;font-weight:600;cursor:pointer;font-family:inherit">&#128196; Déclarer le retour</button>`:'')}

    </div>`;
  };
  modal.innerHTML=`<div style="background:white;border-radius:20px;width:100%;max-width:480px;max-height:88vh;overflow-y:auto;box-shadow:0 24px 60px rgba(0,0,0,.25)">
    <div style="padding:20px 24px 16px;border-bottom:1px solid var(--g100);display:flex;align-items:center;justify-content:space-between;position:sticky;top:0;background:white;z-index:1">
      <h3 style="font-family:'Cormorant Garamond',serif;font-size:22px;color:var(--navy)">📖 Mes emprunts</h3>
      <button onclick="document.getElementById('m-my-loans-overlay').remove()" style="background:var(--g100);border:none;width:32px;height:32px;border-radius:8px;cursor:pointer;font-size:16px">✕</button>
    </div>
    <div style="padding:20px 24px">
      ${myLoans.length===0&&past.length===0?'<p style="color:var(--g400);text-align:center;padding:24px 0">Aucun emprunt en cours ou récent.</p>':''}
      ${myLoans.length?`<h4 style="font-size:14px;font-weight:700;color:var(--navy);margin-bottom:10px;text-transform:uppercase;letter-spacing:.5px">📖 En cours (${myLoans.length})</h4>${myLoans.map(rows).join('')}`:''}
      ${past.length?`<h4 style="font-size:14px;font-weight:700;color:var(--g500);margin:16px 0 10px;text-transform:uppercase;letter-spacing:.5px">📋 Historique récent</h4>${past.map(l=>{const isRej=l.status==='rejected';return html`<div style="background:${isRej?'#fff5f5':'var(--g50)'};border-radius:10px;padding:12px 16px;margin-bottom:8px;border:1px solid ${isRej?'#fca5a5':'var(--g200)'}"><div style="font-weight:600;font-size:14px;color:var(--navy)">${l.bookTitle}</div><div style="font-size:12px;margin-top:4px">${safe(isRej?'<span style="background:#fee2e2;color:#dc2626;border:1px solid #fca5a5;padding:2px 8px;border-radius:20px;font-size:11px;font-weight:600">&#10060; Demande rejetée</span>':'<span style="background:#d1fae5;color:#065f46;padding:2px 8px;border-radius:20px;font-size:11px;font-weight:600">&#9989; Retourné</span>')} <span style="color:var(--g400)">${isRej?(l.rejectedAt?new Date(l.rejectedAt).toLocaleDateString('fr-FR'):'—'):(l.returnedAt?new Date(l.returnedAt).toLocaleDateString('fr-FR'):'—')}</span></div></div>`;}).join('')}`:''}
    </div>
  </div>`;
  document.body.appendChild(modal);
}
function showCat(){
  /* Afficher bouton Mes Emprunts pour les résidents ET membres pouvant emprunter */
  const _btnML=document.getElementById('btn-my-loans');
  if(_btnML){
    const hasLoans=loans.some(l=>l.userId==curUser?.id&&(l.status==='active'||l.status==='pending'||l.status==='pending_return'));
    _btnML.style.display=(curUser&&(curUser.role==='resident'||curUser.canLoan||hasLoans))?'inline-flex':'none';
  }
  /* Garantir que l'admin voit toujours les deux catalogues */
  if(curUser&&curUser.role==='admin')curUser.spiritualAccess=true;
  if(!curUser){sv('vl');return;}
  sf={t:'',a:'',c:'',l:''};
  ['ft','fa','fc','fl'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
  const qs=document.getElementById('qs');if(qs)qs.value='';
  catTypeFilter='all';
  sv('vc');sChip('a0','n0');bNav('nl0','vc');updRB();rCatTypeTabs();rCat();
  /* Afficher/masquer la section "Mes étagères" selon le rôle */
  const _shelfSec=document.getElementById('shelf-mgr-section');
  if(_shelfSec){
    const _isSM=curUser&&(curUser.role==='enrol'||(curUser.tabs||[]).includes('shelf_mgr'));
    _shelfSec.style.display=_isSM?'block':'none';
    if(_isSM)rShelfMgrView();
  }
}
function rCatTypeTabs(){
  const el=document.getElementById('cat-type-tabs');if(!el)return;
  const _ca2=cfg.catAccess||{member:['academique'],commission:['academique','spirituel'],resident:['academique'],enrol:['academique','spirituel'],admin:['academique','spirituel']};
  /* Admin voit toujours les deux catalogues.
     Pour les autres rôles : le rôle doit autoriser spirituel ET l'utilisateur doit avoir spiritualAccess=true */
  const catDefs=_getCatTypes();
  const _roleAllowed=curUser&&curUser.role==='admin'
    ?catDefs.map(t=>t.id)
    :(curUser?(_ca2[curUser.role]||['academique']):['academique']);
  const allowed=curUser&&curUser.role!=='admin'
    ?_roleAllowed.filter(t=>{const def=catDefs.find(c=>c.id===t);return !def?.requiresIndivAccess||!!curUser.spiritualAccess;})
    :_roleAllowed;
  if(allowed.length<=1){el.innerHTML='';catTypeFilter='all';return;}
  const tabs=[{k:'all',l:'Tous les livres',ico:'📚'},...catDefs.map(t=>({k:t.id,l:t.label,ico:t.emoji}))];
  el.innerHTML=tabs.filter(t=>t.k==='all'||allowed.includes(t.k)).map(t=>html`
    <button onclick="catTypeFilter='${t.k}';catPage=1;rCatTypeTabs();rCat();"
      style="padding:7px 16px;border-radius:20px;border:1.5px solid ${catTypeFilter===t.k?'var(--navy)':'var(--g200)'};
      background:${catTypeFilter===t.k?'var(--navy)':'white'};color:${catTypeFilter===t.k?'white':'var(--g600)'};
      font-size:13px;font-weight:500;cursor:pointer;font-family:inherit">${t.ico} ${t.l}</button>`).join('');
}
function apSrch(){sf.t=document.getElementById('ft').value.toLowerCase();sf.a=document.getElementById('fa').value.toLowerCase();sf.c=document.getElementById('fc').value.toLowerCase();sf.l=document.getElementById('fl').value.toLowerCase();catPage=1;rCat(1);}
function qSearch(v){const q=v.toLowerCase();sf={t:q,a:q,c:q,l:q};catPage=1;rCat(1);}
let catNewOnly=false,catFeatOnly=false;
function gFilt(){
  const _ca=cfg.catAccess||{member:['academique'],commission:['academique','spirituel'],resident:['academique'],enrol:['academique','spirituel'],admin:['academique','spirituel']};
  const _catDefs=_getCatTypes();
  /* L'admin voit tous les catalogues */
  const isAdmin=curUser&&curUser.role==='admin';
  const allowedCats=isAdmin?_catDefs.map(t=>t.id):(curUser?(_ca[curUser.role]||['academique']):['academique']);
  const avail=books.filter(b=>{
    if(b.status==='retired')return false;
    const bType=b.catType||'academique';
    const catDef=_catDefs.find(t=>t.id===bType);
    /* Catalogues à accès individuel requis (ex : spirituel) */
    if(catDef?.requiresIndivAccess&&!isAdmin){
      if(!(allowedCats.includes(bType)&&curUser?.spiritualAccess))return false;
    } else if(!isAdmin&&!allowedCats.includes(bType))return false;
    if(catTypeFilter&&catTypeFilter!=='all'&&bType!==catTypeFilter)return false;
    return true;
  });
  /* Filtres Nouveautés et Mis en avant */
  const now_gf=Date.now();
  let availFiltered=avail.slice();
  if(catNewOnly)availFiltered=availFiltered.filter(b=>b.addedAt&&(now_gf-new Date(b.addedAt).getTime())<30*86400*1000);
  if(catFeatOnly)availFiltered=availFiltered.filter(b=>b.featured);
  /* ⭐ Featured en tête, puis 🆕 nouveaux, puis le reste */
  availFiltered.sort((a2,b2)=>{
    const fa=a2.featured?2:0,fb=b2.featured?2:0;
    const na=a2.addedAt&&(now_gf-new Date(a2.addedAt).getTime())<30*86400*1000?1:0;
    const nb2=b2.addedAt&&(now_gf-new Date(b2.addedAt).getTime())<30*86400*1000?1:0;
    return(fb+nb2)-(fa+na);
  });
  const isQ=sf.t===sf.a&&sf.t===sf.c&&sf.t===sf.l;
  const priv=isPrivileged();
  if(isQ&&sf.t){
    const q=sf.t;
    return availFiltered.filter(b=>{
      const fields=[b.titre,b.auteur,b.cat,b.lang];
      if(priv)fields.push(b.salle,b.placard,b.etagere,b.editeur,b.etat,b.ancienNouv,String(b.annee||''),String(b.expl||''),b.resume);
      return fields.some(v=>String(v||'').toLowerCase().includes(q));
    });
  }
  return availFiltered.filter(b=>{
    if(sf.t&&!b.titre.toLowerCase().includes(sf.t))return false;
    if(sf.a&&!b.auteur.toLowerCase().includes(sf.a))return false;
    if(sf.c&&!b.cat.toLowerCase().includes(sf.c))return false;
    if(sf.l&&!(b.lang||'').toLowerCase().includes(sf.l))return false;
    return true;
  });
}
let catPage=1;
const CAT_PER=12;
function rCat(page=catPage){
  catPage=page;
  const fl=gFilt();
  const avail=books.filter(b=>b.status!=='retired').length;
  document.getElementById('bkc').textContent=fl.length;
  document.getElementById('bkt').textContent=fl.length<avail?'sur '+avail+' total':'';
  const g=document.getElementById('cgrid');
  if(!fl.length){g.innerHTML=`<div class="empty" style="grid-column:1/-1"><div class="ei">🔍</div><p>Aucun livre ne correspond.</p></div>`;
    renderPagination('cat-pgn',1,0,CAT_PER,p=>rCat(p));return;}
  const slice=fl.slice((page-1)*CAT_PER,page*CAT_PER);
  g.innerHTML=slice.map(b=>html`<div class="bcd" onclick="showDet(${b.id})">
    <div class="bcv" style="background:${cg(b.cat)}">${b.emoji||ci(b.cat)}</div>
    <div class="bbd">
      <span class="ctg" style="background:${cb(b.cat)};color:${cf(b.cat)}">${b.cat}</span>
      ${safe((()=>{const ct=b.catType||'academique';if(ct==='academique')return'';const def=_getCatTypes().find(t=>t.id===ct);return def?`<span class="ctg" style="background:#f3e8ff;color:#6b21a8;font-size:10px">${def.emoji} ${def.label}</span>`:`<span class="ctg" style="background:#f1f5f9;color:#64748b;font-size:10px">${ct}</span>`;})())}
      <div class="btt">${b.titre}</div>
      <div class="bat">✍️ ${b.auteur||'—'}</div>
      ${safe(b.salle?`<div class="blo">📍 ${esc(b.salle)}${b.placard?` · ${esc(b.placard)}`:''}${b.etagere?`-${esc(b.etagere)}`:''}</div>`:'')}

      <div class="bmt"><span>${b.lang||'—'}</span><span>${b.annee||'—'}</span></div>
    </div>
  </div>`).join('');
  renderPagination('cat-pgn',page,fl.length,CAT_PER,p=>rCat(p));
}
/* ── Système de covers par catégorie ── */
const CAT_STYLES={
  'Littérature africaine':{bg:'linear-gradient(160deg,#d97706 0%,#92400e 100%)',icon:'🌍',badge:['#fef3c7','#92400e']},
  'Littérature':{bg:'linear-gradient(160deg,#7c3aed 0%,#4c1d95 100%)',icon:'📜',badge:['#ede9fe','#5b21b6']},
  'Roman':{bg:'linear-gradient(160deg,#be185d 0%,#831843 100%)',icon:'📖',badge:['#fce7f3','#9d174d']},
  'Autobiographie':{bg:'linear-gradient(160deg,#0369a1 0%,#1e3a5f 100%)',icon:'✍️',badge:['#e0f2fe','#075985']},
  'Histoire':{bg:'linear-gradient(160deg,#a16207 0%,#713f12 100%)',icon:'🏛️',badge:['#fef9c3','#713f12']},
  'Informatique':{bg:'linear-gradient(160deg,#059669 0%,#064e3b 100%)',icon:'💻',badge:['#dcfce7','#166534']},
  'Jeunesse / Philosophie':{bg:'linear-gradient(160deg,#ea580c 0%,#7c2d12 100%)',icon:'🌟',badge:['#ffedd5','#7c2d12']},
  'Philosophie':{bg:'linear-gradient(160deg,#7c3aed 0%,#4c1d95 100%)',icon:'🧠',badge:['#f3e8ff','#6b21a8']},
  'Droit':{bg:'linear-gradient(160deg,#475569 0%,#1e293b 100%)',icon:'⚖️',badge:['#f1f5f9','#334155']},
  'Sciences / Mathématiques':{bg:'linear-gradient(160deg,#22806B 0%,#1a3a30 100%)',icon:'🔬',badge:['#d1fae5','#065f46']},
  'Mathématique':{bg:'linear-gradient(160deg,#0891b2 0%,#164e63 100%)',icon:'📐',badge:['#cffafe','#0e7490']},
  'Sciences':{bg:'linear-gradient(160deg,#0d9488 0%,#134e4a 100%)',icon:'🧪',badge:['#ccfbf1','#0f766e']},
  'Œuvre littéraire':{bg:'linear-gradient(160deg,#9333ea 0%,#581c87 100%)',icon:'🎭',badge:['#f3e8ff','#6b21a8']},
  'Économie':{bg:'linear-gradient(160deg,#0f766e 0%,#134e4a 100%)',icon:'📈',badge:['#ccfbf1','#115e59']},
  'Politique':{bg:'linear-gradient(160deg,#1d4ed8 0%,#1e3a8a 100%)',icon:'🏛️',badge:['#dbeafe','#1e40af']},
  'Géographie':{bg:'linear-gradient(160deg,#16a34a 0%,#14532d 100%)',icon:'🗺️',badge:['#dcfce7','#166534']},
  'Religion':{bg:'linear-gradient(160deg,#b45309 0%,#78350f 100%)',icon:'☪️',badge:['#fef3c7','#92400e']},
  'Art':{bg:'linear-gradient(160deg,#db2777 0%,#831843 100%)',icon:'🎨',badge:['#fce7f3','#9d174d']},
  'Musique':{bg:'linear-gradient(160deg,#7c3aed 0%,#4c1d95 100%)',icon:'🎵',badge:['#ede9fe','#5b21b6']},
  'Médecine / Santé':{bg:'linear-gradient(160deg,#dc2626 0%,#7f1d1d 100%)',icon:'🏥',badge:['#fee2e2','#b91c1c']},
  'Biologie':{bg:'linear-gradient(160deg,#16a34a 0%,#14532d 100%)',icon:'🧬',badge:['#dcfce7','#166534']},
  'Physique / Chimie':{bg:'linear-gradient(160deg,#0891b2 0%,#164e63 100%)',icon:'⚗️',badge:['#cffafe','#0e7490']},
  'Général':{bg:'linear-gradient(160deg,#1C4370 0%,#142f4f 100%)',icon:'📚',badge:['#e0f2fe','#1C4370']},
};
function catStyle(c){
  if(CAT_STYLES[c])return CAT_STYLES[c];
  const cl=c.toLowerCase();
  for(const[k,v]of Object.entries(CAT_STYLES)){
    if(cl.includes(k.toLowerCase())||k.toLowerCase().includes(cl))return v;
  }
  /* couleur déterministe basée sur le hash du nom */
  const palettes=[
    {bg:'linear-gradient(160deg,#1C4370,#142f4f)',icon:'📚',badge:['#e0f2fe','#1C4370']},
    {bg:'linear-gradient(160deg,#7c3aed,#4c1d95)',icon:'📝',badge:['#ede9fe','#5b21b6']},
    {bg:'linear-gradient(160deg,#059669,#064e3b)',icon:'📗',badge:['#dcfce7','#166534']},
    {bg:'linear-gradient(160deg,#d97706,#92400e)',icon:'📙',badge:['#fef3c7','#92400e']},
    {bg:'linear-gradient(160deg,#be185d,#831843)',icon:'📕',badge:['#fce7f3','#9d174d']},
  ];
  const hash=c.split('').reduce((a,ch)=>a+ch.charCodeAt(0),0);
  return palettes[hash%palettes.length];
}
function cg(c){return catStyle(c).bg;}
function cb(c){return catStyle(c).badge[0];}
function cf(c){return catStyle(c).badge[1];}
function ci(c){return catStyle(c).icon;}

function canProp(){
  if(!curUser||curUser.disabled)return false;
  if(!cfg.propMotif||!cfg.propMotif.trim())return false;
  if(curUser.role==='admin')return true;
  /* Session globale fermée → personne ne peut proposer sauf autorisation individuelle ET session encore ouverte */
  const sessionOpen=cfg.openAll&&(!cfg.openUntil||new Date()<=new Date(cfg.openUntil+'T23:59:59'));
  /* Autorisation individuelle : valide seulement si la session est ouverte */
  if(curUser.canPropose&&sessionOpen){
    if(!curUser.propUntil)return true;
    return new Date()<=new Date(curUser.propUntil+'T23:59:59');
  }
  if(sessionOpen)return true;
  return false;
}
function updRB(){
  const rbEl=document.getElementById('rb');
  const rbHist=document.getElementById('rb-history');
  if(rbEl)rbEl.style.display=canProp()?'inline-flex':'none';
  if(rbHist&&curUser){
    const myReqs=requests.filter(r=>r.dem==curUser.id);
    rbHist.style.display=myReqs.length>0?'inline-flex':'none';
  }else if(rbHist){rbHist.style.display='none';}
}

function showMyRequests(){
  if(!curUser)return;
  /* Toutes les demandes du membre, triées par date décroissante */
  const myReqs=requests.filter(r=>r.dem==curUser.id)
    .sort((a,b)=>(b.date||'').localeCompare(a.date||''));
  /* Grouper par session pour l'affichage */
  const sessionMap={};
  myReqs.forEach(r=>{
    const key=r.sessionId||r.date||'session';
    if(!sessionMap[key])sessionMap[key]=[];
    sessionMap[key].push(r);
  });
  const sessionsHtml=Object.entries(sessionMap).map(([sid,reqs])=>{
    const dateLabel=reqs[0]?.date?new Date(reqs[0].date).toLocaleDateString('fr-FR',{month:'long',year:'numeric'}):'Session';
    const booksHtml=reqs.map((r,i)=>html`
      <div style="background:var(--g50);border-radius:10px;padding:14px 16px;border:1px solid var(--g200);margin-bottom:8px;user-select:text">
        <div style="display:flex;align-items:flex-start;gap:10px">
          <span style="background:var(--navy);color:white;border-radius:50%;width:22px;height:22px;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;flex-shrink:0;margin-top:2px">${i+1}</span>
          <div style="flex:1;min-width:0">
            <div style="font-weight:700;font-size:15px;color:var(--navy);word-break:break-word">${r.titre||'—'}</div>
            ${safe(r.auteur?`<div style="font-size:13px;color:var(--g500);margin-top:3px">✍️ ${esc(r.auteur)}</div>`:'')}
            ${safe(r.desc?`<div style="font-size:12px;color:var(--g400);margin-top:5px;font-style:italic;line-height:1.5">${esc(r.desc)}</div>`:'')}

          </div>
        </div>
      </div>`).join('');
    return html`
      <div style="margin-bottom:20px">
        <div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--g400);margin-bottom:10px;padding-bottom:6px;border-bottom:1px solid var(--g200)">
          📅 Session du ${dateLabel} — ${reqs.length} livre(s) soumis
        </div>
        ${safe(booksHtml)}
      </div>`;
  }).join('');

  /* Ouvrir un modal dédié */
  const overlay=document.createElement('div');
  overlay.id='m-my-requests-overlay';
  overlay.style.cssText='position:fixed;inset:0;background:rgba(15,23,42,.55);z-index:9000;display:flex;align-items:center;justify-content:center;padding:16px';
  overlay.onclick=e=>{if(e.target===overlay)overlay.remove();};
  overlay.innerHTML=html`
    <div style="background:white;border-radius:16px;box-shadow:0 24px 64px rgba(0,0,0,.3);width:100%;max-width:560px;max-height:88vh;display:flex;flex-direction:column;overflow:hidden">
      <!-- En-tête -->
      <div style="padding:20px 22px 16px;border-bottom:1px solid var(--g100);display:flex;align-items:center;justify-content:space-between;flex-shrink:0">
        <div>
          <div style="font-size:18px;font-weight:700;color:var(--navy)">📋 Mes livres soumis</div>
          <div style="font-size:13px;color:var(--g400);margin-top:2px">${myReqs.length} livre(s) au total</div>
        </div>
        <button type="button" onclick="document.getElementById('m-my-requests-overlay').remove()"
          style="background:var(--g100);border:none;border-radius:8px;padding:6px 12px;cursor:pointer;font-size:13px;color:var(--g600);font-family:inherit;font-weight:600">✕ Fermer</button>
      </div>
      <!-- Bannière info -->
      <div style="background:#eff6ff;border-bottom:1px solid #bfdbfe;padding:12px 22px;flex-shrink:0;display:flex;gap:10px;align-items:flex-start">
        <span style="font-size:18px;flex-shrink:0">ℹ️</span>
        <div style="font-size:13px;color:#1e40af;line-height:1.5">
          Vos propositions ont bien été transmises à la commission.<br>
          <strong>Elles feront l'objet d'une validation interne</strong> — vous ne recevrez pas de notification individuelle sur leur sélection définitive.
        </div>
      </div>
      <!-- Corps scrollable -->
      <div style="flex:1;overflow-y:auto;padding:18px 22px;user-select:text">
        ${safe(myReqs.length===0
          ?'<div style="text-align:center;padding:40px;color:var(--g400)">Vous n\'avez encore soumis aucun livre.</div>'
          :sessionsHtml)}
      </div>
      ${safe(myReqs.length>0?`
      <!-- Pied : astuce copier-coller -->
      <div style="border-top:1px solid var(--g100);padding:12px 22px;background:var(--g50);flex-shrink:0">
        <div style="font-size:12px;color:var(--g400);display:flex;align-items:center;gap:6px">
          💡 <span>Pour copier un titre ou un auteur, sélectionnez le texte directement dans cette liste.</span>
        </div>
      </div>`:'')}
    </div>`;
  document.body.appendChild(overlay);
}

/* ═══════════════════════════════════════════════════════════════
   FICHE LIVRE
═══════════════════════════════════════════════════════════════ */
function showDet(id){
  const b=books.find(x=>x.id==id);if(!b)return;
  const eB=e=>e?`<span class="badge ${e==='Bon'?'bbon':e==='Moyen'?'bmoy':'bmauv'}">${e}</span>`:'';
  const aB=a=>a?`<span class="badge ${a==='Nouveau'?'bnv':'banc'}">${a}</span>`:'';
  const priv=isPrivileged();
  document.getElementById('mdb').innerHTML=`
    <div class="dh">
      <div class="dcv" style="background:${cg(b.cat)}">${b.emoji||ci(b.cat)}</div>
      <div class="di"><h2>${esc(b.titre)}</h2><div class="dat">✍️ ${esc(b.auteur)||'—'}</div>
        <div class="dtg">
          <span style="background:${cb(b.cat)};color:${cf(b.cat)}">${esc(b.cat)}</span>
          ${b.lang?`<span style="background:#e0f2fe;color:#0369a1">🌐 ${esc(b.lang)}</span>`:''}
          ${b.annee?`<span style="background:#f1f5f9;color:#475569">📅 ${esc(String(b.annee))}</span>`:''}
          ${b.editeur?`<span style="background:#f1f5f9;color:#475569">🏢 ${esc(b.editeur)}</span>`:''}
          ${priv?aB(b.ancienNouv):''}${priv?eB(b.etat):''}
        </div>
      </div>
    </div>
    ${priv?`<div class="dig">
      <div class="dii"><div class="dl">Exemplaires</div><div class="dv">${b.expl||1} ex.</div></div>
      <div class="dii"><div class="dl">État</div><div class="dv">${esc(b.etat)||'—'}</div></div>
      <div class="dii"><div class="dl">Acquisition</div><div class="dv">${esc(b.ancienNouv)||'—'}</div></div>
    </div>`:''}
    ${(b.salle||b.placard||b.etagere)?`<div class="dloc">
      <span class="dll">📍 Localisation</span>
      ${b.salle?`<span class="dlv">Salle : ${esc(b.salle)}</span>`:''}
      ${b.placard?`<span class="dlv">Placard : ${esc(b.placard)}</span>`:''}
      ${b.etagere?`<span class="dlv">Étagère : ${esc(b.etagere)}</span>`:''}
    </div>`:''}
    ${b.resume?`<div class="dres"><h4>Résumé</h4><p>${esc(b.resume)}</p></div>`:''}
    ${b.addedAt&&(Date.now()-new Date(b.addedAt).getTime())<30*86400*1000?'<div style="margin-top:10px"><span style="background:#d1fae5;color:#065f46;padding:4px 10px;border-radius:20px;font-size:12px;font-weight:700">🆕 Nouveau livre</span></div>':''}
    ${b.featured?'<div style="margin-top:6px"><span style="background:#fef9c3;color:#92400e;padding:4px 10px;border-radius:20px;font-size:12px;font-weight:700">⭐ Mis en avant</span></div>':''}
    ${b.updatedAt?`<div style="margin-top:10px;font-size:11px;color:var(--g400)">📝 Ajouté le ${b.addedAt?new Date(b.addedAt).toLocaleDateString('fr-FR'):'—'} · Modifié le ${new Date(b.updatedAt).toLocaleDateString('fr-FR')} par ${esc(b.updatedBy)||'?'} · v${b.version||1}</div>`:''}
    ${(()=>{
      const borrowed=b.status==='borrowed';
      const isMissing=b.status==='missing';
      const eligible=canUserLoan();
      const isResident=curUser?.role==='resident';
      /* ── Livre introuvable ── */
      if(isMissing){
        const since=b.missingAt?new Date(b.missingAt).toLocaleDateString('fr-FR'):'—';
        const note=b.missingNote?`<div style="font-size:12px;margin-top:6px;opacity:.85">${b.missingNote}</div>`:'';
        const foundBtn=priv?`<button type="button" class="btn bg btn-sm" onclick="reportMissing(${b.id})" style="margin-top:10px;background:#16a34a;border:none">✅ Marquer comme retrouvé</button>`:'';
        return html`<div class="cnot" style="background:#fff7ed;border-color:#f97316;color:#9a3412">
          ⚠️ <strong>Livre introuvable</strong> — signalé le ${since}${note}
          ${foundBtn}
        </div>`;
      }
      /* ── Livre emprunté ── */
      if(borrowed){
        const isMine=b.borrowedBy&&curUser&&(b.borrowedBy===curUser.prenom+' '+curUser.nom||b.borrowedBy.includes(curUser.prenom));
        if(isMine){
          const myPendingReturn=loans.find(l=>l.userId==curUser?.id&&l.status==='pending_return'&&l.bookId==b.id);
          if(myPendingReturn)return '<div class="cnot" style="background:#fff7ed;border-color:#fed7aa;color:#ea580c">\u23F3 Retour déclaré — en attente de validation par l\'administrateur.</div>';
          return '<div class="cnot" style="background:#ede9fe;border-color:#7c3aed;color:#7c3aed">📖 Vous avez emprunté ce livre jusqu&#39;au '+(b.borrowedUntil||'—')+'</div>';
        }
        return '<div class="cnot">📖 <strong>Non disponible</strong> — Emprunté jusqu\'au '+(b.borrowedUntil||'—')+(b.borrowedUntil&&b.borrowedUntil<new Date().toISOString().split('T')[0]?' <strong style="color:#dc2626">– non retourné</strong>':'')+'</div>';
      }
      /* ── Disponible ── */
      if(b.status==='available'||eligible){
        const pendingRet=curUser&&loans.find(l=>l.userId==curUser.id&&l.status==='pending_return');
        if(pendingRet){
          return '<div class="cnot" style="background:#fff7ed;border-color:#fed7aa;color:#ea580c">⏳ Votre retour de "<strong>'+pendingRet.bookTitle+'</strong>" est en attente de validation. Vous pourrez emprunter à nouveau dès que l\'administrateur aura confirmé le retour.</div>';
        }
        const hasActiveOrPending=curUser&&!isResident&&loans.some(
          l=>l.userId==curUser.id&&(l.status==='active'||l.status==='pending')
        );
        if(hasActiveOrPending){
          return '<div class="cnot" style="background:#fef3c7;border-color:#fde68a;color:#92400e">📌 Vous avez un emprunt actif. Veuillez le déposer pour pouvoir emprunter à nouveau !</div>';
        }
        if(b.status!=='available'){
          return '';
        }
        if(eligible){
          const labelBtn=isResident?'📖 Emprunter ce livre':'📖 Demander l&#39;emprunt';
          return '<div style="margin-top:14px"><button type="button" class="btn bn" onclick="cM(&quot;md&quot;);openLoanModal('+b.id+')" style="width:100%">'+labelBtn+'</button></div>';
        }
      }
      return '<div class="cnot">&#127963;&#65039; <strong>Consultation sur place uniquement</strong></div>';
    })()}
    ${priv&&b.status!=='borrowed'&&b.status!=='retired'?`
    <div style="margin-top:14px;padding-top:12px;border-top:1px solid var(--g100)">
      ${b.status==='missing'
        ?`<button type="button" class="btn bo btn-sm" onclick="reportMissing(${b.id})">✅ Marquer comme retrouvé</button>`
        :`<button type="button" class="btn bo btn-sm" style="border-color:#f97316;color:#ea580c" onclick="reportMissing(${b.id})">⚠️ Signaler introuvable</button>`}
    </div>`:''}
  `;
  openM('md');
}

/* ═══════════════════════════════════════════════════════════════
   DEMANDE DE LIVRE
═══════════════════════════════════════════════════════════════ */
function openRq(){
  if(!canProp())return;
  document.getElementById('rdem').value=curUser.prenom+' '+curUser.nom;
  document.getElementById('motif-preview-text').textContent=cfg.propMotif||'—';
  document.getElementById('rtit').value='';document.getElementById('raut').value='';
  document.getElementById('rdesc').value='';document.getElementById('rerr').textContent='';
  gtoSt(1);openM('mrq');
}
function gtoSt(n){
  [1,2,3].forEach(i=>{
    document.getElementById('rs'+i).classList.toggle('active',i===n);
    const s=document.getElementById('si'+i);s.className='si'+(i===n?' active':i<n?' done':'');
  });
}
function rqNxt(){
  const t=document.getElementById('rtit').value.trim();
  if(!t){document.getElementById('rerr').textContent='Le titre est obligatoire.';return;}
  document.getElementById('rerr').textContent='';
  const a=document.getElementById('raut').value.trim(),sim=fSim(t,a);
  const sc=document.getElementById('sc');
  if(sim.length){
    const simHtml=sim.map(b=>{
      const isNew=b.addedAt&&(Date.now()-new Date(b.addedAt).getTime())<30*86400*1000;
      const newBadge=isNew?'<span style="background:#d1fae5;color:#065f46;font-size:10px;padding:1px 5px;border-radius:10px;margin-left:4px;font-weight:700">🆕</span>':'';
      const featBadge=b.featured?'<span style="font-size:11px;margin-left:2px">⭐</span>':'';
      return '<div class="smi" onclick="showDet('+b.id+')">'
        +'<div class="sic" style="background:'+cg(b.cat)+'">'+(b.emoji||'📖')+'</div>'
        +'<div><div style="font-weight:600;font-size:14px;color:var(--navy)">'+b.titre+newBadge+featBadge+'</div>'
        +'<div style="font-size:13px;color:var(--green)">'+b.auteur+'</div></div>'
        +'<div style="margin-left:auto;color:var(--green);font-size:12px">Voir →</div>'
        +'</div>';
    }).join('');
    sc.innerHTML='<div class="al aw">⚠️ <strong>'+sim.length+' livre(s) similaire(s)</strong> trouvé(s).</div>'
      +'<div class="sml">'+simHtml+'</div>'
      +'<div class="al ai">ℹ️ Si votre livre est différent, confirmez quand même.</div>';
  } else {
    sc.innerHTML='<div class="al ao">✅ Aucun livre similaire trouvé.</div>'
      +'<div style="text-align:center;padding:20px 0"><div style="font-size:48px;margin-bottom:10px">📚</div>'
      +'<p style="color:var(--g500);font-size:14px">« '+t+' » ne semble pas encore disponible.</p></div>';
  }
  gtoSt(2);
}
function rqBk(){gtoSt(1);}
async function rqCf(){
  const entry={id:nxR++,titre:document.getElementById('rtit').value.trim(),
    auteur:document.getElementById('raut').value.trim(),
    desc:document.getElementById('rdesc').value.trim(),
    motif:cfg.propMotif||'',sessionId:cfg.currentSessionId,
    dem:curUser.id,status:'pending',note:'',date:todayStr()};
  try{
    await sbSet('requests',entry.id,entry);
    await sbSaveCounters();
    requests.push(entry);
    _cachePut({requests});
    gtoSt(3);updPDFBtn();updRB();
  }catch(e){
    nxR--;
    console.error('[rqCf]',e);
    alert('❌ Erreur : votre demande n\'a pas été envoyée.\n'+e.message+'\nVérifiez votre connexion et réessayez.');
  }
}
function fSim(t,a){
  const tl=t.toLowerCase(),al=a.toLowerCase(),w=tl.split(/\s+/).filter(x=>x.length>3);
  return books.filter(b=>{const bt=b.titre.toLowerCase(),ba=b.auteur.toLowerCase();
    if(bt.includes(tl)||tl.includes(bt))return true;
    if(al&&ba.includes(al))return true;
    return w.some(x=>bt.includes(x));
  });
}
function fSimRq(titre,auteur){
  /* Similaires pour l'onglet demandes — max 3 résultats */
  const t=(titre||'').toLowerCase(),a=(auteur||'').toLowerCase();
  const words=[...t.split(/\s+/),...a.split(/\s+/)].filter(x=>x.length>3);
  if(!words.length)return[];
  return books.filter(b=>{
    const bt=(b.titre||'').toLowerCase(),ba=(b.auteur||'').toLowerCase();
    return words.some(w=>bt.includes(w)||ba.includes(w));
  }).slice(0,3);
}

/* ═══════════════════════════════════════════════════════════════
   GESTION DES DEMANDES (Commission / Résident)
═══════════════════════════════════════════════════════════════ */
function showCom(){
  if(!curUser)return;
  const r=curUser.role;if(r!=='commission'&&r!=='admin'&&r!=='resident')return;
  resetComTabs();sv('vcom');sChip('a2','n2');bNav('nl2','vcom');
  const ro=r==='resident';
  document.getElementById('com-sub').textContent=ro?'Consultation des demandes — lecture seule':'Suivi des demandes · Autorisation · Membres';
  document.getElementById('tab-auth').style.display=ro?'none':'';
  document.getElementById('tab-mbr').style.display=ro?'none':'';
  document.getElementById('com-col-action').textContent=ro?'':'Changer';
  rComSt();rComT();rComAuth();rComUsers();rSessList();updPDFBtn();
  try{_refreshSectPicker(document.querySelector('#vcom .anv'));}catch(e){}
}
function swCom(t,b){
  document.querySelectorAll('#vcom .at').forEach(x=>x.classList.remove('active'));b.classList.add('active');
  ['dem','sess','auth','mbr'].forEach(id=>{const el=document.getElementById('com-'+id);if(el)el.classList.remove('active');});
  document.getElementById('com-'+t).classList.add('active');
  try{_syncSectPicker(document.querySelector('#vcom .anv'));}catch(e){}
  if(t==='sess')rSessList();
}
function rComSt(){
  const t=requests.length,p=requests.filter(r=>r.status==='pending').length,
        a=requests.filter(r=>r.status==='approved').length,rj=requests.filter(r=>r.status==='rejected').length;
  document.getElementById('cst').innerHTML=html`
    <div class="stc stT"><div class="sv" style="color:var(--navy)">${t}</div><div class="sl">Total</div></div>
    <div class="stc stP"><div class="sv" style="color:#b45309">${p}</div><div class="sl">En attente</div></div>
    <div class="stc stA"><div class="sv" style="color:var(--green)">${a}</div><div class="sl">Approuvées</div></div>
    <div class="stc stR"><div class="sv" style="color:var(--danger)">${rj}</div><div class="sl">Rejetées</div></div>`;
}
function rComT(){
  const f=document.getElementById('cf').value;
  const list=f?requests.filter(r=>r.status===f):requests;
  const tb=document.getElementById('ctb');
  const ro=curUser&&curUser.role==='resident';
  if(!list.length){tb.innerHTML=`<tr><td colspan="9" style="text-align:center;padding:36px;color:var(--g400)">Aucune demande</td></tr>`;return;}
  tb.innerHTML=list.map(r=>{
    const u=users.find(x=>x.id==r.dem);
    const simC=fSimRq(r.titre,r.auteur);
    const simCellC=simC.length?simC.map(b=>html`<span onclick="showDet(${b.id})" title="${b.titre}" style="display:inline-block;max-width:90px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;background:#eff6ff;color:#1d4ed8;border-radius:5px;padding:2px 7px;font-size:11px;cursor:pointer;margin:1px">${b.titre.length>20?b.titre.substring(0,20)+'…':b.titre}</span>`).join(' '):'<span style="color:var(--g400)">—</span>';
    return html`<tr><td style="color:var(--g400)">#${r.id}</td>
      <td style="font-weight:600;max-width:130px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${r.titre}</td>
      <td>${r.auteur||'—'}</td>
      <td style="max-width:100px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px" title="${r.desc||''}">${safe(r.desc?html`<a href="${r.desc.startsWith('http')?r.desc:'#'}" target="_blank" style="color:var(--green)">${r.desc.substring(0,30)}${r.desc.length>30?'…':''}</a>`:'—')}</td>
      <td>${u?u.prenom+' '+u.nom:'—'}</td>
      <td style="max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-style:italic;color:var(--gd);font-size:12px">${r.motif||'—'}</td>
      <td style="color:var(--g400);white-space:nowrap;font-size:12px">${r.date}</td>
      <td style="min-width:110px">${safe(simCellC)}</td>
      <td>${safe(sBdg(r.status))}</td>
      <td>${safe(ro?'':`<div style="display:flex;align-items:center;gap:6px">
        <select class="fi fi-l" style="padding:5px 8px;font-size:12px;width:auto" onchange="chgSt(${r.id},this.value,'com')">
        <option value="pending" ${r.status==='pending'?'selected':''}>⏳ En attente</option>
        <option value="approved" ${r.status==='approved'?'selected':''}>✅ Approuvée</option>
        <option value="rejected" ${r.status==='rejected'?'selected':''}>❌ Rejetée</option>
      </select>
        ${(r.status==='approved'||r.status==='rejected')?`<button type="button" onclick="delRq(${r.id})" title="Supprimer cette demande" style="background:#fee2e2;color:#dc2626;border:none;border-radius:6px;width:28px;height:28px;cursor:pointer;font-size:13px;flex-shrink:0">🗑️</button>`:''}
      </div>`)}</td></tr>`;
  }).join('');
}

/* Supprimer une demande déjà validée ou rejetée */
async function delRq(id){
  if(!_requirePrivileged('delRq'))return;
  const r=requests.find(x=>x.id==id);if(!r)return;
  if(!confirm(`Supprimer définitivement la demande "${r.titre}" ?\n\nCette action est irréversible.`))return;
  try{
    await sbDel('requests',id);
    requests=requests.filter(x=>x.id!=id);
    _cachePut({requests});
    rAdmRq();rComT&&rComT();updPDFBtn();
    _showSyncToast('🗑️ Demande supprimée');
  }catch(e){console.error('[delRq]',e.message);alert('❌ Erreur suppression demande : '+e.message);}
}
async function chgSt(id,s,src){
  if(!_requirePrivileged('chgSt'))return;
  const r=requests.find(x=>x.id==id);if(!r)return;
  r.status=s;
  try{await sbUpd('requests',id,{status:s});}catch(e){console.error('[chgSt]',e.message);_showSyncToast('⚠️ Statut non sauvegardé');}
  _cachePut({requests});
  if(src==='com'){rComSt();rComT();}else rAdmRq();
  updPDFBtn();
}
function sBdg(s){return{pending:'<span class="badge bpen">⏳ En attente</span>',approved:'<span class="badge bapp">✅ Approuvée</span>',rejected:'<span class="badge brej">❌ Rejetée</span>'}[s]||s;}
function rBdg(r){return{admin:'<span class="badge badm">🛡️ Admin</span>',commission:'<span class="badge bcom">🎓 Commission</span>',enrol:'<span class="badge benr">📝 Enrôlement</span>',member:'<span class="badge bmem">👤 Membre</span>',resident:'<span class="badge bres">🏠 Résident</span>',validator:'<span class="badge" style="background:#ede9fe;color:#7c3aed">📖 Validateur</span>'}[r]||r;}

function updPDFBtn(){
  const has=requests.some(r=>r.status==='approved');
  ['pdf-btn-com','pdf-btn-adm'].forEach(id=>{
    const el=document.getElementById(id);
    if(el)el.style.display=has?'inline-flex':'none';
  });
  /* Aussi mettre à jour le compteur */
  const cnt=requests.filter(r=>r.status==='approved').length;
  ['pdf-btn-com','pdf-btn-adm'].forEach(id=>{
    const el=document.getElementById(id);
    if(el&&has)el.innerHTML=html`📄 Exporter PDF (${cnt} approuvée${cnt>1?'s':''})`;
  });
}

/* ═══════════════════════════════════════════════════════════════
   SESSIONS
═══════════════════════════════════════════════════════════════ */
function rSessList(){
  const el=document.getElementById('sess-list');if(!el)return;
  if(!sessions.length){el.innerHTML=`<div class="empty"><div class="ei">📭</div><p>Aucune session.</p></div>`;return;}
  el.innerHTML=`<div class="sess-grid">${sessions.slice().reverse().map(s=>{
    const cnt=requests.filter(r=>r.sessionId==s.id).length;
    const isOpen=!s.closed&&cfg.currentSessionId==s.id;
    return html`<div class="sess-card${isOpen?' open-sess':''}">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px" onclick="showSessionDetail(${s.id})" style="cursor:pointer">
        <div style="flex:1;cursor:pointer">
          <div class="sess-num">Session N°${s.id} ${safe(isOpen?'<span class="badge bapp">● En cours</span>':'')}</div>
          <div class="sess-motif">${s.motif}</div>
          <div class="sess-meta">
            <span>📅 ${fmtDateLong(s.openDate)}</span>
            ${safe(s.closed?`<span>🔒 Fermée le ${fmtDateLong(s.closedDate)}</span>`:'')}
            <span class="sess-cnt">📋 ${cnt} demande${cnt>1?'s':''}</span>
          </div>
        </div>
        ${safe(!isOpen?`<button type="button" class="btn bd btn-xs" style="flex-shrink:0;margin-top:2px" onclick="event.stopPropagation();delSess(${s.id})" title="Supprimer cette session et ses demandes">🗑️</button>`:'')}
      </div>
    </div>`;
  }).join('')}</div>`;
}
function showSessionDetail(sid){
  const s=sessions.find(x=>x.id==sid);if(!s)return;
  const reqs=requests.filter(r=>r.sessionId==sid);
  document.getElementById('sess-modal-title').textContent=`Session N°${s.id}`;
  document.getElementById('sess-modal-body').innerHTML=`
    <div class="motif-box" style="margin-bottom:18px"><div class="ml">📋 Motif</div><div class="mv">${s.motif}</div></div>
    <div style="display:flex;gap:14px;flex-wrap:wrap;margin-bottom:18px;font-size:13px;color:var(--g500)">
      <span>📅 Ouverte le ${fmtDateLong(s.openDate)}</span>
      ${s.openUntil?`<span>⏰ Jusqu'au ${fmtDateLong(s.openUntil)}</span>`:''}
      ${s.closed?`<span>🔒 Fermée le ${fmtDateLong(s.closedDate||s.openUntil)}</span>`:'<span style="color:var(--green)">● En cours</span>'}
    </div>
    ${!reqs.length?`<div class="empty" style="padding:28px 0"><div class="ei">📭</div><p>Aucune demande.</p></div>`:
    `<div class="tw"><div class="tov"><table>
      <thead><tr><th>#</th><th>Titre</th><th>Auteur</th><th>Description</th><th>Demandeur</th><th>Statut</th></tr></thead>
      <tbody>${reqs.map(r=>{const u=users.find(x=>x.id==r.dem);return`<tr>
        <td style="color:var(--g400)">#${r.id}</td><td style="font-weight:600">${r.titre}</td>
        <td>${r.auteur||'—'}</td><td style="font-size:12px">${r.desc||'—'}</td>
        <td>${u?u.prenom+' '+u.nom:'—'}</td><td>${sBdg(r.status)}</td>
      </tr>`;}).join('')}</tbody>
    </table></div></div>`}`;
  openM('msess');
}

async function delSess(id){
  const s=sessions.find(x=>x.id==id);if(!s)return;
  const cnt=requests.filter(r=>r.sessionId==id).length;
  if(!confirm(`Supprimer la Session N°${s.id} "${s.motif}" et ses ${cnt} demande(s) ?\nCette action est irréversible.`))return;
  try{
    /* Supprimer toutes les demandes liées */
    const toDelReqs=requests.filter(r=>r.sessionId==id);
    for(const r of toDelReqs){
      await sbDel('requests',r.id);
    }
    const idx=requests.findIndex(x=>x.id==id);
    requests.splice(0,requests.length,...requests.filter(r=>r.sessionId!=id));
    /* Supprimer la session */
    await sbDel('sessions',id);
    const si=sessions.findIndex(x=>x.id==id);
    if(si!==-1)sessions.splice(si,1);
    _cachePut({sessions,requests});
    rSessList();rComT();rComSt();
  }catch(e){console.error('[delSess]',e);alert('❌ Erreur suppression : '+e.message);}
}

/* ═══════════════════════════════════════════════════════════════
   AUTORISATION (Commission)
═══════════════════════════════════════════════════════════════ */
function rComAuth(){
  const el=document.getElementById('auth-status-com');if(!el)return;
  document.getElementById('com-motif').value=cfg.propMotif||'';
  const isOpen=cfg.openAll&&(!cfg.openUntil||new Date()<=new Date(cfg.openUntil+'T23:59:59'));
  const box=document.getElementById('authbox-com');
  if(isOpen){el.className='status-pill spo';el.textContent=`● Ouvert à tous${cfg.openUntil?' jusqu\'au '+fmtDateLong(cfg.openUntil):''}`;box.classList.add('authbox-open');}
  else{el.className='status-pill spc';el.textContent='● Fermé';box.classList.remove('authbox-open');}
  const until=document.getElementById('com-until');until.value=cfg.openUntil||'';until.min=todayStr();
  document.getElementById('com-motif').placeholder=nowMotifPlaceholder();
}
async function opPropCom(){
  const m=document.getElementById('com-motif').value.trim();
  const d=document.getElementById('com-until').value;
  document.getElementById('com-motif-err').textContent='';
  if(!m){document.getElementById('com-motif-err').textContent='Le motif est obligatoire.';return;}
  const sess={id:nxS++,motif:m,openDate:todayStr(),openUntil:d||null,closed:false,closedDate:null};
  try{
    await sbSet('sessions',sess.id,sess);
    cfg.propMotif=m;cfg.openAll=true;cfg.openUntil=d||null;cfg.currentSessionId=sess.id;
    await sbSaveCfg();await sbSaveCounters();
    sessions.push(sess);
    _cachePut({config:cfg,sessions});
    rComAuth();rSessList();
    document.getElementById('adm-motif').value=m;rPropSt();
  }catch(e){nxS--;console.error('[opPropCom]',e);alert('❌ Erreur : la session n\'a pas été ouverte.\n'+e.message);}
}
async function clPropCom(){
  const sessId=cfg.currentSessionId;
  const savedCfg={openAll:cfg.openAll,openUntil:cfg.openUntil,currentSessionId:cfg.currentSessionId};
  try{
    if(sessId){
      const s=sessions.find(x=>x.id==sessId);
      if(s){await sbUpd('sessions',s.id,{closed:true,closedDate:todayStr()});s.closed=true;s.closedDate=todayStr();}
    }
    cfg.openAll=false;cfg.openUntil=null;cfg.currentSessionId=null;
    await sbSaveCfg();
    _cachePut({config:cfg,sessions});
    document.getElementById('com-until').value='';
    rComAuth();rSessList();rPropSt();
  }catch(e){
    Object.assign(cfg,savedCfg);
    console.error('[clPropCom]',e);
    alert('❌ Erreur lors de la fermeture : '+e.message);
  }
}

/* ═══════════════════════════════════════════════════════════════
   MEMBRES (Commission)
═══════════════════════════════════════════════════════════════ */
let mbrSelected=new Set();
function rComUsers(){
  const tb=document.getElementById('com-utb');if(!tb)return;
  const ro=curUser&&curUser.role==='resident';
  if(!users.length){
    if(!dataReady){tb.innerHTML='<tr><td colspan="4" style="text-align:center;padding:24px;color:var(--g400)">⏳ Chargement…</td></tr>';return;}
    tb.innerHTML='<tr><td colspan="4" style="text-align:center;padding:24px;color:var(--g400)">Aucun membre.</td></tr>';return;
  }
  const q=(document.getElementById('mbr-search')?.value||'').toLowerCase();
  const list=users.filter(u=>{
    if(u.role==='admin')return false;
    if(!q)return true;
    return (u.prenom+' '+u.nom+' '+u.abbrev).toLowerCase().includes(q)||u.role.toLowerCase().includes(q);
  });
  tb.innerHTML=list.map(u=>{
    const propActive=u.canPropose;
    return html`<tr>
      <td>${safe(ro?'':`<input type="checkbox" class="mbr-chk" data-id="${u.id}" ${mbrSelected.has(u.id)?'checked':''} onchange="onMbrChk(${u.id},this.checked)" style="cursor:pointer"/>`)}</td>
      <td style="font-weight:500">${u.prenom} ${u.nom}</td>
      <td>${safe(rBdg(u.role))}</td>
      <td style="min-width:140px">
        ${safe((curUser&&curUser.role==='resident')?
          `<span class="badge ${u.canPropose?'bapp':'bmem'}">${u.canPropose?'✅ Autorisé':'Non'}</span>`:
          `<div style="display:flex;align-items:center;gap:8px">
            <label class="tgl" style="flex-shrink:0"><input type="checkbox" ${u.canPropose?'checked':''} onchange="comTogP(${u.id},this.checked)"/><span class="ts"></span></label>
            <span style="font-size:12px;font-weight:500;color:${u.canPropose?'var(--gd)':'var(--g500)'}">
              ${u.canPropose?'✅ Autorisé':'Non autorisé'}
            </span>
          </div>`)}
      </td>
    </tr>`;
  }).join('');
  const mbr_cnt=document.getElementById('com-mbr-count');if(mbr_cnt)mbr_cnt.textContent=list.length+' membre(s)'+(list.length<users.length?' affiché(s)':' au total');
  updBulkBar();
}
function onMbrChk(id,v){v?mbrSelected.add(id):mbrSelected.delete(id);updBulkBar();}
function toggleAllMbrSel(v){
  const q=(document.getElementById('mbr-search')?.value||'').toLowerCase();
  users.filter(u=>u.role!=='admin'&&(!q||(u.prenom+' '+u.nom+' '+u.abbrev).toLowerCase().includes(q))).forEach(u=>{v?mbrSelected.add(u.id):mbrSelected.delete(u.id);});
  rComUsers();
}
function updBulkBar(){
  const bar=document.getElementById('mbr-bulk');
  const cnt=document.getElementById('mbr-sel-cnt');
  if(bar){bar.style.display=mbrSelected.size>0?'flex':'none';}
  if(cnt)cnt.textContent=mbrSelected.size+' sélectionné(s)';
}
function clearBulkSel(){mbrSelected.clear();rComUsers();}
async function bulkTogP(v){
  const ids=[...mbrSelected];
  for(const id of ids){
    const u=users.find(x=>x.id==id);if(!u)continue;
    u.canPropose=v;
    try{await sbUpd('users',id,{canPropose:v});}catch(e){console.error(e);_showSyncToast('⚠️ Modification non sauvegardée');}
  }
  _cachePut({users});
  mbrSelected.clear();rComUsers();
}
async function comTogAll(v){
  if(!confirm(v?'Autoriser TOUS les membres à proposer des livres ?':"Retirer l'autorisation à TOUS les membres ?"))return;
  for(const u of users){
    u.canPropose=v;
    try{await sbUpd('users',u.id,{canPropose:v});}catch(e){console.error(e.message);_showSyncToast('⚠️ Modification non sauvegardée');}
  }
  _cachePut({users});
  rComUsers();
}
async function comTogP(id,v){
  const u=users.find(x=>x.id==id);if(!u)return;
  u.canPropose=v;
  rComUsers();
  try{await sbUpd('users',id,{canPropose:v});_cachePut({users});}catch(e){console.error(e);_showSyncToast('⚠️ Modification non sauvegardée');}
}
async function comSetUntil(id,v){
  const u=users.find(x=>x.id==id);if(!u)return;
  u.propUntil=v||null;
  try{await sbUpd('users',id,{propUntil:v||null});_cachePut({users});}catch(e){console.error(e.message);_showSyncToast('⚠️ Modification non sauvegardée');}
}

/* ═══════════════════════════════════════════════════════════════
   STATISTIQUES
═══════════════════════════════════════════════════════════════ */
function showStat(){
  if(!curUser||(curUser.role!=='admin'&&curUser.role!=='commission'))return;
  sv('vstat');sChip('a4','n4');bNav('nl4','vstat');
  document.getElementById('stat-content').innerHTML=buildStats();
}
function rAdmStat(){
  const el=document.getElementById('adm-stat-content');if(!el)return;
  el.innerHTML=buildStats();
}
function buildStats(){
  const totalBks=books.length,availBks=books.filter(b=>b.status!=='retired').length,retiredBks=books.filter(b=>b.status==='retired').length;
  const now30=Date.now();
  const addedThisMonth=books.filter(b=>{if(!b.addedAt)return false;const d=new Date(b.addedAt);return d.getMonth()===new Date().getMonth()&&d.getFullYear()===new Date().getFullYear();}).length;
  const featuredBks=books.filter(b=>b.featured).length;
  const activeLoansBks=books.filter(b=>b.status==='borrowed').length;
  const totalReqs=requests.length,appReqs=requests.filter(r=>r.status==='approved').length,penReqs=requests.filter(r=>r.status==='pending').length;
  const actUsers=users.filter(u=>!u.disabled).length,totalLogins=loginLog.length;
  const today2=new Date().toISOString().split('T')[0];
  const activeLoans=loans.filter(l=>l.status==='active').length;
  const lateLoans=loans.filter(l=>l.status==='active'&&l.dueDate&&l.dueDate<today2).length;
  const thisMonth=new Date().toISOString().substring(0,7);
  const returnedThisMonth=loans.filter(l=>l.status==='returned'&&l.returnedAt&&l.returnedAt.substring(0,7)===thisMonth).length;
  const catMap={};books.forEach(b=>{catMap[b.cat]=(catMap[b.cat]||0)+1;});
  const catS=Object.entries(catMap).sort((a,b)=>b[1]-a[1]).slice(0,8),maxC=catS[0]?.[1]||1;
  const reqMap={};requests.forEach(r=>{reqMap[r.dem]=(reqMap[r.dem]||0)+1;});
  const topReq=Object.entries(reqMap).sort((a,b)=>b[1]-a[1]).slice(0,5).map(([id,cnt])=>{const u=users.find(x=>x.id==parseInt(id));return{name:u?u.prenom+' '+u.nom:'—',cnt};});
  const maxR=topReq[0]?.cnt||1;
  const logMap={};loginLog.forEach(l=>{logMap[l.name]=(logMap[l.name]||0)+1;});
  const topLog=Object.entries(logMap).sort((a,b)=>b[1]-a[1]).slice(0,5),maxL=topLog[0]?.[1]||1;
  const devMap={};loginLog.forEach(l=>{const d=l.device.replace(/[📱💻❓]/g,'').trim();devMap[d]=(devMap[d]||0)+1;});
  const devS=Object.entries(devMap).sort((a,b)=>b[1]-a[1]);
  return html`<div class="stg" style="grid-template-columns:repeat(auto-fill,minmax(150px,1fr));margin-bottom:28px">
    <div class="stc stT"><div class="sv" style="color:var(--navy)">${totalBks}</div><div class="sl">Livres total</div></div>
    <div class="stc stA"><div class="sv" style="color:var(--green)">${availBks}</div><div class="sl">Disponibles</div></div>
    <div class="stc" style="border-color:var(--g400)"><div class="sv" style="color:var(--g500)">${retiredBks}</div><div class="sl">Retirés</div></div>
    <div class="stc" style="border-color:#f59e0b"><div class="sv" style="color:#d97706">${addedThisMonth}</div><div class="sl">🆕 Ajouts ce mois</div></div>
    <div class="stc" style="border-color:#f59e0b"><div class="sv" style="color:#d97706">${featuredBks}</div><div class="sl">⭐ Mis en avant</div></div>
    <div class="stc" style="border-color:#7c3aed"><div class="sv" style="color:#7c3aed">${activeLoansBks}</div><div class="sl">📖 Empruntés</div></div>
    <div class="stc" style="border-color:#7c3aed"><div class="sv" style="color:#7c3aed">${activeLoans}</div><div class="sl">📖 Emprunts actifs</div></div>
    <div class="stc" style="border-color:#dc2626"><div class="sv" style="color:#dc2626">${lateLoans}</div><div class="sl">⚠️ En retard</div></div>
    <div class="stc" style="border-color:#16a34a"><div class="sv" style="color:#16a34a">${returnedThisMonth}</div><div class="sl">✅ Retournés ce mois</div></div>
    <div class="stc stP"><div class="sv" style="color:#b45309">${penReqs}</div><div class="sl">Demandes en attente</div></div>
    <div class="stc stA"><div class="sv" style="color:var(--green)">${appReqs}</div><div class="sl">Demandes approuvées</div></div>
    <div class="stc stT"><div class="sv" style="color:var(--navy)">${actUsers}</div><div class="sl">Membres actifs</div></div>
    <div class="stc stS"><div class="sv" style="color:var(--res)">${totalLogins}</div><div class="sl">Connexions</div></div>
    <div class="stc" style="border-color:#9333ea"><div class="sv" style="color:#9333ea">${sessions.length}</div><div class="sl">Sessions</div></div>
  </div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:24px">
    <div><h3 style="font-size:18px;color:var(--navy);margin-bottom:12px">📂 Livres par catégorie</h3>
      <div class="stat-bar-wrap">${safe(catS.map(([cat,cnt])=>html`<div class="stat-bar-row">
        <div class="stat-bar-lbl" title="${cat}">${cat}</div>
        <div class="stat-bar"><div class="stat-bar-fill" style="width:${Math.round(cnt/maxC*100)}%"></div></div>
        <div class="stat-bar-val">${cnt}</div></div>`).join(''))}</div></div>
    <div><h3 style="font-size:18px;color:var(--navy);margin-bottom:12px">👥 Top demandeurs</h3>
      <div class="stat-bar-wrap">${safe(!topReq.length?'<p style="color:var(--g400)">Aucune demande.</p>':topReq.map(x=>html`<div class="stat-bar-row">
        <div class="stat-bar-lbl">${x.name}</div>
        <div class="stat-bar"><div class="stat-bar-fill" style="width:${Math.round(x.cnt/maxR*100)}%;background:linear-gradient(90deg,var(--navy),var(--nl))"></div></div>
        <div class="stat-bar-val">${x.cnt}</div></div>`).join(''))}</div></div>
    <div><h3 style="font-size:18px;color:var(--navy);margin-bottom:12px">🔐 Connexions par utilisateur</h3>
      <div class="stat-bar-wrap">${safe(!topLog.length?'<p style="color:var(--g400)">Aucune connexion.</p>':topLog.map(([name,cnt])=>html`<div class="stat-bar-row">
        <div class="stat-bar-lbl">${name}</div>
        <div class="stat-bar"><div class="stat-bar-fill" style="width:${Math.round(cnt/maxL*100)}%;background:linear-gradient(90deg,var(--res),#0891b2)"></div></div>
        <div class="stat-bar-val">${cnt}</div></div>`).join(''))}</div></div>
    <div><h3 style="font-size:18px;color:var(--navy);margin-bottom:12px">📱 Appareils</h3>
      <div class="stat-bar-wrap">${safe(!devS.length?'<p style="color:var(--g400)">Aucune connexion.</p>':devS.map(([dev,cnt])=>{const mx=devS[0][1];return html`<div class="stat-bar-row">
        <div class="stat-bar-lbl">${dev}</div>
        <div class="stat-bar"><div class="stat-bar-fill" style="width:${Math.round(cnt/mx*100)}%;background:linear-gradient(90deg,#7c3aed,var(--enrol))"></div></div>
        <div class="stat-bar-val">${cnt}</div></div>`;}).join(''))}</div></div>
  </div>`;
}

/* ═══════════════════════════════════════════════════════════════
   EXPORT PDF
═══════════════════════════════════════════════════════════════ */
const PDF_COLS={num:{lbl:'#',fn:(r,i,u)=>i+1},titre:{lbl:'Titre',fn:(r)=>r.titre},auteur:{lbl:'Auteur',fn:(r)=>r.auteur||'—'},desc:{lbl:'Description / Lien',fn:(r)=>r.desc||'—'},demandeur:{lbl:'Demandeur',fn:(r,i,u)=>u?u.prenom+' '+u.nom:'—'},role:{lbl:'Rôle',fn:(r,i,u)=>u?u.role:'—'},note:{lbl:'Commentaire',fn:(r)=>r.note||'—'}};
function openPdfConfig(){
  const fields=cfg.pdfFields||['num','titre','auteur','desc','demandeur'];
  const pdfHtml=Object.entries(PDF_COLS).map(([k,v])=>html`<label style="display:flex;align-items:center;gap:10px;padding:10px 14px;background:var(--g50);border-radius:8px;border:1px solid var(--g200);cursor:pointer;margin-bottom:8px">
    <input type="checkbox" value="${k}" ${fields.includes(k)?'checked':''} style="width:16px;height:16px"/>
    <span style="font-size:14px;font-weight:500">${v.lbl}</span></label>`).join('');
  const modal=document.createElement('div');
  modal.id='pdf-cfg-modal';
  modal.style.cssText='position:fixed;inset:0;background:rgba(10,24,40,.72);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px;backdrop-filter:blur(5px)';
  modal.innerHTML=html`<div style="background:white;border-radius:20px;width:100%;max-width:420px;box-shadow:0 14px 44px rgba(28,67,112,.18);overflow:hidden">
    <div style="padding:20px 24px 16px;border-bottom:1px solid #f0f4f7;display:flex;align-items:center;justify-content:space-between">
      <h3 style="font-family:'Cormorant Garamond',serif;font-size:22px;color:#1C4370">⚙️ Colonnes du PDF</h3>
      <button onclick="document.getElementById('pdf-cfg-modal').remove()" style="background:#f0f4f7;border:none;width:32px;height:32px;border-radius:8px;cursor:pointer;font-size:16px">✕</button>
    </div>
    <div style="padding:20px 24px">${safe(pdfHtml)}</div>
    <div style="padding:14px 24px 20px;display:flex;gap:10px;justify-content:flex-end">
      <button onclick="document.getElementById('pdf-cfg-modal').remove()" style="background:#f1f5f9;border:none;padding:10px 18px;border-radius:8px;cursor:pointer;font-family:inherit;font-size:14px">Annuler</button>
      <button onclick="savePdfConfig(this)" style="background:#1C4370;color:white;border:none;padding:10px 18px;border-radius:8px;cursor:pointer;font-family:inherit;font-size:14px;font-weight:600">💾 Sauvegarder</button>
    </div>
  </div>`;
  document.body.appendChild(modal);
}
async function savePdfConfig(btn){
  const modal=document.getElementById('pdf-cfg-modal');
  if(!modal){alert('Erreur : modal introuvable.');return;}
  const checked=[...modal.querySelectorAll('input[type=checkbox]:checked')].map(x=>x.value);
  if(!checked.length){alert('Sélectionnez au moins une colonne.');return;}
  const oldFields=cfg.pdfFields;
  cfg.pdfFields=checked;
  modal.remove();
  try{await sbSaveCfg();_cachePut({config:cfg});}
  catch(e){cfg.pdfFields=oldFields;console.error('[sbSaveCfg]',e.message);_showSyncToast('⚠️ Config non sauvegardée');}
}
function exportPDF(){
  const approved=requests.filter(r=>r.status==='approved');
  if(!approved.length){alert('Aucune demande approuvée.');return;}
  try{
    const {jsPDF}=window.jspdf;
    const doc=new jsPDF({orientation:'portrait',unit:'mm',format:'a4'});
    const fields=cfg.pdfFields||['num','titre','auteur','desc','demandeur'];
    const cols=fields.map(k=>PDF_COLS[k]).filter(Boolean);
    const now=new Date().toLocaleDateString('fr-FR',{day:'2-digit',month:'long',year:'numeric'});
    const spaceName=(cfg.name||'Bibliothèque du Centre Culturel Comoé').substring(0,55);
    const HEADER_H=32; /* hauteur totale de la bande d'en-tête en mm */
    const LOGO_SIZE=22; /* taille du logo en mm */
    const LOGO_MARGIN=5;
    const hasLogo=!!cfg.logoB64;

    /* ── Bande d'en-tête ────────────────────────────────────── */
    doc.setFillColor(28,67,112);
    doc.rect(0,0,210,HEADER_H,'F');

    /* ── Logo (si disponible) : coin gauche centré verticalement ── */
    if(hasLogo){
      try{
        /* Détecter le format depuis le data-URL */
        let fmt='PNG';
        if(cfg.logoB64.includes('image/jpeg')||cfg.logoB64.includes('image/jpg'))fmt='JPEG';
        else if(cfg.logoB64.includes('image/webp'))fmt='WEBP';
        const logoY=(HEADER_H-LOGO_SIZE)/2;
        doc.addImage(cfg.logoB64,fmt,LOGO_MARGIN,logoY,LOGO_SIZE,LOGO_SIZE);
      }catch(e){
        /* Logo corrompu → dessiner un carré blanc en placeholder */
        doc.setFillColor(255,255,255);
        doc.setGState && doc.setGState(new doc.GState({opacity:0.2}));
        doc.roundedRect(LOGO_MARGIN,(HEADER_H-LOGO_SIZE)/2,LOGO_SIZE,LOGO_SIZE,3,3,'F');
        doc.setGState && doc.setGState(new doc.GState({opacity:1}));
        console.warn('[PDF] Logo non chargé :',e.message);
      }
    }

    /* ── Textes de l'en-tête ────────────────────────────────── */
    const textX=hasLogo?LOGO_MARGIN+LOGO_SIZE+4:14; /* décaler à droite si logo */
    doc.setTextColor(255,255,255);
    doc.setFontSize(14);doc.setFont('helvetica','bold');
    doc.text(spaceName,textX,12);
    doc.setFontSize(8.5);doc.setFont('helvetica','normal');
    doc.text('Demandes de livres approuvées · '+now,textX,20);
    doc.setFontSize(8);doc.setTextColor(180,210,240);
    doc.text(approved.length+' ouvrage(s) sélectionné(s)',textX,26.5);
    doc.setTextColor(40,40,40);

    /* ── Tableau ────────────────────────────────────────────── */
    const headers=[cols.map(c=>c.lbl)];
    const rows=approved.map((r,i)=>{const u=users.find(x=>x.id==r.dem);return cols.map(c=>String(c.fn(r,i,u)||'—').replace(/<[^>]*>/g,''));});
    doc.autoTable({
      head:headers,
      body:rows,
      startY:HEADER_H+2,
      styles:{fontSize:9,cellPadding:3,overflow:'linebreak'},
      headStyles:{fillColor:[28,67,112],textColor:255,fontStyle:'bold',fontSize:9},
      alternateRowStyles:{fillColor:[248,250,251]},
      margin:{left:14,right:14},
      didDrawPage:(data)=>{
        /* Pied de page */
        doc.setFontSize(8);doc.setTextColor(148,163,184);
        const pgY=doc.internal.pageSize.height-8;
        doc.text('ComoéBiblio',14,pgY);
        doc.text(approved.length+' demande(s) approuvée(s)',105,pgY,{align:'center'});
        doc.text('Page '+data.pageNumber,196,pgY,{align:'right'});
      }
    });

    /* ── Ouvrir dans un nouvel onglet ───────────────────────── */
    const blob=doc.output('blob');
    const url=URL.createObjectURL(blob);
    window.open(url,'_blank');
    setTimeout(()=>URL.revokeObjectURL(url),10000);
  }catch(e){alert('Erreur PDF : '+e.message);console.error(e);}
}

/* ═══════════════════════════════════════════════════════════════
   GESTION DU CATALOGUE (Enrôlement)
═══════════════════════════════════════════════════════════════ */
let caSort={col:'titre',dir:1};
let caFilter='';
function showCA(){
  if(!curUser||!(curUser.role==='enrol'||curUser.role==='admin'))return;
  caFilter='';caSort={col:'titre',dir:1};caPage=1;
  ['ca-search','ca-f-cat','ca-f-sal','ca-f-plc','ca-f-et','ca-f-lng','ca-f-yr','ca-f-st'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
  sv('vca');sChip('a1','n1');bNav('nl1','vca');rCABk();
  /* Section "Mes étagères" dans la vue enrôleur */
  const _shelfSecCA=document.getElementById('shelf-mgr-section');
  if(_shelfSecCA){
    const _isSMCA=curUser&&(curUser.role==='enrol'||(curUser.tabs||[]).includes('shelf_mgr'));
    _shelfSecCA.style.display=_isSMCA?'block':'none';
    if(_isSMCA)rShelfMgrView();
  }
}
function caSetSort(col){
  if(caSort.col===col)caSort.dir*=-1;else{caSort.col=col;caSort.dir=1;}
  caPage=1;rCABk(1);
}
function populateCASelects(){
  const sel=(id,vals)=>{const el=document.getElementById(id);if(!el)return;const cur=el.value;el.innerHTML='<option value="">'+el.options[0].text+'</option>'+[...new Set(vals.filter(Boolean))].sort().map(v=>html`<option value="${v}">${v}</option>`).join('');el.value=cur;};
  sel('ca-f-cat',books.map(b=>b.cat));
  sel('ca-f-sal',books.map(b=>b.salle));
  sel('ca-f-plc',books.map(b=>b.placard));
  sel('ca-f-et', books.map(b=>b.etagere));
  sel('ca-f-lng',books.map(b=>b.lang));
  sel('ca-f-yr', books.map(b=>b.annee).filter(Boolean).sort((a,b_)=>b_-a).map(String));
}
function resetCAFilters(){
  ['ca-search','ca-f-cat','ca-f-sal','ca-f-plc','ca-f-et','ca-f-lng','ca-f-yr','ca-f-st'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
  caFilter='';caNewOnly=false;caPage=1;
  const btnNew=document.getElementById('btn-new-only');
  if(btnNew){btnNew.classList.remove('bn');btnNew.classList.add('bo');}
  rCABk(1);
}
let caNewOnly=false;
function caGetFiltered(){
  let list=[...books];
  const now=Date.now();
  if(caFilter){const q=caFilter.toLowerCase();
    list=list.filter(b=>[b.titre,b.auteur,b.cat,b.salle,b.placard,b.etagere,b.lang,b.editeur,b.etat,b.ancienNouv,String(b.annee||''),String(b.expl||''),b.resume].some(v=>String(v||'').toLowerCase().includes(q)));}
  if(caNewOnly)list=list.filter(b=>b.addedAt&&(now-new Date(b.addedAt).getTime())<30*86400*1000);
  const fCat=(document.getElementById('ca-f-cat')?.value||'');
  const fSal=(document.getElementById('ca-f-sal')?.value||'');
  const fPlc=(document.getElementById('ca-f-plc')?.value||'');
  const fEt =(document.getElementById('ca-f-et')?.value||'');
  const fLng=(document.getElementById('ca-f-lng')?.value||'');
  const fYr =(document.getElementById('ca-f-yr')?.value||'');
  const fSt =(document.getElementById('ca-f-st')?.value||'');
  if(fCat)list=list.filter(b=>b.cat===fCat);
  if(fSal)list=list.filter(b=>b.salle===fSal);
  if(fPlc)list=list.filter(b=>b.placard===fPlc);
  if(fEt) list=list.filter(b=>b.etagere===fEt);
  if(fLng)list=list.filter(b=>b.lang===fLng);
  if(fYr) list=list.filter(b=>String(b.annee||'')===fYr);
  if(fSt) list=list.filter(b=>b.status===fSt);
  /* ⭐ Featured en premier, puis tri normal */
  list.sort((a,b)=>{
    if(b.featured&&!a.featured)return 1;
    if(a.featured&&!b.featured)return-1;
    let va=String(a[caSort.col]||'').toLowerCase(),vb=String(b[caSort.col]||'').toLowerCase();
    if(caSort.col==='annee'||caSort.col==='expl'){va=Number(a[caSort.col])||0;vb=Number(b[caSort.col])||0;}
    return va<vb?-caSort.dir:va>vb?caSort.dir:0;
  });
  return list;
}
let caPage=1;
const CA_PER=10;
function rCABk(page=caPage){
  caPage=page;
  populateCASelects();
  const list=caGetFiltered();
  document.getElementById('cac').textContent=books.length;
  const tb=document.getElementById('catb');
  const s=c=>caSort.col===c?(caSort.dir===1?' ↑':' ↓'):'';
  document.getElementById('ca-th').innerHTML=html`
    <th onclick="caSetSort('titre')" style="cursor:pointer">Titre${s('titre')}</th>
    <th onclick="caSetSort('auteur')" style="cursor:pointer">Auteur${s('auteur')}</th>
    <th onclick="caSetSort('cat')" style="cursor:pointer">Catégorie${s('cat')}</th>
    <th onclick="caSetSort('salle')" style="cursor:pointer">Localisation${s('salle')}</th>
    <th onclick="caSetSort('lang')" style="cursor:pointer">Langue${s('lang')}</th>
    <th onclick="caSetSort('annee')" style="cursor:pointer">Année${s('annee')}</th>
    <th onclick="caSetSort('status')" style="cursor:pointer">Statut${s('status')}</th>
    <th>Actions</th>`;
  if(!list.length){tb.innerHTML=`<tr><td colspan="8" style="text-align:center;padding:36px;color:var(--g400)">Aucun résultat</td></tr>`;
    renderPagination('ca-pgn',1,0,CA_PER,p=>rCABk(p));rCAStat(list);return;}
  const slice=list.slice((page-1)*CA_PER,page*CA_PER);
  tb.innerHTML=bkRows('ca',slice);
  renderPagination('ca-pgn',page,list.length,CA_PER,p=>rCABk(p));
  const ca_cnt=document.getElementById('ca-count');if(ca_cnt)ca_cnt.textContent=list.length+(list.length<books.length?' résultat(s) filtré(s)':' livre(s) au total');
  rCAStat(list);
}
function rCAStat(list){
  const el=document.getElementById('ca-stats');if(!el)return;
  const total=list.length,avail=list.filter(b=>b.status!=='retired').length,retired=list.filter(b=>b.status==='retired').length;
  const cats={};list.forEach(b=>{cats[b.cat]=(cats[b.cat]||0)+1;});
  const topCat=Object.entries(cats).sort((a,b)=>b[1]-a[1]).slice(0,3).map(([c,n])=>html`<span class="badge" style="background:${cb(c)};color:${cf(c)}">${c} (${n})</span>`).join(' ');
  el.innerHTML=html`<div style="display:flex;gap:18px;flex-wrap:wrap;align-items:center;font-size:13px;color:var(--g600)">
    <span>📚 <strong>${total}</strong> livre(s)</span>
    <span style="color:var(--gd)">✅ <strong>${avail}</strong> disponible(s)</span>
    ${safe(retired?`<span style="color:var(--g400)">📦 <strong>${retired}</strong> retiré(s)</span>`:'')}
    ${safe(topCat?`<span>Catégories : ${topCat}</span>`:'')}
  </div>`;
}
function bkRows(src,list=null){
  const now=Date.now();
  return (list||books).map(b=>{
    const recentMod=b.updatedAt&&(now-new Date(b.updatedAt).getTime())<7*86400*1000;
    const isNew=b.addedAt&&(now-new Date(b.addedAt).getTime())<30*86400*1000;
    const modBadge=recentMod?'<span style="background:#fef9c3;color:#92400e;font-size:10px;padding:1px 5px;border-radius:4px;font-weight:600;margin-left:4px">✏️</span>':'';
    const newBadge=isNew?'<span style="background:#d1fae5;color:#065f46;font-size:10px;padding:1px 5px;border-radius:4px;font-weight:600;margin-left:4px">🆕</span>':'';
    const featBadge=b.featured?'<span style="font-size:12px;margin-left:3px">⭐</span>':'';
    const activeForBook=loans.filter(l=>l.bookId==b.id&&(l.status==='active'||l.status==='pending_return')).length;
    const copies=parseInt(b.expl)||parseInt(b.exemplaires)||1;
    const availCopies=Math.max(0,copies-activeForBook);
    const copiesBadge=src==='adm'?`<td style="text-align:center;font-size:13px;font-weight:600;color:${availCopies===0?'#dc2626':availCopies===1?'#d97706':'#065f46'}">${availCopies}/${copies}</td>`:'';
    const borrowed=b.status==='borrowed'||availCopies===0;
    const statusBadge=b.status==='retired'?'<span class="badge bret">📦 Retiré</span>':b.status==='missing'?'<span class="badge" style="background:#fff7ed;color:#c2410c;border:1px solid #fed7aa">⚠️ Introuvable</span>':borrowed?`<span class="badge" style="background:#ede9fe;color:#7c3aed">📖 Emprunté</span>`:'<span class="badge bavl">✅ Disponible</span>';
    return html`<tr>
    <td style="font-weight:600;max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${b.titre}${safe(modBadge)}${safe(newBadge)}${safe(featBadge)}</td>
    <td style="max-width:130px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${b.auteur||'—'}</td>
    <td>${safe((()=>{const ct=b.catType||'academique';const def=_getCatTypes().find(t=>t.id===ct);return`<span class="badge" style="background:${cb(b.cat)};color:${cf(b.cat)}">${esc(b.cat)}</span><br><span style="font-size:10px;color:var(--g400)">${def?def.emoji:'📚'} ${def&&ct!=='academique'?esc(def.label):''}</span>`;})())}</td>
    <td style="white-space:nowrap;color:var(--g600);font-size:12px">${[b.salle,b.placard,b.etagere].filter(Boolean).join(' · ')||'—'}</td>
    <td>${b.lang||'—'}</td><td>${b.annee||'—'}</td>
    ${safe(copiesBadge)}
    <td>${safe(statusBadge)}</td>
    <td><div style="display:flex;gap:6px;flex-wrap:wrap">
      <button type="button" class="btn bo btn-xs" onclick="openBkM('${src}',${b.id})" title="Modifier">✏️</button>
      <button type="button" class="btn ${b.status==='retired'?'bg':'bwarn'} btn-xs" onclick="togBkStatus(${b.id},'${src}')" title="${b.status==='retired'?'Remettre au catalogue':b.status==='missing'?'Marquer retrouvé':'Retirer du catalogue'}">${b.status==='retired'?'✅':b.status==='missing'?'✅':'📦'}</button>
      ${safe(b.status!=='borrowed'&&b.status!=='retired'?`<button type="button" class="btn btn-xs" onclick="reportMissing(${b.id})" style="border:1px solid ${b.status==='missing'?'#16a34a':'#f97316'};color:${b.status==='missing'?'#16a34a':'#ea580c'}" title="${b.status==='missing'?'Marquer retrouvé':'Signaler introuvable'}">${b.status==='missing'?'Retrouvé ✅':'⚠️'}</button>`:'')}
      ${safe(src==='adm'?`<button type="button" class="btn bd btn-xs" onclick="delBk(${b.id})" title="Supprimer définitivement">🗑️</button>`:'')}

    </div></td>
  </tr>`;
  }).join('');
}
/* ── Pagination générique ──
   Params:
     containerId : id de la <div> qui reçoit les boutons
     page        : page courante (1-based)
     total       : nombre total d'items
     perPage     : items par page
     onPage      : callback(newPage)
*/
function renderPagination(containerId,page,total,perPage,onPage){
  const el=document.getElementById(containerId);if(!el)return;
  const pages=Math.ceil(total/perPage)||1;
  if(pages<=1){el.innerHTML='';return;}
  let btns='';
  btns+=`<button class="pgn-btn" ${page===1?'disabled':''} onclick="(${onPage.toString()})(1)">«</button>`;
  btns+=`<button class="pgn-btn" ${page===1?'disabled':''} onclick="(${onPage.toString()})(${page-1})">‹</button>`;
  /* pages proches */
  for(let p=Math.max(1,page-2);p<=Math.min(pages,page+2);p++){
    btns+=`<button type="button" class="pgn-btn ${p===page?'active':''}" onclick="(${onPage.toString()})(${p})">${p}</button>`;
  }
  btns+=`<button class="pgn-btn" ${page===pages?'disabled':''} onclick="(${onPage.toString()})(${page+1})">›</button>`;
  btns+=`<button class="pgn-btn" ${page===pages?'disabled':''} onclick="(${onPage.toString()})(${pages})">»</button>`;
  btns+=`<span class="pgn-info">${(page-1)*perPage+1}–${Math.min(page*perPage,total)} / ${total}</span>`;
  el.innerHTML=btns;
}
async function delBk(id){
  if(!_requireAdmin('delBk'))return;
  const b=books.find(x=>x.id==id);if(!b)return;
  if(!confirm(`Supprimer définitivement "${b.titre}" ?
Cette action est irréversible.`))return;
  try{
    await sbDel('books',id);
    const idx=books.findIndex(x=>x.id==id);if(idx!==-1)books.splice(idx,1);
    _cachePut({books});
    rAdmBk();rCat();
  }catch(e){console.error('[delBk]',e.message);alert('❌ Erreur suppression livre : '+e.message);}
}
async function togBkStatus(id,src){
  if(!_requireAdmin('togBkStatus'))return;
  const b=books.find(x=>x.id==id);if(!b)return;
  if(b.status==='missing'){
    if(!confirm(`Marquer "${b.titre}" comme retrouvé et le remettre disponible ?`))return;
    const prevSt=b.status;
    b.status='available';b.missingAt=null;b.missingNote=null;
    try{await sbUpd('books',id,{status:'available',lastModifiedBy:curUser?.prenom+' '+curUser?.nom,lastModifiedAt:new Date().toISOString(),lastModifiedRole:curUser?.role||'?'});}catch(e){console.error(e.message);_showSyncToast('⚠️ Statut non sauvegardé');}
    _cachePut({books});
    _logBookChange(id,b.titre,{status:{from:prevSt,to:'available'}});
  }else{
    const nxt=b.status==='retired'?'available':'retired';
    if(nxt==='retired'&&!confirm(`Retirer "${b.titre}" du catalogue ?`))return;
    const prevSt2=b.status;b.status=nxt;
    try{await sbUpd('books',id,{status:nxt,lastModifiedBy:curUser?.prenom+' '+curUser?.nom,lastModifiedAt:new Date().toISOString(),lastModifiedRole:curUser?.role||'?'});}catch(e){console.error(e.message);_showSyncToast('⚠️ Statut non sauvegardé');}
    _cachePut({books});
    _logBookChange(id,b.titre,{status:{from:prevSt2,to:nxt}});
  }
  if(src==='ca')rCABk();else rAdmBk();rCat();
}

async function reportMissing(id){
  const b=books.find(x=>x.id==id);if(!b)return;
  if(b.status==='borrowed'){alert('⚠️ Ce livre est actuellement emprunté — son absence est normale.');return;}
  if(b.status==='missing'){
    if(!confirm(`"${b.titre}" est déjà signalé introuvable.\nCliquez OK pour le marquer comme retrouvé.`))return;
    b.status='available';b.missingAt=null;b.missingNote=null;
    try{await sbUpd('books',id,{status:'available'});}catch(e){console.error(e.message);_showSyncToast('⚠️ Statut non sauvegardé');}
    _cachePut({books});
    cM('mdet');rCat();rAdmBk();_showSyncToast('✅ Livre retrouvé — remis disponible');return;
  }
  const note=prompt(`Signaler "${b.titre}" comme introuvable à son emplacement.\n\nNote optionnelle (ex : vérifié le ${new Date().toLocaleDateString('fr-FR')}, absent de l'étagère) :`,'');
  if(note===null)return;
  const now=new Date().toISOString();
  b.status='missing';b.missingAt=now;b.missingNote=note||'';
  try{await sbUpd('books',id,{status:'missing',lastModifiedBy:curUser?.prenom+' '+curUser?.nom,lastModifiedAt:now,lastModifiedRole:curUser?.role||'?'});}catch(e){console.error(e.message);_showSyncToast('⚠️ Statut non sauvegardé');}
  _cachePut({books});
  _logBookChange(id,b.titre,{status:{from:'available',to:'missing'},note:note||''});
  cM('mdet');rCat();rAdmBk();_showSyncToast('⚠️ Livre signalé introuvable');
}

/* ═══════════════════════════════════════════════════════════════
   ADMIN — LIVRES
═══════════════════════════════════════════════════════════════ */
let admBkFilter='',admBkPage=1,admBkNewOnly=false,admBkFeatOnly=false;
const ADM_BK_PER=10;
function populateAdmSelects(){
  const sel=(id,vals)=>{const el=document.getElementById(id);if(!el)return;const cur=el.value;el.innerHTML='<option value="">'+el.options[0].text+'</option>'+[...new Set(vals.filter(Boolean))].sort().map(v=>html`<option value="${v}">${v}</option>`).join('');el.value=cur;};
  sel('adm-f-cat',books.map(b=>b.cat));
  sel('adm-f-sal',books.map(b=>b.salle));
  sel('adm-f-lng',books.map(b=>b.lang));
  sel('adm-f-yr',books.map(b=>b.annee).filter(Boolean).sort((a,b_)=>b_-a).map(String));
  sel('adm-f-plc',books.map(b=>b.placard));
  sel('adm-f-et',books.map(b=>b.etagere));
}
function resetAdmFilters(){
  ['adm-bk-search','adm-f-cat','adm-f-sal','adm-f-lng','adm-f-yr','adm-f-plc','adm-f-et','adm-f-st','adm-f-expl'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
  admBkFilter='';admBkNewOnly=false;admBkFeatOnly=false;admBkPage=1;
  ['adm-btn-new','adm-btn-feat'].forEach(id=>{const el=document.getElementById(id);if(el){el.classList.remove('bn');el.classList.add('bo');}});
  rAdmBk(1);
}
function rAdmBk(page=admBkPage){
  admBkPage=page;
  populateAdmSelects();
  document.getElementById('abc').textContent=books.length;
  const tb=document.getElementById('abtb');
  const fCat=(document.getElementById('adm-f-cat')?.value||'');
  const fSal=(document.getElementById('adm-f-sal')?.value||'');
  const fLng=(document.getElementById('adm-f-lng')?.value||'');
  const fYr =(document.getElementById('adm-f-yr')?.value||'');
  const fSt =(document.getElementById('adm-f-st')?.value||'');
  const fPlc=(document.getElementById('adm-f-plc')?.value||'');
  const fEt =(document.getElementById('adm-f-et')?.value||'');
  const fExpl=(document.getElementById('adm-f-expl')?.value||'');
  const _now=Date.now();
  let list=[...books];
  /* Trier : featured en tête, puis récents */
  list.sort((a,b2)=>{
    const fa=a.featured?2:0,fb2=b2.featured?2:0;
    const na=a.addedAt&&(_now-new Date(a.addedAt).getTime())<30*86400*1000?1:0;
    const nb2=b2.addedAt&&(_now-new Date(b2.addedAt).getTime())<30*86400*1000?1:0;
    return(fb2+nb2)-(fa+na);
  });
  if(admBkFilter){const q=admBkFilter.toLowerCase();list=list.filter(b=>[b.titre,b.auteur,b.cat,b.salle,b.placard,b.etagere,b.lang,b.editeur,b.etat,b.ancienNouv,String(b.annee||''),String(b.expl||''),b.resume].some(v=>String(v||'').toLowerCase().includes(q)));}
  if(admBkNewOnly)list=list.filter(b=>b.addedAt&&(_now-new Date(b.addedAt).getTime())<30*86400*1000);
  if(admBkFeatOnly)list=list.filter(b=>b.featured);
  if(fCat)list=list.filter(b=>b.cat===fCat);
  if(fSal)list=list.filter(b=>b.salle===fSal);
  if(fLng)list=list.filter(b=>b.lang===fLng);
  if(fYr) list=list.filter(b=>String(b.annee||'')===fYr);
  if(fPlc)list=list.filter(b=>b.placard===fPlc);
  if(fEt) list=list.filter(b=>b.etagere===fEt);
  if(fSt) list=list.filter(b=>b.status===fSt);
  if(fExpl){
    const n=parseInt(fExpl);
    /* "5+" = 5 ou plus */
    if(fExpl==='5') list=list.filter(b=>(parseInt(b.expl)||parseInt(b.exemplaires)||1)>=5);
    else             list=list.filter(b=>(parseInt(b.expl)||parseInt(b.exemplaires)||1)===n);
  }
  if(!list.length){tb.innerHTML=`<tr><td colspan="8" style="text-align:center;padding:36px;color:var(--g400)">Aucun résultat</td></tr>`;
    renderPagination('adm-bk-pgn',1,0,ADM_BK_PER,p=>rAdmBk(p));return;}
  const slice=list.slice((page-1)*ADM_BK_PER,page*ADM_BK_PER);
  tb.innerHTML=bkRows('adm',slice);
  renderPagination('adm-bk-pgn',page,list.length,ADM_BK_PER,p=>rAdmBk(p));
  const bk_cnt=document.getElementById('adm-bk-count');if(bk_cnt)bk_cnt.textContent=list.length+(list.length<books.length?' résultat(s) filtré(s)':' livre(s) au total');
}
/* ── Langue : basculer entre select et saisie libre ── */
function togLangCustom(val){
  const custom=document.getElementById('bflg-custom');
  if(!custom)return;
  custom.style.display=val==='__autre__'?'block':'none';
  if(val!=='__autre__')custom.value='';
}

/* ── Peupler un datalist depuis les valeurs existantes des livres ── */
function _fillDL(dlId,values){
  const dl=document.getElementById(dlId);if(!dl)return;
  const uniq=[...new Set(values.filter(Boolean).map(v=>String(v).trim()))].sort();
  dl.innerHTML=uniq.map(v=>html`<option value="${v.replace(/"/g,'&quot;')}"></option>`).join('');
}

function openBkM(src,id=null){
  bfSrc=src;bfEid=id;
  /* Pré-remplir featured */
  const featEl=document.getElementById('bffeatured');
  if(featEl){const bk=id?books.find(b=>b.id==id):null;featEl.checked=!!(bk?.featured);}
  document.getElementById('bft').textContent=id?'Modifier le livre':'Ajouter un livre';
  document.getElementById('bfe').textContent='';

  /* ── Peupler les datalists depuis la base ── */
  _fillDL('dl-bfca', books.map(b=>b.cat));
  _fillDL('dl-bfsa', books.map(b=>b.salle));
  _fillDL('dl-bfpl', books.map(b=>b.placard));
  _fillDL('dl-bfet', books.map(b=>b.etagere));
  _populateCatTypeSelect();

  const KNOWN_LANGS=['Français','Anglais','Espagnol','Portugais','Mandarin (Chinois)'];
  const fmap={bftt:'titre',bfau:'auteur',bfca:'cat',bfsa:'salle',bfpl:'placard',bfet:'etagere',bfyr:'annee',bfex:'expl',bfan:'ancienNouv',bfet2:'etat',bfed:'editeur',bfrs:'resume'};
  const ctEl=document.getElementById('bfct');
  const lgEl=document.getElementById('bflg');
  const lgCustomEl=document.getElementById('bflg-custom');
  if(id){
    const b=books.find(x=>x.id==id);
    if(b){
      document.getElementById('bfid').value=b.id;
      for(const[fi,bk]of Object.entries(fmap))document.getElementById(fi).value=b[bk]||'';
      if(ctEl)ctEl.value=b.catType||'academique';
      /* Langue : sélectionner dans la liste ou passer en "Autre" */
      if(lgEl){
        if(KNOWN_LANGS.includes(b.lang)){
          lgEl.value=b.lang;
          if(lgCustomEl){lgCustomEl.style.display='none';lgCustomEl.value='';}
        }else if(b.lang){
          lgEl.value='__autre__';
          if(lgCustomEl){lgCustomEl.style.display='block';lgCustomEl.value=b.lang;}
        }else{
          lgEl.value='';
          if(lgCustomEl){lgCustomEl.style.display='none';lgCustomEl.value='';}
        }
      }
    }
  }else{
    document.getElementById('bfid').value='';
    for(const fi of Object.keys(fmap))document.getElementById(fi).value='';
    if(ctEl)ctEl.value='academique';
    if(lgEl)lgEl.value='';
    if(lgCustomEl){lgCustomEl.style.display='none';lgCustomEl.value='';}
  }
  openM('mbk');
}
async function savBk(){
  const titre=document.getElementById('bftt').value.trim(),auteur=document.getElementById('bfau').value.trim();
  const salle=document.getElementById('bfsa').value.trim(),placard=document.getElementById('bfpl').value.trim(),etagere=document.getElementById('bfet').value.trim();
  if(!titre||!auteur){document.getElementById('bfe').textContent='Titre et auteur obligatoires.';return;}
  if(!salle||!placard||!etagere){document.getElementById('bfe').textContent='Salle, Placard et Étagère sont obligatoires.';return;}
  /* Langue : lire depuis select ou champ libre si "Autre" */
  const lgSel=document.getElementById('bflg');
  const lgCustom=document.getElementById('bflg-custom');
  const lang=lgSel?.value==='__autre__'
    ?(lgCustom?.value.trim()||'')
    :(lgSel?.value||'');
  const featured=document.getElementById('bffeatured')?.checked||false;
  const d={titre,auteur,cat:document.getElementById('bfca').value.trim()||'Général',catType:document.getElementById('bfct')?.value||'academique',lang,
    salle,placard,
    etagere:document.getElementById('bfet').value.trim(),annee:parseInt(document.getElementById('bfyr').value)||null,
    expl:parseInt(document.getElementById('bfex').value)||1,ancienNouv:document.getElementById('bfan').value,
    etat:document.getElementById('bfet2').value,editeur:document.getElementById('bfed').value.trim(),
    resume:document.getElementById('bfrs').value.trim(),emoji:bfEid?(books.find(b=>b.id==bfEid)?.emoji||'📖'):'📖',featured};
  const now=new Date().toISOString();
  const who=curUser?.abbrev||'?';
  if(bfEid){
    const existing=books.find(b=>b.id==bfEid);
    const newVer=(existing?.version||0)+1;
    const changedFields=['titre','auteur','cat','salle','placard','etagere','lang','editeur','etat','featured','expl'].filter(k=>existing&&String(existing[k]||'')!==String(d[k]||''));
    const updFields={...d,updatedAt:now,updatedBy:who,version:newVer,
      lastModifiedBy:curUser?.prenom+' '+curUser?.nom,lastModifiedAt:now,lastModifiedRole:curUser?.role||'?'};
    const i=books.findIndex(b=>b.id==bfEid);
    try{
      await sbUpd('books',bfEid,updFields);
      if(i>=0)books[i]={...books[i],...updFields};
      _cachePut({books});
      if(changedFields.length>0)_logBookChange(bfEid,d.titre,
        Object.fromEntries(changedFields.map(k=>([k,{from:existing?.[k],to:d[k]}]))));
    }catch(e){console.error('[savBk update]',e.message);alert('❌ Erreur mise à jour livre : '+e.message);return;}
  } else {
    const nb={id:_nextBookId(),...d,status:'available',addedAt:now,updatedAt:now,updatedBy:who,version:1,
      lastModifiedBy:curUser?.prenom+' '+curUser?.nom,lastModifiedAt:now,lastModifiedRole:curUser?.role||'?'};
    try{
      await sbSet('books',nb.id,nb);
      await sbSaveCounters();
      if(!books.find(b=>String(b.id)===String(nb.id)))books.push(nb);
      _cachePut({books});
      _logBookChange(nb.id,nb.titre,{action:'ajout'});
    }catch(e){
      nxB--;/* Annuler l'incrément (l'ID sera recalculé au prochain ajout) */
      console.error('[savBk]',e);
      alert('❌ Erreur de sauvegarde du livre : '+e.message+'\n\nLe livre n\'a pas été enregistré. Vérifiez votre connexion et réessayez.');
      return;
    }
  }
  cM('mbk');if(bfSrc==='ca')rCABk();else rAdmBk();
}

/* ═══════════════════════════════════════════════════════════════
   ADMIN — DEMANDES
═══════════════════════════════════════════════════════════════ */
function rAdmRq(){
  const tb=document.getElementById('artb');updPDFBtn();
  const rq_cnt=document.getElementById('adm-rq-count');if(rq_cnt)rq_cnt.textContent=requests.length+' demande(s) au total';
  if(!requests.length){tb.innerHTML=`<tr><td colspan="9" style="text-align:center;padding:36px;color:var(--g400)">Aucune demande</td></tr>`;return;}
  tb.innerHTML=requests.map(r=>{
    const u=users.find(x=>x.id==r.dem);
    const sim=fSimRq(r.titre,r.auteur);
    const simCell=sim.length?sim.map(b=>html`<span onclick="showDet(${b.id})" title="${b.titre}" style="display:inline-block;max-width:90px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;background:#eff6ff;color:#1d4ed8;border-radius:5px;padding:2px 7px;font-size:11px;cursor:pointer;margin:1px;vertical-align:middle">${b.titre.length>20?b.titre.substring(0,20)+'…':b.titre}</span>`).join(' '):'<span style="color:var(--g400)">—</span>';
    return html`<tr><td style="color:var(--g400)">#${r.id}</td>
      <td style="font-weight:600;max-width:130px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${r.titre}</td>
      <td>${r.auteur||'—'}</td><td style="font-size:12px;max-width:100px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${r.desc||'—'}</td>
      <td>${u?u.prenom+' '+u.nom:'—'}</td>
      <td style="max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-style:italic;font-size:12px;color:var(--gd)">${r.motif||'—'}</td>
      <td style="min-width:120px">${safe(simCell)}</td>
      <td>${safe(sBdg(r.status))}</td>
      <td><input class="fi fi-l" value="${r.note||''}" placeholder="Commentaire…" style="padding:6px 10px;font-size:12px;min-width:120px" onchange="updN(${r.id},this.value)"/></td>
      <td><div style="display:flex;align-items:center;gap:6px"><select class="fi fi-l" style="padding:5px 8px;font-size:12px;width:auto" onchange="chgSt(${r.id},this.value,'adm')">
        <option value="pending" ${r.status==='pending'?'selected':''}>⏳ En attente</option>
        <option value="approved" ${r.status==='approved'?'selected':''}>✅ Approuvée</option>
        <option value="rejected" ${r.status==='rejected'?'selected':''}>❌ Rejetée</option>
      </select><button type="button" onclick="delRq(${r.id})" title="Supprimer cette demande" style="background:#fee2e2;color:#dc2626;border:none;border-radius:6px;width:28px;height:28px;cursor:pointer;font-size:13px;flex-shrink:0">🗑️</button></div></td></tr>`;
  }).join('');
}
async function updN(id,v){
  const r=requests.find(x=>x.id==id);if(r)r.note=v;
  try{await sbUpd('requests',id,{note:v});_cachePut({requests});}catch(e){console.error(e.message);_showSyncToast('⚠️ Modification non sauvegardée');}
}

/* ═══════════════════════════════════════════════════════════════
   ADMIN — UTILISATEURS
═══════════════════════════════════════════════════════════════ */
function countAdmins(){return users.filter(u=>u.role==='admin').length;}
let admUsFilter='all';
let _admUsRefreshed=false; /* true après le premier fetch Supabase depuis cette session */
let _admLoginLogLoaded=false; /* true une fois loginLog chargé pour la colonne "Dernière connexion" */
function setAdmUsFilter(f){
  admUsFilter=f;
  ['all','active','expired','disabled'].forEach(k=>{
    const el=document.getElementById('uf-'+k);
    if(el){el.className='btn btn-sm '+(f===k?'bn':'bo');
      if(k==='expired')el.style.cssText=f===k?'':'border-color:#dc2626;color:#dc2626';
      if(k==='disabled')el.style.cssText=f===k?'':'border-color:var(--g500);color:var(--g500)';
    }
  });
  rAdmUs();
}
function rAdmUs(){
  const tb=document.getElementById('utb');if(!tb)return;
  /* Refresh silencieux au premier affichage : rattrape les users créés hors-app (ex: Supabase UI)
     qui ne seraient pas dans le cache localStorage. Après ce fetch, le Realtime prend le relais. */
  if(!_admUsRefreshed&&dataReady){
    _admUsRefreshed=true;
    _fetchAndCache('users',null).then(()=>rAdmUs()).catch(()=>{});
  }
  /* Charger loginLog en arrière-plan si pas encore fait — nécessaire pour la colonne "Dernière connexion" */
  if(!_admLoginLogLoaded&&dataReady){
    _admLoginLogLoaded=true;
    sbGetAll('loginLog').then(logD=>{
      loginLog=logD.sort((a,b)=>(b.id||0)-(a.id||0)).slice(0,300);
      rAdmUs();
    }).catch(()=>{});
  }
  const gO=cfg.openAll&&(!cfg.openUntil||new Date()<=new Date(cfg.openUntil+'T23:59:59'));
  const today3=new Date().toISOString().split('T')[0];
  /* Appliquer le filtre statut */
  const searchQ=(document.getElementById('uf-search')?.value||'').toLowerCase().trim();
  let filteredUsers=[...users];
  /* Les comptes admin/resident/commission sont toujours actifs (neverExpires) */
  if(admUsFilter==='active')filteredUsers=filteredUsers.filter(u=>(u.role==='admin'||u.role==='resident'||u.role==='commission'||u.neverExpires)?!u.disabled:(!u.disabled&&(!u.expiresAt||u.expiresAt>=today3)));
  else if(admUsFilter==='expired')filteredUsers=filteredUsers.filter(u=>u.expiresAt&&u.expiresAt<today3);
  else if(admUsFilter==='disabled')filteredUsers=filteredUsers.filter(u=>u.disabled);
  if(searchQ)filteredUsers=filteredUsers.filter(u=>(u.prenom+' '+u.nom+' '+u.abbrev).toLowerCase().includes(searchQ));
  if(!curUser||curUser.role!=='admin')filteredUsers=filteredUsers.filter(u=>u.role!=='admin');
  const expiringSoon=users.filter(u=>u.expiresAt&&!u.disabled&&Math.ceil((new Date(u.expiresAt)-new Date(today3))/(86400*1000))<=30).length;
  const el_cnt=document.getElementById('adm-us-count');
  if(el_cnt)el_cnt.textContent=filteredUsers.length+(filteredUsers.length<users.length?' / '+users.length:'')+' membre(s)'+(expiringSoon?' \u23F3 '+expiringSoon+' expire(nt) bient\u00F4t':'');
  if(!filteredUsers.length){
    if(!dataReady){tb.innerHTML='<tr><td colspan="7" style="text-align:center;padding:32px;color:var(--g400)">&#9203; Chargement des membres&hellip;</td></tr>';return;}
    /* Chercher si ce membre existe mais est filtré */
    const totalHidden=users.length-filteredUsers.length;
    const filterHint=admUsFilter!=='all'?`<br><button type="button" class="btn bo btn-sm" style="margin-top:8px" onclick="setAdmUsFilter('all')">Afficher tous les ${users.length} comptes</button>`:'';
    tb.innerHTML=html`<tr><td colspan="7" style="text-align:center;padding:32px;color:var(--g400)">Aucun membre pour ce filtre.${filterHint}</td></tr>`;return;
  }
  /* Bandeau d'avertissement si des comptes sont cachés par le filtre */
  const hiddenCount=users.length-filteredUsers.length;
  const hiddenWarnEl=document.getElementById('us-hidden-warn');
  if(hiddenWarnEl){
    if(hiddenCount>0&&admUsFilter!=='all'){
      hiddenWarnEl.style.display='block';
      hiddenWarnEl.innerHTML=html`⚠️ <strong>${hiddenCount} compte(s)</strong> masqué(s) par le filtre "<em>${admUsFilter}</em>". 
        <button type="button" class="btn bo btn-xs" onclick="setAdmUsFilter('all')">Tout afficher</button>
        &nbsp;<span style="font-size:12px;color:var(--g500)">Si vous ne trouvez pas un compte, cliquez sur "Tout afficher".</span>`;
    }else{hiddenWarnEl.style.display='none';}
  }
  tb.innerHTML=filteredUsers.map(u=>{
    try{
    const expired=u.propUntil&&new Date()>new Date(u.propUntil+'T23:59:59');
    const propActive=u.canPropose&&!expired;
    const showCode=(u.role!=='admin')||(curUser&&u.id==curUser.id);
    const lastLogin=loginLog.find(l=>l.userId==u.id||l.abbrev===u.abbrev);
    return html`<tr class="${u.disabled?'user-disabled':''}">
      <td>
        <div style="display:flex;align-items:center;gap:8px">
          ${safe(u.photoB64?`<img src="${esc(u.photoB64)}" style="width:32px;height:32px;border-radius:50%;object-fit:cover;flex-shrink:0;border:2px solid var(--g200)"/>`:`<div style="width:32px;height:32px;border-radius:50%;background:var(--g100);display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;color:var(--g500);flex-shrink:0">${((u.prenom[0]||'')+(u.nom[0]||'')).toUpperCase()}</div>`)}
          ${safe(showCode?html`<code class="pl">${u.abbrev}</code>`:`<span style="color:var(--g400);font-size:12px;font-style:italic">🔒</span>`)}
        </div>
      </td>
      <td style="font-weight:500">${u.prenom} ${u.nom}</td>
      <td>${safe(rBdg(u.role))}</td>
      <td>${safe(u.disabled?'<span class="badge bdis">🚫 Désactivé</span>':'<span class="badge bavl">✅ Actif</span>')}</td>
      <td>
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:5px">
          <label class="tgl"><input type="checkbox" ${u.canPropose?'checked':''} onchange="togP(${u.id},this.checked)"/><span class="ts"></span></label>
          <span style="font-size:12px;color:${propActive?'var(--gd)':gO?'var(--green)':'var(--g400)'}">${propActive?'Oui':'Non'}</span>
        </div>
        <div style="font-size:11px;color:var(--g400)">📅 ${u.propUntil?'Expire le '+u.propUntil:'Permanent'}</div>
        ${safe((()=>{
          if(!u.expiresAt)return'';
          const today=new Date().toISOString().split('T')[0];
          const daysLeft=Math.ceil((new Date(u.expiresAt)-new Date(today))/(86400*1000));
          if(daysLeft<0)return'<div style="font-size:11px;color:#dc2626;margin-top:2px">🔴 Compte expiré le '+u.expiresAt+'</div>';
          if(daysLeft<=30)return'<div style="font-size:11px;color:#d97706;margin-top:2px">⏳ Expire bientôt : '+u.expiresAt+' ('+daysLeft+'j)</div>';
          if(daysLeft<=60)return'<div style="font-size:11px;color:#d97706;margin-top:2px">🟠 Expire le '+u.expiresAt+'</div>';
          return'<div style="font-size:11px;color:#16a34a;margin-top:2px">🟢 Valide jusqu&#39;au '+u.expiresAt+'</div>';
        })())}
      </td>
      <td style="font-size:12px;color:var(--g500);white-space:nowrap">
        ${lastLogin?lastLogin.date+' '+lastLogin.time:'—'}
      </td>
      <td><div style="display:flex;gap:5px;flex-wrap:wrap">
        <button type="button" class="btn bo btn-xs" onclick="openUM(${u.id})">✏️</button>
        <button type="button" class="btn bn btn-xs" onclick="showCard(${u.id})" title="Carte membre">🪪</button>
        ${safe(u.whatsapp?`<button type="button" class="btn btn-xs" style="background:#dcfce7;color:#15803d" onclick="shareAccess(${u.id})" title="Partager les accès via WhatsApp">📤 Partager</button>`:'')}
        <button type="button" class="btn ${u.disabled?'bg':'bwarn'} btn-xs" onclick="togDisable(${u.id})">${u.disabled?'✅ Réactiver':'🚫 Désactiver'}</button>
        ${safe(u.role==='admin'&&countAdmins()<=1
          ?`<button class="btn btn-xs" style="background:var(--g200);color:var(--g400);cursor:not-allowed" title="Dernier admin">🔒</button>`
          :`<button type="button" class="btn bd btn-xs" onclick="delU(${u.id})">🗑️</button>`)}
      </div></td>
    </tr>`;
    }catch(renderErr){
      console.error('[rAdmUs] Erreur rendu user id='+u.id,renderErr);
      return html`<tr style="background:#fff5f5"><td colspan="7" style="padding:8px 12px;font-size:12px;color:#dc2626">
        ⚠️ Erreur d'affichage du compte <b>${u.abbrev||'?'}</b> (ID:${u.id}) — <button type="button" class="btn bo btn-xs" onclick="openUM(${u.id})">Ouvrir quand même</button>
      </td></tr>`;
    }
  }).join('');
}
async function togP(id,v){
  const u=users.find(x=>x.id==id);if(!u)return;u.canPropose=v;rAdmUs();
  try{await sbUpd('users',id,{canPropose:v});_cachePut({users});}catch(e){console.error(e);_showSyncToast('⚠️ Modification non sauvegardée');}
}

/* ═══════════════════════════════════════════════════════════════
   CAPACITÉS PAR RÔLE — source unique pour message WhatsApp + guide
═══════════════════════════════════════════════════════════════ */
const ROLE_LABELS={admin:'Administrateur',resident:'Résident',commission:'Membre de la commission',enrol:'Enrôleur',member:'Membre'};

/* Retourne la liste des capacités d'un utilisateur selon son rôle et ses onglets */
function _userCapabilities(u){
  const caps=[];
  const tabs=u.tabs||[];
  /* Capacités communes à tous */
  caps.push({icon:'📚',title:'Consulter le catalogue',desc:'Parcourir et rechercher les livres de la bibliothèque.'});
  caps.push({icon:'👤',title:'Gérer votre profil',desc:'Mettre à jour votre photo, téléphone et informations personnelles.'});

  if(u.role==='admin'){
    caps.push({icon:'📖',title:'Gérer le catalogue',desc:'Ajouter, modifier et retirer des livres.'});
    caps.push({icon:'🤝',title:'Gérer les emprunts',desc:'Valider les demandes d\'emprunt et les retours.'});
    caps.push({icon:'📋',title:'Traiter les demandes',desc:'Approuver ou rejeter les propositions de livres.'});
    caps.push({icon:'👥',title:'Gérer les membres',desc:'Créer, modifier et désactiver les comptes.'});
    caps.push({icon:'✍️',title:'Valider les inscriptions',desc:'Approuver les nouvelles demandes d\'inscription.'});
    caps.push({icon:'📚',title:'Gérer les étagères',desc:'Affecter les gestionnaires et suivre les vérifications.'});
    caps.push({icon:'📊',title:'Voir les statistiques',desc:'Tableau de bord, diagnostics et suivi du quota.'});
    caps.push({icon:'🎨',title:'Personnaliser l\'application',desc:'Logo, thème et paramètres généraux.'});
    return caps;
  }

  if(u.role==='resident'){
    caps.push({icon:'🤝',title:'Emprunter des livres',desc:'Emprunter directement, sans validation préalable.'});
    caps.push({icon:'📝',title:'Proposer des livres',desc:'Suggérer de nouveaux ouvrages pour la bibliothèque.'});
  }else if(u.role==='commission'){
    caps.push({icon:'📋',title:'Traiter les demandes',desc:'Approuver ou rejeter les propositions de livres.'});
    caps.push({icon:'📝',title:'Proposer des livres',desc:'Suggérer de nouveaux ouvrages.'});
  }else if(u.role==='enrol'){
    caps.push({icon:'📖',title:'Enrichir le catalogue',desc:'Ajouter et modifier des fiches de livres.'});
  }else{ /* member */
    if(u.canPropose!==false)caps.push({icon:'📝',title:'Proposer des livres',desc:'Suggérer de nouveaux ouvrages à la bibliothèque.'});
    if(u.canLoan)caps.push({icon:'🤝',title:'Emprunter des livres',desc:'Vous êtes autorisé à emprunter des ouvrages.'});
  }

  /* Onglets admin délégués */
  if(tabs.includes('loans_validator'))caps.push({icon:'🤝',title:'Valider les emprunts',desc:'Gérer les demandes d\'emprunt et les retours.'});
  if(tabs.includes('members'))caps.push({icon:'👥',title:'Gérer les membres',desc:'Consulter et gérer les comptes membres.'});
  if(tabs.includes('stats'))caps.push({icon:'📊',title:'Voir les statistiques',desc:'Accéder au tableau de bord.'});
  if(tabs.includes('shelf_mgr'))caps.push({icon:'📚',title:'Vérifier les étagères',desc:'Marquer les étagères dont vous avez la charge comme vérifiées.'});

  return caps;
}

/* Guide personnalisé — affiche ce que l'utilisateur connecté peut faire */
function openGuide(){
  if(!curUser)return;
  const old=document.getElementById('_guide_modal');if(old)old.remove();
  const roleLabel=ROLE_LABELS[curUser.role]||'Membre';
  const caps=_userCapabilities(curUser);
  const ov=document.createElement('div');
  ov.id='_guide_modal';
  ov.style.cssText='position:fixed;inset:0;background:rgba(15,23,42,.55);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px;overflow-y:auto';
  ov.onclick=e=>{if(e.target===ov)ov.remove();};
  const capsHtml=caps.map(c=>html`
    <div style="display:flex;gap:13px;padding:14px;background:#f8fafc;border-radius:11px;border:0.5px solid #e8edf2">
      <div style="font-size:22px;flex-shrink:0;line-height:1.2">${c.icon}</div>
      <div>
        <div style="font-size:14px;font-weight:600;color:#1e293b;margin-bottom:2px">${c.title}</div>
        <div style="font-size:13px;color:#64748b;line-height:1.5">${c.desc}</div>
      </div>
    </div>`).join('');
  ov.innerHTML=html`<div style="background:white;border-radius:16px;width:100%;max-width:480px;max-height:90vh;overflow-y:auto;box-shadow:0 24px 64px rgba(0,0,0,.25)">
    <div style="background:linear-gradient(135deg,#1c4370,#2a5a8f);color:white;padding:24px 22px;border-radius:16px 16px 0 0;position:relative">
      <button onclick="document.getElementById('_guide_modal').remove()" style="position:absolute;top:14px;right:14px;background:rgba(255,255,255,.18);border:none;border-radius:50%;width:30px;height:30px;cursor:pointer;font-size:16px;color:white;display:flex;align-items:center;justify-content:center">✕</button>
      <div style="font-size:20px;font-weight:700;margin-bottom:6px">❓ Guide d'utilisation</div>
      <div style="font-size:13px;opacity:.9">Bonjour ${curUser.prenom} · Vous êtes connecté en tant que <strong>${roleLabel}</strong></div>
    </div>
    <div style="padding:20px">
      <div style="font-size:13px;color:#64748b;margin-bottom:14px">Voici tout ce que vous pouvez faire avec l'application :</div>
      <div style="display:flex;flex-direction:column;gap:10px">${safe(capsHtml)}</div>
      <div style="margin-top:18px;padding:14px;background:#eff6ff;border-radius:11px;font-size:13px;color:#1d4ed8;line-height:1.6">
        💡 <strong>Astuce :</strong> utilisez le menu en haut de l'écran pour naviguer entre les différentes sections accessibles à votre compte.
      </div>
    </div>
    <div style="padding:0 20px 20px">
      <button type="button" onclick="document.getElementById('_guide_modal').remove()" style="width:100%;padding:13px;border:none;background:#1c4370;color:white;border-radius:11px;font-size:14px;font-weight:600;font-family:inherit;cursor:pointer">J'ai compris</button>
    </div>
  </div>`;
  document.body.appendChild(ov);
}

/* Partager les accès d'un membre via WhatsApp (message adapté au rôle) */
function shareAccess(id){
  const u=users.find(x=>x.id==id);if(!u){alert('Membre introuvable.');return;}
  if(!u.whatsapp){alert('Ce membre n\'a pas de numéro WhatsApp enregistré.');return;}
  const appUrl=(cfg.shortLink&&cfg.shortLink.trim())?cfg.shortLink.trim():(window.location.origin+'/'+SPACE_ID);
  const roleLabel=ROLE_LABELS[u.role]||'Membre';
  const caps=_userCapabilities(u);
  const libName=(SPACE&&SPACE.name)||'la bibliothèque';

  /* Message sans caractères problematiques pour WhatsApp (pas de keycap U+20E3, pas d'emoji rares) */
  let msg='Bonjour ' + u.prenom + ' !\n\n';
  msg+='Bienvenue a ' + libName + ' ! Votre compte a ete cree.\n\n';
  msg+='--- VOS ACCES ---\n';
  msg+='Code de connexion : ' + u.abbrev + '\n';
  msg+='Role : ' + roleLabel + '\n\n';
  msg+='--- CE QUE VOUS POUVEZ FAIRE ---\n';
  caps.forEach(c=>{msg+=c.title+'\n'+c.desc+'\n\n';});
  msg+='--- COMMENT SE CONNECTER ---\n';
  msg+='1. Ouvrez ce lien sur telephone ou ordinateur :\n' + appUrl + '\n';
  msg+='2. Saisissez votre code : ' + u.abbrev + '\n';
  msg+='3. C\'est tout, vous etes connecte !\n\n';
  msg+='L\'application fonctionne sur telephone ET sur ordinateur.\n';
  msg+='Pas besoin de mot de passe, votre code suffit. Conservez-le.\n\n';
  msg+='A bientot a ' + libName + ' !';

  const wa=u.whatsapp.replace(/[^0-9+]/g,'').replace(/^\+/,'');
  /* Supprimer tout caractère non-ASCII ou non supporté par WhatsApp avant l'envoi */
  const sanitize=s=>s.replace(/[^\u0000-\u007E\u00A0-\u00FF\u2000-\u206F\u20A0-\u20CF\u2100-\u214F\u{1F300}-\u{1F9FF}\u{2600}-\u{27BF}]/gu,'-');
  const url=`https://wa.me/${wa}?text=${encodeURIComponent(sanitize(msg))}`;
  window.open(url,'_blank');
}
async function togDisable(id){if(!_requireAdmin('togDisable'))return;
  const u=users.find(x=>x.id==id);if(!u)return;
  if(u.role==='admin'&&countAdmins()<=1&&!u.disabled){alert('⚠️ Seul administrateur.');return;}
  if(u.id==curUser.id&&!u.disabled){alert('⚠️ Vous ne pouvez pas désactiver votre propre compte.');return;}
  u.disabled=!u.disabled;rAdmUs();
  try{await sbUpd('users',id,{disabled:u.disabled});_cachePut({users});}catch(e){console.error(e);_showSyncToast('⚠️ Modification non sauvegardée');}
}
/* ── Logo organisation ── */
function applyLogo(b64){
  /* Login page */
  const wrap=document.getElementById('login-logo-wrap');
  const ico=document.getElementById('login-ico-emoji');
  if(wrap&&b64){
    wrap.innerHTML=html`<img src="${b64}" class="llogo-img" alt="Logo"/>`;
  } else if(ico){
    if(wrap)wrap.innerHTML='<div class="lico" id="login-ico-emoji">📚</div>';
  }
  /* Toutes les navbars */
  for(let i=0;i<=4;i++){
    const el=document.getElementById('nbr-logo-'+i);
    if(el) el.innerHTML=b64?`<img src="${esc(b64)}" class="nbr-logo" alt="Logo"/>`:'' ;
  }
  /* Preview admin */
  const pw=document.getElementById('logo-preview-wrap');
  if(pw){
    pw.innerHTML=b64
      ?`<img src="${esc(b64)}" style="width:100%;height:100%;object-fit:cover;border-radius:12px" alt="Logo"/>`
      :`<span id="logo-preview-ico">📚</span>`;
  }
}
function onLogoFile(input){
  const file=input.files[0];if(!file)return;
  const reader=new FileReader();
  reader.onload=e=>{
    const img=new Image();
    img.onload=async()=>{
      const MAX=200;
      let {width:w,height:ht}=img;
      if(w>MAX||ht>MAX){const r=Math.min(MAX/w,MAX/ht);w=Math.round(w*r);ht=Math.round(ht*r);}
      const canvas=document.createElement('canvas');
      canvas.width=w;canvas.height=ht;
      canvas.getContext('2d').drawImage(img,0,0,w,ht);
      const b64=canvas.toDataURL('image/png',0.92);
      const oldLogo=cfg.logoB64;
      cfg.logoB64=b64;applyLogo(b64);
      try{await sbSaveCfg();_cachePut({config:cfg});}
      catch(err){cfg.logoB64=oldLogo;applyLogo(oldLogo);console.warn('Logo non sauvegardé:',err);_showSyncToast('⚠️ Logo non sauvegardé');}
    };
    img.src=e.target.result;
  };
  reader.readAsDataURL(file);
}
async function clearLogo(){
  const oldLogo=cfg.logoB64;
  cfg.logoB64=null;applyLogo(null);
  try{await sbSaveCfg();_cachePut({config:cfg});}
  catch(e){cfg.logoB64=oldLogo;applyLogo(oldLogo);console.error('[sbSaveCfg]',e.message);_showSyncToast('⚠️ Config non sauvegardée');}
}
let ufPhotoB64=null;
function onMbrPhoto(input){
  const file=input.files[0];if(!file)return;
  const reader=new FileReader();
  reader.onload=e=>{
    const img=new Image();
    img.onload=()=>{
      const MAX=150;
      let {width:w,height:ht}=img;
      if(w>MAX||ht>MAX){const r=Math.min(MAX/w,MAX/ht);w=Math.round(w*r);ht=Math.round(ht*r);}
      const canvas=document.createElement('canvas');canvas.width=w;canvas.height=ht;
      canvas.getContext('2d').drawImage(img,0,0,w,ht);
      ufPhotoB64=canvas.toDataURL('image/png',0.9);
      const prev=document.getElementById('uf-photo-prev');
      if(prev)prev.innerHTML=html`<img src="${ufPhotoB64}" style="width:100%;height:100%;object-fit:cover"/>`;
    };
    img.src=e.target.result;
  };
  reader.readAsDataURL(file);
}
function showCard(id){
  /* Chercher par id en comparaison souple (int vs string) ou utiliser curUser si liste vide */
  let u=users.find(x=>x.id==id);
  if(!u&&curUser&&curUser.id==id)u=curUser;
  if(!u)return;
  const initials=((u.prenom[0]||'')+(u.nom[0]||'')).toUpperCase();
  const photoHtml=u.photoB64
    ?`<img src="${esc(u.photoB64)}" style="width:80px;height:80px;border-radius:50%;object-fit:cover;border:3px solid white;box-shadow:0 4px 12px rgba(0,0,0,.2)"/>`
    :`<div style="width:80px;height:80px;border-radius:50%;background:var(--gl);border:3px solid white;display:flex;align-items:center;justify-content:center;font-size:28px;font-weight:700;color:white;box-shadow:0 4px 12px rgba(0,0,0,.2)">${initials}</div>`;
  const logoHtml=cfg.logoB64
    ?`<img src="${esc(cfg.logoB64)}" style="height:40px;width:40px;object-fit:contain;border-radius:8px"/>`
    :`<div style="width:40px;height:40px;background:rgba(255,255,255,.2);border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:20px">📚</div>`;
  document.getElementById('m-card-body').innerHTML=html`
    <div style="background:linear-gradient(135deg,#1C4370 0%,#22806B 100%);border-radius:16px;padding:28px;color:white;font-family:'DM Sans',sans-serif">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:22px;opacity:.8;font-size:13px;font-weight:600;letter-spacing:.5px">
        ${safe(logoHtml)}
        <span style="font-family:'Cormorant Garamond',serif;font-size:18px;font-weight:700">Bibliothèque · Centre Culturel Comoé</span>
      </div>
      <div style="display:flex;gap:24px;align-items:center">
        ${safe(photoHtml)}
        <div style="flex:1">
          <div style="font-family:'Cormorant Garamond',serif;font-size:26px;font-weight:700;line-height:1.2;margin-bottom:4px">${u.prenom} ${u.nom.toUpperCase()}</div>
          <div style="margin-bottom:12px">${safe(rBdg(u.role))}</div>
          ${safe(u.profession?`<div style="font-size:13px;opacity:.85;margin-bottom:4px">💼 ${esc(u.profession)}</div>`:'')}
          ${safe(u.commune?`<div style="font-size:13px;opacity:.85;margin-bottom:4px">📍 ${esc(u.commune)}</div>`:'')}
          ${safe(u.whatsapp?`<div style="font-size:13px;opacity:.85">📱 ${esc(u.whatsapp)}</div>`:'')}
        </div>
      </div>
      <div style="margin-top:20px;padding-top:14px;border-top:1px solid rgba(255,255,255,.2);display:flex;justify-content:space-between;font-size:11px;opacity:.6">
        <span>ComoéBiblio · Carte membre</span>
        <span>${new Date().getFullYear()}</span>
      </div>
    </div>`;
  openM('m-card');
}
function showMyCard(){
  if(!curUser)return;
  showCard(curUser.id);
}
async function downloadCard(){
  const cardEl=document.getElementById('m-card-body');
  if(!cardEl||!cardEl.firstElementChild){alert('Aucune carte à télécharger.');return;}
  const btn=document.querySelector('#m-card .btn[onclick*="downloadCard"]');
  if(btn){btn.disabled=true;btn.textContent='⏳ Génération…';}
  const resetBtn=()=>{if(btn){btn.disabled=false;btn.textContent='📥 Télécharger la carte';}};
  try{
    /* Charger html2canvas dynamiquement si absent */
    if(typeof html2canvas==='undefined'){
      await new Promise((resolve,reject)=>{
        const s=document.createElement('script');
        s.src='https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
        s.onload=resolve;
        s.onerror=()=>reject(new Error('html2canvas non chargeable depuis le CDN. Vérifiez votre connexion internet.'));
        document.head.appendChild(s);
      });
    }
    /* Capturer la carte en image haute résolution */
    const canvas=await html2canvas(cardEl.firstElementChild,{
      scale:3,
      useCORS:true,
      backgroundColor:null,
      logging:false
    });
    const link=document.createElement('a');
    link.download='carte-bibliotheque-'+(curUser?.abbrev||'membre')+'.png';
    link.href=canvas.toDataURL('image/png');
    link.click();
    resetBtn();
  }catch(e){
    console.error('[downloadCard]',e);
    alert('Erreur génération carte : '+e.message);
    resetBtn();
  }
}
function genCode(){
  const chars='abcdefghjkmnpqrstuvwxyz23456789';
  const arr=new Uint8Array(4);
  let code='';
  do{
    crypto.getRandomValues(arr);
    code=Array.from(arr).map(b=>chars[b%chars.length]).join('');
  }while(users.some(u=>u.abbrev===code));
  return code;
}
function saGenSpaceCode(){
  /* UUID cryptographique tronqué : 3 segments de 4 hex = 12 chars imprévisibles */
  const arr=new Uint8Array(6);
  crypto.getRandomValues(arr);
  const hex=Array.from(arr).map(b=>b.toString(16).padStart(2,'0')).join('');
  return hex.slice(0,4)+'-'+hex.slice(4,8)+'-'+hex.slice(8,12);
}
function togNeverExpires(checked){
  const expEl=document.getElementById('ufexp');
  const expWrap=document.getElementById('uf-expiry-wrap');
  const note=document.getElementById('uf-never-expires-note');
  if(expEl){expEl.disabled=checked;if(checked)expEl.value='';}
  if(note)note.style.display=checked?'block':'none';
  /* Griser visuellement le champ date quand "n'expire jamais" est coché */
  if(expEl)expEl.style.opacity=checked?'0.4':'1';
}

function openUM(id=null){
  ufEid=id;document.getElementById('uft').textContent=id?'Modifier le membre':'Nouveau membre';document.getElementById('ufe').textContent='';
  ufPhotoB64=null;
  if(id){const u=users.find(x=>x.id==id);if(u){
    document.getElementById('ufid').value=u.id;document.getElementById('ufab').value=u.abbrev;
    document.getElementById('ufpn').value=u.prenom;document.getElementById('ufnm').value=u.nom;
    document.getElementById('ufrl').value=u.role;document.getElementById('ufcp').checked=u.canPropose;
    document.getElementById('ufpro').value=u.profession||'';
    document.getElementById('ufwa').value=u.whatsapp||'';
    document.getElementById('ufcom').value=u.commune||'';
    if(document.getElementById('ufemail'))document.getElementById('ufemail').value=u.email||'';
    _setUfAuthStatus(!!u.auth_id,true);
    ufPhotoB64=u.photoB64||null;
    const prev=document.getElementById('uf-photo-prev');
    if(prev)prev.innerHTML=ufPhotoB64?`<img src="${esc(ufPhotoB64)}" style="width:100%;height:100%;object-fit:cover"/>`:'📷';
  }}
  else{
    ['ufid','ufpn','ufnm','ufpro','ufwa','ufcom','ufemail'].forEach(f=>{const el=document.getElementById(f);if(el)el.value='';});
    document.getElementById('ufab').value=genCode();
    document.getElementById('ufrl').value='member';document.getElementById('ufcp').checked=false;
    _setUfAuthStatus(false,false);
    const prev=document.getElementById('uf-photo-prev');if(prev)prev.innerHTML='📷';
  }
  openM('mus');
  /* Pré-remplir expiresAt et neverExpires */
  const u2=id?users.find(x=>x.id==id):null;
  const expEl=document.getElementById('ufexp');
  const neverExpEl=document.getElementById('uf-never-expires');
  const isNeverExp=!!(u2?.neverExpires);
  if(neverExpEl){neverExpEl.checked=isNeverExp;togNeverExpires(isNeverExp);}
  if(expEl&&!isNeverExp){expEl.value=u2?.expiresAt||calcExpiresAt();}
  else if(expEl&&isNeverExp){expEl.value='';}
  /* Afficher champ canLoan si option emprunt activée */
  const loanWrap=document.getElementById('uf-loan-wrap');
  const canLoanEl2=document.getElementById('ufcanloan');
  const currentRole=document.getElementById('ufrl')?.value||'member';
  const isResidentForm=(id?users.find(x=>x.id==id)?.role:currentRole)==='resident';
  if(loanWrap){loanWrap.style.display=(cfg.loanOpen||isResidentForm)?'flex':'none';}
  if(canLoanEl2){
    const u3=id?users.find(x=>x.id==id):null;
    /* Les résidents ont toujours le droit d'emprunt activé et bloqué */
    canLoanEl2.checked=isResidentForm?true:!!(u3?.canLoan);
    canLoanEl2.disabled=isResidentForm;
    canLoanEl2.title=isResidentForm?'Les résidents peuvent toujours emprunter':'';
  }
  /* Synchroniser avec le changement de rôle */
  const roleEl2=document.getElementById('ufrl');
  if(roleEl2&&canLoanEl2&&loanWrap){
    roleEl2.addEventListener('change',function onRoleChange(){
      const isRes=this.value==='resident';
      loanWrap.style.display=(cfg.loanOpen||isRes)?'flex':'none';
      canLoanEl2.checked=isRes?true:canLoanEl2.checked;
      canLoanEl2.disabled=isRes;
      canLoanEl2.title=isRes?'Les résidents peuvent toujours emprunter':'';
      roleEl2.removeEventListener('change',onRoleChange); /* sera réattaché à l'ouverture suivante */
      roleEl2.addEventListener('change',onRoleChange);
    });
  }
  /* Charger les droits onglets admin */
  const tabKeys=['loans_validator','stats','members','shelf_mgr'];
  tabKeys.forEach(k=>{
    const el=document.getElementById('uf-tab-'+k);
    if(!el)return;
    const u4=id?users.find(x=>x.id==id):null;
    const roleCurrent=document.getElementById('ufrl')?.value||'member';
    if(k==='loans_validator'){
      /* Pour résident/commission : coché par défaut si pas de donnée existante */
      const isEligibleRole=roleCurrent==='resident'||roleCurrent==='commission';
      const hasExplicitData=u4?.tabs!==undefined;
      el.checked=hasExplicitData
        ?!!(u4.tabs&&u4.tabs.includes(k))
        :isEligibleRole; /* nouveau membre éligible → coché par défaut */
    }else{
      el.checked=!!(u4?.tabs&&u4.tabs.includes(k));
    }
  });
  /* Masquer le bloc onglets admin si le rôle sélectionné est admin (déjà tous les droits) */
  const roleEl=document.getElementById('ufrl');
  const admTabWrap=document.getElementById('uf-admintabs-wrap');
  const loanValidEl=document.getElementById('uf-tab-loans_validator');
  /* ID fiable sur la ligne — évite les sélecteurs fragiles */
  const loanValidRow=document.getElementById('uf-tab-loans_validator-row');

  function _syncAdminTabs(){
    const role=roleEl?.value||'member';
    if(admTabWrap)admTabWrap.style.display=role==='admin'?'none':'block';
    if(loanValidRow&&loanValidEl){
      const isEligible=role==='resident'||role==='commission';
      loanValidRow.style.display=isEligible?'flex':'none';
      if(isEligible&&!loanValidEl.dataset.manualUncheck){loanValidEl.checked=true;}
      else if(!isEligible){loanValidEl.checked=false;delete loanValidEl.dataset.manualUncheck;}
      loanValidEl.onchange=()=>{
        if(!loanValidEl.checked)loanValidEl.dataset.manualUncheck='1';
        else delete loanValidEl.dataset.manualUncheck;
      };
    }
    /* Date d'expiration : la case "n'expire jamais" gère ce champ directement
       via togNeverExpires() — ne pas interférer ici */
  }
  if(roleEl){roleEl.onchange=_syncAdminTabs;_syncAdminTabs();}
}
async function savU(){if(!_requirePrivileged('savU'))return;
  const ab=document.getElementById('ufab').value.trim().toLowerCase(),
        pn=document.getElementById('ufpn').value.trim(),nm=document.getElementById('ufnm').value.trim(),
        rl=document.getElementById('ufrl').value,cp=document.getElementById('ufcp').checked,
        pro=document.getElementById('ufpro').value.trim(),
        wa=document.getElementById('ufwa').value.trim(),
        com=document.getElementById('ufcom').value.trim(),
        em=(document.getElementById('ufemail')?.value||'').trim().toLowerCase();
  if(!ab||!pn||!nm){document.getElementById('ufe').textContent='Tous les champs * sont obligatoires.';return;}
  if(em&&!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em)){document.getElementById('ufe').textContent='E-mail invalide.';return;}
  /* Vérif unicité code — d'abord en mémoire, puis Supabase pour les nouveaux */
  const abConflict=users.find(u=>u.abbrev===ab&&u.id!==ufEid);
  if(abConflict){
    const today=todayStr();
    const st=abConflict.disabled?'🔴 Désactivé'
      :(abConflict.expiresAt&&abConflict.expiresAt<today&&!abConflict.neverExpires)?'🟡 Expiré ('+abConflict.expiresAt+')'
      :'🟢 Actif';
    document.getElementById('ufe').innerHTML=html`Code "<b>${ab}</b>" déjà utilisé par :
      <span style="display:block;margin:6px 0;padding:8px 10px;background:#f8fafc;border-radius:6px;font-size:12px">
        <b>${abConflict.prenom} ${abConflict.nom}</b> · ${abConflict.role} · ${st}<br>
        <span style="color:#64748b">Si ce compte n'apparaît pas dans la liste, changez le filtre sur 
        <b style="cursor:pointer;text-decoration:underline;color:#1c4370" onclick="setAdmUsFilter('all');document.getElementById('adm-us-filter-all').click()">Tous les membres</b>
        et cherchez ID #${abConflict.id}</span>
      </span>`;
    return;
  }
  if(!ufEid){
    /* Vérification Supabase pour garantir l'unicité même en cas de création concurrente */
    document.getElementById('ufe').textContent='Vérification du code…';
    try{
      _initSb();
      const {data:chkData}=await sb.from('users').select('id').eq('space_code',SPACE_ID).eq('abbrev',ab).limit(1);
      if(chkData?.[0]){document.getElementById('ufe').textContent='Ce code de connexion existe déjà dans la base. Choisissez-en un autre.';return;}
    }catch(e){console.warn('Check abbrev SB:',e);}
    document.getElementById('ufe').textContent='';
  }
  const canLoanEl=document.getElementById('ufcanloan');
  /* Collecter les droits onglets admin */
  const tabKeys=['loans_validator','stats','members','shelf_mgr'];
  const adminTabs=tabKeys.filter(k=>{const el=document.getElementById('uf-tab-'+k);return el?.checked;});
  const extras={profession:pro,whatsapp:wa,commune:com,email:em||null,photoB64:ufPhotoB64||null,canLoan:canLoanEl?.checked||false,tabs:adminTabs};
  if(ufEid){
    const existing=users.find(u=>u.id==ufEid);
    if(existing&&existing.role==='admin'&&rl!=='admin'&&countAdmins()<=1){document.getElementById('ufe').textContent='⚠️ Seul administrateur.';return;}
    const i=users.findIndex(u=>u.id==ufEid);
    if(i>=0)users[i]={...users[i],abbrev:ab,prenom:pn,nom:nm,role:rl,canPropose:cp,...extras};
    const isNeverExp=document.getElementById('uf-never-expires')?.checked||false;
    const expUpdVal=(!isNeverExp&&document.getElementById('ufexp')?.value)||undefined;
    const updFields={abbrev:ab,prenom:pn,nom:nm,role:rl,canPropose:cp,neverExpires:isNeverExp,...extras};
    /* Rôles permanents : admin/resident/commission ne doivent jamais expirer */
    const isPermanentRole=['admin','resident','commission'].includes(rl);
    if(isPermanentRole){updFields.neverExpires=true;updFields.expiresAt=null;}
    else if(isNeverExp){updFields.expiresAt=null;}else if(expUpdVal){updFields.expiresAt=expUpdVal;}
    if(i>=0){users[i].neverExpires=isPermanentRole||isNeverExp;if(!isPermanentRole&&expUpdVal)users[i].expiresAt=expUpdVal;if(isPermanentRole)users[i].expiresAt=null;}
    try{await sbUpd('users',ufEid,updFields);_cachePut({users});}catch(e){console.error(e);alert('❌ Erreur de mise à jour : '+e.message);}
  } else {
    /* ── Création d'un nouveau compte ── */
    /* 1. Lire le compteur frais depuis Supabase pour éviter les collisions entre sessions */
    try{const d=await sbGetDoc('counters','main');if(d&&d.nxU)nxU=Math.max(nxU,parseInt(d.nxU)||nxU);}catch(e){}
    const newId=_nextUserId();
    /* Rôles permanents : jamais d'expiration */
    const isPermanentRole=['admin','resident','commission'].includes(rl);
    const isNeverExp=isPermanentRole||document.getElementById('uf-never-expires')?.checked||false;
    const expVal=isNeverExp?null:(document.getElementById('ufexp')?.value||calcExpiresAt());
    const nu={id:newId,abbrev:ab,prenom:pn,nom:nm,role:rl,canPropose:cp,propUntil:null,disabled:false,expiresAt:expVal,neverExpires:isNeverExp,...extras};
    try{
      /* 2. Sauvegarder le compteur EN PREMIER pour réserver l'ID */
      await sbSaveCounters();
      /* 3. Sauvegarder l'utilisateur dans Supabase */
      await sbSet('users',newId,nu);
      /* 4. Seulement si Supabase confirme : ajouter au tableau local */
      if(!users.find(u=>String(u.id)===String(newId)))users.push(nu);
      _cachePut({users});
    }catch(e){
      console.error('[savU] Échec sauvegarde Supabase:',e);
      alert('❌ Erreur de sauvegarde : '+e.message+'\n\nLe compte n\'a pas été créé. Vérifiez votre connexion et réessayez.');
      return;
    }
  }
  cM('mus');
  /* Recharger les users depuis Supabase pour confirmer la persistance */
}
async function delU(id){if(!_requireAdmin('delU'))return;
  const u=users.find(x=>x.id==id);if(!u)return;
  if(u.role==='admin'&&countAdmins()<=1){alert('⚠️ Seul administrateur — impossible de supprimer.');return;}
  if(u.id==curUser.id){alert('⚠️ Impossible de supprimer votre propre compte.');return;}

  /* Vérifier les emprunts actifs avant suppression */
  const activeLoans=loans.filter(l=>l.userId==id&&
    (l.status==='active'||l.status==='pending'||l.status==='pending_return'));
  if(activeLoans.length>0){
    const titles=activeLoans.map(l=>'• '+l.bookTitle+(l.status==='pending'?' (demande en attente)':l.status==='pending_return'?' (retour à valider)':' (emprunté)')).join('\n');
    const choice=confirm(
      '⚠️ Ce membre a '+activeLoans.length+' emprunt(s) en cours :\n'+titles+
      '\n\nPour supprimer ce compte, les emprunts actifs doivent d\'abord être clôturés.\n\n'+
      'Cliquer OK pour clôturer automatiquement les emprunts ET supprimer le compte.\n'+
      'Cliquer Annuler pour garder le compte.'
    );
    if(!choice)return;
    /* Clôturer tous les emprunts actifs et remettre les livres disponibles */
    const now=new Date().toISOString();
    for(const l of activeLoans){
      try{
        await sbUpd('loans',l.id,{status:'returned',validatedAt:now,validatedBy:'SYSTEM — Compte supprimé'});
        l.status='returned';l.validatedAt=now;
        const b=books.find(x=>x.id==l.bookId);
        if(b){
          const stillActive=loans.filter(x=>x.bookId==l.bookId&&x.status==='active'&&x.id!==l.id).length;
          if(stillActive===0){
            b.status='available';b.borrowedBy=null;b.borrowedUntil=null;
            await sbUpd('books',l.bookId,{status:'available',borrowedBy:null,borrowedUntil:null,activeLoans:0});
          }
        }
      }catch(e){console.warn('[delU] Clôture emprunt',l.id,e.message);}
    }
  } else {
    if(!confirm(`Supprimer définitivement "${u.prenom} ${u.nom}" ?\n\nCette action est irréversible.`))return;
  }

  /* Archiver et supprimer le compte */
  const archived={...u,deletedAt:new Date().toLocaleDateString('fr-FR'),deletedBy:curUser.prenom+' '+curUser.nom};
  deletedUsers.unshift(archived);
  try{
    await sbDel('users',id);
    await sbSet('deletedUsers',id,archived);
    const idx=users.findIndex(x=>x.id==id);if(idx!==-1)users.splice(idx,1);
    _cachePut({users,loans,books});
    rAdmUs();rAdmDelUs();rCat();updAdmLoansBadge();
  }catch(e){console.error('[delU]',e.message);alert('❌ Erreur suppression compte : '+e.message);}
}
function rAdmDelUs(){
  const tb=document.getElementById('del-utb');if(!tb)return;
  /* Chargement à la demande — évite les lectures Supabase au démarrage */
  if(!deletedUsers.length){
    sbGetAll('deletedUsers').then(delD=>{
      deletedUsers=delD.sort((a,b)=>String(b.deletedAt||'').localeCompare(String(a.deletedAt||'')));
      _rAdmDelUsRender();
    }).catch(e=>console.warn('[rAdmDelUs]',e.message));
    tb.innerHTML='<tr><td colspan="5" style="text-align:center;padding:28px;color:var(--g400)">⏳ Chargement…</td></tr>';
    return;
  }
  _rAdmDelUsRender();
}
function _rAdmDelUsRender(){
  const tb=document.getElementById('del-utb');if(!tb)return;
  const cnt=document.getElementById('del-u-cnt');if(cnt)cnt.textContent=deletedUsers.length;
  const clearBtn=document.getElementById('btn-clear-del-users');
  if(clearBtn)clearBtn.style.display=deletedUsers.length?'':'none';
  if(!deletedUsers.length){
    tb.innerHTML=`<tr><td colspan="5" style="text-align:center;padding:28px;color:var(--g400)">Aucun membre supprimé.</td></tr>`;
    return;
  }
  tb.innerHTML=deletedUsers.map(u=>html`<tr>
    <td><code class="pl">${u.abbrev}</code></td>
    <td style="font-weight:500">${u.prenom} ${u.nom}</td>
    <td>${safe(rBdg(u.role))}</td>
    <td style="font-size:12px;color:var(--g500)">${u.deletedAt||'—'}</td>
    <td style="font-size:12px;color:var(--g500)">${u.deletedBy||'—'}</td>
  </tr>`).join('');
}

async function clearDeletedUsers(){
  if(!deletedUsers.length){alert('La liste est déjà vide.');return;}
  if(!confirm('Vider définitivement la liste des '+deletedUsers.length+' membre(s) supprimé(s) ?\n\nCette action supprime les archives. Elle est irréversible.'))return;
  let ok=0,fail=0;
  for(const u of deletedUsers){
    try{await sbDel('deletedUsers',u.id);ok++;}
    catch(e){fail++;console.warn('[clearDel]',u.id,e.message);}
  }
  deletedUsers=[];
  rAdmDelUs();
  alert(ok+' archive(s) supprimée(s).'+(fail?'\n⚠️ '+fail+' erreur(s) — vérifiez la console.':''));
}

/* ═══════════════════════════════════════════════════════════════
   ADMIN — AUTORISATION
═══════════════════════════════════════════════════════════════ */
function rPropSt(){
  const el=document.getElementById('pst');if(!el)return;
  if(cfg.openAll){
    if(cfg.openUntil&&new Date()>new Date(cfg.openUntil+'T23:59:59')){cfg.openAll=false;cfg.openUntil=null;}
    else{el.className='status-pill spo';el.textContent=`● Ouvert${cfg.openUntil?' jusqu\'au '+fmtDateLong(cfg.openUntil):''}`;return;}
  }
  el.className='status-pill spc';el.textContent='● Fermé';
  const ma=document.getElementById('adm-motif');if(ma&&!ma.value)ma.placeholder=nowMotifPlaceholder();
}
async function opProp(){
  const m=document.getElementById('adm-motif').value.trim(),d=document.getElementById('pun').value;
  document.getElementById('adm-motif-err').textContent='';
  if(!m){document.getElementById('adm-motif-err').textContent='Le motif est obligatoire.';return;}
  const sess={id:nxS++,motif:m,openDate:todayStr(),openUntil:d||null,closed:false,closedDate:null};
  try{
    await sbSet('sessions',sess.id,sess);
    cfg.propMotif=m;cfg.openAll=true;cfg.openUntil=d||null;cfg.currentSessionId=sess.id;
    await sbSaveCfg();await sbSaveCounters();
    sessions.push(sess);
    _cachePut({config:cfg,sessions});
    rPropSt();rAdmUs();document.getElementById('com-motif').value=m;
  }catch(e){nxS--;console.error('[opProp]',e);alert('❌ Erreur : la session n\'a pas été ouverte.\n'+e.message);}
}
async function clProp(){
  const sessId=cfg.currentSessionId;
  const savedCfg={openAll:cfg.openAll,openUntil:cfg.openUntil,currentSessionId:cfg.currentSessionId,propMotif:cfg.propMotif};
  try{
    if(sessId){
      const s=sessions.find(x=>x.id==sessId);
      if(s){await sbUpd('sessions',s.id,{closed:true,closedDate:todayStr()});s.closed=true;s.closedDate=todayStr();}
    }
    cfg.openAll=false;cfg.openUntil=null;cfg.currentSessionId=null;cfg.propMotif='';
    await sbSaveCfg();
    _cachePut({config:cfg,sessions});
    document.getElementById('pun').value='';
    document.getElementById('adm-motif').value='';
    rPropSt();rAdmUs();updRB();
  }catch(e){
    Object.assign(cfg,savedCfg);
    console.error('[clProp]',e);
    alert('❌ Erreur lors de la fermeture : '+e.message);
  }
}

/* ═══════════════════════════════════════════════════════════════
   ADMIN — CONNEXIONS
═══════════════════════════════════════════════════════════════ */
let catIndivPage=1;
const CAT_INDIV_PER=5;
function rCatAccessPanel(){
  const el=document.getElementById('cat-access-panel');if(!el)return;
  const roles=['member','commission','resident','enrol','admin'];
  const roleLabels={'member':'👤 Membre','commission':'🎓 Commission','resident':'🏠 Résident','enrol':'📝 Enrôlement','admin':'🛡️ Admin'};
  const access=cfg.catAccess||{member:['academique'],commission:['academique','spirituel'],resident:['academique'],enrol:['academique','spirituel'],admin:['academique','spirituel']};
  const catDefs=_getCatTypes();
  const badgeOk='<span style="display:inline-flex;align-items:center;gap:4px;background:#dcfce7;color:#166534;padding:3px 10px;border-radius:20px;font-size:12px;font-weight:700">✅ Actif</span>';
  const badgeNo='<span style="display:inline-flex;align-items:center;gap:4px;background:#f1f5f9;color:#94a3b8;padding:3px 10px;border-radius:20px;font-size:12px;font-weight:600">⛔ Inactif</span>';
  const headers=catDefs.map(t=>`<th style="text-align:center">${t.emoji} ${t.label}</th>`).join('');
  el.innerHTML=`<div class="tw"><div class="tov"><table>
    <thead><tr><th>Rôle</th>${headers}</tr></thead>
    <tbody>${roles.map(r=>{
      const cols=catDefs.map(t=>{
        const has=(access[r]||[]).includes(t.id);
        return html`<td style="text-align:center;vertical-align:middle">
          <div style="display:flex;flex-direction:column;align-items:center;gap:6px">
            ${safe(has?badgeOk:badgeNo)}
            <label class="tgl"><input type="checkbox" ${has?'checked':''}
              onchange="toggleCatAccess('${r}','${t.id}',this.checked)"/><span class="ts"></span></label>
          </div>
        </td>`;
      }).join('');
      return html`<tr><td style="font-weight:600">${roleLabels[r]||r}</td>${safe(cols)}</tr>`;
    }).join('')}</tbody>
  </table></div></div>`;
  /* Gestionnaire de types de catalogues */
  const mgrEl=document.getElementById('cat-types-manager');
  if(mgrEl)rCatManager(mgrEl,catDefs);
  /* Stats */
  const statsEl=document.getElementById('cat-type-stats');
  if(statsEl){
    statsEl.innerHTML=catDefs.map(t=>{
      const cnt=books.filter(b=>(b.catType||'academique')===t.id).length;
      return `<div class="stc" style="min-width:140px"><div class="sv">${cnt}</div><div class="sl">${t.emoji} ${t.label}</div></div>`;
    }).join('');
  }
  /* Boutons bulk */
  const bulkEl=document.getElementById('cat-indiv-bulk');
  if(bulkEl){
    const eligible=users.filter(u=>(access[u.role]||[]).includes('spirituel'));
    const countOn=eligible.filter(u=>u.spiritualAccess).length;
    const countOff=eligible.filter(u=>!u.spiritualAccess).length;
    bulkEl.innerHTML=`
      <button type="button" class="btn bg btn-sm" onclick="bulkIndivSpiritual(true)" ${!countOff?'disabled':''}>✅ Tout activer (${countOff} restant${countOff>1?'s':''})</button>
      <button type="button" class="btn bwarn btn-sm" onclick="bulkIndivSpiritual(false)" ${!countOn?'disabled':''}>⛔ Tout désactiver (${countOn} actif${countOn>1?'s':''})</button>`;
  }
  /* Accès individuel spirituel — liste paginée 5 par page */
  const indEl=document.getElementById('cat-indiv-spiritual');
  if(indEl){
    const q=(document.getElementById('cat-indiv-search')?.value||'').toLowerCase().trim();
    /* Afficher tous les membres (y compris admin) — normaliser les IDs en int */
  const allUsers=users.map(u=>({...u,id:parseInt(u.id)||u.id}));
  const filtered=q?allUsers.filter(u=>(u.prenom+' '+u.nom+' '+u.abbrev).toLowerCase().includes(q)):allUsers;
    const total=filtered.length;
    const pages=Math.ceil(total/CAT_INDIV_PER)||1;
    if(catIndivPage>pages)catIndivPage=1;
    const slice=filtered.slice((catIndivPage-1)*CAT_INDIV_PER,catIndivPage*CAT_INDIV_PER);
    indEl.innerHTML=slice.length?slice.map(u=>{
      const roleOk=(access[u.role]||[]).includes('spirituel');
      const disabledAttr=roleOk?'':'disabled title="Le rôle de cet utilisateur n\'a pas accès au catalogue spirituel"';
      const badge=u.spiritualAccess&&roleOk
        ?'<span style="background:#dcfce7;color:#166534;padding:2px 8px;border-radius:20px;font-size:11px;font-weight:700">✅ Accès</span>'
        :roleOk
          ?'<span style="background:#f1f5f9;color:#94a3b8;padding:2px 8px;border-radius:20px;font-size:11px;font-weight:600">⛔ Non</span>'
          :'<span style="background:#fef9c3;color:#92400e;padding:2px 8px;border-radius:20px;font-size:11px;font-weight:600">🚫 Rôle</span>';
      return html`<tr style="${roleOk?'':'opacity:.5'}">
      <td><div style="display:flex;align-items:center;gap:8px">
        ${safe(u.photoB64?`<img src="${esc(u.photoB64)}" style="width:28px;height:28px;border-radius:50%;object-fit:cover"/>`:`<div style="width:28px;height:28px;border-radius:50%;background:var(--g100);display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:var(--g500)">${esc(((u.prenom[0]||'')+(u.nom[0]||'')).toUpperCase())}</div>`)}
        <span style="font-weight:500">${u.prenom} ${u.nom}</span>
      </div></td>
      <td>${safe(rBdg(u.role))}</td>
      <td style="text-align:center">
        <div style="display:flex;flex-direction:column;align-items:center;gap:5px">
          ${safe(badge)}
          <label class="tgl"><input type="checkbox" ${u.spiritualAccess&&roleOk?'checked':''} ${disabledAttr} onchange="toggleIndivSpiritual(${u.id},this.checked)"/><span class="ts"></span></label>
        </div>
      </td>
    </tr>`;}).join(''):`<tr><td colspan="3" style="text-align:center;padding:24px;color:var(--g400)">Aucun membre trouvé</td></tr>`;
    /* Pagination */
    const pgnEl=document.getElementById('cat-indiv-pgn');
    if(pgnEl){
      if(pages<=1){pgnEl.innerHTML='';return;}
      let btns='';
      for(let p=1;p<=pages;p++){
        btns+=`<button onclick="catIndivPage=${p};rCatAccessPanel()" style="padding:4px 10px;border-radius:6px;border:1.5px solid ${p===catIndivPage?'var(--navy)':'var(--g200)'};background:${p===catIndivPage?'var(--navy)':'white'};color:${p===catIndivPage?'white':'var(--g600)'};font-size:12px;cursor:pointer;font-family:inherit">${p}</button>`;
      }
      pgnEl.innerHTML=html`<div style="display:flex;gap:6px;align-items:center;margin-top:10px;flex-wrap:wrap"><span style="font-size:12px;color:var(--g400)">${total} membre(s)</span>${safe(btns)}</div>`;
    }
  }
}
async function toggleIndivSpiritual(id,v){
  const u=users.find(x=>x.id==id);if(!u)return;
  const access=cfg.catAccess||{};
  if(!( access[u.role]||[]).includes('spirituel')){_showSyncToast('⚠️ Le rôle de cet utilisateur n\'a pas accès au catalogue spirituel');rCatAccessPanel();return;}
  u.spiritualAccess=v;
  rCatAccessPanel();
  try{await sbUpd('users',id,{spiritualAccess:v});_cachePut({users});}catch(e){console.error(e.message);_showSyncToast('⚠️ Modification non sauvegardée');}
}
async function bulkIndivSpiritual(v){
  const access=cfg.catAccess||{};
  const eligible=users.filter(u=>(access[u.role]||[]).includes('spirituel'));
  const targets=eligible.filter(u=>!!u.spiritualAccess!==v);
  if(!targets.length)return;
  const label=v?'activer':'désactiver';
  if(!confirm(`${v?'Activer':'Désactiver'} l'accès spirituel pour ${targets.length} membre(s) dont le rôle est autorisé ?`))return;
  targets.forEach(u=>u.spiritualAccess=v);
  rCatAccessPanel();
  try{
    await Promise.all(targets.map(u=>sbUpd('users',u.id,{spiritualAccess:v})));
    _cachePut({users});
    _showSyncToast(`✅ ${targets.length} membre(s) mis à jour`);
  }catch(e){console.error(e.message);_showSyncToast('⚠️ Modification partiellement sauvegardée');}
}
async function toggleCatAccess(role,type,v){
  if(!cfg.catAccess)cfg.catAccess={member:['academique'],commission:['academique','spirituel'],resident:['academique'],enrol:['academique','spirituel'],admin:['academique','spirituel']};
  if(!cfg.catAccess[role])cfg.catAccess[role]=['academique'];
  const oldAccess=[...(cfg.catAccess[role])];
  if(v){if(!cfg.catAccess[role].includes(type))cfg.catAccess[role].push(type);}
  else{cfg.catAccess[role]=cfg.catAccess[role].filter(x=>x!==type);}
  rCatAccessPanel();
  try{await sbSaveCfg();_cachePut({config:cfg});}
  catch(e){cfg.catAccess[role]=oldAccess;rCatAccessPanel();console.warn('[toggleCatAccess]',e);_showSyncToast('⚠️ Modification non sauvegardée');}
}

/* ── Rendu du gestionnaire de types de catalogues ── */
function rCatManager(el,catDefs){
  const custom=catDefs.filter(t=>!t.builtin);
  el.innerHTML=`
  <div style="background:#f8fafc;border:1px solid var(--g200);border-radius:12px;padding:16px 20px">
    <h4 style="font-size:15px;font-weight:700;color:var(--navy);margin-bottom:12px">📂 Types de catalogues</h4>
    <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:14px">
      ${catDefs.map(t=>`<span style="display:inline-flex;align-items:center;gap:6px;background:${t.builtin?'var(--g100)':'#eff6ff'};border:1px solid ${t.builtin?'var(--g200)':'#bfdbfe'};border-radius:20px;padding:5px 12px;font-size:13px;font-weight:600">
        ${t.emoji} ${t.label}
        ${t.builtin?'<span style="font-size:10px;color:var(--g400)">intégré</span>':`<button type="button" onclick="delCatType('${t.id}')" title="Supprimer" style="background:none;border:none;cursor:pointer;color:#dc2626;font-size:13px;padding:0 0 0 4px;line-height:1">✕</button>`}
      </span>`).join('')}
    </div>
    <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
      <input id="new-cat-emoji" maxlength="4" placeholder="📂" style="width:56px;padding:7px 10px;border:1.5px solid var(--g300);border-radius:8px;font-size:18px;text-align:center;font-family:inherit"/>
      <input id="new-cat-label" placeholder="Nom du catalogue" style="flex:1;min-width:160px;max-width:260px;padding:8px 12px;border:1.5px solid var(--g300);border-radius:8px;font-size:14px;font-family:inherit" onkeydown="if(event.key==='Enter')addCatType()"/>
      <button type="button" class="btn bg btn-sm" onclick="addCatType()">+ Ajouter</button>
    </div>
  </div>`;
}
async function addCatType(){
  const emoji=(document.getElementById('new-cat-emoji')?.value||'').trim()||'📂';
  const label=(document.getElementById('new-cat-label')?.value||'').trim();
  if(!label){_showSyncToast('⚠️ Saisir un nom de catalogue');return;}
  const id=label.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^a-z0-9]+/g,'_').replace(/^_+|_+$/g,'');
  if(!id||['academique','spirituel'].includes(id)){_showSyncToast('⚠️ Nom invalide ou réservé');return;}
  if((cfg.catTypes||[]).find(t=>t.id===id)){_showSyncToast('⚠️ Ce catalogue existe déjà');return;}
  if(!cfg.catTypes)cfg.catTypes=[];
  cfg.catTypes.push({id,label,emoji});
  /* Donner accès à l'admin par défaut */
  if(!cfg.catAccess)cfg.catAccess={};
  ['admin'].forEach(r=>{if(!cfg.catAccess[r])cfg.catAccess[r]=[];if(!cfg.catAccess[r].includes(id))cfg.catAccess[r].push(id);});
  rCatAccessPanel();
  if(document.getElementById('new-cat-label'))document.getElementById('new-cat-label').value='';
  if(document.getElementById('new-cat-emoji'))document.getElementById('new-cat-emoji').value='';
  try{await sbSaveCfg();_cachePut({config:cfg});_showSyncToast('✅ Catalogue créé');}
  catch(e){cfg.catTypes.pop();rCatAccessPanel();_showSyncToast('⚠️ Erreur sauvegarde');}
}
async function delCatType(id){
  if(['academique','spirituel'].includes(id))return;
  const def=_getCatTypes().find(t=>t.id===id);
  const cnt=books.filter(b=>b.catType===id).length;
  const label=def?def.label:id;
  if(!confirm(`Supprimer le catalogue "${label}" ?\n\n${cnt>0?`⚠️ ${cnt} livre(s) utilisent ce catalogue (ils passeront à "Académique").`:'Aucun livre n\'utilise ce catalogue.'}\n\nCette action est irréversible.`))return;
  cfg.catTypes=(cfg.catTypes||[]).filter(t=>t.id!==id);
  Object.keys(cfg.catAccess||{}).forEach(r=>{cfg.catAccess[r]=(cfg.catAccess[r]||[]).filter(t=>t!==id);});
  rCatAccessPanel();
  try{await sbSaveCfg();_cachePut({config:cfg});_showSyncToast('✅ Catalogue supprimé');}
  catch(e){_showSyncToast('⚠️ Erreur sauvegarde');}
}
/* ═══════════════════════════════════════════════════════════════
   DIAGNOSTIC — Détection des anomalies de données
═══════════════════════════════════════════════════════════════ */
let _diagFilter='all';

async function runDiag(){if(!_requireAdmin('runDiag'))return;
  const btn=document.getElementById('diag-run-btn');
  if(btn){btn.disabled=true;btn.textContent='⏳ Analyse…';}
  /* Petite pause pour laisser le DOM se mettre à jour */
  await new Promise(r=>setTimeout(r,50));
  try{
    const today=new Date().toISOString().split('T')[0];
    const now=new Date();
    const anomalies=[];

    /* ── Helpers ────────────────────────────────────────────── */
    const daysAgo=(iso)=>{
      if(!iso)return null;
      return Math.floor((now-new Date(iso))/(86400*1000));
    };
    const bookById=(id)=>books.find(b=>String(b.id)===String(id));
    const userById=(id)=>users.find(u=>String(u.id)===String(id));

    /* ══ LIVRES ════════════════════════════════════════════════ */

    /* 1. Livres "borrowed" sans emprunt actif */
    const borrowedNoLoan=books.filter(b=>{
      if(b.status!=='borrowed'||b.status==='retired')return false;
      const activeL=loans.find(l=>String(l.bookId)===String(b.id)&&(l.status==='active'||l.status==='pending_return'));
      return !activeL;
    });
    if(borrowedNoLoan.length) anomalies.push({
      level:'critical',cat:'books',
      title:'Livres marqués "emprunté" sans emprunt actif',
      desc:'Le statut est "borrowed" mais aucun emprunt actif ne correspond. Incohérence de données.',
      count:borrowedNoLoan.length,
      items:borrowedNoLoan,
      action:'Remettre en disponible',
      fix:async()=>{
        for(const b of borrowedNoLoan){
          b.status='available';b.borrowedBy=null;b.borrowedUntil=null;
          await sbUpd('books',b.id,{status:'available',borrowedBy:null,borrowedUntil:null}).catch(()=>{});
        }
      }
    });

    /* 2. Emprunts actifs pointant un livre inexistant */
    const orphanLoanBook=loans.filter(l=>(l.status==='active'||l.status==='pending'||l.status==='pending_return')&&!bookById(l.bookId));
    if(orphanLoanBook.length) anomalies.push({
      level:'critical',cat:'loans',
      title:'Emprunts actifs pointant un livre inexistant',
      desc:'Le bookId de l\'emprunt ne correspond à aucun livre (livre supprimé sans clôturer l\'emprunt).',
      count:orphanLoanBook.length,
      items:orphanLoanBook,
      action:'Marquer comme retournés',
      fix:async()=>{
        const now2=new Date().toISOString();
        for(const l of orphanLoanBook){
          l.status='returned';l.validatedAt=now2;l.validatedBy='DIAG';
          await sbUpd('loans',l.id,{status:'returned',validatedAt:now2,validatedBy:'DIAG'}).catch(()=>{});
        }
      }
    });

    /* 3. Emprunts actifs pointant un membre inexistant */
    const orphanLoanUser=loans.filter(l=>(l.status==='active'||l.status==='pending'||l.status==='pending_return')&&!userById(l.userId));
    if(orphanLoanUser.length) anomalies.push({
      level:'critical',cat:'loans',
      title:'Emprunts actifs d\'un membre supprimé',
      desc:'Le userId de l\'emprunt ne correspond à aucun membre existant. Le livre est potentiellement bloqué.',
      count:orphanLoanUser.length,
      items:orphanLoanUser,
      action:'Clôturer ces emprunts',
      fix:async()=>{
        const now2=new Date().toISOString();
        for(const l of orphanLoanUser){
          l.status='returned';l.validatedAt=now2;l.validatedBy='DIAG';
          const b=bookById(l.bookId);
          if(b){b.status='available';b.borrowedBy=null;b.borrowedUntil=null;
            await sbUpd('books',l.bookId,{status:'available',borrowedBy:null,borrowedUntil:null}).catch(()=>{});}
          await sbUpd('loans',l.id,{status:'returned',validatedAt:now2,validatedBy:'DIAG'}).catch(()=>{});
        }
      }
    });

    /* 4. Exemplaires ≤ 0 */
    const zeroExpl=books.filter(b=>b.status!=='retired'&&(parseInt(b.expl)||parseInt(b.exemplaires)||1)<1);
    if(zeroExpl.length) anomalies.push({
      level:'critical',cat:'books',
      title:'Livres avec 0 exemplaire ou valeur invalide',
      desc:'Le nombre d\'exemplaires est 0 ou non défini. Cela bloque les emprunts même si le livre est disponible.',
      count:zeroExpl.length,items:zeroExpl,
      action:'Corriger à 1 exemplaire',
      fix:async()=>{
        for(const b of zeroExpl){
          b.expl=1;
          await sbUpd('books',b.id,{expl:1}).catch(()=>{});
        }
      }
    });

    /* 5. Emprunts en retard > 30 jours */
    const veryLate=loans.filter(l=>l.status==='active'&&l.dueDate&&daysAgo(l.dueDate+'T00:00:00')>30);
    if(veryLate.length) anomalies.push({
      level:'critical',cat:'loans',
      title:'Emprunts en retard de plus de 30 jours',
      desc:'Ces emprunts actifs dépassent leur date de retour de plus d\'un mois sans déclaration.',
      count:veryLate.length,items:veryLate,
    });

    /* 6. Livres sans localisation complète */
    const noLoc=books.filter(b=>b.status!=='retired'&&(!b.salle||!b.placard||!b.etagere));
    if(noLoc.length) anomalies.push({
      level:'warning',cat:'books',
      title:'Livres sans localisation complète',
      desc:'Salle, Placard ou Étagère manquant — le livre ne peut pas être retrouvé physiquement.',
      count:noLoc.length,items:noLoc,
    });

    /* 7. Demandes pending > 7 jours */
    const stalePending=loans.filter(l=>l.status==='pending'&&daysAgo(l.requestedAt)>7);
    if(stalePending.length) anomalies.push({
      level:'warning',cat:'loans',
      title:'Demandes d\'emprunt en attente depuis plus de 7 jours',
      desc:'Ces demandes n\'ont pas reçu de réponse. L\'emprunteur attend depuis plus d\'une semaine.',
      count:stalePending.length,items:stalePending,
    });

    /* 8. Retours pending_return > 48 h */
    const staleReturn=loans.filter(l=>l.status==='pending_return'&&daysAgo(l.returnedAt)>2);
    if(staleReturn.length) anomalies.push({
      level:'warning',cat:'loans',
      title:'Retours déclarés non validés depuis plus de 48 h',
      desc:'Le membre a déclaré le retour mais l\'administrateur n\'a pas confirmé. Le membre est bloqué.',
      count:staleReturn.length,items:staleReturn,
    });

    /* 9. Comptes expirés avec emprunts actifs */
    const expiredWithLoan=users.filter(u=>{
      if(!u.expiresAt||u.expiresAt>=today)return false;
      return loans.some(l=>String(l.userId)===String(u.id)&&l.status==='active');
    });
    if(expiredWithLoan.length) anomalies.push({
      level:'warning',cat:'members',
      title:'Comptes expirés avec un emprunt actif',
      desc:'Le compte a expiré mais un livre est toujours sorti. La récupération ne peut pas être automatique.',
      count:expiredWithLoan.length,items:expiredWithLoan,
    });

    /* 10. Membres avec loans_validator mais rôle non éligible */
    const badValidator=users.filter(u=>{
      const tabs=u.tabs||[];
      if(!tabs.includes('loans_validator'))return false;
      return u.role!=='resident'&&u.role!=='commission'&&u.role!=='admin';
    });
    if(badValidator.length) anomalies.push({
      level:'warning',cat:'members',
      title:'Validateurs d\'emprunt avec rôle non éligible',
      desc:'Ces membres ont l\'accès "Validateur d\'emprunts" mais leur rôle n\'est ni Résident ni Commission.',
      count:badValidator.length,items:badValidator,
    });

    /* 11. Session ouverte sans date de clôture */
    if(cfg.openAll&&!cfg.openUntil) anomalies.push({
      level:'info',cat:'sessions',
      title:'Session de demandes ouverte sans date de clôture',
      desc:'Les membres peuvent soumettre des demandes indéfiniment. Pensez à définir une date de fin.',
      count:1,
    });

    /* 12. Livres sans catégorie (≠ Général) */
    const noCat=books.filter(b=>b.status!=='retired'&&(!b.cat||b.cat==='Général'));
    if(noCat.length) anomalies.push({
      level:'info',cat:'books',
      title:'Livres sans catégorie précise',
      desc:'Ces livres ont la catégorie "Général" ou vide. Ils apparaissent mal classés dans les filtres.',
      count:noCat.length,items:noCat,
    });

    /* 13. Membres dont le compte expire dans 15 jours */
    const expiringSoon=users.filter(u=>{
      if(!u.expiresAt||u.disabled)return false;
      const d=Math.ceil((new Date(u.expiresAt)-now)/(86400*1000));
      return d>=0&&d<=15;
    });
    if(expiringSoon.length) anomalies.push({
      level:'info',cat:'members',
      title:'Comptes expirant dans les 15 prochains jours',
      desc:'Ces comptes vont expirer bientôt. Sans renouvellement, ils seront désactivés à la prochaine connexion.',
      count:expiringSoon.length,items:expiringSoon,
    });

    /* 14. Livres "available" avec emprunts actifs > nombre d'exemplaires */
    const overLoan=books.filter(b=>{
      if(b.status==='retired')return false;
      const active=loans.filter(l=>String(l.bookId)===String(b.id)&&(l.status==='active'||l.status==='pending_return')).length;
      const copies=Math.max(1,parseInt(b.expl)||parseInt(b.exemplaires)||1);
      return active>copies;
    });
    if(overLoan.length) anomalies.push({
      level:'critical',cat:'books',
      title:'Livres avec plus d\'emprunts actifs que d\'exemplaires',
      desc:'Le nombre d\'emprunts actifs dépasse le nombre d\'exemplaires disponibles. Incohérence critique.',
      count:overLoan.length,items:overLoan,
    });

    /* 15. Livres signalés introuvables depuis plus de 30 jours */
    const longMissing=books.filter(b=>{
      if(b.status!=='missing'||!b.missingAt)return false;
      return Math.floor((now-new Date(b.missingAt))/(86400*1000))>30;
    });
    if(longMissing.length) anomalies.push({
      level:'critical',cat:'books',
      title:'Livres introuvables depuis plus de 30 jours',
      desc:'Ces livres sont signalés introuvables depuis plus d\'un mois sans avoir été retrouvés. Ils sont peut-être perdus ou volés.',
      count:longMissing.length,items:longMissing,
    });

    /* 16. Livres introuvables (tous) */
    const allMissing=books.filter(b=>b.status==='missing'&&!longMissing.includes(b));
    if(allMissing.length) anomalies.push({
      level:'warning',cat:'books',
      title:'Livres signalés introuvables à leur emplacement',
      desc:'Ces livres sont introuvables. Vérifiez les étagères voisines ou consultez les derniers emprunteurs.',
      count:allMissing.length,items:allMissing,
      action:'Corriger le statut',
      fix:async()=>{
        if(!confirm('Remettre ces '+allMissing.length+' livre(s) en "Disponible" ?\nN\'utilisez cette correction que si les livres ont effectivement été retrouvés.'))return;
        for(const b of allMissing){
          b.status='available';b.missingAt=null;b.missingNote=null;
          await sbUpd('books',b.id,{status:'available'}).catch(()=>{});
        }
      }
    });

    /* ── Rendu ────────────────────────────────────────────── */
    _renderDiag(anomalies,'all');
    /* Mettre à jour le badge dans l'onglet */
    const critCount=anomalies.filter(a=>a.level==='critical').length;
    const badge=document.getElementById('diag-badge');
    if(badge){badge.style.display=critCount>0?'inline':'none';badge.textContent=critCount;}
    /* Timestamp */
    const lastEl=document.getElementById('diag-last-run');
    if(lastEl)lastEl.textContent='Analysé le '+new Date().toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'});
  }catch(e){
    console.error('[Diag]',e);
    const listEl=document.getElementById('diag-list');
    if(listEl)listEl.innerHTML=html`<div style="padding:24px;color:#dc2626">Erreur lors de l'analyse : ${e.message}</div>`;
  }finally{
    if(btn){btn.disabled=false;btn.textContent='▶ Relancer l\'analyse';}
  }
}

/* ── Rendu du tableau de diagnostic ── */
let _diagAnomCache=[];
function _renderDiag(anomalies,filter){
  _diagAnomCache=anomalies;
  _diagFilter=filter;
  const criticals=anomalies.filter(a=>a.level==='critical');
  const warnings=anomalies.filter(a=>a.level==='warning');
  const infos=anomalies.filter(a=>a.level==='info');
  const total=anomalies.length;
  const score=total===0?100:Math.max(0,Math.round(100-(criticals.length*15)-(warnings.length*5)-(infos.length*2)));

  /* KPIs */
  const kpiEl=document.getElementById('diag-kpis');
  if(kpiEl) kpiEl.innerHTML=[
    {v:criticals.length,l:'Critiques',c:'#dc2626',bg:'#fee2e2'},
    {v:warnings.length,l:'Avertissements',c:'#d97706',bg:'#fef3c7'},
    {v:infos.length,l:'Informations',c:'#2563eb',bg:'#eff6ff'},
    {v:score+'%',l:'Score santé',c:score>=90?'#16a34a':score>=70?'#d97706':'#dc2626',bg:score>=90?'#dcfce7':score>=70?'#fef3c7':'#fee2e2'},
  ].map(k=>html`<div style="background:${k.bg};border-radius:10px;padding:14px 16px">
    <div style="font-size:26px;font-weight:500;color:${k.c};line-height:1.1;margin-bottom:4px">${k.v}</div>
    <div style="font-size:12px;color:${k.c};opacity:.75">${k.l}</div>
  </div>`).join('');

  /* Filtres */
  const cats=[
    {id:'all',label:'Tout ('+total+')'},
    {id:'critical',label:'Critiques ('+criticals.length+')'},
    {id:'books',label:'Livres'},
    {id:'loans',label:'Emprunts'},
    {id:'members',label:'Membres'},
    {id:'sessions',label:'Sessions'},
  ];
  const filtersEl=document.getElementById('diag-filters');
  if(filtersEl) filtersEl.innerHTML=cats.map(c=>html`
    <button type="button" onclick="_applyDiagFilter('${c.id}')"
      style="padding:5px 12px;border-radius:20px;font-size:12px;border:0.5px solid var(--g200);
        background:${_diagFilter===c.id?'var(--navy)':'white'};
        color:${_diagFilter===c.id?'white':'var(--g600)'};
        cursor:pointer;font-family:inherit;transition:all .15s">
      ${c.label}
    </button>`).join('');

  /* Liste */
  let list=anomalies;
  if(filter==='critical')list=criticals;
  else if(filter!=='all')list=anomalies.filter(a=>a.cat===filter);

  const listEl=document.getElementById('diag-list');
  if(!listEl)return;
  if(!list.length){
    listEl.innerHTML=total===0
      ?`<div style="text-align:center;padding:48px;color:var(--g400)">
          <div style="font-size:32px;margin-bottom:12px">✅</div>
          <div style="font-size:15px;font-weight:500;color:var(--green);margin-bottom:4px">Aucune anomalie détectée !</div>
          <div style="font-size:13px">Vos données sont cohérentes.</div>
        </div>`
      :`<div style="text-align:center;padding:28px;color:var(--g400);font-size:13px">Aucune anomalie pour ce filtre.</div>`;
    return;
  }

  /* Légende */
  const levColors={critical:{bg:'#fee2e2',border:'#dc2626',text:'#991b1b',icon:'!'},
    warning:{bg:'#fef3c7',border:'#d97706',text:'#92400e',icon:'▲'},
    info:{bg:'#eff6ff',border:'#2563eb',text:'#1e40af',icon:'i'}};

  listEl.innerHTML=list.map((a,idx)=>{
    const lc=levColors[a.level];
    const hasItems=a.items&&a.items.length>0;
    const detailId=`diag-detail-${idx}`;
    const fixBtn=a.fix?`<button type="button" onclick="_fixDiagItem(${idx})"
      style="margin-top:8px;padding:5px 12px;border-radius:6px;border:1px solid ${lc.border};
        background:white;color:${lc.text};font-size:12px;font-weight:600;cursor:pointer;font-family:inherit">
      ✓ ${a.action||'Corriger'}
    </button>`:'';
    const detailBtn=hasItems?`<button type="button" onclick="toggleDiagDetail('${detailId}')"
      style="margin-top:8px;margin-left:${a.fix?'8px':'0'};padding:5px 12px;border-radius:6px;
        border:0.5px solid var(--g200);background:white;color:var(--g600);font-size:12px;cursor:pointer;font-family:inherit">
      Voir les éléments ▾
    </button>`:'';
    const preview=hasItems?`<div id="${detailId}" style="display:none;margin-top:10px;background:rgba(0,0,0,.03);border-radius:8px;padding:10px 12px;font-size:12px;color:var(--g600);max-height:180px;overflow-y:auto">
      ${a.items.slice(0,20).map(it=>it.titre||it.prenom&&(it.prenom+' '+it.nom)||it.bookTitle||it.id||'—').map(s=>html`<div style="padding:3px 0;border-bottom:0.5px solid var(--g100)">${s}</div>`).join('')}
      ${a.items.length>20?`<div style="padding:4px 0;color:var(--g400)">… et ${a.items.length-20} autre(s)</div>`:''}
    </div>`:'';
    return html`<div style="background:white;border:0.5px solid var(--g200);border-left:3px solid ${lc.border};
        border-radius:0 10px 10px 0;padding:14px 16px;display:flex;align-items:flex-start;gap:12px">
      <div style="width:30px;height:30px;border-radius:8px;background:${lc.bg};color:${lc.text};
        display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;flex-shrink:0">${lc.icon}</div>
      <div style="flex:1;min-width:0">
        <div style="font-size:14px;font-weight:500;color:var(--navy);margin-bottom:3px">${a.title}</div>
        <div style="font-size:12px;color:var(--g500);line-height:1.5">${a.desc}</div>
        <div style="margin-top:6px">${safe(fixBtn)}${safe(detailBtn)}</div>
        ${safe(preview)}
      </div>
      <div style="background:${lc.bg};color:${lc.text};font-size:12px;font-weight:600;
        padding:3px 10px;border-radius:20px;flex-shrink:0;white-space:nowrap">${a.count} élément${a.count>1?'s':''}</div>
    </div>`;
  }).join('');
}

function _applyDiagFilter(f){_renderDiag(_diagAnomCache,f);}

function toggleDiagDetail(id){
  const el=document.getElementById(id);
  if(!el)return;
  const hidden=el.style.display==='none';
  el.style.display=hidden?'block':'none';
  const btn=el.previousElementSibling?.querySelector('[onclick*="toggleDiagDetail"]')||
    el.parentElement.querySelector('[onclick*="toggleDiagDetail"]');
  if(btn)btn.textContent=hidden?'Masquer ▴':'Voir les éléments ▾';
}

async function _fixDiagItem(idx){
  const a=_diagAnomCache[idx];
  if(!a||!a.fix)return;
  if(!confirm('Appliquer la correction automatique pour "'+a.title+'" ?\n\nCette action modifie les données Supabase et est irréversible.'))return;
  try{
    const btn=document.querySelector(`[onclick="_fixDiagItem(${idx})"]`);
    if(btn){btn.disabled=true;btn.textContent='⏳ Correction…';}
    await a.fix();
    alert('Correction appliquée. Relancez l\'analyse pour vérifier.');
    runDiag();
  }catch(e){alert('Erreur lors de la correction : '+e.message);}
}

/* ═══════════════════════════════════════════════════════════════
   CATALOGUE PUBLIC — Sans connexion, livres académiques uniquement
═══════════════════════════════════════════════════════════════ */
let _pubBooks=[],_pubPage=1,_pubContactData=null,_pubMeeting=null;

/* ── Inscription publique : ouvrir le formulaire ── */
function openPubRegister(){
  const old=document.getElementById('_pub_reg_modal');if(old)old.remove();
  const ov=document.createElement('div');
  ov.id='_pub_reg_modal';
  ov.style.cssText='position:fixed;inset:0;background:rgba(15,23,42,.55);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px;overflow-y:auto';
  ov.onclick=e=>{if(e.target===ov)ov.remove();};
  ov.innerHTML=html`<div style="background:white;border-radius:16px;width:100%;max-width:440px;max-height:94vh;overflow-y:auto;box-shadow:0 24px 64px rgba(0,0,0,.25)">
    <div style="background:#1c4370;color:white;padding:22px 20px;border-radius:16px 16px 0 0">
      <div style="font-size:18px;font-weight:700;margin-bottom:4px">✍️ Demande d'inscription</div>
      <div style="font-size:13px;opacity:.85">Remplissez ce formulaire pour rejoindre la bibliothèque</div>
    </div>
    <div style="padding:20px" id="_pub_reg_body">
      <div class="fg"><label class="ld">Prénom <span style="color:#dc2626">*</span></label><input class="fi" id="reg-prenom" autocomplete="given-name"/></div>
      <div class="fg"><label class="ld">Nom <span style="color:#dc2626">*</span></label><input class="fi" id="reg-nom" autocomplete="family-name"/></div>
      <div class="fg"><label class="ld">Numéro WhatsApp <span style="color:#dc2626">*</span></label>
        <div style="display:flex;align-items:center;gap:6px">
          ${safe((_pubMeeting?.countryCode)?`<span style="background:var(--g100);border:1px solid var(--g200);border-radius:8px;padding:10px 10px;font-size:13px;font-weight:600;color:var(--g600);white-space:nowrap">${esc(_pubMeeting.countryCode)}</span>`:'')}

          <input class="fi" id="reg-whatsapp" type="tel" placeholder="${(_pubMeeting?.countryCode)?'07 00 00 00 00':'+225 07 00 00 00 00'}" style="flex:1"
            onfocus="if(!this.value&&'${_pubMeeting?.countryCode||''}')this.value='${_pubMeeting?.countryCode||''} '" />
        </div>
      </div>
      <div class="fg"><label class="ld">Commune <span style="color:#dc2626">*</span></label><input class="fi" id="reg-commune" placeholder="Ex : Cocody"/></div>
      <div class="fg"><label class="ld">Profession</label><input class="fi" id="reg-profession" placeholder="Ex : Étudiant en Math"/></div>
      <div class="fg"><label class="ld">Email <span style="color:#dc2626">*</span></label><input class="fi" id="reg-email" type="email" placeholder="vous@exemple.com" autocomplete="email"/>
        <p style="font-size:11px;color:var(--g400);margin-top:4px">Servira à créer votre compte (mot de passe à définir après validation).</p></div>
      <p id="reg-err" style="color:#dc2626;font-size:13px;margin-top:8px;min-height:16px"></p>
      ${safe((_pubMeeting&&(_pubMeeting.place||_pubMeeting.time))?`
      <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:10px;padding:12px 14px;margin-top:4px">
        <div style="font-size:12px;font-weight:600;color:#92400e;margin-bottom:6px">📌 Pour finaliser votre inscription</div>
        ${_pubMeeting.place?`<div style="font-size:12px;color:#78350f;margin-bottom:3px">📍 ${esc(_pubMeeting.place)}</div>`:''}
        ${_pubMeeting.time?`<div style="font-size:12px;color:#78350f">🕒 ${esc(_pubMeeting.time)}</div>`:''}
      </div>`:'')}
    </div>
    <div style="padding:0 20px 20px;display:flex;gap:10px">
      <button type="button" onclick="document.getElementById('_pub_reg_modal').remove()" style="flex:1;padding:12px;border:1.5px solid #e2e8f0;background:white;border-radius:10px;font-size:14px;font-family:inherit;cursor:pointer;color:#475569">Annuler</button>
      <button type="button" id="reg-submit-btn" onclick="submitPubRegister()" style="flex:2;padding:12px;border:none;background:#22c55e;color:white;border-radius:10px;font-size:14px;font-weight:600;font-family:inherit;cursor:pointer">Envoyer ma demande</button>
    </div>
  </div>`;
  document.body.appendChild(ov);
}

async function submitPubRegister(){
  const val=id=>document.getElementById(id)?.value.trim()||'';
  const prenom=val('reg-prenom'),nom=val('reg-nom'),whatsapp=val('reg-whatsapp'),
        commune=val('reg-commune'),profession=val('reg-profession'),email=val('reg-email');
  const err=document.getElementById('reg-err');
  if(!prenom||!nom||!whatsapp||!commune||!email){err.textContent='Les champs marqués * sont obligatoires.';return;}
  if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)){err.textContent='Veuillez saisir une adresse e-mail valide (elle servira à créer votre compte).';return;}
  const btn=document.getElementById('reg-submit-btn');
  if(btn){btn.disabled=true;btn.textContent='Envoi en cours…';btn.style.opacity='.6';}
  _initSb();
  const regId='reg_'+Date.now();
  const entry={id:regId,space_code:SPACE_ID,prenom,nom,whatsapp,commune,profession,email:email.toLowerCase(),
    status:'pending',submittedAt:new Date().toISOString()};
  try{
    /* insert (et non upsert) : chaque inscription a un id unique (reg_<timestamp>).
       L'upsert exigerait une policy UPDATE côté anon → violerait la RLS. */
    const {error}=await sb.from('registrations').insert(entry);
    if(error)throw new Error(error.message);
    _showRegSuccess(prenom);
  }catch(e){
    if(err)err.textContent='Erreur lors de l\'envoi : '+e.message;
    if(btn){btn.disabled=false;btn.textContent='Envoyer ma demande';btn.style.opacity='1';}
  }
}

function _showRegSuccess(prenom){
  const modal=document.getElementById('_pub_reg_modal');
  if(!modal)return;
  const place=_pubMeeting?.place||'';
  const time=_pubMeeting?.time||'';
  const card=modal.querySelector('div');
  card.innerHTML=html`
    <div style="padding:32px 24px;text-align:center">
      <div style="width:64px;height:64px;border-radius:50%;background:#dcfce7;display:flex;align-items:center;justify-content:center;font-size:32px;margin:0 auto 16px">✅</div>
      <div style="font-size:19px;font-weight:700;color:#1e293b;margin-bottom:8px">Demande envoyée, ${prenom} !</div>
      <div style="font-size:14px;color:#475569;line-height:1.6;margin-bottom:20px">Votre demande d'inscription a bien été enregistrée. Pour finaliser votre inscription, présentez-vous auprès de l'administrateur :</div>
      <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:16px;text-align:left;margin-bottom:20px">
        ${safe(place?`<div style="display:flex;gap:10px;margin-bottom:10px"><span style="font-size:18px">📍</span><div><div style="font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:.5px">Lieu</div><div style="font-size:14px;color:#1e293b;font-weight:500">${esc(place)}</div></div></div>`:'')}
        ${safe(time?`<div style="display:flex;gap:10px"><span style="font-size:18px">🕒</span><div><div style="font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:.5px">Disponibilité</div><div style="font-size:14px;color:#1e293b;font-weight:500">${esc(time)}</div></div></div>`:'')}
        ${safe(!place&&!time?'<div style="font-size:13px;color:#64748b;text-align:center">Contactez la bibliothèque pour finaliser votre inscription.</div>':'')}
      </div>
      <button type="button" onclick="document.getElementById('_pub_reg_modal').remove()" style="width:100%;padding:12px;border:none;background:#1c4370;color:white;border-radius:10px;font-size:14px;font-weight:600;font-family:inherit;cursor:pointer">Compris, merci</button>
    </div>`;
}
const PUB_PER_PAGE=24;

async function _loadPubCat(){
  const grid=document.getElementById('pub-cgrid');
  const cntEl=document.getElementById('pub-bkc');

  _initSb();
  if(!SPACE_ID){if(grid)grid.innerHTML='<div style="grid-column:1/-1;text-align:center;padding:48px;color:var(--g400)">Code de bibliothèque introuvable dans l\'URL.</div>';return;}

  /* Lire les livres depuis Supabase */
  let data=[];
  try{
    data=await sbGetAll('books');
  }catch(e){
    console.warn('[PubCat] Lecture livres échouée:',e.message);
    let msg='';let detail='';
    if(e.message.includes('UNAUTHENTICATED')||e.message.includes('401')){
      msg='Accès non autorisé';
      detail='Accès refusé par les règles RLS de Supabase.<br>Vérifiez que la politique <code>allow_all</code> est bien activée sur la table <code>books</code>.';
    }else if(e.message.includes('PERMISSION_DENIED')||e.message.includes('403')){
      msg='Permission refusée';
      detail='Les règles RLS Supabase bloquent l\'accès public au catalogue.<br>Vérifiez la politique <code>allow_all</code> sur la table <code>books</code>.';
    }else if(e.message.includes('fetch')||e.message.includes('network')||e.message.includes('Failed')){
      msg='Erreur réseau';
      detail='Vérifiez votre connexion internet.';
    }else{
      msg='Erreur de chargement';
      detail=e.message;
    }
    if(grid)grid.innerHTML=html`<div style="grid-column:1/-1;text-align:center;padding:48px 20px">
      <div style="font-size:32px;margin-bottom:12px">⚠️</div>
      <div style="font-size:15px;font-weight:600;color:var(--navy);margin-bottom:8px">${msg}</div>
      <div style="font-size:13px;color:var(--g500);line-height:1.6;max-width:400px;margin:0 auto">${detail}</div>
    </div>`;
    return;
  }

  /* Filtrer : académiques uniquement, disponibles ou empruntés */
  _pubBooks=data.filter(b=>b.status!=='retired'&&b.status!=='missing'&&(b.catType||'academique')==='academique');

  if(!_pubBooks.length){
    if(cntEl)cntEl.textContent='0';
    if(grid)grid.innerHTML='<div style="grid-column:1/-1;text-align:center;padding:48px 16px;color:var(--g400)"><div style="font-size:32px;margin-bottom:12px">📭</div><div>Le catalogue est vide pour l\'instant.</div></div>';
    return;
  }

  /* Peupler la datalist catégories */
  const cats=[...new Set(_pubBooks.map(b=>b.cat).filter(Boolean))].sort();
  const dl=document.getElementById('pub-dl-cat');
  if(dl)dl.innerHTML=cats.map(c=>html`<option value="${c}"></option>`).join('');

  /* Mettre à jour les liens Se connecter */
  const loginUrl=window.location.href.replace('/book/'+SPACE_ID,'/'+SPACE_ID);
  document.querySelectorAll('.pub-login-link').forEach(el=>{
    el.href=loginUrl;
    el.onclick=e=>{e.preventDefault();window.location.href=loginUrl;};
  });

  rPubCat();
}

function rPubCat(){
  const ft=(document.getElementById('pub-ft')?.value||'').toLowerCase();
  const fc=(document.getElementById('pub-fc')?.value||'');
  let list=_pubBooks.filter(b=>{
    if(ft&&!b.titre?.toLowerCase().includes(ft)&&!b.auteur?.toLowerCase().includes(ft))return false;
    if(fc&&b.cat!==fc)return false; /* exact match car select */
    return true;
  }).sort((a,b)=>(a.titre||'').localeCompare(b.titre||''));
  const cntEl=document.getElementById('pub-bkc');
  if(cntEl)cntEl.textContent=list.length;
  const total=list.length,pages=Math.max(1,Math.ceil(total/PUB_PER_PAGE));
  if(_pubPage>pages)_pubPage=pages;
  if(_pubPage<1)_pubPage=1;
  const page=list.slice((_pubPage-1)*PUB_PER_PAGE,_pubPage*PUB_PER_PAGE);
  const grid=document.getElementById('pub-cgrid');
  if(!grid)return;
  if(!page.length){
    grid.innerHTML='<div style="grid-column:1/-1;text-align:center;padding:48px;color:var(--g400)">Aucun livre trouvé pour ces critères.</div>';
    const pgnE=document.getElementById('pub-pgn');if(pgnE)pgnE.innerHTML='';
    return;
  }
  grid.innerHTML=page.map(b=>{
    const avail=b.status==='available';
    return html`<div class="bc" onclick="showPubDet(${b.id})" style="cursor:pointer;${!avail?'opacity:.75':''}">
      <div class="bcv" style="background:${cg(b.cat)}">${b.emoji||'📖'}</div>
      <div class="bi">
        <div class="btt" title="${b.titre}">${b.titre}</div>
        <div class="bau">${b.auteur||'—'}</div>
        <div style="display:flex;gap:5px;margin-top:6px;flex-wrap:wrap">
          <span style="font-size:11px;background:var(--g100);color:var(--g500);padding:2px 7px;border-radius:10px">${b.cat||'Général'}</span>
          ${safe(!avail?`<span style="font-size:11px;background:#ede9fe;color:#7c3aed;padding:2px 7px;border-radius:10px">📖 Emprunté</span>`:
          `<span style="font-size:11px;background:#dcfce7;color:#16a34a;padding:2px 7px;border-radius:10px">✅ Disponible</span>`)}
        </div>
      </div>
    </div>`;
  }).join('');
  /* Pagination en bas */
  const pgn=document.getElementById('pub-pgn');
  if(pgn&&pages>1){
    const cur=_pubPage;
    let btns=[];
    btns.push(`<button type="button" class="pgn-btn" ${cur===1?'disabled style="opacity:.4"':''} onclick="_pubGoPage(${cur-1})">‹</button>`);
    for(let i=1;i<=pages;i++){
      if(i===1||i===pages||Math.abs(i-cur)<=1)
        btns.push(`<button type="button" class="pgn-btn ${i===cur?'active':''}" onclick="_pubGoPage(${i})">${i}</button>`);
      else if(btns[btns.length-1]!=='<span class="pgn-ell">…</span>')btns.push('<span class="pgn-ell">…</span>');
    }
    btns.push(`<button type="button" class="pgn-btn" ${cur===pages?'disabled style="opacity:.4"':''} onclick="_pubGoPage(${cur+1})">›</button>`);
    pgn.innerHTML=btns.join('');
  }else if(pgn){pgn.innerHTML='';}
}

/* Changer de page et remonter en haut de la grille */
function _pubGoPage(n){
  _pubPage=n;
  rPubCat();
  const grid=document.getElementById('pub-cgrid');
  if(grid)grid.scrollIntoView({behavior:'smooth',block:'start'});
}

/* ── Filtre barre publique redesignée ── */
function _renderPubFilters(){
  const cats=[...new Set(_pubBooks.map(b=>b.cat).filter(Boolean))].sort((a,b)=>a.localeCompare(b));
  const wrap=document.getElementById('pub-filters-wrap');
  if(!wrap)return;
  const focusSty="this.style.borderColor='#1c4370';this.style.boxShadow='0 0 0 3px rgba(28,67,112,.08)'";
  const blurSty="this.style.borderColor='#e8edf2';this.style.boxShadow='none'";
  const base="width:100%;box-sizing:border-box;height:46px;border:1.5px solid #e8edf2;border-radius:12px;font-size:14px;font-family:inherit;background:white;color:#1e293b;outline:none;transition:border-color .15s,box-shadow .15s";
  wrap.innerHTML=`
    <div style="padding:10px 16px 14px">
      <!-- Filtres côte à côte -->
      <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center">
        <!-- Recherche -->
        <div style="position:relative;flex:2;min-width:180px">
          <svg style="position:absolute;left:14px;top:50%;transform:translateY(-50%);width:17px;height:17px;stroke:#94a3b8;fill:none;pointer-events:none" viewBox="0 0 24 24" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="11" cy="11" r="7"/><path d="m21 21-4.35-4.35"/>
          </svg>
          <input id="pub-ft" type="text" placeholder="Titre, auteur\u2026" oninput="_pubPage=1;rPubCat()"
            style="${base};padding:0 14px 0 42px"
            onfocus="${focusSty}" onblur="${blurSty}"/>
        </div>
        <!-- Catégorie -->
        <div style="position:relative;flex:1;min-width:150px">
          <svg style="position:absolute;left:12px;top:50%;transform:translateY(-50%);width:16px;height:16px;stroke:#94a3b8;fill:none;pointer-events:none" viewBox="0 0 24 24" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>
          </svg>
          <select id="pub-fc" onchange="_pubPage=1;rPubCat()"
            style="${base};padding:0 32px 0 36px;-webkit-appearance:none;appearance:none;cursor:pointer"
            onfocus="${focusSty}" onblur="${blurSty}">
            <option value="">Toutes catégories</option>
            ${cats.map(c=>html`<option value="${c}">${c}</option>`).join('')}
          </select>
          <svg style="position:absolute;right:10px;top:50%;transform:translateY(-50%);width:13px;height:13px;stroke:#94a3b8;fill:none;pointer-events:none" viewBox="0 0 24 24" stroke-width="2.5" stroke-linecap="round">
            <path d="M6 9l6 6 6-6"/>
          </svg>
        </div>
      </div>
      <!-- Compteur -->
      <div style="font-size:13px;color:#64748b;margin-top:10px"><b id="pub-bkc" style="color:#1c4370;font-weight:600">${_pubBooks.length}</b> livre(s) au catalogue</div>
    </div>`;
}

/* Afficher le contact de l'administrateur sur la page publique (sous la grille) */
function _renderPubContact(number,name){
  if(!number)return;
  const existing=document.getElementById('pub-contact-banner');
  if(existing)existing.remove();
  const clean=number.replace(/[^0-9+]/g,'');
  const banner=document.createElement('div');
  banner.id='pub-contact-banner';
  banner.style.cssText='margin:8px 16px 32px;padding:18px;background:linear-gradient(135deg,#eff6ff,#f0f9ff);border:1px solid #bfdbfe;border-radius:14px;display:flex;align-items:center;gap:14px;flex-wrap:wrap';
  banner.innerHTML=`
    <div style="width:46px;height:46px;border-radius:12px;background:#0ea5e9;display:flex;align-items:center;justify-content:center;font-size:22px;flex-shrink:0">💬</div>
    <div style="flex:1;min-width:160px">
      <div style="font-size:15px;font-weight:700;color:#0c4a6e;margin-bottom:2px">Besoin de plus d'informations ?</div>
      <div style="font-size:13px;color:#0369a1">${name?'<strong>'+esc(name)+'</strong> · ':''}Contactez sur WhatsApp</div>
    </div>
    <a href="https://wa.me/${esc(clean.replace(/^\+/,''))}" target="_blank" style="background:#22c55e;color:white;text-decoration:none;padding:11px 18px;border-radius:10px;font-size:14px;font-weight:600;white-space:nowrap;flex-shrink:0">📱 Contactez sur WhatsApp</a>`;
  /* Insérer APRÈS la pagination (en bas de page) */
  const pgn=document.getElementById('pub-pgn');
  if(pgn&&pgn.parentNode){
    pgn.parentNode.insertBefore(banner,pgn.nextSibling);
  }else{
    const grid=document.getElementById('pub-cgrid');
    if(grid&&grid.parentNode)grid.parentNode.insertBefore(banner,grid.nextSibling);
  }
}

function showPubDet(id){
  const b=_pubBooks.find(x=>x.id==id);if(!b)return;
  const avail=b.status==='available';
  const old=document.getElementById('_pub_modal');if(old)old.remove();
  const ov=document.createElement('div');
  ov.id='_pub_modal';
  ov.style.cssText='position:fixed;inset:0;background:rgba(15,23,42,.55);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px';
  ov.onclick=e=>{if(e.target===ov)ov.remove();};
  ov.innerHTML=html`<div style="background:white;border-radius:16px;width:100%;max-width:440px;overflow:hidden;box-shadow:0 24px 64px rgba(0,0,0,.25)">
    <!-- En-tête -->
    <div style="background:${cg(b.cat)||'#eff6ff'};padding:28px 20px 22px;text-align:center;position:relative">
      <button onclick="document.getElementById('_pub_modal').remove()" style="position:absolute;top:12px;right:12px;background:rgba(0,0,0,.12);border:none;border-radius:50%;width:28px;height:28px;cursor:pointer;font-size:15px;color:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;font-family:inherit">✕</button>
      <div style="font-size:44px;margin-bottom:10px">${b.emoji||'📖'}</div>
      <div style="font-size:17px;font-weight:700;color:#ffffff;line-height:1.3;margin-bottom:4px;text-shadow:0 1px 3px rgba(0,0,0,.35)">${b.titre}</div>
      <div style="font-size:13px;color:rgba(255,255,255,.85)">✍️ ${b.auteur||'—'}</div>
    </div>
    <!-- Infos -->
    <div style="padding:18px 20px 22px">
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:18px;justify-content:center">
        ${safe(b.cat?`<span style="background:#f1f5f9;color:#475569;font-size:12px;padding:5px 12px;border-radius:20px;font-weight:500">📂 ${esc(b.cat)}</span>`:'')}
        ${safe(b.lang?`<span style="background:#f1f5f9;color:#475569;font-size:12px;padding:5px 12px;border-radius:20px;font-weight:500">🌐 ${esc(b.lang)}</span>`:'')}
        ${safe(avail
          ?'<span style="background:#dcfce7;color:#16a34a;font-size:12px;padding:5px 12px;border-radius:20px;font-weight:600">✅ Disponible</span>'
          :'<span style="background:#ede9fe;color:#7c3aed;font-size:12px;padding:5px 12px;border-radius:20px;font-weight:600">📖 Emprunté</span>')}
      </div>
      <!-- Message consultation uniquement -->
      <div style="background:#fef9c3;border:1px solid #fde68a;border-radius:10px;padding:12px 14px;text-align:center;font-size:13px;color:#92400e">
        📍 Ce livre est consultable <strong>sur place uniquement</strong>.
      </div>
    </div>
  </div>`;
  document.body.appendChild(ov);
}

/* ═══════════════════════════════════════════════════════════════
   PROFIL MEMBRE — Modification des infos personnelles
═══════════════════════════════════════════════════════════════ */
let _profilePhotoB64=null;

function openMyProfile(){
  if(!curUser)return;
  const isResident=curUser.role==='resident';
  /* Remplir champs communs */
  const setVal=(id,v)=>{const el=document.getElementById(id);if(el)el.value=v||'';};
  setVal('pf-whatsapp',curUser.whatsapp);
  setVal('pf-commune',curUser.commune);
  setVal('pf-profession',curUser.profession);
  /* Champs résident */
  const resFields=document.getElementById('profile-resident-fields');
  if(resFields)resFields.style.display=isResident?'block':'none';
  if(isResident){
    setVal('pf-prenom',curUser.prenom);
    setVal('pf-nom',curUser.nom);
    setVal('pf-email',curUser.email);
  }
  /* Avatar */
  _profilePhotoB64=curUser.photoB64||null;
  _renderProfileAvatar();
  document.getElementById('pf-err').textContent='';
  openM('m-profile');
}

function _renderProfileAvatar(){
  const txt=document.getElementById('profile-avatar-txt');
  const img=document.getElementById('profile-avatar-img');
  const initials=((curUser?.prenom||'')[0]||'')+(( curUser?.nom||'')[0]||'');
  if(_profilePhotoB64){
    if(img){img.src=_profilePhotoB64;img.style.display='block';}
    if(txt)txt.style.display='none';
  }else{
    if(img)img.style.display='none';
    if(txt){txt.style.display='';txt.textContent=initials.toUpperCase()||'?';}
  }
}

function handleProfilePhoto(input){
  const file=input.files[0];if(!file)return;
  if(!file.type.startsWith('image/')){alert('Veuillez sélectionner une image.');return;}
  if(file.size>8*1024*1024){alert('Image trop volumineuse (max 8 Mo).');return;}
  const reader=new FileReader();
  reader.onload=e=>{
    /* Redimensionner/compresser en JPEG 256px pour éviter de stocker des photos lourdes */
    const img=new Image();
    img.onload=()=>{
      const max=256,scale=Math.min(1,max/Math.max(img.width,img.height));
      const w=Math.round(img.width*scale),h=Math.round(img.height*scale);
      const c=document.createElement('canvas');c.width=w;c.height=h;
      const ctx=c.getContext('2d');
      if(!ctx){_profilePhotoB64=e.target.result;_renderProfileAvatar();return;}
      ctx.drawImage(img,0,0,w,h);
      _profilePhotoB64=c.toDataURL('image/jpeg',0.8);
      _renderProfileAvatar();
    };
    img.onerror=()=>alert('Image illisible.');
    img.src=e.target.result;
  };
  reader.readAsDataURL(file);
}

async function saveMyProfile(){
  if(!curUser)return;
  const errEl=document.getElementById('pf-err');
  const isResident=curUser.role==='resident';
  const updates={
    whatsapp:document.getElementById('pf-whatsapp')?.value.trim()||null,
    commune:document.getElementById('pf-commune')?.value.trim()||null,
    profession:document.getElementById('pf-profession')?.value.trim()||null,
    photoB64:_profilePhotoB64||null,
  };
  if(isResident){
    const prenom=document.getElementById('pf-prenom')?.value.trim();
    const nom=document.getElementById('pf-nom')?.value.trim();
    if(!prenom||!nom){errEl.textContent='Prénom et nom obligatoires.';return;}
    updates.prenom=prenom;
    updates.nom=nom;
    updates.email=document.getElementById('pf-email')?.value.trim()||null;
  }
  /* Nettoyer les valeurs null */
  Object.keys(updates).forEach(k=>{if(updates[k]===null)delete updates[k];});
  try{
    await sbUpd('users',curUser.id,updates);
    Object.assign(curUser,updates);
    _cachePut({users});
    /* Mettre à jour l'affichage du nom dans la nav */
    const n0=document.getElementById('n0');if(n0)n0.textContent=curUser.abbrev||'—';
    cM('m-profile');
    _showSyncToast('✅ Profil mis à jour');
  }catch(e){errEl.textContent='Erreur : '+e.message;}
}

function rLoginLog(){
  const tb=document.getElementById('log-tb');if(!tb)return;
  /* Chargement à la demande — loginLog non chargé au démarrage pour économiser le quota */
  if(!loginLog.length){
    tb.innerHTML='<tr><td colspan="7" style="text-align:center;padding:36px;color:var(--g400)">⏳ Chargement du journal…</td></tr>';
    sbGetAll('loginLog').then(logD=>{
      loginLog=logD.sort((a,b)=>(b.id||0)-(a.id||0)).slice(0,300);
      _rLoginLogRender();
    }).catch(e=>{tb.innerHTML=html`<tr><td colspan="7" style="color:#dc2626;padding:16px">Erreur : ${e.message}</td></tr>`;});
    return;
  }
  _rLoginLogRender();
}
function _rLoginLogRender(){
  const tb=document.getElementById('log-tb');if(!tb)return;
  const lg_cnt=document.getElementById('log-count');if(lg_cnt)lg_cnt.textContent=loginLog.length+' connexion(s) enregistrée(s)';
  if(!loginLog.length){tb.innerHTML=`<tr><td colspan="7" style="text-align:center;padding:36px;color:var(--g400)">Aucune connexion.</td></tr>`;return;}
  tb.innerHTML=loginLog.map(l=>html`<tr class="${l.role==='admin'?'log-row-admin':''}">
    <td style="color:var(--g400)">${l.id}</td>
    <td style="font-weight:500">${esc(l.name)}</td>
    <td>${safe(rBdg(l.role))}</td>
    <td style="white-space:nowrap">${esc(l.date)}</td>
    <td style="white-space:nowrap">${esc(l.time)}</td>
    <td style="white-space:nowrap">${esc(l.device)}</td>
    <td>${esc(l.browser)}</td>
  </tr>`).join('');
}
async function clearLog(){
  if(!confirm('Vider tout le journal des connexions ? Cette action est irréversible.'))return;
  const ids=loginLog.map(l=>String(l.id)).filter(Boolean);
  loginLog=[];
  rLoginLog();
  if(ids.length===0)return;
  _initSb();
  const {error}=await sb.from('login_logs').delete().in('id',ids).eq('space_code',SPACE_ID);
  if(error)console.warn('clearLog error:',error.message);
  else console.log('[CB] Journal vidé :',ids.length,'supprimé(s)');
}

/* ═══════════════════════════════════════════════════════════════
   TABS & MODALS
═══════════════════════════════════════════════════════════════ */
/* Restaure l'onglet admin mémorisé en simulant un clic dessus */
/* ═══════════════════════════════════════════════════════════════
   ONGLET TESTS FONCTIONNELS — Admin uniquement, à la demande
═══════════════════════════════════════════════════════════════ */
function _tr(ok,label,detail='',warn=false){return {ok,warn,label,detail};}

async function _testsData(){
  const res=[];
  const _dup=(arr,label)=>{const ids=arr.map(x=>String(x.id));const dups=[...new Set(ids.filter((id,i)=>ids.indexOf(id)!==i))];return _tr(!dups.length,label,dups.length?`IDs en double : ${dups.join(', ')}`:arr.length+' enregistrements, tous IDs uniques');};
  res.push(_dup(books,'Livres : IDs uniques'));res.push(_dup(users,'Utilisateurs : IDs uniques'));res.push(_dup(loans,'Emprunts : IDs uniques'));res.push(_dup(requests,'Demandes : IDs uniques'));res.push(_dup(registrations,'Inscriptions : IDs uniques'));
  const maxB=books.reduce((m,b)=>Math.max(m,parseInt(b.id)||0),0);
  const maxU=users.reduce((m,u)=>Math.max(m,parseInt(u.id)||0),0);
  const maxR=requests.reduce((m,r)=>Math.max(m,parseInt(r.id)||0),0);
  const maxS=sessions.reduce((m,s)=>Math.max(m,parseInt(s.id)||0),0);
  const _ctrTest=(ok,label,nx,max,name)=>{
    const detail=`${name}=${nx}, max ID=${max}`;
    const fix=ok?'':` — <button type="button" class="btn bo btn-xs" style="border-color:#dc2626;color:#dc2626" onclick="repairCounters()">🔧 Réparer les compteurs</button>`;
    return {ok,warn:false,label,detail:detail+fix};
  };
  res.push(_ctrTest(nxB>maxB,'Compteur livres (nxB)',nxB,maxB,'nxB'));
  res.push(_ctrTest(nxU>maxU,'Compteur utilisateurs (nxU)',nxU,maxU,'nxU'));
  res.push(_ctrTest(nxR>maxR,'Compteur demandes (nxR)',nxR,maxR,'nxR'));
  res.push(_ctrTest(nxS>maxS,'Compteur sessions (nxS)',nxS,maxS,'nxS'));
  const orphanLoans=loans.filter(l=>l.status==='active'&&!books.find(b=>String(b.id)===String(l.bookId)));
  res.push(_tr(!orphanLoans.length,'Emprunts : livres existants',orphanLoans.length?`${orphanLoans.length} emprunt(s) sans livre`:'Tous les emprunts actifs ont un livre'));
  const orphanLoanUsers=loans.filter(l=>l.status==='active'&&!users.find(u=>String(u.id)===String(l.userId)));
  res.push(_tr(!orphanLoanUsers.length,'Emprunts : emprunteurs existants',orphanLoanUsers.length?`${orphanLoanUsers.length} emprunt(s) sans utilisateur`:'Tous les emprunteurs existent'));
  const borrowedBooks=books.filter(b=>b.status==='borrowed');
  const borrowedOrphan=borrowedBooks.filter(b=>!loans.find(l=>String(l.bookId)===String(b.id)&&(l.status==='active'||l.status==='pending_return'))).length;
  res.push(_tr(!borrowedOrphan,'Livres marqués empruntés : emprunt actif',borrowedOrphan?`${borrowedOrphan} livre(s) sans emprunt actif`:`${borrowedBooks.length} livre(s) tous liés`));
  const admins=users.filter(u=>u.role==='admin');
  res.push(_tr(admins.length>0,'Au moins un administrateur',`${admins.length} administrateur(s)`));
  const adminBadConf=admins.filter(u=>!u.neverExpires||u.expiresAt||u.disabled);
  res.push(_tr(!adminBadConf.length,'Admins : configuration permanente',adminBadConf.length?'Compte(s) mal configuré(s) : '+adminBadConf.map(u=>u.abbrev).join(', '):'Tous permanents et actifs'));
  res.push(_tr(!!(cfg.contact),'Config : numéro de contact',cfg.contact||'Non renseigné',!cfg.contact));
  res.push(_tr(!!(cfg.meetingPlace&&cfg.meetingTime),'Config : lieu et heure RDV',cfg.meetingPlace&&cfg.meetingTime?cfg.meetingPlace+' — '+cfg.meetingTime:'Non renseigné',!(cfg.meetingPlace&&cfg.meetingTime)));
  const pending=registrations.filter(r=>r.status==='pending');
  res.push(_tr(true,'Inscriptions en attente',`${pending.length} demande(s)`,pending.length>0));
  res.push(_tr(true,"Session d'emprunt",cfg.openAll?('Ouverte — '+cfg.propMotif):'Fermee'));
  return res;
}

async function _testsSupabase(){
  const res=[];
  _initSb();
  res.push(_tr(!!sb,'Supabase client : initialisé',sb?'Client prêt (anon key OK)':'Échec init'));
  try{const d=await sbGetDoc('config',SPACE_ID);res.push(_tr(!!d,'Supabase Lecture : space_config',d?'Lu avec succès':'Introuvable'));}catch(e){res.push(_tr(false,'Supabase Lecture : space_config',e.message));}
  if(books.length){try{const d=await sbGetDoc('books',books[0].id);res.push(_tr(!!(d&&d.titre===books[0].titre),'Supabase Lecture : livre test',d?'"'+books[0].titre+'" cohérent':'Incohérence'));}catch(e){res.push(_tr(false,'Supabase Lecture : livre test',e.message));}}
  if(users.length){const tu=users.find(u=>u.id==curUser?.id)||users[0];try{const d=await sbGetDoc('users',tu.id);res.push(_tr(!!(d&&d.abbrev===tu.abbrev),'Supabase Lecture : utilisateur test',d?tu.abbrev+' cohérent':'Incohérence'));}catch(e){res.push(_tr(false,'Supabase Lecture : utilisateur test',e.message));}}
  /* Sync temps réel */
  res.push(_tr(_rtOnline,'Synchronisation temps réel',_rtOnline?'Connexion active — Supabase Realtime':'Hors ligne — vérifiez votre connexion',!_rtOnline));
  return res;
}

async function _testsPublic(){
  const res=[];
  const pubUrl=window.location.origin+'/book/'+SPACE_ID;
  res.push(_tr(true,'URL catalogue public',pubUrl));
  try{const r=await fetch(pubUrl,{method:'HEAD'});res.push(_tr(r.ok,'Page publique accessible','HTTP '+r.status));}catch(e){res.push(_tr(false,'Page publique accessible',e.message));}
  const pubBooks=books.filter(b=>b.status!=='retired'&&b.status!=='missing'&&(b.catType||'academique')==='academique');
  res.push(_tr(pubBooks.length>0,'Catalogue public : livres disponibles',`${pubBooks.length} livre(s) academique(s) visibles`));
  return res;
}

/* Naviguer vers l'onglet Utilisateurs et y trouver un user par ID */
/* Recalculer et sauvegarder les compteurs depuis les données réelles */
async function repairCounters(){if(!_requireAdmin('repairCounters'))return;
  if(!confirm('Recalculer et sauvegarder les compteurs à partir des données réelles ?\n\nCela corrigera les erreurs de compteurs détectées par les tests.'))return;

  /* Calculer les max IDs depuis chaque collection */
  const maxId=(arr)=>arr.reduce((m,x)=>{const n=parseInt(x.id);return(!isNaN(n)&&n>m)?n:m;},0);

  const oldVals={nxB,nxU,nxR,nxS,nxL,nxSC,nxReg};

  nxB=Math.max(nxB, maxId(books))  +1;
  nxU=Math.max(nxU, maxId(users))  +1;
  nxR=Math.max(nxR, maxId(requests))+1;
  nxS=Math.max(nxS, maxId(sessions))+1;
  nxL=Math.max(nxL, maxId(loans))  +1;
  nxSC=Math.max(nxSC,maxId(shelfChecks))+1;
  /* nxReg utilise des IDs string (reg_timestamp), pas besoin de correction */

  /* Forcer la sauvegarde (contournement du cache _lastSavedCounters) */
  _lastSavedCounters='';
  try{
    await sbSaveCounters();
    const lines=[
      `nxB : ${oldVals.nxB} → ${nxB}`,
      `nxU : ${oldVals.nxU} → ${nxU}`,
      `nxR : ${oldVals.nxR} → ${nxR}`,
      `nxS : ${oldVals.nxS} → ${nxS}`,
      `nxL : ${oldVals.nxL} → ${nxL}`,
    ].filter(l=>!l.includes('→ '+l.split('→ ')[0].split(': ')[1]));
    _showSyncToast('✅ Compteurs réparés');
    alert('✅ Compteurs recalculés et sauvegardés !\n\n'+
      lines.join('\n')+
      '\n\nRelancez les tests pour vérifier.');
  }catch(e){
    alert('❌ Erreur lors de la sauvegarde : '+e.message);
  }
}

function tpGoToUser(userId){
  /* 1. Basculer le filtre sur "Tous" */
  setAdmUsFilter('all');
  /* 2. Vider le champ recherche */
  const s=document.getElementById('uf-search');if(s)s.value='';
  /* 3. Ouvrir l'onglet Utilisateurs */
  const usBtn=document.querySelector('#vadm .at[onclick*="swT(\'us\'"]');
  if(usBtn){swT('us',usBtn);}else{sv('vadm');}
  /* 4. Scroller sur la ligne du user */
  setTimeout(()=>{
    const rows=document.querySelectorAll('#utb tr');
    rows.forEach(tr=>{
      if(tr.innerHTML.includes('openUM('+userId+')')||tr.innerHTML.includes('delU('+userId+')')){
        tr.style.outline='3px solid #f59e0b';
        tr.scrollIntoView({behavior:'smooth',block:'center'});
        setTimeout(()=>{tr.style.outline='';},3000);
      }
    });
  },300);
}

/* Vider l'historique des inscriptions (approuvées + rejetées, garder les pending) */
async function clearRegistrations(keepPending=true){if(!_requireAdmin('clearRegistrations'))return;
  const toClear=registrations.filter(r=>!keepPending||(r.status==='approved'||r.status==='rejected'));
  if(!toClear.length){alert('Aucune inscription à supprimer.');return;}
  const msg=keepPending
    ?`Supprimer ${toClear.length} demande(s) traitée(s) (approuvées et rejetées) ?\n\nLes demandes en attente seront conservées.`
    :`Supprimer TOUTES les ${toClear.length} demandes d'inscription ?`;
  if(!confirm(msg))return;
  registrations=registrations.filter(r=>keepPending&&r.status==='pending');
  rAdmRegistrations();
  let errors=0;
  for(const r of toClear){
    try{await sbDel('registrations',r.id);}
    catch(e){errors++;console.error('[clearReg]',r.id,e.message);}
  }
  if(errors)_showSyncToast('⚠️ '+errors+' erreur(s) lors de la suppression');
  else _showSyncToast('🗑️ Historique vidé ('+toClear.length+' suppression(s))');
}

function tpFindUser(){
  const code=(document.getElementById('tp-abbrev-search')?.value||'').trim().toLowerCase();
  const out=document.getElementById('tp-abbrev-result');
  if(!out)return;
  if(!code){out.innerHTML='';return;}
  /* Chercher dans users[] sans aucun filtre */
  const found=users.filter(u=>(u.abbrev||'').toLowerCase()===code||String(u.id)===code);
  if(!found.length){
    out.innerHTML=html`<div style="padding:12px;background:#fee2e2;border-radius:8px;font-size:13px;color:#991b1b">
      ❌ Aucun compte trouvé avec le code "<b>${code}</b>" dans la mémoire locale (${users.length} comptes chargés).
      <br><br>Vérifiez que les données sont bien chargées (voir l'indicateur de sync en haut).
    </div>`;
    return;
  }
  const today=new Date().toISOString().split('T')[0];
  out.innerHTML=found.map(u=>{
    const st=u.disabled?'🔴 Désactivé':(u.neverExpires||!u.expiresAt)?'🟢 Permanent':(u.expiresAt<today)?'🟡 Expiré ('+u.expiresAt+')':'🟢 Actif (expire '+u.expiresAt+')';
    const fields=[
      ['ID',u.id],['Code (abbrev)',u.abbrev],['Rôle',u.role],
      ['neverExpires',String(!!u.neverExpires)],['expiresAt',u.expiresAt||'(null)'],
      ['disabled',String(!!u.disabled)],['Prénom/Nom',u.prenom+' '+u.nom],
    ];
    return html`<div style="background:white;border:0.5px solid var(--g200);border-radius:10px;padding:14px;font-size:13px">
      <div style="font-weight:600;color:var(--navy);margin-bottom:8px;font-size:14px">${u.prenom} ${u.nom} — ${st}</div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:6px">
        ${safe(fields.map(([k,v])=>html`<div><span style="color:var(--g400)">${k} :</span> <b>${v}</b></div>`).join(''))}
      </div>
      <div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap">
        <button type="button" class="btn bn btn-sm" onclick="openUM(${u.id})">✏️ Modifier ce compte</button>
        <button type="button" class="btn bo btn-sm" onclick="tpGoToUser(${u.id})">👥 Voir dans Utilisateurs</button>
      </div>
    </div>`;
  }).join('');
}

async function runTestPanel(){
  const resultsEl=document.getElementById('tp-results');
  const btn=document.getElementById('tp-run-btn');
  if(!resultsEl||!btn)return;
  btn.disabled=true;btn.textContent='⏳ Tests en cours...';
  resultsEl.innerHTML='<div style="text-align:center;padding:48px;color:var(--g400)"><div style="font-size:32px;margin-bottom:12px">⏳</div><div>Execution des tests...</div></div>';
  const t0=Date.now();let allResults=[];const groups=[];
  const runGroup=async(title,sub,fn)=>{try{const r=await fn();groups.push({title,sub,results:r});allResults.push(...r);}catch(e){const r=[_tr(false,'Erreur',e.message)];groups.push({title,sub,results:r});allResults.push(...r);}};
  await runGroup('Données locales','Analyse en mémoire — 0 lecture Supabase',_testsData);
  await runGroup('Supabase','~3 lectures + 1 écriture test supprimée immédiatement',_testsSupabase);
  await runGroup('Page publique','Accessibilité et catalogue',_testsPublic);
  const elapsed=((Date.now()-t0)/1000).toFixed(1);
  const passed=allResults.filter(r=>r.ok).length;
  const warned=allResults.filter(r=>r.ok&&r.warn).length;
  const failed=allResults.filter(r=>!r.ok).length;
  const sc=failed?'#dc2626':warned?'#b45309':'#16a34a';
  const sb=failed?'#fee2e2':warned?'#fffbeb':'#dcfce7';
  const si=failed?'❌':warned?'⚠️':'✅';
  const st=failed?`${failed} test(s) échoué(s)`:warned?'Tout fonctionne (avertissements)':'Tout fonctionne parfaitement';
  let out=`<div style="background:${sb};border:1px solid ${sc}33;border-radius:12px;padding:16px 20px;margin-bottom:20px;display:flex;align-items:center;gap:14px">
    <div style="font-size:36px">${si}</div>
    <div><div style="font-size:16px;font-weight:700;color:${sc}">${st}</div>
    <div style="font-size:13px;color:var(--g500);margin-top:2px">${passed}/${allResults.length} reussis · ${warned} avertissements · ${elapsed}s</div></div></div>`;
  for(const g of groups){
    const gf=g.results.filter(r=>!r.ok).length;const gw=g.results.filter(r=>r.ok&&r.warn).length;
    const gi=gf?'❌':gw?'⚠️':'✅';
    const rows=g.results.map(r=>{const ic=r.ok?(r.warn?'⚠️':'✅'):'❌';const bg=r.ok?(r.warn?'#fffbeb':'white'):'#fff5f5';const tc=r.ok?(r.warn?'#92400e':'#1e293b'):'#991b1b';
      return html`<div style="padding:10px 16px;border-bottom:0.5px solid var(--g100);background:${bg};display:flex;align-items:flex-start;gap:10px">
        <span style="font-size:14px;flex-shrink:0">${ic}</span>
        <div><div style="font-size:13px;font-weight:500;color:${tc}">${r.label}</div>${safe(r.detail?`<div style="font-size:12px;color:var(--g500);margin-top:2px">${r.detail}</div>`:'')}</div>
      </div>`;}).join('');
    out+=`<div style="background:white;border:0.5px solid var(--g200);border-radius:12px;margin-bottom:14px;overflow:hidden">
      <div style="padding:13px 16px;border-bottom:0.5px solid var(--g100);background:var(--g50);display:flex;align-items:center;gap:10px">
        <span style="font-size:18px">${gi}</span>
        <div style="flex:1"><div style="font-size:15px;font-weight:600;color:var(--navy)">${g.title}</div><div style="font-size:12px;color:var(--g400)">${g.sub}</div></div>
        <div style="font-size:12px;color:var(--g400)">${g.results.filter(r=>r.ok).length}/${g.results.length}</div>
      </div>
      ${rows}
    </div>`;
  }
  resultsEl.innerHTML=out;
  btn.disabled=false;btn.textContent='🔄 Relancer les tests';
}

function _restoreLastTab(tabKey){
  if(!tabKey)return;
  const btn=document.querySelector(`#vadm .at[onclick*="swT('${tabKey}'"]`);
  /* Vérifier que l'onglet est visible (autorisé pour ce rôle) */
  if(btn&&btn.style.display!=='none'){
    swT(tabKey,btn);
  }
}

function swT(t,b){
  document.querySelectorAll('#vadm .at').forEach(x=>x.classList.remove('active'));b.classList.add('active');
  document.querySelectorAll('#vadm .ap').forEach(p=>p.classList.remove('active'));
  const panel=document.getElementById('ap-'+t);if(panel)panel.classList.add('active');
  try{_syncSectPicker(document.querySelector('#vadm .anv'));}catch(e){}
  /* Mémoriser l'onglet admin courant */
  try{localStorage.setItem('cb_lasttab',t);}catch(e){}
  const isAdmin=curUser?.role==='admin';
  if(t==='im')populateExpSelects();
  if(t==='st')rAdmStat();
  if(t==='log'&&isAdmin)rLoginLog();
  if(t==='rq'&&isAdmin)rAdmRq();
  if(t==='theme'&&isAdmin)initThemePanel();
  if(t==='loans_adm')rAdmLoans('pending');
  if(t==='us')rAdmUs();
  if(t==='diag'&&isAdmin)runDiag();
  if(t==='quota'&&isAdmin)rQuotaPanel();
  if(t==='shelves')rAdmShelves();
  if(t==='reg'&&isAdmin){
    sbGetAll('registrations').then(data=>{registrations=data;_cachePut({registrations});setRegFilter('pending');}).catch(()=>setRegFilter('pending'));
  }
  if(t==='testpanel'&&isAdmin){
    /* Afficher le coût estimé avant lancement */
    const w=document.getElementById('tp-quota-warn');
    const c=document.getElementById('tp-cost');
    if(w){w.style.display='block';}
    if(c)c.textContent=3+Math.min(2,books.length?1:0)+Math.min(2,users.length?1:0);
    /* Réinitialiser les résultats si nécessaire */
    const r=document.getElementById('tp-results');
    if(r&&!r.innerHTML.trim())r.innerHTML='<div style="text-align:center;padding:48px;color:var(--g400);font-size:14px">Cliquez sur <strong>▶ Lancer les tests</strong> pour vérifier le bon fonctionnement de l\'application.</div>';
  }
}

/* ── Journal des modifications de livres (in-memory + Supabase) ── */
function _logBookChange(bookId, bookTitle, changes){
  /* Stocker dans le livre lui-même (lastModified*) + dans un log global en mémoire */
  /* On évite une collection dédiée pour rester dans le quota — les données sont
     dans les champs lastModified* des livres, récupérés à la demande */
  console.log('[BookChange]',bookTitle,'→',JSON.stringify(changes));
}

/* ═══════════════════════════════════════════════════════════════
   INSCRIPTIONS — Validation / rejet des demandes publiques
═══════════════════════════════════════════════════════════════ */
let _regFilter='pending';
function setRegFilter(f){
  _regFilter=f;
  document.getElementById('regf-pending')?.classList.toggle('bn',f==='pending');
  document.getElementById('regf-pending')?.classList.toggle('bo',f!=='pending');
  document.getElementById('regf-all')?.classList.toggle('bn',f==='all');
  document.getElementById('regf-all')?.classList.toggle('bo',f!=='all');
  rAdmRegistrations();
}

function rAdmRegistrations(){
  const el=document.getElementById('reg-list');if(!el)return;
  let list=registrations.slice().sort((a,b)=>(b.submittedAt||'').localeCompare(a.submittedAt||''));
  if(_regFilter==='pending')list=list.filter(r=>r.status==='pending');
  if(!list.length){
    el.innerHTML=html`<div style="padding:40px;text-align:center;color:var(--g400);background:white;border:0.5px solid var(--g200);border-radius:12px">
      <div style="font-size:32px;margin-bottom:10px">${_regFilter==='pending'?'✅':'📭'}</div>
      <div style="font-size:14px">${_regFilter==='pending'?'Aucune demande en attente':'Aucune inscription'}</div>
    </div>`;return;
  }
  el.innerHTML=list.map(r=>{
    const dt=r.submittedAt?new Date(r.submittedAt).toLocaleString('fr-FR',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}):'—';
    const wa=(r.whatsapp||'').replace(/[^0-9+]/g,'').replace(/^\+/,'');
    const statusBadge=r.status==='pending'?'<span class="badge bpen">⏳ En attente</span>'
      :r.status==='approved'?'<span class="badge bapp">✅ Validée</span>'
      :'<span class="badge brej">❌ Rejetée</span>';
    return html`<div style="background:white;border:0.5px solid var(--g200);border-radius:12px;padding:16px">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-bottom:12px">
        <div style="display:flex;align-items:center;gap:12px">
          <div style="width:44px;height:44px;border-radius:50%;background:var(--navy);color:white;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:15px;flex-shrink:0">${((r.prenom[0]||'')+(r.nom[0]||'')).toUpperCase()}</div>
          <div>
            <div style="font-weight:600;color:var(--navy);font-size:15px">${r.prenom} ${r.nom}</div>
            <div style="font-size:12px;color:var(--g400)">Demande du ${dt}</div>
          </div>
        </div>
        ${safe(statusBadge)}
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:8px;font-size:13px;color:var(--g600);margin-bottom:${r.status==='pending'?'14px':'0'}">
        <div>📱 <a href="https://wa.me/${wa}" target="_blank" style="color:#16a34a;text-decoration:none">${r.whatsapp||'—'}</a></div>
        <div>🏘️ ${r.commune||'—'}</div>
        ${safe(r.profession?`<div>💼 ${r.profession}</div>`:'')}
        ${safe(r.email?`<div>✉️ ${r.email}</div>`:'')}
      </div>
      ${safe(r.status==='pending'?`
      <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding-top:12px;border-top:0.5px solid var(--g100)">
        <select id="reg-role-${r.id}" class="fi fi-l" style="width:auto;padding:8px 12px;font-size:13px">
          <option value="member">👤 Membre</option>
          <option value="resident">🏠 Résident</option>
          <option value="commission">🎓 Commission</option>
          <option value="enrol">📝 Enrôleur</option>
        </select>
        <button type="button" class="btn bn btn-sm" onclick="approveRegistration('${r.id}')">✅ Valider et créer le compte</button>
        <button type="button" class="btn bd btn-sm" onclick="rejectRegistration('${r.id}')">❌ Rejeter</button>
      </div>`:
      r.status==='approved'?`<div style="font-size:12px;color:#16a34a;padding-top:10px;border-top:0.5px solid var(--g100)">✅ Compte créé (${r.assignedRole||'membre'}) · code : <strong>${r.createdAbbrev||'—'}</strong></div>`:
      `<div style="font-size:12px;color:#dc2626;padding-top:10px;border-top:0.5px solid var(--g100)">❌ Demande rejetée</div>`)}
    </div>`;
  }).join('');
}

/* Générer un code de connexion unique à partir du nom */
function _genAbbrev(prenom,nom){
  let base=(prenom.substring(0,3)+nom.substring(0,2)).toLowerCase().replace(/[^a-z0-9]/g,'');
  if(base.length<3)base=(base+'usr').substring(0,4);
  let code=base,i=1;
  while(users.find(u=>u.abbrev===code)){code=base+i;i++;}
  return code;
}

async function approveRegistration(id){if(!_requireAdmin('approveRegistration'))return;
  const reg=registrations.find(r=>r.id===id);if(!reg)return;
  const role=document.getElementById('reg-role-'+id)?.value||'member';
  const abbrev=_genAbbrev(reg.prenom,reg.nom);
  const regEmail=(reg.email||'').trim().toLowerCase();
  if(!regEmail){
    alert('Cette demande n\'a pas d\'e-mail. L\'e-mail est désormais nécessaire pour la connexion. Le compte sera créé, mais vous devrez saisir son e-mail puis l\'inviter depuis la gestion des membres.');
  }
  if(!confirm(`Créer le compte de ${reg.prenom} ${reg.nom} ?\n\nRôle : ${role}\nCode : ${abbrev}\n${regEmail?`Une invitation sera envoyée à ${regEmail} pour définir le mot de passe.`:'⚠️ Sans e-mail, le membre ne pourra pas se connecter tant qu\'il ne sera pas invité.'}`))return;

  /* 1. Compteur frais depuis Supabase pour éviter collisions entre sessions */
  try{const d=await sbGetDoc('counters','main');if(d&&d.nxU)nxU=Math.max(nxU,parseInt(d.nxU)||nxU);}catch(e){}
  const newId=_nextUserId();
  const neverExp=['resident','commission','admin'].includes(role);
  const nu={id:newId,abbrev,prenom:reg.prenom,nom:reg.nom,role,
    canPropose:true,canLoan:false,propUntil:null,disabled:false,
    expiresAt:neverExp?null:calcExpiresAt(),neverExpires:neverExp,
    whatsapp:reg.whatsapp||'',commune:reg.commune||'',profession:reg.profession||'',email:regEmail||null,
    tabs:[],createdAt:new Date().toISOString()};

  try{
    /* 2. Réserver l'ID en sauvegardant le compteur EN PREMIER */
    await sbSaveCounters();
    /* 3. Sauvegarder l'utilisateur dans Supabase */
    await sbSet('users',newId,nu);
    /* 4. Mettre à jour la demande dans Supabase EN PREMIER */
    const processedAt=new Date().toISOString();
    await sbUpd('registrations',id,{status:'approved',assignedRole:role,createdAbbrev:abbrev,createdUserId:newId,processedAt});
    /* 5. Seulement si TOUT réussit : mettre à jour l'état local */
    reg.status='approved';reg.assignedRole=role;reg.createdAbbrev=abbrev;reg.createdUserId=newId;reg.processedAt=processedAt;
    if(!users.find(u=>String(u.id)===String(newId)))users.push(nu);
    _cachePut({users,registrations});
    rAdmRegistrations();
    try{rAdmUs();}catch(e){}
    _showSyncToast('✅ Compte créé — code : '+abbrev);
    /* 6. Inviter le compte d'authentification (email d'invitation → set-password) */
    if(regEmail){
      const res=await _inviteMember(newId,regEmail);
      if(res.ok){
        alert(`✅ Compte créé et invitation envoyée !\n\n${reg.prenom} ${reg.nom}\nCode : ${abbrev}\nE-mail : ${regEmail}\n\nLe membre reçoit un lien pour définir son mot de passe.`);
      }else{
        alert(`✅ Compte créé (code : ${abbrev}), mais l'invitation a échoué :\n${res.error}\n\nVous pourrez réessayer via « Inviter » dans la gestion des membres.`);
      }
    }else{
      alert(`✅ Compte créé (code : ${abbrev}).\n\n⚠️ Sans e-mail : saisissez son e-mail puis cliquez « Inviter » dans la gestion des membres.`);
    }
  }catch(e){
    console.error('[approveRegistration]',e.message);
    alert('❌ Erreur lors de la création du compte : '+e.message+'\n\nAucun compte n\'a été créé. Réessayez.');
  }
}

async function rejectRegistration(id){if(!_requireAdmin('rejectRegistration'))return;
  const reg=registrations.find(r=>r.id===id);if(!reg)return;
  if(!confirm(`Rejeter la demande de ${reg.prenom} ${reg.nom} ?\n\nAucun compte ne sera créé.`))return;
  const processedAt=new Date().toISOString();
  try{
    await sbUpd('registrations',id,{status:'rejected',processedAt});
    /* Local seulement si Supabase réussit */
    reg.status='rejected';reg.processedAt=processedAt;
    _cachePut({registrations});
    rAdmRegistrations();
    _showSyncToast('Demande rejetée');
  }catch(e){console.error('[rejectRegistration]',e.message);alert('❌ Erreur : '+e.message);}
}

/* Vider tout l'historique des vérifications d'étagères */
async function clearShelfHistory(){if(!_requireAdmin('clearShelfHistory'))return;
  if(!shelfChecks.length)return;
  if(!confirm(`Vider l'historique des ${shelfChecks.length} vérification(s) d'étagères ?\n\nCette action est irréversible.`))return;
  const toDelete=[...shelfChecks];
  const deleted=[];
  for(const c of toDelete){
    try{await sbDel('shelfChecks',c.id);deleted.push(c.id);}catch(e){console.warn('[clearShelfHistory]',c.id,e.message);}
  }
  if(deleted.length){
    shelfChecks=shelfChecks.filter(c=>!deleted.includes(c.id));
    _cachePut({shelfChecks});
  }
  rAdmShelves();
  _showSyncToast(deleted.length<toDelete.length?'⚠️ Historique partiellement vidé':'🗑️ Historique vidé');
}

/* ── Marquer la vérification d'une étagère terminée ── */
async function markShelfChecked(shelfKey){
  if(!curUser)return;
  const parts=shelfKey.split('|');
  if(parts.length<3)return;
  const [salle,placard,etagere]=parts;
  const booksOnShelf=books.filter(b=>b.salle===salle&&b.placard===placard&&b.etagere===etagere);
  const now=new Date().toISOString();
  const entry={
    id:nxSC++,
    userId:curUser.id,
    userName:curUser.prenom+' '+curUser.nom,
    userRole:curUser.role,
    shelfKey,salle,placard,etagere,
    checkedAt:now,
    booksCount:booksOnShelf.length,
    missingCount:booksOnShelf.filter(b=>b.status==='missing').length,
    modifiedCount:booksOnShelf.filter(b=>b.lastModifiedBy&&b.lastModifiedAt>=(localStorage.getItem('last_shelf_check_'+shelfKey)||'0')).length
  };
  shelfChecks.unshift(entry);
  /* Mémoriser l'heure de cette vérification pour la prochaine */
  try{localStorage.setItem('last_shelf_check_'+shelfKey,now);}catch(e){}
  try{
    await sbSet('shelfChecks',entry.id,entry);
    await sbSaveCounters();
    _showSyncToast('✅ Vérification enregistrée');
    rShelfMgrView();
    /* Rafraîchir le panneau admin si ouvert */
    if(document.getElementById('ap-shelves')?.classList.contains('active'))rAdmShelves();
  }catch(e){console.warn('[markShelfChecked]',e.message);}
}

/* Retourne les membres éligibles à la gestion d'étagères :
   rôle 'enrol' OU adminTab 'shelf_mgr' */
/* Vue Gestionnaire : liste des étagères assignées + bouton vérification */
function rShelfMgrView(){
  const el=document.getElementById('shelf-mgr-view');if(!el)return;
  if(!curUser)return;
  const assigned=curUser.assignedShelves||[];
  if(!assigned.length){
    el.innerHTML=`<div style="background:var(--g50);border-radius:12px;padding:18px 16px;color:var(--g400);font-size:13px;text-align:center">
      <div style="font-size:24px;margin-bottom:8px">📚</div>
      Aucune étagère ne vous a encore été assignée.<br>Contactez l'administrateur.
    </div>`;return;
  }
  const today=new Date().toISOString().split('T')[0];
  el.innerHTML=assigned.map(key=>{
    const [salle,placard,etagere]=key.split('|');
    const booksHere=books.filter(b=>b.salle===salle&&b.placard===placard&&b.etagere===etagere);
    const myChecks=shelfChecks.filter(c=>c.shelfKey===key&&c.userId==curUser.id).sort((a,b)=>b.checkedAt.localeCompare(a.checkedAt));
    const lastCheck=myChecks[0];
    const missing=booksHere.filter(b=>b.status==='missing').length;
    const alreadyToday=lastCheck&&lastCheck.checkedAt.startsWith(today);
    const lastDate=lastCheck?new Date(lastCheck.checkedAt).toLocaleString('fr-FR',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}):'Jamais vérifiée';
    return html`<div style="background:white;border:0.5px solid var(--g200);border-radius:12px;padding:14px 16px;display:flex;align-items:flex-start;gap:12px;margin-bottom:10px">
      <div style="width:42px;height:42px;border-radius:10px;background:${alreadyToday?'#dcfce7':missing>0?'#fee2e2':'#eff6ff'};display:flex;align-items:center;justify-content:center;font-size:20px;flex-shrink:0">${alreadyToday?'✅':missing>0?'⚠️':'📚'}</div>
      <div style="flex:1;min-width:0">
        <div style="font-weight:600;font-size:14px;color:var(--navy)">${salle}</div>
        <div style="font-size:13px;color:var(--g600)">Placard <strong>${placard}</strong> — Étagère <strong>${etagere}</strong></div>
        <div style="font-size:12px;color:var(--g500);margin-top:4px">${booksHere.length} livre(s) · ${safe(missing?`<span style="color:#dc2626;font-weight:600">${missing} introuvable(s)</span>`:'<span style="color:#16a34a">Tous présents</span>')}</div>
        <div style="font-size:11px;color:var(--g400);margin-top:3px">Dernière vérification : ${lastDate}</div>
      </div>
      <div style="flex-shrink:0">
        ${safe(alreadyToday
          ?'<span style="font-size:11px;color:#16a34a;font-weight:600;padding:5px 10px;background:#dcfce7;border-radius:20px">✅ OK aujourd\'hui</span>'
          :`<button type="button" class="btn bn btn-sm" onclick="markShelfChecked('${key.replace(/'/g,"\\'")}')">✅ Vérification OK</button>`)}
      </div>
    </div>`;
  }).join('');
}

function _shelfManagers(){
  return users.filter(u=>
    !u.disabled&&(u.role==='enrol'||(u.tabs||[]).includes('shelf_mgr'))
  );
}

/* Retourne les étagères uniques depuis le catalogue de livres */
function _allShelves(){
  const set=new Set();
  books.forEach(b=>{
    if(b.salle&&b.placard&&b.etagere)
      set.add(JSON.stringify({salle:b.salle,placard:b.placard,etagere:b.etagere}));
  });
  return [...set].map(s=>JSON.parse(s)).sort((a,b)=>{
    if(a.salle!==b.salle)return a.salle.localeCompare(b.salle);
    if(a.placard!==b.placard)return a.placard.localeCompare(b.placard);
    return String(a.etagere).localeCompare(String(b.etagere),undefined,{numeric:true});
  });
}

function _shelfKey(s){return html`${s.salle}|${s.placard}|${s.etagere}`;}

/* Rendre le panneau Étagères */
function rAdmShelves(){
  const managers=_shelfManagers();
  const shelves=_allShelves();
  const cntEl=document.getElementById('shelves-count');
  if(cntEl)cntEl.textContent=shelves.length+' étagère(s) · '+managers.length+' gestionnaire(s)';

  /* ── Cartes de synthèse par gestionnaire ── */
  const summaryEl=document.getElementById('shelves-summary');
  if(summaryEl){
    if(!managers.length){
      summaryEl.innerHTML=`<div style="grid-column:1/-1;padding:24px;text-align:center;color:var(--g400);font-size:13px">
        Aucun gestionnaire d'étagères configuré.<br>
        Attribuez le rôle <strong>Enrôleur</strong> ou l'accès <strong>📚 Gestionnaire d'étagères</strong> à un membre.
      </div>`;
    }else{
      summaryEl.innerHTML=managers.map(u=>{
        const assigned=(u.assignedShelves||[]);
        const count=assigned.length;
        return html`<div style="background:white;border:0.5px solid var(--g200);border-radius:12px;padding:14px 16px">
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">
            <div style="width:36px;height:36px;border-radius:50%;background:var(--navy);color:white;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:14px;flex-shrink:0">${((u.prenom[0]||'')+(u.nom[0]||'')).toUpperCase()}</div>
            <div>
              <div style="font-weight:600;color:var(--navy)">${u.prenom} ${u.nom}</div>
              <div style="font-size:12px;color:var(--g400)">${safe(rBdg(u.role))}</div>
            </div>
            <button type="button" class="btn bo btn-xs" style="margin-left:auto" onclick="openShelfAssign(${u.id})">✏️ Modifier</button>
          </div>
          ${safe(count?`<div style="display:flex;flex-wrap:wrap;gap:5px">${assigned.map(s=>html`<span style="background:#eff6ff;color:#1d4ed8;font-size:11px;padding:2px 8px;border-radius:20px;border:0.5px solid #bfdbfe">${s}</span>`).join('')}</div>`
          :`<div style="font-size:12px;color:var(--g400);font-style:italic">Aucune étagère assignée</div>`)}
        </div>`;
      }).join('');
    }
  }

  /* ── Matrice Étagères × Gestionnaires ── */
  const tb=document.getElementById('shelves-matrix');
  if(!tb)return;
  if(!shelves.length){
    tb.innerHTML='<tbody><tr><td colspan="10" style="padding:32px;text-align:center;color:var(--g400)">Aucune étagère trouvée. Ajoutez des livres avec Salle / Placard / Étagère renseignés.</td></tr></tbody>';
    return;
  }

  /* En-tête avec noms des gestionnaires */
  const headerCols=managers.map(u=>html`<th style="padding:8px 12px;font-weight:500;color:var(--g500);font-size:12px;text-align:center;white-space:nowrap;min-width:80px">${u.prenom}<br><span style="font-size:10px;opacity:.7">${u.nom}</span></th>`).join('');

  /* Grouper par salle puis placard */
  const bySalle={};
  shelves.forEach(s=>{
    if(!bySalle[s.salle])bySalle[s.salle]={};
    if(!bySalle[s.salle][s.placard])bySalle[s.salle][s.placard]=[];
    bySalle[s.salle][s.placard].push(s.etagere);
  });

  const rows=shelves.map(s=>{
    const key=_shelfKey(s);
    const booksOnShelf=books.filter(b=>b.salle===s.salle&&b.placard===s.placard&&b.etagere===s.etagere).length;
    const cells=managers.map(u=>{
      const assigned=(u.assignedShelves||[]).includes(key);
      return html`<td style="padding:8px;text-align:center;border-top:0.5px solid var(--g100)">
        <span style="display:inline-flex;width:22px;height:22px;border-radius:50%;align-items:center;justify-content:center;font-size:12px;${assigned?'background:#dcfce7;':'background:var(--g50);'}">
          ${assigned?'✅':'○'}
        </span>
      </td>`;
    }).join('');
    return html`<tr style="background:white">
      <td style="padding:10px 14px;border-top:0.5px solid var(--g100);white-space:nowrap;font-size:13px;color:var(--g500)">${s.salle}</td>
      <td style="padding:10px 12px;border-top:0.5px solid var(--g100);font-weight:600;font-size:13px">${s.placard} / ${s.etagere}</td>
      <td style="padding:10px 10px;border-top:0.5px solid var(--g100);font-size:12px;color:var(--g400);text-align:center">${booksOnShelf} livre(s)</td>
      ${safe(cells)}
    </tr>`;
  }).join('');

  tb.innerHTML=html`
    <thead><tr style="background:var(--g50)">
      <th style="padding:10px 14px;text-align:left;font-weight:500;color:var(--g500);font-size:12px">Salle</th>
      <th style="padding:10px 12px;text-align:left;font-weight:500;color:var(--g500);font-size:12px">Placard / Étagère</th>
      <th style="padding:10px 10px;text-align:center;font-weight:500;color:var(--g500);font-size:12px">Livres</th>
      ${safe(headerCols)}
    </tr></thead>
    <tbody>${safe(rows)}</tbody>`;

  /* ── Section Activité ── */
  _rShelvesActivity();
}

function _rShelvesActivity(){
  const actEl=document.getElementById('shelves-activity');if(!actEl)return;
  /* Vérifications récentes — triées par date décroissante */
  const recentChecks=shelfChecks.slice().sort((a,b)=>b.checkedAt.localeCompare(a.checkedAt)).slice(0,50);
  /* Livres modifiés récemment (par lastModifiedAt) */
  const recentBooks=books.filter(b=>b.lastModifiedAt).slice().sort((a,b)=>b.lastModifiedAt.localeCompare(a.lastModifiedAt)).slice(0,30);

  actEl.innerHTML=`
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:20px">
      <!-- Vérifications -->
      <div style="background:white;border:0.5px solid var(--g200);border-radius:12px;overflow:hidden">
        <div style="padding:12px 16px;border-bottom:0.5px solid var(--g100);display:flex;align-items:center;justify-content:space-between">
          <div style="font-size:14px;font-weight:600;color:var(--navy)">✅ Vérifications récentes</div>
          <div style="display:flex;align-items:center;gap:10px">
            <div style="font-size:12px;color:var(--g400)">${recentChecks.length} entrée(s)</div>
            ${recentChecks.length&&curUser?.role==='admin'?`<button type="button" onclick="clearShelfHistory()" title="Vider l'historique" style="background:#fee2e2;color:#dc2626;border:none;border-radius:7px;padding:5px 10px;font-size:11px;font-weight:600;cursor:pointer;font-family:inherit">🗑️ Vider</button>`:''}
          </div>
        </div>
        <div style="max-height:400px;overflow-y:auto">
          ${!recentChecks.length
            ?'<div style="padding:24px;text-align:center;color:var(--g400);font-size:13px">Aucune vérification enregistrée</div>'
            :recentChecks.map(c=>{
              const dt=new Date(c.checkedAt).toLocaleString('fr-FR',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'});
              return html`<div style="padding:10px 16px;border-bottom:0.5px solid var(--g100);display:flex;align-items:center;gap:10px">
                <span style="font-size:18px">✅</span>
                <div style="flex:1;min-width:0">
                  <div style="font-size:13px;font-weight:500;color:var(--navy)">${c.salle} — Placard ${c.placard} / Étagère ${c.etagere}</div>
                  <div style="font-size:12px;color:var(--g500)">${c.userName}</div>
                  <div style="font-size:11px;color:var(--g400);margin-top:2px">${c.booksCount} livre(s) · ${safe(c.missingCount>0?`<span style="color:#dc2626">${c.missingCount} introuvable(s)</span>`:'')}</div>
                </div>
                <div style="font-size:11px;color:var(--g400);white-space:nowrap">${dt}</div>
              </div>`;
            }).join('')}
        </div>
      </div>
      <!-- Modifications livres -->
      <div style="background:white;border:0.5px solid var(--g200);border-radius:12px;overflow:hidden">
        <div style="padding:12px 16px;border-bottom:0.5px solid var(--g100);display:flex;align-items:center;justify-content:space-between">
          <div style="font-size:14px;font-weight:600;color:var(--navy)">📝 Modifications récentes des livres</div>
          <div style="display:flex;align-items:center;gap:10px">
            <span style="font-size:12px;color:var(--g400)">${recentBooks.length} livre(s)</span>
            ${recentBooks.length?`<button type="button" class="btn bd btn-xs" onclick="clearRecentModifs()" title="Effacer l'historique des modifications">🗑️ Effacer</button>`:''}
          </div>
        </div>
        <div style="max-height:400px;overflow-y:auto">
          ${!recentBooks.length
            ?'<div style="padding:24px;text-align:center;color:var(--g400);font-size:13px">Aucune modification tracée</div>'
            :recentBooks.map(b=>{
              const dt=new Date(b.lastModifiedAt).toLocaleString('fr-FR',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'});
              const statusIcon=b.status==='missing'?'⚠️':b.status==='borrowed'?'📖':b.status==='retired'?'📦':'✅';
              const roleBadge=b.lastModifiedRole==='enrol'?'<span style="background:#fef3c7;color:#92400e;font-size:10px;padding:1px 6px;border-radius:10px">Enrôleur</span>':b.lastModifiedRole==='admin'?'<span style="background:#eff6ff;color:#1d4ed8;font-size:10px;padding:1px 6px;border-radius:10px">Admin</span>':'';
              return html`<div style="padding:10px 16px;border-bottom:0.5px solid var(--g100);display:flex;align-items:center;gap:10px">
                <span style="font-size:16px">${statusIcon}</span>
                <div style="flex:1;min-width:0">
                  <div style="font-size:13px;font-weight:500;color:var(--navy);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${b.titre}</div>
                  <div style="font-size:12px;color:var(--g500)">${b.lastModifiedBy} ${safe(roleBadge)}</div>
                  <div style="font-size:11px;color:var(--g400);margin-top:1px">${b.salle} / ${b.placard} / Ét.${b.etagere}</div>
                </div>
                <div style="font-size:11px;color:var(--g400);white-space:nowrap">${dt}</div>
              </div>`;
            }).join('')}
        </div>
      </div>
    </div>`;
}

async function clearRecentModifs(){
  const count=books.filter(b=>b.lastModifiedAt).length;
  if(!count)return;
  if(!confirm(`Effacer l'historique des modifications pour ${count} livre(s) ?\n\nCette action est irréversible.`))return;
  books.forEach(b=>{if(b.lastModifiedAt){b.lastModifiedAt=null;b.lastModifiedBy=null;b.lastModifiedRole=null;}});
  rAdmShelves();
  try{
    _initSb();
    await sb.from('books').update({lastModifiedAt:null,lastModifiedBy:null,lastModifiedRole:null})
      .eq('space_code',SPACE_ID).not('lastModifiedAt','is',null);
    _cachePut({books});
    _showSyncToast('✅ Historique effacé');
  }catch(e){console.error(e.message);_showSyncToast('⚠️ Erreur lors de l\'effacement');}
}
/* Ouvrir le modal d'affectation */
function openShelfAssign(userId){
  const managers=_shelfManagers();
  const sel=document.getElementById('shelf-user-sel');
  if(!sel)return;
  sel.innerHTML='<option value="">— Choisir un membre —</option>'+
    managers.map(u=>html`<option value="${u.id}">${u.prenom} ${u.nom} (${u.role})</option>`).join('');
  if(userId){sel.value=userId;loadShelfCheckboxes();}
  else{document.getElementById('shelf-checkboxes').innerHTML='<div style="color:var(--g400);font-size:13px;padding:8px 0">Sélectionnez d\'abord un membre</div>';}
  document.getElementById('shelf-err').textContent='';
  openM('m-shelf-assign');
}

/* Charger les cases à cocher des étagères pour le membre sélectionné */
function loadShelfCheckboxes(){
  const sel=document.getElementById('shelf-user-sel');
  const container=document.getElementById('shelf-checkboxes');
  if(!sel||!container)return;
  const userId=sel.value;
  if(!userId){container.innerHTML='<div style="color:var(--g400);font-size:13px;padding:8px 0">Sélectionnez d\'abord un membre</div>';return;}
  const u=users.find(x=>String(x.id)===String(userId));
  const assigned=new Set(u?.assignedShelves||[]);
  const shelves=_allShelves();
  if(!shelves.length){container.innerHTML='<div style="color:var(--g400);font-size:13px;padding:8px 0">Aucune étagère dans le catalogue.</div>';return;}

  /* Grouper par salle/placard pour l'affichage */
  const groups={};
  shelves.forEach(s=>{
    const gk=`${s.salle} — Placard ${s.placard}`;
    if(!groups[gk])groups[gk]=[];
    groups[gk].push(s);
  });

  container.innerHTML=Object.entries(groups).map(([gk,shs])=>html`
    <div style="margin-bottom:12px">
      <div style="font-size:11px;font-weight:700;color:var(--g400);text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px">${gk}</div>
      <div style="display:flex;flex-wrap:wrap;gap:6px">
        ${safe(shs.map(s=>{const key=_shelfKey(s);
          return html`<label style="display:inline-flex;align-items:center;gap:6px;padding:5px 10px;border-radius:8px;border:1px solid ${assigned.has(key)?'#3b82f6':'var(--g200)'};background:${assigned.has(key)?'#eff6ff':'white'};cursor:pointer;font-size:13px;transition:all .15s">
            <input type="checkbox" data-shelf-key="${key}" ${assigned.has(key)?'checked':''} style="accent-color:#3b82f6" onchange="this.closest('label').style.background=this.checked?'#eff6ff':'white';this.closest('label').style.borderColor=this.checked?'#3b82f6':'var(--g200)'"/>
            Étagère ${s.etagere}
          </label>`;
        }).join(''))}
      </div>
    </div>`).join('');
}

/* Sauvegarder l'affectation */
async function saveShelfAssign(){
  const sel=document.getElementById('shelf-user-sel');
  const errEl=document.getElementById('shelf-err');
  if(!sel?.value){errEl.textContent='Veuillez sélectionner un membre.';return;}
  const checked=[...document.querySelectorAll('#shelf-checkboxes input[type="checkbox"]:checked')].map(i=>i.dataset.shelfKey);
  const u=users.find(x=>String(x.id)===String(sel.value));
  if(!u){errEl.textContent='Membre introuvable.';return;}
  u.assignedShelves=checked;
  try{
    await sbUpd('users',u.id,{assignedShelves:checked});
    _cachePut({users});
    cM('m-shelf-assign');
    rAdmShelves();
    _showSyncToast('✅ Étagères sauvegardées');
  }catch(e){errEl.textContent='Erreur : '+e.message;}
}

/* ═══════════════════════════════════════════════════════════════
   PANNEAU QUOTA (supprimé — était spécifique à Firebase)
   Lectures / Écritures / Suppressions vs limites plan Spark
═══════════════════════════════════════════════════════════════ */
let _qRefreshTimer=null;

function rQuotaPanel(){/* Supprimé — panel Firebase quota n'existe plus */}

/* ═══════════════════════════════════════════════════════════════
   ADMIN — EMPRUNTS (onglet admin)
═══════════════════════════════════════════════════════════════ */
let _admLoanFilter='pending';
function rAdmLoans(filter){
  _admLoanFilter=filter||_admLoanFilter;

  /* ── Boutons filtre ─────────────────────────────────────────── */
  ['all','pending','pending_return','active','returned','rejected'].forEach(f=>{
    const el=document.getElementById('adm-loan-f-'+f);
    if(!el)return;
    const isActive=f===_admLoanFilter;
    el.className='btn btn-sm '+(isActive?'bn':'bo');
    /* Conserver la couleur rouge du bouton "Rejeté" quand inactif */
    if(f==='rejected'&&!isActive){el.style.borderColor='#dc2626';el.style.color='#dc2626';}
    else if(f==='rejected'&&isActive){el.style.borderColor='';el.style.color='';}
  });

  /* ── Bouton purge : visible uniquement en mode "Tous" ───────── */
  const purgeBtn=document.querySelector('[onclick="bulkDeleteLoanHistory()"]');
  if(purgeBtn)purgeBtn.style.display=_admLoanFilter==='all'?'':'none';

  const tb=document.getElementById('adm-loans-tb');if(!tb)return;

  /* ── Compteurs badges ───────────────────────────────────────── */
  const pendingCnt=loans.filter(l=>l.status==='pending').length;
  const preturnCnt=loans.filter(l=>l.status==='pending_return').length;
  const pc=document.getElementById('adm-loan-pending-cnt');if(pc)pc.textContent=pendingCnt;
  const prc=document.getElementById('adm-loan-preturn-cnt');if(prc)prc.textContent=preturnCnt;
  const badge=document.getElementById('adm-loans-badge');
  if(badge){const tot=pendingCnt+preturnCnt;badge.style.display=tot>0?'inline':'none';badge.textContent=tot;}

  /* ── Filtrage strict — chaque statut dans une seule catégorie ─ */
  let list=[...loans];
  if(_admLoanFilter==='returned')      list=list.filter(l=>l.status==='returned');
  else if(_admLoanFilter==='rejected') list=list.filter(l=>l.status==='rejected');
  else if(_admLoanFilter!=='all')      list=list.filter(l=>l.status===_admLoanFilter);
  list.sort((a,b)=>(b.requestedAt||'').localeCompare(a.requestedAt||''));

  const cntEl=document.getElementById('adm-loans-count');
  if(cntEl)cntEl.textContent=list.length+' emprunt(s)';
  if(!list.length){
    tb.innerHTML=`<tr><td colspan="7" style="text-align:center;padding:36px;color:var(--g400)">Aucun emprunt pour ce filtre.</td></tr>`;
    return;
  }

  const today=new Date().toISOString().split('T')[0];
  tb.innerHTML=list.map(l=>{
    const u=users.find(x=>x.id==l.userId);
    const daysLeft=l.dueDate?Math.ceil((new Date(l.dueDate)-new Date(today))/(86400*1000)):null;
    const late=daysLeft!==null&&daysLeft<0&&l.status==='active';

    /* ── Badge statut — exhaustif, aucun statut sans badge ─────── */
    const statusBadge=
      l.status==='returned'      ?'<span class="badge bavl">&#9989; Retourné</span>':
      l.status==='rejected'      ?'<span class="badge" style="background:#fee2e2;color:#dc2626;border:1px solid #fca5a5">&#10060; Rejeté</span>':
      l.status==='pending_return'?'<span class="badge" style="background:#fff7ed;color:#ea580c;border:1px solid #fed7aa">&#9203; Retour à valider</span>':
      l.status==='pending'       ?'<span class="badge bpen">&#9203; En attente</span>':
      late                       ?'<span class="badge" style="background:#fee2e2;color:#dc2626">&#9888; En retard</span>':
                                  '<span class="badge benr">&#128214; Actif</span>';

    /* ── Actions selon statut ───────────────────────────────────── */
    let actionBtn;
    if(l.status==='pending'){
      actionBtn=`<button type="button" class="btn bg btn-xs" style="background:var(--green)" onclick="approveLoan('${l.id}')">&#9989; Approuver</button>
        <button type="button" class="btn bd btn-xs" onclick="rejectLoan('${l.id}')">&#10060; Rejeter</button>`;
    }else if(l.status==='pending_return'){
      actionBtn=`<button type="button" class="btn bg btn-xs" style="background:var(--green)" onclick="validateReturn('${l.id}')">&#9989; Valider retour</button>
        <button type="button" class="btn bd btn-xs" onclick="rejectReturn('${l.id}')">&#10060; Rejeter</button>`;
    }else if(l.status==='active'){
      actionBtn=`<button type="button" class="btn bwarn btn-xs" onclick="validateReturn('${l.id}')">&#9989; Marquer retourné</button>`;
    }else{
      /* Statuts finaux (returned / rejected) : uniquement suppression */
      actionBtn=`<button type="button" class="btn bd btn-xs" title="Supprimer cet historique" onclick="deleteLoanHistory('${l.id}')">&#128465; Supprimer</button>`;
    }

    const rowBg=late?'background:#fff5f5':l.status==='rejected'?'background:#fff5f5':'';
    return html`<tr style="${rowBg}">
      <td style="font-weight:600;max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${l.bookTitle||''}">${l.bookTitle||'—'}</td>
      <td><div style="font-weight:500">${l.userName||l.userAbbrev||'—'}</div>${safe(u?html`<div style="font-size:11px;color:var(--g400);margin-top:2px">${u.profession||u.commune||''}</div>`:'')}</td>
      <td>${safe(u?rBdg(u.role):'—')}</td>
      <td style="font-size:12px;color:var(--g500);white-space:nowrap">${l.requestedAt?new Date(l.requestedAt).toLocaleDateString('fr-FR'):'—'}</td>
      <td style="font-size:12px;white-space:nowrap${late?';color:#dc2626;font-weight:700':''}">${l.dueDate||'—'}</td>
      <td>${safe(statusBadge)}</td>
      <td><div style="display:flex;gap:4px;flex-wrap:wrap">${safe(actionBtn)}</div></td>
    </tr>`;
  }).join('');
}

function updAdmLoansBadge(){
  const badge=document.getElementById('adm-loans-badge');
  if(!badge)return;
  const tot=loans.filter(l=>l.status==='pending'||l.status==='pending_return').length;
  badge.style.display=tot>0?'inline':'none';badge.textContent=tot;
}
function openM(id){document.getElementById(id).classList.add('open');}
function cM(id){document.getElementById(id).classList.remove('open');}
document.querySelectorAll('.mov').forEach(o=>o.addEventListener('click',e=>{if(e.target===o)o.classList.remove('open');}));

/* ═══════════════════════════════════════════════════════════════
   IMPORT
═══════════════════════════════════════════════════════════════ */
const FMAP=[
  {key:'titre',label:'Titre de l\'ouvrage',req:true},{key:'auteur',label:'Auteur',req:false},
  {key:'cat',label:'Catégorie',req:false},{key:'salle',label:'Salle',req:false},
  {key:'placard',label:'Placard',req:false},{key:'etagere',label:'Étagère',req:false},
  {key:'lang',label:'Langue(s)',req:false},{key:'annee',label:'Année du livre',req:false},
  {key:'expl',label:'Nbre d\'exemplaires',req:false},{key:'ancienNouv',label:'Ancien / Nouveau',req:false},
  {key:'etat',label:'État',req:false},{key:'editeur',label:'Éditeur',req:false},
  {key:'resume',label:'Résumé / Notes',req:false},
];
const ALIAS={
  titre:['titre','title','titre de l\'ouvrage','ouvrage','nom du livre'],
  auteur:['auteur','author','auteur de l\'ouvrage','nom auteur'],
  cat:['catégorie','categorie','category','thème','theme','genre','type'],
  salle:['salle','room','localisation'],placard:['placard','armoire','meuble'],
  etagere:['étagère','etagere','rayon','étage'],lang:['langue','langues','language','lang'],
  annee:['année','annee','year','date'],expl:['exemplaires','exemplaire','nombre','nbre','copies'],
  ancienNouv:['ancien','nouveau','ancien / nouveau'],etat:['état','etat','condition'],
  editeur:['éditeur','editeur','edition','publisher'],resume:['résumé','resume','description','notes'],
};
function autoD(h){const hx=h.toLowerCase().replace(/['"]/g,'').trim();for(const[key,als]of Object.entries(ALIAS)){if(als.some(a=>{const ax=a.toLowerCase();return hx===ax||hx.includes(ax)||ax.includes(hx);}))return key;}return '';}
function dzOv(e){e.preventDefault();document.getElementById('dz').classList.add('drag');}
function dzLv(){document.getElementById('dz').classList.remove('drag');}
function dzDp(e){e.preventDefault();dzLv();const f=e.dataTransfer.files[0];if(f)prcFile(f);}
function hdlFile(i){if(i.files[0])prcFile(i.files[0]);}
function prcFile(file){
  const ext=file.name.split('.').pop().toLowerCase();
  if(!['csv','xlsx','xls'].includes(ext)){alert('Format non supporté.');return;}
  const rdr=new FileReader();
  if(ext==='csv'){rdr.onload=e=>parseCSV(e.target.result);rdr.readAsText(file,'UTF-8');}
  else{rdr.onload=e=>{try{const wb=XLSX.read(e.target.result,{type:'binary'});const ws=wb.Sheets[wb.SheetNames[0]];
    const json=XLSX.utils.sheet_to_json(ws,{header:1,defval:''});
    impHdr=(json[0]||[]).map(String);impRaw=json.slice(1).filter(row=>row.some(c=>String(c).trim()));showMap();
  }catch(err){alert('Erreur Excel: '+err.message);}};rdr.readAsBinaryString(file);}
}
function parseCSV(text){
  const lines=text.split(/\r?\n/).filter(l=>l.trim());if(!lines.length){alert('Fichier vide.');return;}
  const sep=lines[0].split(';').length>lines[0].split(',').length?';':',';
  const pR=line=>{const res=[];let cur='',inQ=false;for(const ch of line){if(ch==='"'){inQ=!inQ;}else if(ch===sep&&!inQ){res.push(cur.trim());cur='';}else cur+=ch;}res.push(cur.trim());return res;};
  impHdr=pR(lines[0]).map(h=>h.replace(/^"|"$/g,'').trim());
  impRaw=lines.slice(1).map(pR).filter(r=>r.some(c=>c.trim()));showMap();
}
function showMap(){
  document.getElementById('dz').style.display='none';document.getElementById('imp-map').style.display='block';
  document.getElementById('imp-prv').style.display='none';document.getElementById('imp-res').style.display='none';
  const opts=FMAP.map(f=>html`<option value="${f.key}">${f.label}${f.req?' *':''}</option>`).join('');
  document.getElementById('mpg').innerHTML=impHdr.map((h,i)=>html`
    <div class="mpr"><div class="mps" title="${h}">📋 ${h}</div><div class="mpa">→</div>
      <div class="mpd"><select id="mp${i}"><option value="">(ignorer)</option>${opts}</select></div>
    </div>`).join('');
  impHdr.forEach((h,i)=>{const d=autoD(h);if(d)document.getElementById('mp'+i).value=d;});
}
function doPrev(){
  impMap=impHdr.map((_,i)=>document.getElementById('mp'+i).value);
  if(!impMap.some(m=>m==='titre')){alert('Mappez au moins le Titre.');return;}
  impParsed=impRaw.map(row=>{const o={};impMap.forEach((k,i)=>{if(k&&row[i]!==undefined)o[k]=String(row[i]).trim();});return o;}).filter(o=>o.titre&&o.titre.length>0);
  document.getElementById('imp-map').style.display='none';document.getElementById('imp-prv').style.display='block';
  document.getElementById('icnt').textContent=impParsed.length;
  document.getElementById('imp-info').innerHTML=html`✅ <strong>${impParsed.length} ligne(s)</strong> prêtes sur <strong>${impRaw.length}</strong> lues.`;
  document.getElementById('pvtot').textContent=`${Math.min(10,impParsed.length)}/${impParsed.length}`;
  const cols=impMap.filter(Boolean).filter((v,i,a)=>a.indexOf(v)===i);
  const clbls=cols.map(c=>FMAP.find(f=>f.key===c)?.label||c);
  document.getElementById('pvtbl').innerHTML=`<table><thead><tr>${clbls.map(l=>html`<th>${l}</th>`).join('')}</tr></thead>
    <tbody>${impParsed.slice(0,10).map(r=>html`<tr>${safe(cols.map(c=>html`<td>${r[c]||''}</td>`).join(''))}</tr>`).join('')}</tbody></table>`;
}
async function doImport(){
  const clr=document.getElementById('iclr').checked;
  if(clr&&!confirm(`Effacer les ${books.length} livres existants ?`))return;
  showLoading('Import en cours…');
  try{
    if(clr){
      /* Supprimer tous les livres existants dans Supabase */
      await sbBatchDel('books',books.map(b=>String(b.id)));
      books=[];nxB=1;
    }
    /* Insérer par lots de 500 (limite Supabase) */
    let added=0;
    /* Mode ajout : amorcer nxB au-delà du max existant pour éviter d'écraser des livres */
    if(!clr){const m=_maxId(books)+1;if(nxB<m)nxB=m;}
    const newBooks=impParsed.map(r=>({id:nxB++,titre:r.titre||'',auteur:r.auteur||'',cat:r.cat||'Général',
      salle:r.salle||'',placard:r.placard||'',etagere:r.etagere||'',lang:r.lang||'',
      annee:r.annee?parseInt(r.annee)||null:null,expl:r.expl?parseInt(r.expl)||1:1,
      ancienNouv:r.ancienNouv||'',etat:r.etat||'',editeur:r.editeur||'',resume:r.resume||'',
      emoji:gEmo(r.cat||''),status:'available'}));
    /* Écriture REST par lots de 400 */
    for(let i=0;i<newBooks.length;i+=400){
      const chunk=newBooks.slice(i,i+400);
      await sbBatchSet('books',chunk);
      added+=chunk.length;
      showLoading(`Import… ${added}/${newBooks.length} livres`);
    }
    books.push(...newBooks);
    _cachePut({books});
    await sbSaveCounters();
    hideLoading();
    document.getElementById('imp-prv').style.display='none';document.getElementById('imp-res').style.display='block';
    document.getElementById('imp-msg').textContent=`${added} livre(s) importé(s).${clr?' Ancienne base remplacée.':' Ajoutés.'} Total : ${books.length} livres.`;
    rAdmBk();
  }catch(e){hideLoading();alert('Erreur import: '+e.message);}
}
function rstImp(){
  impRaw=[];impHdr=[];impMap=[];impParsed=[];document.getElementById('fi').value='';document.getElementById('iclr').checked=false;
  document.getElementById('dz').style.display='block';
  ['imp-map','imp-prv','imp-res'].forEach(id=>document.getElementById(id).style.display='none');
}

/* ── Export Excel ── */
function populateExpSelects(){
  const fillSel=(id,vals)=>{const el=document.getElementById(id);if(!el)return;const cur=el.value;
    const first=el.options[0].text;
    el.innerHTML=`<option value="">${first}</option>`+[...new Set(vals.filter(v=>v!==null&&v!==undefined&&String(v).trim()))].sort().map(v=>html`<option value="${v}">${v}</option>`).join('');
    if(cur&&[...el.options].some(o=>o.value===cur))el.value=cur;};
  const ctEl=document.getElementById('exp-f-ct');
  if(ctEl){const cur=ctEl.value;
    ctEl.innerHTML='<option value="">Tous les catalogues</option>';
    _getCatTypes().forEach(t=>{const o=document.createElement('option');o.value=t.id;o.textContent=`${t.emoji} ${t.label}`;ctEl.appendChild(o);});
    if(cur&&[...ctEl.options].some(o=>o.value===cur))ctEl.value=cur;}
  fillSel('exp-f-cat',books.map(b=>b.cat));
  fillSel('exp-f-sal',books.map(b=>b.salle));
  fillSel('exp-f-lng',books.map(b=>b.lang));
  updExpCount();
}
function updExpCount(){
  const el=document.getElementById('exp-count');if(!el)return;
  const n=_getExpBooks().length;
  el.textContent=`${n} livre${n!==1?'s':''} à exporter`;
}
function _getExpBooks(){
  const fCt=(document.getElementById('exp-f-ct')?.value||'');
  const fCat=(document.getElementById('exp-f-cat')?.value||'');
  const fSal=(document.getElementById('exp-f-sal')?.value||'');
  const fLng=(document.getElementById('exp-f-lng')?.value||'');
  const fSt=(document.getElementById('exp-f-st')?.value||'');
  let list=[...books];
  if(fCt) list=list.filter(b=>(b.catType||'academique')===fCt);
  if(fCat)list=list.filter(b=>b.cat===fCat);
  if(fSal)list=list.filter(b=>b.salle===fSal);
  if(fLng)list=list.filter(b=>b.lang===fLng);
  if(fSt) list=list.filter(b=>b.status===fSt);
  return list;
}
function exportXlsx(){
  const list=_getExpBooks();
  if(!list.length){alert('Aucun livre ne correspond aux critères sélectionnés.');return;}
  const ST={available:'Disponible',borrowed:'Emprunté',retired:'Retiré',missing:'Introuvable'};
  const catDefs=_getCatTypes();
  const rows=list.map(b=>({
    'ID':b.id,
    'Titre':b.titre||'',
    'Auteur':b.auteur||'',
    'Catégorie':b.cat||'',
    'Catalogue':(catDefs.find(t=>t.id===(b.catType||'academique'))?.label)||(b.catType||'academique'),
    'Salle':b.salle||'',
    'Placard':b.placard||'',
    'Étagère':b.etagere||'',
    'Langue':b.lang||'',
    'Année':b.annee||'',
    'Exemplaires':b.expl||1,
    'Ancien/Nouveau':b.ancienNouv||'',
    'État':b.etat||'',
    'Éditeur':b.editeur||'',
    'Résumé':b.resume||'',
    'Statut':ST[b.status]||b.status||'',
  }));
  const ws=XLSX.utils.json_to_sheet(rows);
  const wb=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb,ws,'Catalogue');
  XLSX.writeFile(wb,`catalogue_${new Date().toISOString().slice(0,10)}.xlsx`);
}

function gEmo(cat){return catStyle(cat).icon;}


/* ═══════════════════════════════════════════════════════════════
   SUPER-ADMIN — Gestion des espaces bibliothèques
═══════════════════════════════════════════════════════════════ */
/* showSuperAdmin() définie plus bas avec la logique complète */
/* ═══════════════════════════════════════════════════════════════
   SUPER-ADMIN — Mot de passe stocké dans Supabase (super_admin_config.pwdHash)
   Aucun hash par défaut dans le code source — le mot de passe doit être
   défini via le dashboard Supabase avant la première connexion.
═══════════════════════════════════════════════════════════════ */

async function saHash(pwd){
  const buf=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(pwd));
  return Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,'0')).join('');
}

async function saGetStoredHash(){
  /* Lire depuis super_admin_config (Supabase) — retourne null si absent */
  try{
    _initSb();
    const {data,error}=await sb.from('super_admin_config').select('pwdHash').eq('id',1).maybeSingle();
    if(error){console.warn('[SA] Supabase erreur:',error.message);}
    else if(data&&data.pwdHash)return{hash:data.pwdHash,isDefault:false,status:200};
    else{console.log('[SA] super_admin_config absent — aucun hash configuré');return{hash:null,isDefault:true,status:404};}
  }catch(e){
    console.warn('[SA] saGetStoredHash réseau:',e.message);
  }
  return{hash:null,isDefault:true,status:0};
}

function showSuperAdmin(){
  /* Titre et favicon neutres — pas de nom de centre */
  document.title='Super Admin — Gestion des bibliothèques';
  /* Réinitialiser les variables CSS pour ne pas hériter d'un thème de centre */
  document.documentElement.style.removeProperty('--green');
  document.documentElement.style.removeProperty('--gl');
  document.documentElement.style.removeProperty('--gd');
  document.querySelectorAll('.view,#v-sadmin,#v-notfound').forEach(v=>v.classList.remove('active'));
  document.getElementById('v-sadmin').classList.add('active');
  document.getElementById('sa-login-screen').style.display='flex';
  document.getElementById('sa-panel-screen').style.display='none';
  document.getElementById('sa-err').textContent='';
  document.getElementById('sa-pwd').value='';
  /* {once:true} empêche l'accumulation de listeners sur plusieurs appels */
  document.getElementById('sa-pwd').addEventListener('keypress',e=>{if(e.key==='Enter')saLogin();},{once:true});
}

async function saLogin(){
  const pwd=document.getElementById('sa-pwd').value.trim();
  const errEl=document.getElementById('sa-err');
  const diagEl=document.getElementById('sa-diag');
  const btn=document.getElementById('sa-login-btn');
  if(!pwd){errEl.textContent='Veuillez saisir le mot de passe.';return;}
  const saWait=_rlCheck('cb_rl_sa');
  if(saWait>0){errEl.textContent='Trop de tentatives. Réessayez dans '+saWait+' secondes.';return;}
  errEl.textContent='Vérification…';
  if(diagEl)diagEl.style.display='none';
  if(btn)btn.disabled=true;
  try{
    const hashHex=await saHash(pwd);
    const {hash:storedHash,isDefault,status}=await saGetStoredHash();
    if(!storedHash){
      errEl.textContent='Aucun mot de passe configuré. Initialisez super_admin_config dans Supabase.';
      return;
    }
    if(hashHex!==storedHash){
      errEl.textContent='Mot de passe incorrect.';
      return;
    }
    /* Succès */
    _rlReset('cb_rl_sa');
    errEl.textContent='';
    document.getElementById('sa-login-screen').style.display='none';
    document.getElementById('sa-panel-screen').style.display='block';
    saLoadSpaces();
    const _codeEl=document.getElementById('sa-new-code');
    if(_codeEl&&!_codeEl.value)_codeEl.value=saGenSpaceCode();
    if(isDefault){
      setTimeout(()=>{
        const w=document.getElementById('sa-default-pwd-warn');
        if(w)w.style.display='flex';
      },500);
    }
  }catch(e){
    console.error('[SA] saLogin erreur:',e);
    errEl.textContent='Erreur : '+e.message;
  }finally{
    if(btn)btn.disabled=false;
  }
}

async function saDiagnose(){
  const diagEl=document.getElementById('sa-diag');
  if(!diagEl)return;
  diagEl.style.display='block';
  diagEl.innerHTML='⏳ Diagnostic en cours…';
  try{
    _initSb();
    const {data,error}=await sb.from('super_admin_config').select('pwdHash').eq('id',1).maybeSingle();
    const storedHashStr=data?.pwdHash?data.pwdHash.substring(0,16)+'...':'(champ absent)';
    const sbStatus=error?('❌ '+error.message):'✅ OK';
    const hasCustomPwd=!!(data?.pwdHash);
    diagEl.innerHTML=html`<strong>🔍 Diagnostic super-admin</strong><br>
      Supabase client : ✅ prêt<br>
      super_admin_config : <strong>${sbStatus}</strong><br>
      Hash stocké SB : <code>${storedHashStr}</code><br>
      <span style="color:${hasCustomPwd?'#4ade80':'#fbbf24'}">${hasCustomPwd?'✅ Mot de passe configuré':'⚠️ Aucun mot de passe — configurez super_admin_config dans Supabase'}</span>`;
  }catch(e){
    diagEl.textContent='❌ Erreur diagnostic : '+e.message;
  }
}

async function saLoadSpaces(){
  const listEl=document.getElementById('sa-spaces-list');
  if(listEl)listEl.innerHTML='<div style="text-align:center;padding:40px;color:rgba(255,255,255,.3)">⏳ Chargement…</div>';
  try{
    const spaces=(await sbGetAllRoot('_spaces')).filter(s=>s.code&&s.code!=='__superadmin__');
    const countEl=document.getElementById('sa-spaces-count');
    const count2El=document.getElementById('sa-spaces-count2');
    const statTotal=document.getElementById('sa-stat-total');
    const statActive=document.getElementById('sa-stat-active');
    const statInactive=document.getElementById('sa-stat-inactive');
    const active=spaces.filter(s=>s.active!==false).length;
    const inactive=spaces.length-active;
    if(countEl)countEl.textContent=spaces.length+' espace(s)';
    if(count2El)count2El.textContent=spaces.length+' espace(s)';
    if(statTotal)statTotal.textContent=spaces.length;
    if(statActive)statActive.textContent=active;
    if(statInactive)statInactive.textContent=inactive;
    if(!listEl)return;
    if(!spaces.length){
      listEl.innerHTML='<div style="text-align:center;padding:40px;color:rgba(255,255,255,.3);font-size:14px">Aucune bibliothèque créée. Utilisez le formulaire ci-dessus.</div>';
      return;
    }
    listEl.innerHTML=spaces.map(s=>html`
      <div class="space-card">
        <div class="space-dot" style="background:${s.color||'#6366f1'}22">${s.active!==false?'📚':'🔒'}</div>
        <div style="flex:1;min-width:0">
          <div style="font-weight:600;color:rgba(255,255,255,.9);margin-bottom:4px;font-size:15px">${s.name||s.short||s.code}</div>
          <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
            <span class="space-code">/${s.code}</span>
            <span class="${s.active!==false?'sa-badge-active':'sa-badge-inactive'}">${s.active!==false?'● Actif':'● Inactif'}</span>
            ${safe(s.tagline?`<span style="font-size:12px;color:rgba(255,255,255,.35)">${esc(s.tagline)}</span>`:'')}

          </div>
          <div style="margin-top:6px">
            <a href="/${s.code}" target="_blank" style="font-size:12px;color:#a5b4fc;text-decoration:none;font-weight:500">🔗 ${window.location.origin}/${s.code}</a>
          </div>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end">
          ${s.active!==false
            ?`<button type="button" class="sa-btn-danger" onclick="saToggleSpace('${s.code}',true)">🚫 Désactiver</button>`
            :`<button type="button" class="sa-btn-ok" onclick="saToggleSpace('${s.code}',false)">✅ Réactiver</button>`}
        </div>
      </div>`).join('');
  }catch(e){
    if(listEl)listEl.innerHTML=html`<div style="color:#f87171;padding:20px">Erreur : ${e.message}</div>`;
  }
}

function saClearCreate(){
  ['sa-new-name','sa-new-short','sa-new-tag','sa-new-admin-code'].forEach(id=>{
    const el=document.getElementById(id);if(el)el.value='';
  });
  /* Régénérer un code opaque après chaque effacement */
  const _ce=document.getElementById('sa-new-code');if(_ce)_ce.value=saGenSpaceCode();
  const col=document.getElementById('sa-new-color');if(col)col.value='#22806B';
  const err=document.getElementById('sa-create-err');if(err)err.textContent='';
  const suc=document.getElementById('sa-create-success');if(suc)suc.style.display='none';
}

async function saCreateSpace(){
  const code    =document.getElementById('sa-new-code').value.trim().toLowerCase();
  const name    =document.getElementById('sa-new-name').value.trim();
  const short   =document.getElementById('sa-new-short').value.trim();
  const tag     =document.getElementById('sa-new-tag').value.trim();
  const color   =document.getElementById('sa-new-color').value;
  const admCode =document.getElementById('sa-new-admin-code').value.trim().toLowerCase();
  const errEl   =document.getElementById('sa-create-err');
  const sucEl   =document.getElementById('sa-create-success');
  const btn     =document.getElementById('sa-create-btn');
  if(!code||!name||!short||!admCode){errEl.textContent='Tous les champs * sont obligatoires.';return;}
  if(!/^[a-z0-9-]+$/.test(code)){errEl.textContent='Code invalide (minuscules, chiffres, tirets uniquement).';return;}
  if(!/^[a-z0-9]+$/.test(admCode)){errEl.textContent='Code admin invalide (lettres minuscules et chiffres uniquement).';return;}
  errEl.textContent='';sucEl.style.display='none';
  btn.disabled=true;btn.textContent='⏳ Vérification…';
  try{
    /* Vérifier unicité */
    const existing=await sbGetDocRoot('_spaces',code);
    if(existing&&existing.code){errEl.textContent='Ce code est déjà utilisé par une autre bibliothèque.';return;}
    btn.textContent='⏳ Création en cours…';
    const spaceData={code,name,short,tagline:tag||name,color,active:true,createdAt:new Date().toISOString()};
    const initCfg={openAll:false,openUntil:null,propMotif:'',currentSessionId:null,logoB64:null,
      pdfFields:['num','titre','auteur','desc','demandeur'],
      catAccess:{member:['academique'],commission:['academique','spirituel'],resident:['academique'],enrol:['academique','spirituel'],admin:['academique','spirituel']}};
    const initAdmin={id:1,abbrev:admCode,prenom:'Administrateur',nom:name,
      role:'admin',canPropose:true,propUntil:null,disabled:false,photoB64:null,profession:'',whatsapp:'',commune:''};
    const initCounters={nxB:1,nxU:2,nxR:1,nxS:1,nxL:1};
    /* 1. Créer _spaces/{code} */
    await sbSetRoot('_spaces',code,spaceData);
    /* 2. Initialiser les tables liées à l'espace */
    _initSb();
    const {error:cfgErr}=await sb.from('space_config').upsert({space_code:code,...initCfg});
    if(cfgErr)throw new Error('Config: '+cfgErr.message);
    const {error:cntErr}=await sb.from('space_counters').upsert({space_code:code,...initCounters});
    if(cntErr)throw new Error('Counters: '+cntErr.message);
    const {error:usrErr}=await sb.from('users').upsert({...initAdmin,space_code:code,neverExpires:true,createdAt:new Date().toISOString()});
    if(usrErr)throw new Error('Admin: '+usrErr.message);
    /* Succès */
    const url=`${window.location.origin}/${code}`;
    sucEl.innerHTML=html`✅ <strong>Bibliothèque "${name}" créée avec succès !</strong><br>
      🔗 URL : <a href="${url}" target="_blank" style="color:#4ade80;font-weight:700">${url}</a><br>
      👤 Code admin : <code style="background:rgba(34,197,94,.15);padding:2px 8px;border-radius:5px">${admCode}</code>`;
    sucEl.style.display='block';
    saClearCreate();
    saLoadSpaces();
  }catch(e){
    errEl.textContent='Erreur : '+e.message;
    console.error(e);
  }finally{
    btn.disabled=false;btn.textContent='🚀 Créer la bibliothèque';
  }
}

async function saChangePwd(){
  const newPwd =document.getElementById('sa-new-pwd').value.trim();
  const confPwd=document.getElementById('sa-confirm-pwd').value.trim();
  const errEl  =document.getElementById('sa-changepwd-err');
  const btn    =document.getElementById('sa-changepwd-btn');
  errEl.textContent='';
  if(!newPwd||newPwd.length<6){errEl.textContent='Mot de passe trop court (min. 6 caractères).';return;}
  if(newPwd!==confPwd){errEl.textContent='Les mots de passe ne correspondent pas.';return;}
  btn.disabled=true;errEl.textContent='Enregistrement…';
  try{
    const hashHex=await saHash(newPwd);
    await sbSetRoot('_spaces','__superadmin__',{pwdHash:hashHex,updatedAt:new Date().toISOString()});
    document.getElementById('sa-new-pwd').value='';
    document.getElementById('sa-confirm-pwd').value='';
    const warn=document.getElementById('sa-default-pwd-warn');
    if(warn)warn.style.display='none';
    cM('m-sa-changepwd');
    alert('✅ Mot de passe mis à jour !\nValable sur tous les navigateurs et appareils.');
  }catch(e){errEl.textContent='Erreur : '+e.message;console.error(e);}
  finally{btn.disabled=false;}
}

async function saToggleSpace(code,currentActive){
  if(!confirm(currentActive?`Désactiver "${code}" ? Les membres ne pourront plus se connecter.`:`Réactiver "${code}" ?`))return;
  try{
    _initSb();
    const {error}=await sb.from('spaces').update({active:!currentActive}).eq('code',code);
    if(error)throw new Error(error.message);
    saLoadSpaces();
  }catch(e){alert('Erreur : '+e.message);}
}



/* ═══════════════════════════════════════════════════════════════
   THÈME — Couleur personnalisable par l'admin
═══════════════════════════════════════════════════════════════ */
function hexToRgb(hex){
  const r=parseInt(hex.slice(1,3),16),g=parseInt(hex.slice(3,5),16),b=parseInt(hex.slice(5,7),16);
  return{r,g,b};
}
function darken(hex,pct){
  const {r,g,b}=hexToRgb(hex);
  const f=1-pct;
  return '#'+[r,g,b].map(v=>Math.max(0,Math.min(255,Math.round(v*f))).toString(16).padStart(2,'0')).join('');
}
function lighten(hex,pct){
  const {r,g,b}=hexToRgb(hex);
  return '#'+[r,g,b].map(v=>Math.round(v+(255-v)*pct).toString(16).padStart(2,'0')).join('');
}
function colorWithAlpha(hex,alpha){
  const {r,g,b}=hexToRgb(hex);
  return html`rgba(${r},${g},${b},${alpha})`;
}

function applyColorVars(color){
  if(!color)return;
  const root=document.documentElement;
  root.style.setProperty('--green', color);
  root.style.setProperty('--gd',    darken(color,.2));
  root.style.setProperty('--gl',    lighten(color,.25));
  root.style.setProperty('--light', lighten(color,.85));
  root.style.setProperty('--l2',    lighten(color,.65));
}

function previewTheme(color){
  if(!color||color.length<7)return;
  applyColorVars(color);
  const v=document.getElementById('theme-current-val');
  if(v)v.textContent=color;
  /* Mettre à jour l'aperçu */
  const p=document.getElementById('theme-color-picker');
  if(p)p.value=color;
}

const THEME_PALETTES=[
  {name:'Vert Émeraude',  color:'#22806B'},
  {name:'Bleu Marine',    color:'#1C4370'},
  {name:'Indigo',         color:'#4338ca'},
  {name:'Violet',         color:'#7c3aed'},
  {name:'Rose Foncé',     color:'#be185d'},
  {name:'Bordeaux',       color:'#9d174d'},
  {name:'Orange Brun',    color:'#c2410c'},
  {name:'Ambre',          color:'#b45309'},
  {name:'Vert Forêt',     color:'#166534'},
  {name:'Sarcelle',       color:'#0e7490'},
  {name:'Ardoise',        color:'#475569'},
  {name:'Anthracite',     color:'#1e293b'},
];

function buildThemePalettes(){
  return THEME_PALETTES.map(p=>html`
    <button type="button" onclick="selectPalette('${p.color}')"
      style="display:flex;align-items:center;gap:10px;padding:10px 14px;border-radius:10px;border:2px solid ${(SPACE?.color||cfg?.themeColor||'#22806B')===p.color?p.color:'var(--g200)'};background:${(SPACE?.color||'#22806B')===p.color?p.color+'18':'white'};cursor:pointer;transition:all .2s;width:100%;font-family:inherit"
      onmouseover="this.style.borderColor='${p.color}';this.style.background='${p.color}18'"
      onmouseout="if('${SPACE?.color||'#22806B'}'!=='${p.color}'){this.style.borderColor='var(--g200)';this.style.background='white';}">
      <div style="width:28px;height:28px;border-radius:8px;background:${p.color};flex-shrink:0;box-shadow:0 2px 6px rgba(0,0,0,.2)"></div>
      <div style="text-align:left">
        <div style="font-size:13px;font-weight:600;color:#1a2a3a">${p.name}</div>
        <div style="font-size:11px;color:var(--g400);font-family:monospace">${p.color}</div>
      </div>
    </button>`
  ).join('');
}

function selectPalette(color){
  const p=document.getElementById('theme-color-picker');
  if(p)p.value=color;
  previewTheme(color);
}

function initThemePanel(){
  const currentColor=SPACE?.color||'#22806B';
  const picker=document.getElementById('theme-color-picker');
  if(picker)picker.value=currentColor;
  const valEl=document.getElementById('theme-current-val');
  if(valEl)valEl.textContent=currentColor;
  /* Regénérer les palettes (pour mettre à jour la couleur sélectionnée) */
  const palGrid=document.getElementById('theme-palettes-grid');
  if(palGrid)palGrid.innerHTML=buildThemePalettes();
  const msg=document.getElementById('theme-save-msg');
  if(msg)msg.textContent='';
}

async function saveThemeColor(){
  const picker=document.getElementById('theme-color-picker');
  const color=picker?.value||'#22806B';
  const btn=document.getElementById('save-theme-btn');
  const msg=document.getElementById('theme-save-msg');
  if(btn)btn.disabled=true;
  if(msg)msg.textContent='Sauvegarde en cours…';
  try{
    _initSb();
    const {error}=await sb.from('spaces').update({color}).eq('code',SPACE_ID);
    if(error)throw new Error(error.message);
    /* Mettre à jour SPACE en mémoire */
    if(SPACE)SPACE.color=color;
    applyColorVars(color);
    if(msg){msg.textContent='✅ Thème mis à jour ! Visible par tous les membres.';msg.style.color='var(--green)';}
    setTimeout(()=>{if(msg)msg.textContent='';},4000);
  }catch(e){
    if(msg){msg.textContent='❌ Erreur : '+e.message;msg.style.color='var(--danger)';}
  }finally{
    if(btn)btn.disabled=false;
  }
}

function resetThemeColor(){
  const defaultColor='#22806B';
  const picker=document.getElementById('theme-color-picker');
  if(picker)picker.value=defaultColor;
  previewTheme(defaultColor);
}

/* ═══════════════════════════════════════════════════════════════
   EMPRUNTS — Résidents uniquement (auto-validé)
═══════════════════════════════════════════════════════════════ */
let _loanBookId=null;

function showLoans(){
  sv('vloans');
  const nl=document.getElementById('nl-loans-links');
  if(nl)bNav('nl-loans-links','vloans');
  /* Nom + initiales utilisateur */
  if(curUser){
    const aEl=document.getElementById('a-loans');
    const nEl=document.getElementById('n-loans');
    if(aEl)aEl.textContent=((curUser.prenom[0]||'')+(curUser.nom[0]||'')).toUpperCase();
    if(nEl)nEl.textContent=curUser.prenom+' '+curUser.nom;
  }
  /* Logo espace */
  const nbr=document.getElementById('nbr-loans');
  if(nbr&&SPACE)nbr.innerHTML=html`<span id="nbr-logo-loans"></span><span style="font-family:'Cormorant Garamond',serif">${SPACE.short||'ComoéBiblio'}</span>`;
  if(cfg.logoB64){const lEl=document.getElementById('nbr-logo-loans');if(lEl){lEl.style.cssText='width:28px;height:28px;border-radius:6px;object-fit:cover;margin-right:8px;display:inline-block;vertical-align:middle';lEl.outerHTML=`<img src="${esc(cfg.logoB64)}" style="width:28px;height:28px;border-radius:6px;object-fit:cover;margin-right:8px;vertical-align:middle" alt="logo"/>`;}}
  rLoans('active');
}

function rLoans(filter='active'){
  const tb=document.getElementById('loans-tb');
  if(!tb)return;
  /* Highlight bouton filtre actif */
  ['active','returned','rejected','all'].forEach(f=>{
    const el=document.getElementById('loans-f-'+f);
    if(!el)return;
    el.className='btn btn-sm '+(f===filter?'bn':'bo');
    /* Conserver la couleur rouge pour le bouton rejeté non actif */
    if(f==='rejected'&&f!==filter){el.style.borderColor='#dc2626';el.style.color='#dc2626';}
    else if(f==='rejected'&&f===filter){el.style.borderColor='';el.style.color='';}
  });
  const today=new Date().toISOString().split('T')[0];
  let list=[...loans];
  /* Filtres stricts et cohérents — chaque statut dans une seule catégorie */
  if(filter==='active')       list=list.filter(l=>l.status==='active'||l.status==='pending'||l.status==='pending_return');
  else if(filter==='returned')list=list.filter(l=>l.status==='returned');   /* UNIQUEMENT retourné validé */
  else if(filter==='rejected')list=list.filter(l=>l.status==='rejected');   /* UNIQUEMENT rejeté */
  /* 'all' : tout sans filtre */
  list.sort((a,b)=>(b.requestedAt||'').localeCompare(a.requestedAt||''));
  /* Compteur */
  const pendingAct=loans.filter(l=>l.status==='pending'||l.status==='pending_return').length;
  const cntEl=document.getElementById('loans-count');
  if(cntEl)cntEl.textContent=list.length+' emprunt(s)'+(pendingAct?' \u2022 '+pendingAct+' action(s) en attente':'');
  if(!list.length){
    const labels={active:'en cours',returned:'retourné validé',rejected:'rejeté',all:''};
    tb.innerHTML=html`<tr><td colspan="7" style="text-align:center;padding:36px;color:var(--g400)">Aucun emprunt ${labels[filter]||''}.</td></tr>`;
    return;
  }
  const isAdmOrVal=curUser&&(curUser.role==='admin'||curUser.role==='validator'||(curUser.tabs&&curUser.tabs.includes('loans_validator')));
  tb.innerHTML=list.map(l=>{
    const daysLeft=l.dueDate?Math.ceil((new Date(l.dueDate)-new Date(today))/(86400*1000)):null;
    const late=daysLeft!==null&&daysLeft<0&&l.status==='active';
    const daysStr=
      (l.status==='returned'||l.status==='rejected')?'—':
      daysLeft===null?'—':
      daysLeft<0?`<span style="color:#dc2626;font-weight:700">⚠️ ${Math.abs(daysLeft)}j de retard</span>`:
      `<span style="color:${daysLeft<=3?'#dc2626':daysLeft<=7?'#d97706':'var(--g600)'}">${daysLeft}j</span>`;
    /* Badge statut — exhaustif, aucun statut sans badge */
    const statusBadge=
      l.status==='returned'     ?'<span class="badge bavl">&#9989; Retourné</span>':
      l.status==='rejected'     ?'<span class="badge" style="background:#fee2e2;color:#dc2626;border:1px solid #fca5a5">&#10060; Rejeté</span>':
      l.status==='pending_return'?'<span class="badge" style="background:#fff7ed;color:#ea580c;border:1px solid #fed7aa">&#9203; Retour à valider</span>':
      l.status==='pending'      ?'<span class="badge" style="background:#fef9c3;color:#92400e">&#9203; En attente</span>':
      late?'<span class="badge" style="background:#fee2e2;color:#dc2626">&#9888;&#65039; En retard</span>':
      '<span class="badge" style="background:#ede9fe;color:#7c3aed">&#128214; Actif</span>';
    /* Boutons d'action selon statut et rôle */
    let actionBtn='—';
    if(l.status==='active'){
      actionBtn=isAdmOrVal
        ?`<button type="button" class="btn bg btn-xs" onclick="validateReturn('${l.id}')" style="background:var(--green)">&#9989; Valider retour</button>`
        :`<button type="button" class="btn bwarn btn-xs" onclick="markReturned('${l.id}')">&#128196; D&#233;clarer retour</button>`;
    }else if(l.status==='pending_return'&&isAdmOrVal){
      actionBtn=`<button type="button" class="btn bg btn-xs" style="background:var(--green)" onclick="validateReturn('${l.id}')">&#9989; Confirmer retour</button>
         <button type="button" class="btn bd btn-xs" onclick="rejectReturn('${l.id}')">&#10060; Rejeter</button>`;
    }else if(l.status==='pending'&&isAdmOrVal){
      actionBtn=`<button type="button" class="btn bg btn-xs" style="background:var(--green)" onclick="approveLoan('${l.id}')">&#9989; Approuver</button>
         <button type="button" class="btn bd btn-xs" onclick="rejectLoan('${l.id}')">&#10060; Rejeter</button>`;
    }
    /* Suppression uniquement sur les statuts finaux */
    if(isAdmOrVal&&(l.status==='returned'||l.status==='rejected'))
      actionBtn=`<button type="button" class="btn bd btn-xs" title="Supprimer cet historique" onclick="deleteLoanHistory('${l.id}')">&#128465;</button>`;
    return html`<tr style="${late?'background:#fff5f5':l.status==='rejected'?'background:#fff5f5':''}">
      <td style="font-weight:600;max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${l.bookTitle||'—'}</td>
      <td>${l.userName||l.userAbbrev||'—'}</td>
      <td style="font-size:12px;color:var(--g500)">${l.requestedAt?new Date(l.requestedAt).toLocaleDateString('fr-FR'):'—'}</td>
      <td style="font-size:12px;${late?'color:#dc2626;font-weight:700':''}">${l.dueDate||'—'}</td>
      <td>${daysStr}</td>
      <td>${statusBadge}</td>
      <td>${actionBtn}</td>
    </tr>`;
  }).join('');
}

function openLoanModal(bookId){
  const b=books.find(x=>x.id==bookId);
  if(!b){alert('Livre introuvable.');return;}
  /* Bloquer si livre signalé introuvable */
  if(b.status==='missing'){alert('⚠️ Ce livre est signalé introuvable à son emplacement. L\'emprunt n\'est pas possible tant qu\'il n\'a pas été retrouvé.');return;}
  /* Vérifier disponibilité en tenant compte des exemplaires */
  const activeLoansForBook=loans.filter(l=>l.bookId==bookId&&(l.status==='active'||l.status==='pending_return')).length;
  const copies=parseInt(b.expl)||parseInt(b.exemplaires)||1;
  if(activeLoansForBook>=copies){alert('Aucun exemplaire disponible ('+copies+' exemplaire(s), '+activeLoansForBook+' emprunté(s)).');return;}
  /* Vérifier un retour en attente de validation */
  const pendingReturn=loans.find(l=>l.userId==curUser?.id&&l.status==='pending_return');
  if(pendingReturn){alert('Vous avez un retour en attente de validation pour "'+pendingReturn.bookTitle+'". Vous ne pouvez pas emprunter avant que l\'administrateur valide ce retour.');return;}
  if(!canUserLoan()){alert('Vous n\'avez pas le droit d\'emprunter. Contactez votre administrateur.');return;}
  /* Vérifier qu'il n'a pas déjà un emprunt actif */
  const existing=loans.find(l=>l.userId==curUser.id&&l.status==='active');
  if(existing){alert('Vous avez déjà un emprunt actif : "'+existing.bookTitle+'".');return;}
  _loanBookId=bookId;
  document.getElementById('loan-book-title').textContent=b.titre+' — '+( b.auteur||'');
  /* Date de retour min = demain */
  const tom=new Date();tom.setDate(tom.getDate()+1);
  document.getElementById('loan-due-date').min=tom.toISOString().split('T')[0];
  document.getElementById('loan-due-date').value='';
  document.getElementById('loan-err').textContent='';
  openM('m-loan');
}

async function confirmLoan(){
  const dueDate=document.getElementById('loan-due-date').value;
  const errEl=document.getElementById('loan-err');
  if(!dueDate){errEl.textContent='La date de retour est obligatoire.';return;}
  const today=new Date().toISOString().split('T')[0];
  if(dueDate<=today){errEl.textContent='La date de retour doit être dans le futur.';return;}
  const b=books.find(x=>x.id==_loanBookId);
  if(!b){errEl.textContent='Livre introuvable.';return;}
  const btn=document.getElementById('loan-confirm-btn');
  btn.disabled=true;
  try{
    const now=new Date().toISOString();
    const loanId='L'+Date.now();
    const isResidentLoan=curUser.role==='resident';
    /* Résidents : auto-validé (active) | Membres : en attente (pending) */
    const loanStatus=isResidentLoan?'active':'pending';
    const loan={id:loanId,bookId:_loanBookId,bookTitle:b.titre,
      userId:curUser.id,userAbbrev:curUser.abbrev,userName:curUser.prenom+' '+curUser.nom,
      requestedAt:now,approvedAt:isResidentLoan?now:null,status:loanStatus,dueDate,returnedAt:null};
    await sbSet('loans',loanId,loan);
    loans.push(loan);
    _cachePut({loans});
    if(isResidentLoan){
      /* Résident : livre marqué emprunté ou toujours disponible selon nb exemplaires restants */
      const activeLoansForBook=loans.filter(x=>x.bookId==_loanBookId&&(x.status==='active'||x.status==='pending_return')&&x.id!==loanId).length;
      const copies=parseInt(b.expl)||parseInt(b.exemplaires)||1;
      const newStatus=activeLoansForBook+1>=copies?'borrowed':'available';
      b.status=newStatus;b.borrowedBy=curUser.prenom+' '+curUser.nom;b.borrowedUntil=dueDate;
      await sbUpd('books',_loanBookId,{status:newStatus,borrowedBy:b.borrowedBy,borrowedUntil:dueDate,activeLoans:activeLoansForBook+1});
      _cachePut({books});
    }
    cM('m-loan');
    rCat();
    if(isResidentLoan){alert('Emprunt confirme ! Rapportez le livre avant le '+dueDate+'.');}
    else{alert("Demande d'emprunt envoyee ! Elle sera examinee par l'administrateur ou un validateur.");}
  }catch(e){errEl.textContent='Erreur : '+e.message;console.error(e);}
  finally{btn.disabled=false;}
}

async function deleteLoanHistory(loanId){
  const l=loans.find(x=>x.id==loanId);
  if(!l)return;
  if(!confirm('Supprimer définitivement cet historique d\'emprunt ?\n"'+l.bookTitle+'" — '+l.userName+'\nCette action est irréversible.'))return;
  try{
    await sbDel('loans',loanId);
    const idx=loans.findIndex(x=>x.id==loanId);if(idx!==-1)loans.splice(idx,1);
    _cachePut({loans});
    rLoans('active');rAdmLoans();updAdmLoansBadge();
  }catch(e){alert('Erreur : '+e.message);}
}

async function bulkDeleteLoanHistory(){
  const finalLoans=loans.filter(l=>l.status==='returned'||l.status==='rejected');
  if(!finalLoans.length){alert('Aucun historique terminé à purger.\nSeuls les emprunts "Retourné" et "Rejeté" peuvent être supprimés.');return;}
  if(!confirm('Supprimer définitivement tout l\'historique terminé ?\n\n'+finalLoans.length+' enregistrement(s) concerné(s) (Retournés + Rejetés).\n\n⚠️ Action irréversible — les emprunts actifs et en attente ne sont PAS touchés.'))return;
  let deleted=0,errors=0;
  const deletedIds=new Set();
  for(const l of finalLoans){
    try{await sbDel('loans',l.id);deleted++;deletedIds.add(l.id);}
    catch(e){errors++;console.warn('[purge]',l.id,e.message);}
  }
  if(deletedIds.size){
    loans.splice(0,loans.length,...loans.filter(l=>!deletedIds.has(l.id)));
    _cachePut({loans});
  }
  rLoans('active');rAdmLoans();updAdmLoansBadge();
  alert(deleted+' enregistrement(s) supprimé(s).'+(errors?'\n⚠️ '+errors+' erreur(s).':''));
}

async function markReturned(loanId){
  const l=loans.find(x=>x.id==loanId);
  if(!l)return;
  if(!confirm('Déclarer "'+l.bookTitle+'" comme retourné ?\nUn administrateur devra valider le retour avant votre prochain emprunt.'))return;
  try{
    const now=new Date().toISOString();
    await sbUpd('loans',loanId,{status:'pending_return',returnedAt:now});
    l.status='pending_return';l.returnedAt=now;
    _cachePut({loans});
    /* Le livre reste "borrowed" jusqu\'à validation admin */
    rLoans('active');rCat();updAdmLoansBadge();
    alert('Retour déclaré. En attente de validation par l\'administrateur.');
  }catch(e){alert('Erreur : '+e.message);}
}

async function approveLoan(loanId){
  if(!_requirePrivileged('approveLoan'))return;
  const l=loans.find(x=>x.id==loanId);
  if(!l)return;
  if(!confirm('Approuver l\'emprunt de "'+l.bookTitle+'" par '+l.userName+' ?'))return;
  try{
    const now=new Date().toISOString();
    /* Recherche robuste : == pour comparer int et string */
    const b=books.find(x=>x.id==l.bookId)||books.find(x=>String(x.id)===String(l.bookId));
    if(!b){
      alert('Livre introuvable dans le catalogue. Il a peut-être été supprimé.\nTitre : '+l.bookTitle);
      return;
    }
    /* Compter les emprunts actifs sur ce livre (excl. celui en cours d'approbation) */
    const activeLoansForBook=loans.filter(x=>
      (String(x.bookId)===String(l.bookId))&&
      (x.status==='active'||x.status==='pending_return')&&
      x.id!=loanId
    ).length;
    const copies=Math.max(1,parseInt(b.expl)||parseInt(b.exemplaires)||1);
    if(activeLoansForBook>=copies){
      alert('Aucun exemplaire disponible pour ce livre.\n'+copies+' exemplaire(s) — '+activeLoansForBook+' actuellement emprunté(s).');
      return;
    }
    const remainingAfter=copies-(activeLoansForBook+1);
    const newStatus=remainingAfter<=0?'borrowed':'available';
    l.status='active';l.approvedAt=now;l.approvedBy=curUser?.abbrev||'?';
    b.status=newStatus;
    if(newStatus==='borrowed'){b.borrowedBy=l.userName;b.borrowedUntil=l.dueDate;}
    await sbUpd('loans',loanId,{status:'active',approvedAt:now,validatedBy:curUser?.abbrev||'?'});
    await sbUpd('books',l.bookId,{
      status:newStatus,
      borrowedBy:newStatus==='borrowed'?l.userName:null,
      borrowedUntil:newStatus==='borrowed'?l.dueDate:null,
      activeLoans:activeLoansForBook+1
    });
    _cachePut({loans,books});
    rLoans('active');rAdmLoans();rCat();updAdmLoansBadge();
  }catch(e){alert('Erreur : '+e.message);console.error('[approveLoan]',e);}
}

async function rejectLoan(loanId){
  if(!_requirePrivileged('rejectLoan'))return;
  const l=loans.find(x=>x.id==loanId);
  if(!l)return;
  if(!confirm('Rejeter la demande d\'emprunt de "'+l.bookTitle+'" par '+l.userName+' ?'))return;
  try{
    const now=new Date().toISOString();
    await sbUpd('loans',loanId,{status:'rejected'});
    /* Mise à jour locale */
    l.status='rejected';l.rejectedAt=now;l.rejectedBy=curUser?.abbrev||'?';
    _cachePut({loans});
    /* Purger l'historique du membre : garder seulement les 5 derniers emprunts terminés (returned/rejected) */
    const memberHistoric=loans
      .filter(x=>x.userId==l.userId&&(x.status==='returned'||x.status==='rejected'))
      .sort((a,b)=>(b.requestedAt||'').localeCompare(a.requestedAt||''));
    if(memberHistoric.length>5){
      const toDelete=memberHistoric.slice(5);
      for(const old of toDelete){
        try{await sbDel('loans',old.id);}catch(e){console.warn('[purge]',e.message);}
      }
    }
    rLoans('active');rAdmLoans();updAdmLoansBadge();
  }catch(e){alert('Erreur : '+e.message);}
}


async function validateReturn(loanId){
  if(!_requirePrivileged('validateReturn'))return;
  const l=loans.find(x=>x.id==loanId);
  if(!l)return;
  if(!confirm('Valider le retour de "'+l.bookTitle+'" ?'))return;
  try{
    const now=new Date().toISOString();
    await sbUpd('loans',loanId,{status:'returned',validatedAt:now,validatedBy:curUser?.abbrev||'?'});
    l.status='returned';l.validatedAt=now;l.validatedBy=curUser?.abbrev||'?';
    const b=books.find(x=>x.id==l.bookId);
    if(b){
      const stillActive=loans.filter(x=>x.bookId==l.bookId&&(x.status==='active'||x.status==='pending_return')&&x.id!==loanId).length;
      b.status='available';
      const upd={status:'available',activeLoans:stillActive};
      if(stillActive===0){b.borrowedBy=null;b.borrowedUntil=null;upd.borrowedBy=null;upd.borrowedUntil=null;}
      await sbUpd('books',l.bookId,upd);
    }
    _cachePut({loans,books});
    rLoans('active');rAdmLoans();rCat();updAdmLoansBadge();
    /* Purger l'historique du membre : garder seulement les 5 derniers emprunts terminés */
    const memberHistoric=loans
      .filter(x=>x.userId==l.userId&&(x.status==='returned'||x.status==='rejected')&&x.id!==loanId)
      .sort((a,b)=>(b.requestedAt||'').localeCompare(a.requestedAt||''));
    if(memberHistoric.length>=5){
      const toDelete=memberHistoric.slice(4);
      for(const old of toDelete){
        try{await sbDel('loans',old.id);}catch(e){console.warn('[purge history]',e.message);}
      }
    }
  }catch(e){alert('Erreur : '+e.message);}
}

async function rejectReturn(loanId){
  if(!_requirePrivileged('rejectReturn'))return;
  const l=loans.find(x=>x.id==loanId);
  if(!l)return;
  if(!confirm('Rejeter le retour de "'+l.bookTitle+'" ? L\'emprunt repassera en statut actif.'))return;
  try{
    await sbUpd('loans',loanId,{status:'active',returnedAt:null});
    l.status='active';l.returnedAt=null;
    _cachePut({loans});
    rLoans('active');rAdmLoans();updAdmLoansBadge();
  }catch(e){alert('Erreur : '+e.message);}
}

/* ═══════════════════════════════════════════════════════════════
   DÉMARRAGE
═══════════════════════════════════════════════════════════════ */
/* Fiabilise le tap sur les barres d'onglets scrollables (.anv).
   Problème : la barre défile horizontalement ; un micro-déplacement du
   doigt pendant le tap fait que le navigateur annule le click natif
   (« ne fonctionne pas toujours »). Solution : sur un tap quasi-immobile
   (< 10px), on déclenche l'onglet nous-mêmes via Pointer Events.
   - Tactile uniquement (souris/desktop : click natif inchangé).
   - Délégation sur document (capte aussi les onglets re-rendus).
   - Le click natif qui suit notre tap est avalé pour éviter un double appel. */
(function _initTabTap(){
  let sx=0,sy=0,moved=false,downBtn=null,synthBtn=null,synthAt=0;
  const findTab=t=>(t&&t.closest)?t.closest('.at'):null;
  document.addEventListener('pointerdown',e=>{
    if(e.pointerType==='mouse'){downBtn=null;return;}
    const b=findTab(e.target);
    downBtn=b;sx=e.clientX;sy=e.clientY;moved=false;
  },true);
  document.addEventListener('pointermove',e=>{
    if(downBtn&&(Math.abs(e.clientX-sx)>10||Math.abs(e.clientY-sy)>10))moved=true;
  },true);
  document.addEventListener('pointercancel',()=>{downBtn=null;},true);
  document.addEventListener('pointerup',e=>{
    if(e.pointerType==='mouse')return;
    const b=findTab(e.target);
    if(downBtn&&b===downBtn&&!moved&&!b.disabled){
      b.click();                       /* laisse passer notre clic synthétique */
      synthBtn=b;synthAt=Date.now();   /* puis arme le garde pour le clic natif suivant */
    }
    downBtn=null;
  },true);
  /* Avale le click natif émis juste après notre tap synthétique (anti-doublon) */
  document.addEventListener('click',e=>{
    const b=findTab(e.target);
    if(b&&b===synthBtn&&Date.now()-synthAt<600){
      synthBtn=null;e.stopPropagation();e.preventDefault();
    }
  },true);
})();

/* Failsafe : masquer l'écran de démarrage après 12s quoi qu'il arrive */
setTimeout(()=>{const sp=document.getElementById('cb-splash');if(sp)sp.remove();},12000);
loadAllData();