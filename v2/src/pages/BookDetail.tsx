import { useParams } from 'react-router-dom'
import { PageHeader } from '@/components/PageHeader'
import { useBook } from '@/features/catalogue/useBooks'
import { safeEmoji, statusInfo } from '@/lib/format'

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
