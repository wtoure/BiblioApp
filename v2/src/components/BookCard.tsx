import { safeEmoji, statusInfo } from '@/lib/format'
import type { Book, CatType } from '@/lib/types'

interface Props {
  book: Book
  onClick?: () => void
}

/** Carte livre — pastilles en texte coloré (aucune dépendance aux polices emoji). */
export function BookCard({ book, onClick }: Props) {
  const Wrapper = onClick ? 'button' : 'div'
  return (
    <Wrapper
      onClick={onClick}
      className={`flex w-full items-start gap-3 rounded-xl border border-slate-100 bg-white p-3 text-left shadow-card ${
        onClick ? 'active:bg-slate-50' : ''
      }`}
    >
      <span className="text-2xl leading-none">{safeEmoji(book.emoji)}</span>
      <div className="min-w-0 flex-1">
        <div className="truncate font-semibold text-slate-800">{book.titre}</div>
        <div className="truncate text-sm text-slate-500">{book.auteur || '—'}</div>
        <div className="mt-1 flex flex-wrap gap-1.5">
          <CatBadge type={book.catType} />
          {book.salle && <Chip>{book.salle}</Chip>}
          <StatusBadge status={book.status} />
        </div>
      </div>
    </Wrapper>
  )
}

function CatBadge({ type }: { type: CatType }) {
  return type === 'spirituel' ? (
    <span className="rounded-full bg-purple-100 px-2 py-0.5 text-[11px] font-semibold text-purple-700">
      Spirituel
    </span>
  ) : (
    <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-semibold text-sky-700">
      Académique
    </span>
  )
}

function StatusBadge({ status }: { status: string }) {
  const s = statusInfo(status)
  return <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${s.cls}`}>{s.label}</span>
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
      {children}
    </span>
  )
}
