import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider, useAuth } from '@/lib/auth'
import { AppShell } from '@/components/AppShell'
import { Login } from '@/pages/Login'
import { Catalogue } from '@/pages/Catalogue'
import { BookDetail } from '@/pages/BookDetail'
import { PublicCatalogue } from '@/pages/PublicCatalogue'
import { Profile } from '@/pages/Profile'
import { Placeholder } from '@/pages/Placeholder'

const queryClient = new QueryClient()

/** Garde d'authentification : redirige vers /login si non connecté. */
function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  if (loading)
    return (
      <div className="flex min-h-screen items-center justify-center bg-navy-dark text-white">
        Chargement…
      </div>
    )
  if (!user) return <Navigate to="/login" replace />
  return <>{children}</>
}

function Router() {
  return (
    <Routes>
      {/* Vue publique — sans authentification */}
      <Route path="/book/:code" element={<PublicCatalogue />} />

      <Route path="/login" element={<Login />} />
      <Route
        element={
          <RequireAuth>
            <AppShell />
          </RequireAuth>
        }
      >
        <Route path="/catalogue" element={<Catalogue />} />
        <Route path="/livre/:id" element={<BookDetail />} />
        <Route path="/demandes" element={<Placeholder title="Demandes" phase="Phase 3" />} />
        <Route path="/emprunts" element={<Placeholder title="Emprunts" phase="Phase 4" />} />
        <Route path="/admin" element={<Placeholder title="Administration" phase="Phase 5" />} />
        <Route path="/stats" element={<Placeholder title="Statistiques" phase="Phase 5" />} />
        <Route path="/saisie" element={<Placeholder title="Saisie catalogue" phase="Phase 1" />} />
        <Route path="/profil" element={<Profile />} />
        <Route path="/guide" element={<Placeholder title="Guide" phase="Phase 2" />} />
        <Route index element={<Navigate to="/catalogue" replace />} />
      </Route>
      <Route path="*" element={<Navigate to="/catalogue" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <Router />
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  )
}
