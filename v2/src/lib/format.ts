/** Emoji sûr : repli sur 📖 si vide ou contient un caractère de remplacement (�). */
export function safeEmoji(e?: string | null, fallback = '📖'): string {
  if (!e || e.includes('�')) return fallback
  return e
}

const STATUS: Record<string, { label: string; cls: string }> = {
  available: { label: 'Disponible', cls: 'bg-green-100 text-green-700' },
  borrowed: { label: 'Emprunté', cls: 'bg-amber-100 text-amber-700' },
  retired: { label: 'Retiré', cls: 'bg-slate-100 text-slate-500' },
  missing: { label: 'Manquant', cls: 'bg-red-100 text-red-700' },
}

export function statusInfo(status: string) {
  return STATUS[status] ?? STATUS.available
}
