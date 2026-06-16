import { useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { PageHeader } from '@/components/PageHeader'
import { useBooks } from '@/features/catalogue/useBooks'
import { supabase } from '@/lib/supabase'
import { SPACE_ID } from '@/lib/space'
import { useAuth } from '@/lib/auth'

const LANGS = ['Français', 'Anglais', 'Espagnol', 'Portugais', 'Autre…']

const EMPTY = {
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
}

export function Saisie() {
  const { user } = useAuth()
  const qc = useQueryClient()
  const { data: books } = useBooks()
  const [form, setForm] = useState(EMPTY)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [lastAdded, setLastAdded] = useState<string | null>(null)

  // Valeurs uniques pour les datalists
  const salles = useMemo(() => [...new Set((books ?? []).map((b) => b.salle).filter(Boolean))].sort(), [books])
  const placards = useMemo(() => [...new Set((books ?? []).map((b) => b.placard).filter(Boolean))].sort(), [books])
  const etageres = useMemo(() => [...new Set((books ?? []).map((b) => b.etagere).filter(Boolean))].sort(), [books])
  const cats = useMemo(() => [...new Set((books ?? []).map((b) => b.cat).filter(Boolean))].sort(), [books])

  function set(field: keyof typeof EMPTY) {
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
    try {
      // Compteur frais anti-collision (cf. savBk desktop)
      const { data: ctr } = await supabase
        .from('space_counters')
        .select('nxB')
        .eq('space_code', SPACE_ID)
        .maybeSingle()
      const freshNxB = (ctr?.nxB as number | undefined) ?? 1
      const maxExisting = (books ?? []).reduce((m, b) => Math.max(m, b.id), 0)
      const newId = Math.max(freshNxB, maxExisting + 1)

      // 1. Réserver le compteur en premier
      const { error: cErr } = await supabase
        .from('space_counters')
        .upsert({ space_code: SPACE_ID, nxB: newId + 1 })
      if (cErr) throw new Error(cErr.message)

      const lang = form.lang === 'Autre…' ? form.langCustom.trim() : form.lang
      const now = new Date().toISOString()
      const nb = {
        id: newId,
        space_code: SPACE_ID,
        titre,
        auteur,
        cat: form.cat.trim() || 'Général',
        catType: form.catType,
        lang,
        salle,
        placard,
        etagere,
        annee: parseInt(form.annee) || null,
        expl: parseInt(form.expl) || 1,
        ancienNouv: '',
        etat: '',
        editeur: form.editeur.trim(),
        resume: form.resume.trim(),
        emoji: '📖',
        featured: false,
        status: 'available',
        addedAt: now,
        updatedAt: now,
        updatedBy: user?.abbrev ?? '?',
        version: 1,
        lastModifiedBy: user ? `${user.prenom} ${user.nom}` : '?',
        lastModifiedAt: now,
        lastModifiedRole: user?.role ?? '?',
      }

      // 2. Insérer le livre
      const { error: bErr } = await supabase.from('books').insert(nb)
      if (bErr) throw new Error(bErr.message)

      qc.invalidateQueries({ queryKey: ['books', SPACE_ID] })
      setLastAdded(`« ${titre} » (ID ${newId}) ajouté avec succès.`)
      setForm(EMPTY)
    } catch (e) {
      setErr('Erreur : ' + (e instanceof Error ? e.message : String(e)))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <PageHeader title="Saisie catalogue" />
      <form onSubmit={submit} className="px-4 py-4 space-y-4 pb-10">
        {lastAdded && (
          <div className="rounded-xl bg-green-50 px-4 py-3 text-sm font-medium text-green-700">
            ✅ {lastAdded}
          </div>
        )}

        <Section title="Identification *">
          <Field label="Titre *">
            <input required value={form.titre} onChange={set('titre')}
              className="field-input" placeholder="Titre du livre" />
          </Field>
          <Field label="Auteur *">
            <input required value={form.auteur} onChange={set('auteur')}
              className="field-input" placeholder="Prénom Nom" />
          </Field>
        </Section>

        <Section title="Classification">
          <Field label="Catégorie">
            <input value={form.cat} onChange={set('cat')}
              list="dl-cat" className="field-input" placeholder="ex. Philosophie" />
            <datalist id="dl-cat">{cats.map((v) => <option key={v} value={v} />)}</datalist>
          </Field>
          <Field label="Type">
            <select value={form.catType} onChange={set('catType')} className="field-input">
              <option value="academique">📚 Académique</option>
              <option value="spirituel">✝️ Spirituel</option>
            </select>
          </Field>
          <Field label="Langue">
            <select value={form.lang} onChange={set('lang')} className="field-input">
              <option value="">—</option>
              {LANGS.map((l) => <option key={l} value={l}>{l}</option>)}
            </select>
          </Field>
          {form.lang === 'Autre…' && (
            <Field label="Préciser la langue">
              <input value={form.langCustom} onChange={set('langCustom')} className="field-input" placeholder="ex. Arabe" />
            </Field>
          )}
        </Section>

        <Section title="Localisation *">
          <Field label="Salle *">
            <input required value={form.salle} onChange={set('salle')}
              list="dl-sal" className="field-input" placeholder="ex. Salle A" />
            <datalist id="dl-sal">{salles.map((v) => <option key={v} value={v} />)}</datalist>
          </Field>
          <Field label="Placard *">
            <input required value={form.placard} onChange={set('placard')}
              list="dl-plc" className="field-input" placeholder="ex. P1" />
            <datalist id="dl-plc">{placards.map((v) => <option key={v} value={v} />)}</datalist>
          </Field>
          <Field label="Étagère *">
            <input required value={form.etagere} onChange={set('etagere')}
              list="dl-et" className="field-input" placeholder="ex. E2" />
            <datalist id="dl-et">{etageres.map((v) => <option key={v} value={v} />)}</datalist>
          </Field>
        </Section>

        <Section title="Détails">
          <Field label="Année">
            <input type="number" value={form.annee} onChange={set('annee')}
              className="field-input" placeholder="ex. 2021" min="1800" max={new Date().getFullYear()} />
          </Field>
          <Field label="Exemplaires">
            <input type="number" value={form.expl} onChange={set('expl')}
              className="field-input" min="1" max="99" />
          </Field>
          <Field label="Éditeur">
            <input value={form.editeur} onChange={set('editeur')} className="field-input" placeholder="Nom de l'éditeur" />
          </Field>
          <Field label="Résumé">
            <textarea value={form.resume} onChange={set('resume')}
              className="field-input min-h-[80px] resize-none" placeholder="Résumé ou notes…" rows={3} />
          </Field>
        </Section>

        {err && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">{err}</p>}

        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-xl bg-comoe py-3.5 font-semibold text-white shadow-soft disabled:opacity-60"
        >
          {busy ? 'Enregistrement…' : '+ Ajouter au catalogue'}
        </button>
      </form>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-white p-4 shadow-card space-y-3">
      <h3 className="text-xs font-bold uppercase tracking-wide text-slate-400">{title}</h3>
      {children}
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-slate-500">{label}</span>
      {children}
    </label>
  )
}
