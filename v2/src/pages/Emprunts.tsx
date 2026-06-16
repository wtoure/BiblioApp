import { useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { PageHeader } from '@/components/PageHeader'
import { useLoans } from '@/features/loans/useLoans'
import { supabase } from '@/lib/supabase'
import { SPACE_ID } from '@/lib/space'
import type { Loan, LoanStatus } from '@/lib/types'

type Tab = 'pending' | 'active' | 'pending_return' | 'history'

const TABS: { key: Tab; label: string }[] = [
  { key: 'pending', label: 'À valider' },
  { key: 'active', label: 'En cours' },
  { key: 'pending_return', label: 'Retours' },
  { key: 'history', label: 'Historique' },
]

export function Emprunts() {
  const qc = useQueryClient()
  const { data: loans, isLoading } = useLoans()
  const [tab, setTab] = useState<Tab>('pending')

  const list = useMemo(() => {
    const l = loans ?? []
    const f =
      tab === 'history'
        ? l.filter((x) => x.status === 'returned' || x.status === 'rejected')
        : l.filter((x) => x.status === tab)
    return [...f].sort((a, b) => (b.requestedAt || '').localeCompare(a.requestedAt || ''))
  }, [loans, tab])

  // Écritures (à relire) — cf. approveLoan / validateReturn / rejectLoan (app.js)
  async function setStatus(loan: Loan, status: LoanStatus, extra: Record<string, unknown> = {}) {
    const { error } = await supabase
      .from('loans')
      .update({ status, ...extra })
      .eq('id', loan.id)
      .eq('space_code', SPACE_ID)
    if (error) {
      alert('Erreur : ' + error.message)
      return
    }
    qc.invalidateQueries({ queryKey: ['loans', SPACE_ID] })
  }

  const nowIso = () => new Date().toISOString()

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
          {list.map((l) => (
            <li key={l.id} className="rounded-xl border border-slate-100 bg-white p-3 shadow-card">
              <div className="font-semibold text-slate-800">{l.bookTitle}</div>
              <div className="text-sm text-slate-500">{l.userName || l.userAbbrev || '—'}</div>
              <div className="mt-0.5 text-xs text-slate-400">
                {l.status === 'returned'
                  ? `Rendu`
                  : l.dueDate
                    ? `À rendre le ${l.dueDate}`
                    : ''}
              </div>
              {tab === 'pending' && (
                <div className="mt-2 flex gap-2">
                  <button
                    onClick={() => setStatus(l, 'active', { approvedAt: nowIso() })}
                    className="flex-1 rounded-lg bg-green-600 py-2 text-sm font-semibold text-white"
                  >
                    Valider
                  </button>
                  <button
                    onClick={() => setStatus(l, 'rejected')}
                    className="flex-1 rounded-lg bg-red-600 py-2 text-sm font-semibold text-white"
                  >
                    Rejeter
                  </button>
                </div>
              )}
              {(tab === 'active' || tab === 'pending_return') && (
                <button
                  onClick={() => setStatus(l, 'returned', { returnedAt: nowIso() })}
                  className="mt-2 w-full rounded-lg bg-navy py-2 text-sm font-semibold text-white"
                >
                  Marquer comme rendu
                </button>
              )}
            </li>
          ))}
          {!isLoading && list.length === 0 && (
            <li className="py-10 text-center text-slate-400">Aucun emprunt.</li>
          )}
        </ul>
      </div>
    </div>
  )
}
