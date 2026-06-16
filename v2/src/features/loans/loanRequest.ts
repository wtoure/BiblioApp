import { supabase } from '@/lib/supabase'
import { SPACE_ID } from '@/lib/space'
import type { Book, Loan, User } from '@/lib/types'

/**
 * Éligibilité d'un utilisateur à emprunter un livre — miroir de `canUserLoan()`
 * + des contrôles de `openLoanModal()` (app.js).
 * Retourne `{ ok: true }` ou `{ ok: false, reason }`.
 */
export function canRequestLoan(
  user: User,
  book: Book,
  loans: Loan[],
): { ok: true } | { ok: false; reason: string } {
  if (user.disabled) return { ok: false, reason: 'Votre compte est désactivé.' }

  if (book.status === 'missing')
    return {
      ok: false,
      reason: 'Ce livre est signalé introuvable. L’emprunt n’est pas possible pour le moment.',
    }

  // Retour en attente de validation → bloque tout nouvel emprunt
  if (loans.some((l) => l.userId === user.id && l.status === 'pending_return'))
    return {
      ok: false,
      reason: 'Vous avez un retour en attente de validation. Patientez avant d’emprunter à nouveau.',
    }

  // Droit d'emprunter : résidents toujours OK, sinon canLoan obligatoire
  if (user.role !== 'resident' && !user.canLoan)
    return {
      ok: false,
      reason: 'Vous n’avez pas le droit d’emprunter. Contactez votre administrateur.',
    }

  // Emprunt actif déjà en cours
  if (loans.some((l) => l.userId === user.id && l.status === 'active'))
    return { ok: false, reason: 'Vous avez déjà un emprunt actif.' }

  // Disponibilité selon le nombre d'exemplaires
  const activeForBook = loans.filter(
    (l) => l.bookId === book.id && (l.status === 'active' || l.status === 'pending_return'),
  ).length
  const copies = Number(book.expl) || 1
  if (activeForBook >= copies)
    return {
      ok: false,
      reason: `Aucun exemplaire disponible (${copies} exemplaire(s), ${activeForBook} emprunté(s)).`,
    }

  return { ok: true }
}

/**
 * Crée une demande d'emprunt — miroir de `confirmLoan()` (app.js).
 * Résidents : auto-validé (`active`) + livre marqué emprunté.
 * Autres rôles : `pending` (à valider par admin/validateur).
 * ⚠️ Écriture LIVE — à relire avant usage réel.
 */
export async function requestLoan(
  user: User,
  book: Book,
  loans: Loan[],
  dueDate: string,
): Promise<void> {
  const now = new Date().toISOString()
  const loanId = 'L' + Date.now()
  const isResident = user.role === 'resident'
  const status: Loan['status'] = isResident ? 'active' : 'pending'

  const loan = {
    id: loanId,
    space_code: SPACE_ID,
    bookId: book.id,
    bookTitle: book.titre,
    userId: user.id,
    userAbbrev: user.abbrev,
    userName: `${user.prenom} ${user.nom}`,
    requestedAt: now,
    approvedAt: isResident ? now : null,
    status,
    dueDate,
    returnedAt: null,
  }

  const { error } = await supabase.from('loans').insert(loan)
  if (error) throw new Error(error.message)

  // Résident : mise à jour de l'état du livre (auto-validé)
  if (isResident) {
    const activeForBook = loans.filter(
      (l) =>
        l.bookId === book.id &&
        (l.status === 'active' || l.status === 'pending_return') &&
        l.id !== loanId,
    ).length
    const copies = Number(book.expl) || 1
    const newStatus = activeForBook + 1 >= copies ? 'borrowed' : 'available'
    const { error: bookErr } = await supabase
      .from('books')
      .update({
        status: newStatus,
        borrowedBy: `${user.prenom} ${user.nom}`,
        borrowedUntil: dueDate,
        activeLoans: activeForBook + 1,
      })
      .eq('id', book.id)
      .eq('space_code', SPACE_ID)
    if (bookErr) throw new Error(bookErr.message)
  }
}
