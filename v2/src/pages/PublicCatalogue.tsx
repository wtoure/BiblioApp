import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { BookCard } from '@/components/BookCard'
import { useBooks } from '@/features/catalogue/useBooks'
import { useConfig } from '@/features/config/useConfig'
import { supabase } from '@/lib/supabase'
import type { Space } from '@/lib/types'

const PER_PAGE = 24 // miroir de PUB_PER_PAGE (desktop)

function useSpace(code: string) {
  return useQuery({
    queryKey: ['space', code],
    queryFn: async (): Promise<Space | null> => {
      const { data, error } = await supabase.from('spaces').select('*').eq('code', code).maybeSingle()
      if (error) throw new Error(error.message)
      return (data as Space) ?? null
    },
  })
}

export function PublicCatalogue() {
  const { code = '' } = useParams()
  const space = useSpace(code)
  const { data: config } = useConfig()
  const { data: books, isLoading, error } = useBooks(code)
  const [q, setQ] = useState('')
  const [cat, setCat] = useState('')
  const [page, setPage] = useState(1)
  const [showReg, setShowReg] = useState(false)

  // Vue publique : académique uniquement, hors livres retirés/introuvables.
  const pubBooks = useMemo(
    () => (books ?? []).filter((b) => b.catType !== 'spirituel' && b.status !== 'retired' && b.status !== 'missing'),
    [books],
  )

  const cats = useMemo(
    () => [...new Set(pubBooks.map((b) => b.cat).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'fr')),
    [pubBooks],
  )

  const filtered = useMemo(() => {
    let list = pubBooks
    if (cat) list = list.filter((b) => b.cat === cat)
    const term = q.trim().toLowerCase()
    if (term)
      list = list.filter(
        (b) => b.titre?.toLowerCase().includes(term) || b.auteur?.toLowerCase().includes(term),
      )
    return list
  }, [pubBooks, q, cat])

  // Réinitialise la pagination quand un filtre change.
  useEffect(() => {
    setPage(1)
  }, [q, cat])

  const pages = Math.max(1, Math.ceil(filtered.length / PER_PAGE))
  const safePage = Math.min(page, pages)
  const slice = filtered.slice((safePage - 1) * PER_PAGE, safePage * PER_PAGE)

  if (space.data === null && !space.isLoading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center px-6 text-center">
        <div className="mb-3 text-5xl">📚</div>
        <p className="font-semibold text-slate-700">Bibliothèque introuvable</p>
        <p className="mt-1 text-sm text-slate-500">
          Le code « {code} » ne correspond à aucune bibliothèque active.
        </p>
      </div>
    )
  }

  return (
    <div className="min-h-screen pb-10">
      <header className="sticky top-0 z-30 bg-navy-dark px-4 py-4 text-white shadow-soft">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="font-serif text-2xl font-semibold leading-tight">
              {space.data?.name ?? 'Catalogue'}
            </h1>
            <p className="text-xs text-white/60">Catalogue public · {filtered.length} livre(s)</p>
          </div>
        </div>
        <div className="mt-3 flex gap-2">
          <button
            onClick={() => setShowReg(true)}
            className="flex-1 rounded-lg bg-comoe py-2 text-sm font-semibold text-white active:opacity-90"
          >
            ✍️ S'inscrire
          </button>
          <Link
            to={`/${code}`}
            className="flex-1 rounded-lg border border-white/40 py-2 text-center text-sm font-semibold text-white active:bg-white/10"
          >
            🔑 Connexion
          </Link>
        </div>
      </header>

      <div className="px-3 pt-3">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Rechercher un titre ou un auteur…"
          className="mb-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-[15px] shadow-card focus:border-navy focus:outline-none"
        />
        {cats.length > 0 && (
          <select
            value={cat}
            onChange={(e) => setCat(e.target.value)}
            className="mb-3 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-[15px] shadow-card focus:border-navy focus:outline-none"
          >
            <option value="">Toutes les catégories</option>
            {cats.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        )}

        {isLoading && <p className="py-10 text-center text-slate-400">Chargement du catalogue…</p>}
        {error && <p className="py-10 text-center text-red-600">Erreur : {(error as Error).message}</p>}

        {!isLoading && !error && (
          <>
            <ul className="space-y-2">
              {slice.map((b) => (
                <li key={b.id}>
                  <BookCard book={b} />
                </li>
              ))}
              {filtered.length === 0 && (
                <li className="py-10 text-center text-slate-400">Aucun livre trouvé.</li>
              )}
            </ul>

            {pages > 1 && (
              <div className="mt-4 flex items-center justify-center gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={safePage === 1}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-600 disabled:opacity-40"
                >
                  ‹
                </button>
                <span className="text-sm font-medium text-slate-500">
                  Page {safePage} / {pages}
                </span>
                <button
                  onClick={() => setPage((p) => Math.min(pages, p + 1))}
                  disabled={safePage === pages}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-600 disabled:opacity-40"
                >
                  ›
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {showReg && (
        <RegisterModal
          code={code}
          countryCode={config?.countryCode ?? null}
          meetingPlace={config?.meetingPlace ?? null}
          meetingTime={config?.meetingTime ?? null}
          onClose={() => setShowReg(false)}
        />
      )}
    </div>
  )
}

/* ─── Formulaire d'inscription publique (cf. openPubRegister / submitPubRegister desktop) ─── */
function RegisterModal({
  code,
  countryCode,
  meetingPlace,
  meetingTime,
  onClose,
}: {
  code: string
  countryCode: string | null
  meetingPlace: string | null
  meetingTime: string | null
  onClose: () => void
}) {
  const [prenom, setPrenom] = useState('')
  const [nom, setNom] = useState('')
  const [whatsapp, setWhatsapp] = useState(countryCode ? countryCode + ' ' : '')
  const [commune, setCommune] = useState('')
  const [profession, setProfession] = useState('')
  const [email, setEmail] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)

  async function submit() {
    if (!prenom.trim() || !nom.trim() || !whatsapp.trim() || !commune.trim() || !email.trim()) {
      setErr('Les champs marqués * sont obligatoires.')
      return
    }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) {
      setErr('Veuillez saisir une adresse e-mail valide (elle servira à créer votre compte).')
      return
    }
    setBusy(true)
    setErr('')
    try {
      const entry = {
        id: 'reg_' + Date.now(),
        space_code: code,
        prenom: prenom.trim(),
        nom: nom.trim(),
        whatsapp: whatsapp.trim(),
        commune: commune.trim(),
        profession: profession.trim(),
        email: email.trim().toLowerCase(),
        status: 'pending',
        submittedAt: new Date().toISOString(),
      }
      const { error } = await supabase.from('registrations').insert(entry)
      if (error) throw new Error(error.message)
      setDone(true)
    } catch (e) {
      setErr("Erreur lors de l'envoi : " + (e instanceof Error ? e.message : String(e)))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      onClick={(e) => e.target === e.currentTarget && onClose()}
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/55 sm:items-center"
    >
      <div className="max-h-[94vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-white sm:rounded-2xl">
        {done ? (
          <div className="px-6 py-8 text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100 text-3xl">
              ✅
            </div>
            <h2 className="text-lg font-bold text-slate-800">Demande envoyée, {prenom.trim()} !</h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-500">
              Votre demande d'inscription a bien été enregistrée. Pour la finaliser, présentez-vous
              auprès de l'administrateur :
            </p>
            {(meetingPlace || meetingTime) && (
              <div className="mt-4 space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-4 text-left">
                {meetingPlace && (
                  <div className="flex gap-2 text-sm text-slate-700">
                    <span>📍</span>
                    <span>{meetingPlace}</span>
                  </div>
                )}
                {meetingTime && (
                  <div className="flex gap-2 text-sm text-slate-700">
                    <span>🕒</span>
                    <span>{meetingTime}</span>
                  </div>
                )}
              </div>
            )}
            <button
              onClick={onClose}
              className="mt-6 w-full rounded-xl bg-navy py-3 font-semibold text-white"
            >
              Compris, merci
            </button>
          </div>
        ) : (
          <>
            <div className="rounded-t-2xl bg-navy px-5 py-5 text-white">
              <div className="text-lg font-bold">✍️ Demande d'inscription</div>
              <div className="text-sm text-white/80">Remplissez ce formulaire pour rejoindre la bibliothèque</div>
            </div>
            <div className="space-y-3 px-5 py-4">
              <RegField label="Prénom *" value={prenom} onChange={setPrenom} />
              <RegField label="Nom *" value={nom} onChange={setNom} />
              <RegField label="Numéro WhatsApp *" value={whatsapp} onChange={setWhatsapp} type="tel" />
              <RegField label="Commune *" value={commune} onChange={setCommune} placeholder="Ex : Cocody" />
              <RegField label="Profession" value={profession} onChange={setProfession} placeholder="Ex : Étudiant" />
              <RegField label="E-mail *" value={email} onChange={setEmail} type="email" placeholder="vous@exemple.com" />
              <p className="-mt-1 text-xs text-slate-400">
                Votre e-mail servira à créer votre compte (mot de passe à définir après validation).
              </p>
              {err && <p className="text-sm text-red-600">{err}</p>}
              {(meetingPlace || meetingTime) && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                  <div className="mb-1 font-semibold">📌 Pour finaliser votre inscription</div>
                  {meetingPlace && <div>📍 {meetingPlace}</div>}
                  {meetingTime && <div>🕒 {meetingTime}</div>}
                </div>
              )}
            </div>
            <div className="flex gap-2 px-5 pb-5">
              <button
                onClick={onClose}
                className="flex-1 rounded-xl border border-slate-200 py-3 font-semibold text-slate-600"
              >
                Annuler
              </button>
              <button
                onClick={submit}
                disabled={busy}
                className="flex-[2] rounded-xl bg-green-600 py-3 font-semibold text-white disabled:opacity-60"
              >
                {busy ? 'Envoi…' : 'Envoyer ma demande'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function RegField({
  label,
  value,
  onChange,
  type = 'text',
  placeholder,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  type?: string
  placeholder?: string
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-slate-500">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-[15px] focus:border-navy focus:outline-none"
      />
    </label>
  )
}
