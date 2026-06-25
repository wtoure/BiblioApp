import { useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { PageHeader } from '@/components/PageHeader'
import { useLoans } from '@/features/loans/useLoans'
import { useBooks } from '@/features/catalogue/useBooks'
import { useUsers } from '@/features/requests/useRequests'
import { useAuth } from '@/lib/auth'
import { approveLoan, rejectLoan, validateReturn } from '@/features/loans/loanActions'
import { SPACE_ID } from '@/lib/space'
import type { Book, Loan } from '@/lib/types'

type Tab = 'pending' | 'active' | 'pending_return' | 'history'

const TABS: { key: Tab; label: string }[] = [
  { key: 'pending', label: 'À valider' },
  { key: 'active', label: 'En cours' },
  { key: 'pending_return', label: 'Retours' },
  { key: 'history', label: 'Historique' },
]

export function Emprunts() {
  const qc = useQueryClient()
  const { user: curUser } = useAuth()
  const { data: loans, isLoading } = useLoans()
  const { data: books } = useBooks()
  const { data: users } = useUsers()
  const [tab, setTab] = useState<Tab>('pending')
  const [busy, setBusy] = useState<string | null>(null)

  const isManager = curUser?.role === 'admin' || curUser?.role === 'validator' || curUser?.role === 'commission'

  const bookById = useMemo(() => {
    const m = new Map<number, Book>()
    ;(books ?? []).forEach((b) => m.set(b.id, b))
    return m
  }, [books])

  const userById = useMemo(() => {
    const m = new Map<number, { whatsapp: string; prenom: string }>()
    ;(users ?? []).forEach((u) => m.set(u.id, { whatsapp: u.whatsapp ?? '', prenom: u.prenom }))
    return m
  }, [users])

  function notifyByWhatsApp(l: Loan, type: 'approved' | 'rejected') {
    const info = l.userId != null ? userById.get(l.userId) : undefined
    const wa = (info?.whatsapp ?? '').replace(/[^0-9+]/g, '').replace(/^\+/, '')
    if (!wa) { alert('Ce membre n\'a pas de numéro WhatsApp enregistré.'); return }
    const prenom = info?.prenom ?? l.userName?.split(' ')[0] ?? 'Membre'
    let m: string
    if (type === 'approved') {
      m =
        `Bonjour ${prenom} !\n\n` +
        `Votre demande d'emprunt a ete APPROUVEE.\n\n` +
        `📚 « ${l.bookTitle} »\n\n` +
        `✅ Vous pouvez venir recuperer le livre.\n` +
        `Date de retour prevue : ${l.dueDate}\n\n` +
        `Bibliotheque Centre Culturel Comoe`
    } else {
      m =
        `Bonjour ${prenom} !\n\n` +
        `Votre demande d'emprunt a ete REFUSEE.\n\n` +
        `📚 « ${l.bookTitle} »\n\n` +
        `Nous ne sommes pas en mesure de vous preter ce livre pour le moment.\n\n` +
        `Bibliotheque Centre Culturel Comoe`
    }
    window.open(`https://wa.me/${wa}?text=${encodeURIComponent(m)}`, '_blank')
  }

  const list = useMemo(() => {
    const l = loans ?? []
    const f =
      tab === 'history'
        ? l.filter((x) => x.status === 'returned' || x.status === 'rejected')
        : l.filter((x) => x.status === tab)
    return [...f].sort((a, b) => (b.requestedAt || '').localeCompare(a.requestedAt || ''))
  }, [loans, tab])

  // Rafraîchit prêts + livres + fiche (les actions modifient les deux tables).
  function refresh(bookId: number | null) {
    qc.invalidateQueries({ queryKey: ['loans', SPACE_ID] })
    qc.invalidateQueries({ queryKey: ['books', SPACE_ID] })
    if (bookId != null) qc.invalidateQueries({ queryKey: ['book', SPACE_ID, bookId] })
  }

  async function run(loan: Loan, action: () => Promise<void>) {
    setBusy(loan.id)
    try {
      await action()
      refresh(loan.bookId)
    } catch (e) {
      alert('Erreur : ' + (e instanceof Error ? e.message : String(e)))
    } finally {
      setBusy(null)
    }
  }

  return (
    <div>
      <PageHeader title="Emprunts" />
      <div className="sticky top-[52px] z-20 flex gap-1.5 overflow-x-auto bg-slate-100 px-3 py-2">
        {TABS.map((t) => {
          const n = (loans ?? []).filter((x) =>
            t.key === 'history'
              ? x.status === 'returned' || x.status === 'rejected'
              : x.status === t.key,
          ).length
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`shrink-0 rounded-full px-3 py-1.5 text-sm font-semibold ${
                tab === t.key ? 'bg-navy text-white' : 'border border-slate-200 bg-white text-slate-600'
              }`}
            >
              {t.label} {n > 0 && <span className="opacity-70">({n})</span>}
            </button>
          )
        })}
      </div>

      <div className="px-3 pt-3">
        {isLoading && <p className="py-10 text-center text-slate-400">Chargement…</p>}
        <ul className="space-y-2 pb-4">
          {list.map((l) => {
            const book = l.bookId != null ? bookById.get(l.bookId) : undefined
            const isBusy = busy === l.id
            const cardCls =
              l.status === 'rejected'
                ? 'border-red-300 bg-red-50'
                : l.status === 'returned'
                  ? 'border-green-200 bg-green-50'
                  : 'border-slate-100 bg-white'
            return (
              <li key={l.id} className={`rounded-xl border p-3 shadow-card ${cardCls}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-slate-800">{l.bookTitle}</div>
                    <div className="text-sm text-slate-500">{l.userName || l.userAbbrev || '—'}</div>
                    <div className="mt-0.5 text-xs text-slate-400">
                      {l.status === 'returned'
                        ? 'Rendu ✅'
                        : l.status === 'rejected'
                          ? 'Demande rejetée ❌'
                          : l.dueDate
                            ? `À rendre le ${l.dueDate}`
                            : ''}
                      {l.status !== 'returned' && l.status !== 'rejected' && !book && (
                        <span className="ml-1 text-red-500">· livre introuvable</span>
                      )}
                    </div>
                  </div>
                  {l.status === 'rejected' && (
                    <span className="shrink-0 rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-bold text-red-700">Rejeté</span>
                  )}
                  {l.status === 'returned' && (
                    <span className="shrink-0 rounded-full bg-green-100 px-2 py-0.5 text-[11px] font-bold text-green-700">Rendu</span>
                  )}
                </div>

                {tab === 'pending' && isManager && (
                  <div className="mt-2 flex gap-2">
                    <button
                      onClick={() => run(l, () => approveLoan(l, book, loans ?? []))}
                      disabled={isBusy}
                      className="flex-1 rounded-lg bg-green-600 py-2 text-sm font-semibold text-white disabled:opacity-60"
                    >
                      {isBusy ? '…' : '✅ Valider'}
                    </button>
                    <button
                      onClick={() => run(l, () => rejectLoan(l))}
                      disabled={isBusy}
                      className="flex-1 rounded-lg bg-red-600 py-2 text-sm font-semibold text-white disabled:opacity-60"
                    >
                      ❌ Rejeter
                    </button>
                  </div>
                )}

                {isManager && l.status === 'active' && (
                  <button
                    onClick={() => notifyByWhatsApp(l, 'approved')}
                    className="mt-2 w-full rounded-lg bg-green-100 py-2 text-sm font-semibold text-green-700 active:bg-green-200"
                  >
                    📲 Notifier approbation WhatsApp
                  </button>
                )}

                {isManager && l.status === 'rejected' && (
                  <button
                    onClick={() => notifyByWhatsApp(l, 'rejected')}
                    className="mt-2 w-full rounded-lg bg-red-600 py-2 text-sm font-semibold text-white active:opacity-90"
                  >
                    📲 Notifier le refus par WhatsApp
                  </button>
                )}

                {(tab === 'active' || tab === 'pending_return') && isManager && (
                  <button
                    onClick={() => run(l, () => validateReturn(l, book, loans ?? []))}
                    disabled={isBusy}
                    className="mt-2 w-full rounded-lg bg-navy py-2 text-sm font-semibold text-white disabled:opacity-60"
                  >
                    {isBusy ? '…' : tab === 'pending_return' ? 'Valider le retour' : 'Marquer comme rendu'}
                  </button>
                )}
              </li>
            )
          })}
          {!isLoading && list.length === 0 && (
            <li className="py-10 text-center text-slate-400">Aucun emprunt.</li>
          )}
        </ul>
      </div>
    </div>
  )
}
