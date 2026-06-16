import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { supabase } from './supabase'
import { SPACE_ID } from './space'
import { logLogin } from './loginLog'
import type { User } from './types'

const PERMANENT_ROLES = ['admin', 'resident', 'commission']

interface AuthState {
  user: User | null
  loading: boolean
  /** Connexion email + mot de passe (Supabase Auth). */
  login: (email: string, password: string) => Promise<User>
  logout: () => Promise<void>
  updateUser: (patch: Partial<User>) => void
  /** Recharge la ligne `users` depuis la session auth courante (post set-password). */
  refresh: () => Promise<User | null>
  /** Envoie un email de réinitialisation de mot de passe. */
  requestPasswordReset: (email: string) => Promise<void>
  /** Définit un nouveau mot de passe (session de récupération/invitation active). */
  updatePassword: (password: string) => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

/** Traduit les messages d'erreur Supabase Auth en français lisible. */
function authMessage(raw: string): string {
  const m = raw.toLowerCase()
  if (m.includes('invalid login credentials')) return 'Email ou mot de passe incorrect.'
  if (m.includes('email not confirmed')) return "Email non confirmé. Vérifiez votre boîte mail."
  if (m.includes('rate limit') || m.includes('too many')) return 'Trop de tentatives. Réessayez dans quelques minutes.'
  return raw
}

/**
 * Résout la ligne `users` de l'espace courant rattachée à la session auth active.
 * Recherche d'abord par auth_id ; repli par email (transition / lignes non liées),
 * avec liaison best-effort de auth_id au passage.
 */
async function resolveAppUser(): Promise<User | null> {
  const { data: auth } = await supabase.auth.getUser()
  const authUser = auth?.user
  if (!authUser) return null

  const byId = await supabase
    .from('users')
    .select('*')
    .eq('space_code', SPACE_ID)
    .eq('auth_id', authUser.id)
    .limit(1)
  if (byId.data?.[0]) return byId.data[0] as User

  if (authUser.email) {
    const byEmail = await supabase
      .from('users')
      .select('*')
      .eq('space_code', SPACE_ID)
      .ilike('email', authUser.email)
      .limit(1)
    const u = byEmail.data?.[0] as User | undefined
    if (u) {
      if (!u.auth_id) {
        // Liaison best-effort (ne bloque pas la connexion en cas d'échec RLS).
        void supabase.from('users').update({ auth_id: authUser.id }).eq('id', u.id).eq('space_code', SPACE_ID)
      }
      return u
    }
  }
  return null
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  // Restauration de session au démarrage + écoute des déconnexions.
  useEffect(() => {
    let mounted = true

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!mounted) return
      if (!session) {
        setLoading(false)
        return
      }
      const u = await resolveAppUser()
      if (!mounted) return
      if (u && !u.disabled) setUser(u)
      setLoading(false)
    })

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT' || !session) setUser(null)
    })

    return () => {
      mounted = false
      sub.subscription.unsubscribe()
    }
  }, [])

  async function login(email: string, password: string): Promise<User> {
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    })
    if (error) throw new Error(authMessage(error.message))

    const u = await resolveAppUser()
    if (!u) {
      await supabase.auth.signOut()
      throw new Error('Aucun compte membre rattaché à cet email dans cette bibliothèque.')
    }
    if (u.disabled) {
      await supabase.auth.signOut()
      throw new Error('Ce compte est désactivé. Contactez l’administrateur.')
    }
    // Expiration (miroir du desktop) — admin/resident/commission ne périment pas.
    const today = new Date().toISOString().split('T')[0]
    if (u.expiresAt && u.expiresAt < today && !u.neverExpires && !PERMANENT_ROLES.includes(u.role)) {
      await supabase.from('users').update({ disabled: true }).eq('id', u.id).eq('space_code', SPACE_ID)
      await supabase.auth.signOut()
      throw new Error('Votre compte a expiré le ' + u.expiresAt + '. Contactez l’administrateur.')
    }

    setUser(u)
    void logLogin(u) // journalisation best-effort, non bloquante
    return u
  }

  async function logout() {
    await supabase.auth.signOut()
    setUser(null)
  }

  function updateUser(patch: Partial<User>) {
    setUser((u) => (u ? { ...u, ...patch } : u))
  }

  async function refresh(): Promise<User | null> {
    const u = await resolveAppUser()
    if (u && !u.disabled) setUser(u)
    return u
  }

  async function requestPasswordReset(email: string): Promise<void> {
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
      redirectTo: window.location.origin + '/set-password',
    })
    if (error) throw new Error(authMessage(error.message))
  }

  async function updatePassword(password: string): Promise<void> {
    const { error } = await supabase.auth.updateUser({ password })
    if (error) throw new Error(authMessage(error.message))
  }

  return (
    <AuthContext.Provider
      value={{ user, loading, login, logout, updateUser, refresh, requestPasswordReset, updatePassword }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth doit être utilisé dans <AuthProvider>')
  return ctx
}
