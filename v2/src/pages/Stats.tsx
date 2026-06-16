import { PageHeader } from '@/components/PageHeader'
import { useUsers, useRequests } from '@/features/requests/useRequests'
import { useLoans } from '@/features/loans/useLoans'
import { useBooks } from '@/features/catalogue/useBooks'

export function Stats() {
  const { data: books } = useBooks()
  const { data: users } = useUsers()
  const { data: loans } = useLoans()
  const { data: requests } = useRequests()

  const stats = [
    { label: 'Livres', value: books?.length ?? 0 },
    { label: 'Membres actifs', value: (users ?? []).filter((u) => !u.disabled).length },
    { label: 'Emprunts en cours', value: (loans ?? []).filter((l) => l.status === 'active').length },
    { label: 'Demandes en attente', value: (requests ?? []).filter((r) => r.status === 'pending').length },
    { label: 'Demandes approuvées', value: (requests ?? []).filter((r) => r.status === 'approved').length },
    { label: 'Demandes totales', value: requests?.length ?? 0 },
  ]

  return (
    <div>
      <PageHeader title="Statistiques" />
      <div className="grid grid-cols-2 gap-3 px-3 py-4">
        {stats.map((s) => (
          <div key={s.label} className="rounded-2xl bg-white p-4 shadow-card">
            <div className="text-3xl font-bold text-navy">{s.value}</div>
            <div className="mt-1 text-sm text-slate-500">{s.label}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
