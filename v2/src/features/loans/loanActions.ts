import { supabase } from '@/lib/supabase'
import { SPACE_ID } from '@/lib/space'
import type { Book, Loan } from '@/lib/types'

/**
 * Actions de gestion des emprunts (admin/validateur) — miroir fidèle de
 * `approveLoan` / `rejectLoan` / `validateReturn` (app.js desktop).
 *
 * Point clé : chaque action met à jour le LIVRE en plus du prêt
 * (statut, borrowedBy/Until, activeLoans), sinon le catalogue se désynchronise.
 * ⚠️ Écritures LIVE.
 */

function nowIso() {
  return new Date().toISOString()
}

/** Nombre d'emprunts actifs (ou retour en attente) sur un livre, hors un prêt donné. */
function activeForBook(loans: Loan[], bookId: number | null, exceptLoanId: string): number {
  return loans.filter(
    (l) =>
      String(l.bookId) === String(bookId) &&
      (l.status === 'active' || l.status === 'pending_return') &&
      l.id !== exceptLoanId,
  ).length
}

/**
 * Valide un emprunt en attente : prêt → `active` et mise à jour du livre.
 * Refuse si plus aucun exemplaire disponible (cf. approveLoan desktop).
 */
export async function approveLoan(loan: Loan, book: Book | undefined, loans: Loan[]): Promise<void> {
  if (!book) throw new Error('Livre introuvable dans le catalogue. Il a peut-être été supprimé.')

  const active = activeForBook(loans, loan.bookId, loan.id)
  const copies = Math.max(1, Number(book.expl) || 1)
  if (active >= copies)
    throw new Error(
      `Aucun exemplaire disponible (${copies} exemplaire(s), ${active} déjà emprunté(s)).`,
    )

  const remainingAfter = copies - (active + 1)
  const newStatus: Book['status'] = remainingAfter <= 0 ? 'borrowed' : 'available'
  const approvedAt = nowIso()

  const { error: lErr } = await supabase
    .from('loans')
    .update({ status: 'active', approvedAt })
    .eq('id', loan.id)
    .eq('space_code', SPACE_ID)
  if (lErr) throw new Error(lErr.message)

  const { error: bErr } = await supabase
    .from('books')
    .update({
      status: newStatus,
      borrowedBy: newStatus === 'borrowed' ? loan.userName : null,
      borrowedUntil: newStatus === 'borrowed' ? loan.dueDate : null,
      activeLoans: active + 1,
    })
    .eq('id', loan.bookId)
    .eq('space_code', SPACE_ID)
  if (bErr) throw new Error(bErr.message)
}

/**
 * Déclaration de retour par le membre : prêt → `pending_return`.
 * Le livre reste `borrowed` jusqu'à validation par un admin/validateur
 * (cf. markReturned desktop). Action côté emprunteur.
 */
export async function declareReturn(loan: Loan): Promise<void> {
  const { error } = await supabase
    .from('loans')
    .update({ status: 'pending_return', returnedAt: nowIso() })
    .eq('id', loan.id)
    .eq('space_code', SPACE_ID)
  if (error) throw new Error(error.message)
}

/** Rejette une demande d'emprunt : prêt → `rejected`. Le livre n'est pas modifié. */
export async function rejectLoan(loan: Loan): Promise<void> {
  const { error } = await supabase
    .from('loans')
    .update({ status: 'rejected' })
    .eq('id', loan.id)
    .eq('space_code', SPACE_ID)
  if (error) throw new Error(error.message)
}

/**
 * Valide un retour : prêt → `returned` et libération du livre.
 * Le livre redevient `available` ; borrowedBy/Until effacés s'il ne reste
 * aucun autre emprunt actif (cf. validateReturn desktop).
 */
export async function validateReturn(loan: Loan, book: Book | undefined, loans: Loan[]): Promise<void> {
  const returnedAt = nowIso()
  const { error: lErr } = await supabase
    .from('loans')
    .update({ status: 'returned', returnedAt })
    .eq('id', loan.id)
    .eq('space_code', SPACE_ID)
  if (lErr) throw new Error(lErr.message)

  if (!book) return // livre supprimé : le prêt est tout de même clôturé

  const stillActive = activeForBook(loans, loan.bookId, loan.id)
  const upd: Record<string, unknown> = { status: 'available', activeLoans: stillActive }
  if (stillActive === 0) {
    upd.borrowedBy = null
    upd.borrowedUntil = null
  }
  const { error: bErr } = await supabase
    .from('books')
    .update(upd)
    .eq('id', loan.bookId)
    .eq('space_code', SPACE_ID)
  if (bErr) throw new Error(bErr.message)
}
