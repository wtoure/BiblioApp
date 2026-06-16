import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider, useAuth } from '@/lib/auth'
import { canAccess } from '@/lib/nav'
import { AppShell } from '@/components/AppShell'
import { Login } from '@/pages/Login'
import { Catalogue } from '@/pages/Catalogue'
import { BookDetail } from '@/pages/BookDetail'
import { PublicCatalogue } from '@/pages/PublicCatalogue'
import { Profile } from '@/pages/Profile'
import { Guide } from '@/pages/Guide'
import { Demandes } from '@/pages/Demandes'
import { Emprunts } from '@/pages/Emprunts'
import { Admin } from '@/pages/Admin'
import { Stats } from '@/pages/Stats'
import { InstallGuide } from '@/pages/InstallGuide'
import { Proposer } from '@/pages/Proposer'
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

/** Garde par rôle : redirige vers le catalogue si la route n'est pas autorisée. */
function Access({ path, children }: { path: string; children: React.ReactNode }) {
  const { user } = useAuth()
  if (user && !canAccess(path, user.role, user.tabs)) return <Navigate to="/catalogue" replace />
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
        <Route
          path="/demandes"
          element={
            <Access path="/demandes">
              <Demandes />
            </Access>
          }
        />
        <Route
          path="/emprunts"
          element={
            <Access path="/emprunts">
              <Emprunts />
            </Access>
          }
        />
        <Route
          path="/admin"
          element={
            <Access path="/admin">
              <Admin />
            </Access>
          }
        />
        <Route
          path="/stats"
          element={
            <Access path="/stats">
              <Stats />
            </Access>
          }
        />
        <Route
          path="/saisie"
          element={
            <Access path="/saisie">
              <Placeholder title="Saisie catalogue" phase="Phase 1" />
            </Access>
          }
        />
        <Route path="/profil" element={<Profile />} />
        <Route path="/guide" element={<Guide />} />
        <Route path="/installer" element={<InstallGuide />} />
        <Route
          path="/proposer"
          element={
            <Access path="/proposer">
              <Proposer />
            </Access>
          }
        />
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
