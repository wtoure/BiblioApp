import { useState } from 'react'
import { Outlet } from 'react-router-dom'
import { BottomNav } from './BottomNav'
import { MoreSheet } from './MoreSheet'

/** Disposition principale : contenu défilant + barre du bas + feuille "Plus". */
export function AppShell() {
  const [moreOpen, setMoreOpen] = useState(false)

  return (
    <div className="min-h-screen">
      {/* Contenu — marge basse pour ne pas être masqué par la barre du bas */}
      <main className="pb-[calc(66px+env(safe-area-inset-bottom))]">
        <Outlet />
      </main>
      <BottomNav onMore={() => setMoreOpen(true)} />
      <MoreSheet open={moreOpen} onClose={() => setMoreOpen(false)} />
    </div>
  )
}
