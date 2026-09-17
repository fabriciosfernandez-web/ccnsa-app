import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  type User,
} from 'firebase/auth'
import { doc, getDoc } from 'firebase/firestore'
import { auth, db, firebaseConfigured } from '../lib/firebase'

export type UserRole = 'SOCIO' | 'TESORERIA' | 'ADMIN' | 'CONSULTA'

export interface UserProfile {
  uid: string
  email: string | null
  displayName: string
  role: UserRole
  socioId?: string
  comites?: string[]
  active: boolean
}

export function userRoleLabel(role?: string) {
  if (role === 'TESORERIA') return 'Comité de Finanzas'
  if (role === 'ADMIN') return 'Administrador'
  if (role === 'CONSULTA') return 'Consulta / Control'
  if (role === 'SOCIO') return 'Socio'
  return role || 'Sin perfil'
}

function committeeLabel(code: string) {
  const normalized = code.trim().toUpperCase()
  if (normalized === 'FINANZAS') return 'Comité de Finanzas'
  return code.trim()
}

export function userProfileContextLabel(profile?: Pick<UserProfile, 'role' | 'comites'> | null) {
  if (!profile) return 'Sin perfil'
  const labels = (profile.comites ?? []).map(committeeLabel).filter(Boolean)
  if (labels.length > 0) return labels.join(' · ')
  return userRoleLabel(profile.role)
}

interface AuthContextValue {
  user: User | null
  profile: UserProfile | null
  loading: boolean
  error: string | null
  firebaseConfigured: boolean
  login: (email: string, password: string) => Promise<void>
  loginWithGoogle: () => Promise<void>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)
const googleProvider = new GoogleAuthProvider()
googleProvider.setCustomParameters({ prompt: 'select_account' })

async function loadProfile(user: User): Promise<UserProfile | null> {
  if (!db) return null

  const snapshot = await getDoc(doc(db, 'users', user.uid))
  if (!snapshot.exists()) return null

  const data = snapshot.data()
  const rawCommittees = Array.isArray(data.comites) ? data.comites : Array.isArray(data.committees) ? data.committees : []
  const comites = rawCommittees.map((value) => String(value).trim()).filter(Boolean)

  return {
    uid: user.uid,
    email: user.email,
    displayName: String(data.displayName ?? user.displayName ?? user.email ?? 'Usuario'),
    role: data.role as UserRole,
    socioId: data.socioId ? String(data.socioId) : undefined,
    comites: comites.length > 0 ? comites : undefined,
    active: data.active !== false,
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(firebaseConfigured)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!auth) {
      setLoading(false)
      return
    }

    return onAuthStateChanged(auth, async (firebaseUser) => {
      setLoading(true)
      setError(null)
      setUser(firebaseUser)

      if (!firebaseUser) {
        setProfile(null)
        setLoading(false)
        return
      }

      try {
        const nextProfile = await loadProfile(firebaseUser)
        if (!nextProfile) {
          setProfile(null)
          setError('La cuenta fue autenticada, pero todavía no está habilitada como usuario de CCNSA.')
        } else if (!nextProfile.active) {
          setProfile(null)
          setError('Esta cuenta se encuentra inactiva.')
        } else {
          setProfile(nextProfile)
        }
      } catch {
        setProfile(null)
        setError('No fue posible cargar el perfil de acceso.')
      } finally {
        setLoading(false)
      }
    })
  }, [])

  async function login(email: string, password: string) {
    if (!auth) {
      throw new Error('Firebase todavía no está configurado para este entorno.')
    }
    await signInWithEmailAndPassword(auth, email, password)
  }

  async function loginWithGoogle() {
    if (!auth) {
      throw new Error('Firebase todavía no está configurado para este entorno.')
    }
    await signInWithPopup(auth, googleProvider)
  }

  async function logout() {
    if (auth) await signOut(auth)
  }

  const value = useMemo<AuthContextValue>(
    () => ({ user, profile, loading, error, firebaseConfigured, login, loginWithGoogle, logout }),
    [user, profile, loading, error],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth debe utilizarse dentro de AuthProvider')
  return context
}
