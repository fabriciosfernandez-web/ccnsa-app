import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
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
  active: boolean
}

interface AuthContextValue {
  user: User | null
  profile: UserProfile | null
  loading: boolean
  error: string | null
  firebaseConfigured: boolean
  login: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

async function loadProfile(user: User): Promise<UserProfile | null> {
  if (!db) return null

  const snapshot = await getDoc(doc(db, 'users', user.uid))
  if (!snapshot.exists()) return null

  const data = snapshot.data()
  return {
    uid: user.uid,
    email: user.email,
    displayName: String(data.displayName ?? user.email ?? 'Usuario'),
    role: data.role as UserRole,
    socioId: data.socioId ? String(data.socioId) : undefined,
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
          setError('La cuenta existe en Authentication, pero no tiene un perfil habilitado en Firestore.')
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

  async function logout() {
    if (auth) await signOut(auth)
  }

  const value = useMemo<AuthContextValue>(
    () => ({ user, profile, loading, error, firebaseConfigured, login, logout }),
    [user, profile, loading, error],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth debe utilizarse dentro de AuthProvider')
  return context
}
