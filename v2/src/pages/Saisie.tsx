import { useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { PageHeader } from '@/components/PageHeader'
import { SectionPicker, type Section } from '@/components/SectionPicker'
import { useBooks } from '@/features/catalogue/useBooks'
import { useShelfChecks } from '@/features/admin/useShelfChecks'
import { supabase } from '@/lib/supabase'
import { SPACE_ID } from '@/lib/space'
import { nextId } from '@/lib/counters'
import { useAuth } from '@/lib/auth'
import type { Book } from '@/lib/types'

const LANGS = ['Français', 'Anglais', 'Espagnol', 'Portugais', 'Autre…']

const EMPTY_FORM = {
  titre: '',
  auteur: '',
  cat: '',
  catType: 'academique' as 'academique' | 'spirituel',
  lang: '',
  langCustom: '',
  salle: '',
  placard: '',
  etagere: '',
  annee: '',
  expl: '1',
  editeur: '',
  resume: '',
  ancienNouv: '',
  etat: '',
  emoji: '📖',
  featured: false,
}

type BookForm = typeof EMPTY_FORM

function bookToForm(b: Book): BookForm {
  const KNOWN_LANGS = ['Français', 'Anglais', 'Espagnol', 'Portugais']
  const langKnown = KNOWN_LANGS.includes(b.lang ?? '')
  return {
    titre: b.titre,
    auteur: b.auteur,
    cat: b.cat,
    catType: b.catType,
    lang: langKnown ? (b.lang ?? '') : b.lang ? 'Autre…' : '',
    langCustom: langKnown ? '' : (b.lang ?? ''),
    salle: b.salle,
    placard: b.placard,
    etagere: b.etagere,
    annee: b.annee != null ? String(b.annee) : '',
    expl: String(b.expl ?? 1),
    editeur: b.editeur ?? '',
    resume: b.resume ?? '',
    ancienNouv: b.ancienNouv ?? '',
    etat: b.etat ?? '',
    emoji: b.emoji ?? '📖',
    featured: b.featured ?? false,
  }
}

export function Saisie() {
  const { user } = useAuth()
  const [searchParams] = useSearchParams()
  const { data: books } = useBooks()

  // /saisie?edit=123 → pré-remplit le formulaire
  const editId = searchParams.get('edit') ? Number(searchParams.get('edit')) : null
  const editBook = editId ? (books ?? []).find((b) => b.id === editId) ?? null : null

  const defaultSection = editId ? 'modifier' : 'ajouter'

  const sections: Section[] = [
    { key: 'ajouter', label: 'Ajouter' },
    { key: 'modifier', label: 'Modifier' },
    { key: 'etageres', label: 'Étagères' },
  ]
  const [section, setSection] = useState(defaultSection)

  return (
    <div>
      <PageHeader title="Saisie catalogue" />
      <SectionPicker sections={sections} value={section} onChange={setSection} />
      {section === 'ajouter' && <BookForm books={books ?? []} user={user} />}
      {section === 'modifier' && <ModifierSection books={books ?? []} user={user} initialBook={editBook} />}
      {section === 'etageres' && <EtagereSection books={books ?? []} user={user} />}
    </div>
  )
}

/* ─── Formulaire ajout / modification ─── */
function BookForm({
  books,
  user,
  editBook,
  onSaved,
}: {
  books: Book[]
  user: ReturnType<typeof useAuth>['user']
  editBook?: Book | null
  onSaved?: () => void
}) {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const isEdit = !!editBook
  const [form, setForm] = useState<BookForm>(editBook ? bookToForm(editBook) : EMPTY_FORM)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState('')

  const salles = useMemo(() => [...new Set(books.map((b) => b.salle).filter(Boolean))].sort(), [books])
  const placards = useMemo(() => [...new Set(books.map((b) => b.placard).filter(Boolean))].sort(), [books])
  const etageres = useMemo(() => [...new Set(books.map((b) => b.etagere).filter(Boolean))].sort(), [books])
  const cats = useMemo(() => [...new Set(books.map((b) => b.cat).filter(Boolean))].sort(), [books])

  function set(field: keyof BookForm) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      setForm((prev) => ({ ...prev, [field]: e.target.value }))
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const titre = form.titre.trim()
    const auteur = form.auteur.trim()
    const salle = form.salle.trim()
    const placard = form.placard.trim()
    const etagere = form.etagere.trim()
    if (!titre || !auteur) { setErr('Titre et auteur sont obligatoires.'); return }
    if (!salle || !placard || !etagere) { setErr('Salle, Placard et Étagère sont obligatoires.'); return }

    setBusy(true)
    setErr('')
    const lang = form.lang === 'Autre…' ? form.langCustom.trim() : form.lang
    const now = new Date().toISOString()
    const who = user?.abbrev ?? '?'
    const fields = {
      titre, auteur,
      cat: form.cat.trim() || 'Général',
      catType: form.catType,
      lang,
      salle, placard, etagere,
      annee: parseInt(form.annee) || null,
      expl: parseInt(form.expl) || 1,
      editeur: form.editeur.trim(),
      resume: form.resume.trim(),
      ancienNouv: form.ancienNouv,
      etat: form.etat,
      emoji: form.emoji || '📖',
      featured: form.featured,
      updatedAt: now,
      updatedBy: who,
      lastModifiedBy: user ? `${user.prenom} ${user.nom}` : '?',
      lastModifiedAt: now,
      lastModifiedRole: user?.role ?? '?',
    }

    try {
      if (isEdit && editBook) {
        const { error } = await supabase
          .from('books')
          .update({ ...fields, version: (editBook.version ?? 0) + 1 })
          .eq('id', editBook.id)
          .eq('space_code', SPACE_ID)
        if (error) throw new Error(error.message)
        qc.invalidateQueries({ queryKey: ['books', SPACE_ID] })
        qc.invalidateQueries({ queryKey: ['book', SPACE_ID, editBook.id] })
        setDone(`« ${titre} » modifié.`)
      } else {
        // Nouveau livre : anti-collision nxB
        const { data: ctr } = await supabase
          .from('space_counters').select('nxB').eq('space_code', SPACE_ID).maybeSingle()
        const freshNxB = (ctr?.nxB as number | undefined) ?? 1
        const maxExisting = books.reduce((m, b) => Math.max(m, b.id), 0)
        const newId = Math.max(freshNxB, maxExisting + 1)
        const { error: cErr } = await supabase
          .from('space_counters').upsert({ space_code: SPACE_ID, nxB: newId + 1 })
        if (cErr) throw new Error(cErr.message)
        const nb = {
          id: newId, space_code: SPACE_ID,
          ...fields,
          ancienNouv: '', etat: '', emoji: '📖', featured: false,
          status: 'available', addedAt: now, version: 1,
        }
        const { error: bErr } = await supabase.from('books').insert(nb)
        if (bErr) throw new Error(bErr.message)
        qc.invalidateQueries({ queryKey: ['books', SPACE_ID] })
        navigate(`/livre/${newId}`)
      }
      onSaved?.()
    } catch (e) {
      setErr('Erreur : ' + (e instanceof Error ? e.message : String(e)))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="px-4 py-4 space-y-4 pb-10">
      {done && (
        <div className="rounded-xl bg-green-50 px-4 py-3 text-sm font-medium text-green-700">
          ✅ {done}
        </div>
      )}

      <FSection title="Identification *">
        <FField label="Titre *">
          <input required value={form.titre} onChange={set('titre')} className="field-input" placeholder="Titre du livre" />
        </FField>
        <FField label="Auteur *">
          <input required value={form.auteur} onChange={set('auteur')} className="field-input" placeholder="Prénom Nom" />
        </FField>
      </FSection>

      <FSection title="Classification">
        <FField label="Catégorie">
          <input value={form.cat} onChange={set('cat')} list="dl-cat" className="field-input" placeholder="ex. Philosophie" />
          <datalist id="dl-cat">{cats.map((v) => <option key={v} value={v} />)}</datalist>
        </FField>
        <FField label="Type">
          <select value={form.catType} onChange={set('catType')} className="field-input">
            <option value="academique">📚 Académique</option>
            <option value="spirituel">✝️ Spirituel</option>
          </select>
        </FField>
        <FField label="Langue">
          <select value={form.lang} onChange={set('lang')} className="field-input">
            <option value="">—</option>
            {LANGS.map((l) => <option key={l} value={l}>{l}</option>)}
          </select>
        </FField>
        {form.lang === 'Autre…' && (
          <FField label="Préciser">
            <input value={form.langCustom} onChange={set('langCustom')} className="field-input" placeholder="ex. Arabe" />
          </FField>
        )}
      </FSection>

      <FSection title="Localisation *">
        <FField label="Salle *">
          <input required value={form.salle} onChange={set('salle')} list="dl-sal" className="field-input" placeholder="ex. Salle A" />
          <datalist id="dl-sal">{salles.map((v) => <option key={v} value={v} />)}</datalist>
        </FField>
        <FField label="Placard *">
          <input required value={form.placard} onChange={set('placard')} list="dl-plc" className="field-input" placeholder="ex. P1" />
          <datalist id="dl-plc">{placards.map((v) => <option key={v} value={v} />)}</datalist>
        </FField>
        <FField label="Étagère *">
          <input required value={form.etagere} onChange={set('etagere')} list="dl-et" className="field-input" placeholder="ex. E2" />
          <datalist id="dl-et">{etageres.map((v) => <option key={v} value={v} />)}</datalist>
        </FField>
      </FSection>

      <FSection title="Détails">
        <FField label="Année">
          <input type="number" value={form.annee} onChange={set('annee')} className="field-input"
            placeholder="ex. 2021" min="1800" max={new Date().getFullYear()} />
        </FField>
        <FField label="Exemplaires">
          <input type="number" value={form.expl} onChange={set('expl')} className="field-input" min="1" max="99" />
        </FField>
        <FField label="Éditeur">
          <input value={form.editeur} onChange={set('editeur')} className="field-input" placeholder="Nom de l'éditeur" />
        </FField>
        <FField label="État">
          <input value={form.etat} onChange={set('etat')} className="field-input" placeholder="ex. Bon, Usé…" />
        </FField>
        <FField label="Ancien / Nouveau">
          <select value={form.ancienNouv} onChange={set('ancienNouv')} className="field-input">
            <option value="">—</option>
            <option value="Ancien">Ancien</option>
            <option value="Nouveau">Nouveau</option>
            <option value="Récent">Récent</option>
          </select>
        </FField>
        <FField label="Emoji">
          <input value={form.emoji} onChange={set('emoji')} className="field-input" placeholder="📖" />
        </FField>
        <FField label="Résumé">
          <textarea value={form.resume} onChange={set('resume')} className="field-input min-h-[80px] resize-none"
            placeholder="Résumé ou notes…" rows={3} />
        </FField>
      </FSection>

      <div className="rounded-2xl bg-white p-4 shadow-card">
        <label className="flex cursor-pointer items-center gap-3">
          <div className="relative">
            <input
              type="checkbox"
              checked={form.featured}
              onChange={(e) => setForm((prev) => ({ ...prev, featured: e.target.checked }))}
              className="sr-only"
            />
            <div className={`h-6 w-11 rounded-full transition-colors ${form.featured ? 'bg-amber-400' : 'bg-slate-200'}`} />
            <div className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${form.featured ? 'translate-x-5' : ''}`} />
          </div>
          <span className="text-sm font-medium text-slate-700">⭐ Mettre en avant</span>
        </label>
        <p className="mt-1 text-xs text-slate-400 pl-14">Le livre apparaîtra en tête du catalogue.</p>
      </div>

      {err && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">{err}</p>}

      <button type="submit" disabled={busy}
        className="w-full rounded-xl bg-comoe py-3.5 font-semibold text-white shadow-soft disabled:opacity-60">
        {busy ? 'Enregistrement…' : isEdit ? '💾 Enregistrer les modifications' : '+ Ajouter au catalogue'}
      </button>
    </form>
  )
}

/* ─── Onglet Modifier : recherche + sélection + formulaire ─── */
function ModifierSection({ books, user, initialBook }: { books: Book[]; user: ReturnType<typeof useAuth>['user']; initialBook?: Book | null }) {
  const [q, setQ] = useState('')
  const [selected, setSelected] = useState<Book | null>(initialBook ?? null)

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase()
    if (!t) return []
    return books
      .filter((b) => `${b.titre} ${b.auteur}`.toLowerCase().includes(t))
      .slice(0, 12)
  }, [books, q])

  if (selected) {
    return (
      <div>
        <div className="flex items-center gap-2 px-4 pt-3 pb-1">
          <button onClick={() => setSelected(null)} className="text-sm text-navy font-medium">← Retour</button>
          <span className="text-sm text-slate-500 truncate">{selected.titre}</span>
        </div>
        <BookForm books={books} user={user} editBook={selected} onSaved={() => setSelected(null)} />
      </div>
    )
  }

  return (
    <div className="px-4 pt-4 pb-10">
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Rechercher un livre à modifier…"
        className="mb-3 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-[15px] shadow-card focus:border-navy focus:outline-none"
      />
      {q.trim() && filtered.length === 0 && (
        <p className="py-8 text-center text-slate-400 text-sm">Aucun résultat.</p>
      )}
      <ul className="space-y-2">
        {filtered.map((b) => (
          <li key={b.id}>
            <button onClick={() => setSelected(b)}
              className="w-full rounded-xl border border-slate-100 bg-white p-3 shadow-card text-left active:opacity-80">
              <div className="font-semibold text-slate-800 truncate">{b.titre}</div>
              <div className="text-sm text-slate-500">{b.auteur || '—'} · {b.salle} {b.placard} {b.etagere}</div>
            </button>
          </li>
        ))}
      </ul>
      {!q.trim() && (
        <p className="py-10 text-center text-slate-400 text-sm">Tapez le titre ou l'auteur pour rechercher.</p>
      )}
    </div>
  )
}

/* ─── Onglet Étagères (enrôleur : étagères assignées) ─── */
function EtagereSection({ books, user }: { books: Book[]; user: ReturnType<typeof useAuth>['user'] }) {
  const qc = useQueryClient()
  const { data: checks } = useShelfChecks()
  const [busy, setBusy] = useState<string | null>(null)

  const assigned: string[] = user?.assignedShelves ?? []
  const today = new Date().toISOString().split('T')[0]

  async function markChecked(shelfKey: string) {
    if (!user) return
    setBusy(shelfKey)
    const [salle, placard, etagere] = shelfKey.split('|')
    const booksHere = books.filter((b) => b.salle === salle && b.placard === placard && b.etagere === etagere)
    try {
      const id = await nextId('nxSC')
      const entry = {
        id,
        space_code: SPACE_ID,
        userId: user.id,
        userName: `${user.prenom} ${user.nom}`,
        userRole: user.role,
        shelfKey,
        salle, placard, etagere,
        checkedAt: new Date().toISOString(),
        booksCount: booksHere.length,
        missingCount: booksHere.filter((b) => b.status === 'missing').length,
        modifiedCount: 0,
      }
      const { error } = await supabase.from('shelf_checks').insert(entry)
      if (error) throw new Error(error.message)
      qc.invalidateQueries({ queryKey: ['shelfChecks', SPACE_ID] })
    } catch (e) {
      alert('Erreur : ' + (e instanceof Error ? e.message : String(e)))
    } finally {
      setBusy(null)
    }
  }

  if (!assigned.length) {
    return (
      <div className="px-4 py-10 text-center text-slate-400">
        <div className="text-4xl mb-3">📚</div>
        <p className="text-sm">Aucune étagère ne vous a été assignée.<br />Contactez l'administrateur.</p>
      </div>
    )
  }

  return (
    <div className="px-3 py-4 space-y-2 pb-10">
      {assigned.map((key) => {
        const [salle, placard, etagere] = key.split('|')
        const booksHere = books.filter((b) => b.salle === salle && b.placard === placard && b.etagere === etagere)
        const missing = booksHere.filter((b) => b.status === 'missing').length
        const myChecks = (checks ?? [])
          .filter((c) => c.shelfKey === key && c.userId === user?.id)
          .sort((a, b) => b.checkedAt.localeCompare(a.checkedAt))
        const lastCheck = myChecks[0]
        const checkedToday = !!lastCheck?.checkedAt.startsWith(today)
        const lastDate = lastCheck
          ? new Date(lastCheck.checkedAt).toLocaleString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
          : 'Jamais'

        return (
          <div key={key} className="rounded-xl border border-slate-100 bg-white p-3 shadow-card">
            <div className="flex items-start gap-3">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-xl shrink-0 ${
                checkedToday ? 'bg-green-100' : missing > 0 ? 'bg-red-100' : 'bg-sky-100'
              }`}>
                {checkedToday ? '✅' : missing > 0 ? '⚠️' : '📚'}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-slate-800">{salle}</div>
                <div className="text-sm text-slate-500">Placard {placard} — Étagère {etagere}</div>
                <div className="mt-0.5 text-xs text-slate-400">
                  {booksHere.length} livre(s) ·{' '}
                  {missing > 0
                    ? <span className="text-red-600 font-semibold">{missing} introuvable(s)</span>
                    : <span className="text-green-600">Tous présents</span>
                  }
                </div>
                <div className="text-xs text-slate-400 mt-0.5">Dernière vérif. : {lastDate}</div>
              </div>
            </div>
            {checkedToday ? (
              <div className="mt-2 rounded-lg bg-green-50 py-2 text-center text-xs font-semibold text-green-600">
                ✅ Vérifiée aujourd'hui
              </div>
            ) : (
              <button
                onClick={() => markChecked(key)}
                disabled={busy === key}
                className="mt-2 w-full rounded-xl bg-navy py-2.5 text-sm font-semibold text-white disabled:opacity-60"
              >
                {busy === key ? '…' : '✅ Marquer vérifiée'}
              </button>
            )}
          </div>
        )
      })}
    </div>
  )
}

function FSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-white p-4 shadow-card space-y-3">
      <h3 className="text-xs font-bold uppercase tracking-wide text-slate-400">{title}</h3>
      {children}
    </div>
  )
}

function FField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-slate-500">{label}</span>
      {children}
    </label>
  )
}
