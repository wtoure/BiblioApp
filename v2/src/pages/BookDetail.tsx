import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { PageHeader } from '@/components/PageHeader'
import { useBook } from '@/features/catalogue/useBooks'
import { useLoans } from '@/features/loans/useLoans'
import { canRequestLoan, requestLoan } from '@/features/loans/loanRequest'
import { useAuth } from '@/lib/auth'
import { SPACE_ID } from '@/lib/space'
import { safeEmoji, statusInfo } from '@/lib/format'
import type { Book } from '@/lib/types'

export function BookDetail() {
  const { id } = useParams()
  const bookId = Number(id)
  const { data: book, isLoading, error } = useBook(bookId)

  if (isLoading)
    return (
      <div>
        <PageHeader title="Livre" back />
        <p className="py-10 text-center text-slate-400">Chargement…</p>
      </div>
    )

  if (error || !book)
    return (
      <div>
        <PageHeader title="Livre" back />
        <p className="py-10 text-center text-slate-500">
          {error ? (error as Error).message : 'Livre introuvable.'}
        </p>
      </div>
    )

  const s = statusInfo(book.status)
  const location = [book.salle, book.placard && `Placard ${book.placard}`, book.etagere && `Étagère ${book.etagere}`]
    .filter(Boolean)
    .join(' · ')

  return (
    <div>
      <PageHeader title="Fiche livre" back />
      <div className="px-4 py-4">
        <div className="flex items-start gap-4 rounded-2xl bg-white p-4 shadow-card">
          <span className="text-5xl leading-none">{safeEmoji(book.emoji)}</span>
          <div className="min-w-0 flex-1">
            <h2 className="font-serif text-2xl font-semibold leading-tight text-navy">
              {book.titre}
            </h2>
            <p className="mt-0.5 text-slate-600">{book.auteur || 'Auteur inconnu'}</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <span
                className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                  book.catType === 'spirituel'
                    ? 'bg-purple-100 text-purple-700'
                    : 'bg-sky-100 text-sky-700'
                }`}
              >
                {book.catType === 'spirituel' ? 'Spirituel' : 'Académique'}
              </span>
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${s.cls}`}>
                {s.label}
              </span>
            </div>
          </div>
        </div>

        <dl className="mt-4 divide-y divide-slate-100 rounded-2xl bg-white shadow-card">
          <Row label="Catégorie" value={book.cat} />
          <Row label="Emplacement" value={location || '—'} />
          {book.lang && <Row label="Langue" value={book.lang} />}
          {book.annee != null && <Row label="Année" value={String(book.annee)} />}
          {book.editeur && <Row label="Éditeur" value={book.editeur} />}
          <Row label="Exemplaires" value={String(book.expl)} />
        </dl>

        {book.resume && (
          <div className="mt-4 rounded-2xl bg-white p-4 shadow-card">
            <h3 className="mb-1.5 text-sm font-bold uppercase tracking-wide text-slate-500">
              Résumé
            </h3>
            <p className="text-[15px] leading-relaxed text-slate-700">{book.resume}</p>
          </div>
        )}

        <LoanCard book={book} />
      </div>
    </div>
  )
}

/** Carte « Emprunter ce livre » — affichée selon l'éligibilité (cf. canUserLoan). */
function LoanCard({ book }: { book: Book }) {
  const { user } = useAuth()
  const { data: loans } = useLoans()
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  const [dueDate, setDueDate] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [done, setDone] = useState(false)

  if (!user) return null

  const eligibility = canRequestLoan(user, book, loans ?? [])
  const tomorrow = new Date(Date.now() + 86_400_000).toISOString().split('T')[0]
  const isResident = user.role === 'resident'

  if (done)
    return (
      <div className="mt-4 rounded-2xl bg-green-50 p-4 text-center text-sm font-medium text-green-700 shadow-card">
        ✅ {isResident ? 'Emprunt confirmé !' : 'Demande d’emprunt envoyée !'}
        {!isResident && ' Elle sera examinée par un administrateur ou un validateur.'}
      </div>
    )

  if (!eligibility.ok)
    return (
      <div className="mt-4 rounded-2xl bg-slate-50 p-4 text-center text-sm text-slate-500 shadow-card">
        {eligibility.reason}
      </div>
    )

  async function confirm() {
    if (!dueDate) {
      setErr('La date de retour est obligatoire.')
      return
    }
    if (dueDate <= new Date().toISOString().split('T')[0]) {
      setErr('La date de retour doit être dans le futur.')
      return
    }
    setBusy(true)
    setErr('')
    try {
      await requestLoan(user!, book, loans ?? [], dueDate)
      qc.invalidateQueries({ queryKey: ['loans', SPACE_ID] })
      qc.invalidateQueries({ queryKey: ['books', SPACE_ID] })
      qc.invalidateQueries({ queryKey: ['book', SPACE_ID, book.id] })
      setDone(true)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setBusy(false)
    }
  }

  if (!open)
    return (
      <button
        onClick={() => setOpen(true)}
        className="mt-4 w-full rounded-xl bg-comoe py-3.5 font-semibold text-white shadow-soft active:opacity-90"
      >
        📕 Emprunter ce livre
      </button>
    )

  return (
    <div className="mt-4 space-y-3 rounded-2xl bg-white p-4 shadow-card">
      <p className="text-sm text-slate-600">
        {isResident
          ? 'En tant que résident, votre emprunt est validé immédiatement.'
          : 'Votre demande sera examinée par un administrateur ou un validateur.'}
      </p>
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-slate-500">Date de retour souhaitée</span>
        <input
          type="date"
          min={tomorrow}
          value={dueDate}
          onChange={(e) => setDueDate(e.target.value)}
          className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-[15px] focus:border-navy focus:outline-none"
        />
      </label>
      {err && <p className="text-sm text-red-600">{err}</p>}
      <div className="flex gap-2">
        <button
          onClick={() => setOpen(false)}
          className="flex-1 rounded-xl bg-slate-100 py-3 font-semibold text-slate-600"
        >
          Annuler
        </button>
        <button
          onClick={confirm}
          disabled={busy}
          className="flex-1 rounded-xl bg-comoe py-3 font-semibold text-white disabled:opacity-60"
        >
          {busy ? 'Envoi…' : 'Confirmer'}
        </button>
      </div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 px-4 py-3">
      <dt className="text-sm text-slate-500">{label}</dt>
      <dd className="text-right font-medium text-slate-800">{value}</dd>
    </div>
  )
}
