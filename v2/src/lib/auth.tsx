import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { supabase } from './supabase'
import { SPACE_ID } from './space'
import { logLogin } from './loginLog'
import type { User } from './types'

const SESSION_KEY = 'cb2_session'

interface AuthState {
  user: User | null
  loading: boolean
  login: (code: string) => Promise<User>
  logout: () => void
  updateUser: (patch: Partial<User>) => void
}

const AuthContext = createContext<AuthState | null>(null)

/**
 * Recherche un utilisateur par code de connexion (abbrev) dans l'espace courant.
 * Le code est normalisé en minuscules (comme le desktop, app.js `value.trim().toLowerCase()`) :
 * les abbrevs sont stockés en minuscules et les claviers mobiles capitalisent souvent
 * la première lettre — sans cette normalisation, la connexion échoue (« Code de connexion inconnu »).
 */
async function findUserByCode(code: string): Promise<User | null> {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('space_code', SPACE_ID)
    .eq('abbrev', code.trim().toLowerCase())
    .limit(1)
  if (error) throw new Error(error.message)
  return (data?.[0] as User) ?? null
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  // Restauration de session au démarrage
  useEffect(() => {
    const raw = localStorage.getItem(SESSION_KEY)
    if (!raw) {
      setLoading(false)
      return
    }
    try {
      const { abbrev } = JSON.parse(raw)
      findUserByCode(abbrev)
        .then((u) => {
          if (u && !u.disabled) setUser(u)
          else localStorage.removeItem(SESSION_KEY)
        })
        .catch(() => localStorage.removeItem(SESSION_KEY))
        .finally(() => setLoading(false))
    } catch {
      localStorage.removeItem(SESSION_KEY)
      setLoading(false)
    }
  }, [])

  async function login(code: string): Promise<User> {
    const u = await findUserByCode(code)
    if (!u) throw new Error('Code de connexion inconnu.')
    if (u.disabled) throw new Error('Ce compte est désactivé.')
    localStorage.setItem(SESSION_KEY, JSON.stringify({ id: u.id, abbrev: u.abbrev }))
    setUser(u)
    void logLogin(u) // journalisation best-effort, non bloquante
    return u
  }

  function logout() {
    localStorage.removeItem(SESSION_KEY)
    setUser(null)
  }

  function updateUser(patch: Partial<User>) {
    setUser((u) => (u ? { ...u, ...patch } : u))
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, updateUser }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth doit être utilisé dans <AuthProvider>')
  return ctx
}
