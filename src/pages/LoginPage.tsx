import { useState, type FormEvent } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'

export function LoginPage() {
  const { user, profile, login, error, firebaseConfigured } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  if (user && profile) {
    return <Navigate to="/" replace />
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitting(true)
    setFormError(null)

    try {
      await login(email.trim(), password)
    } catch {
      setFormError('No se pudo iniciar sesión. Verificá el correo y la contraseña.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="login-screen">
      <section className="login-card">
        <div>
          <p className="eyebrow">Centro Cultural</p>
          <h1>CCNSA App</h1>
          <p className="muted">Consulta de cuotas y gestión institucional.</p>
        </div>

        {!firebaseConfigured && (
          <div className="notice warning">
            Firebase aún no está configurado. Copiá <code>.env.example</code> a <code>.env.local</code> y completá la configuración del proyecto de desarrollo.
          </div>
        )}

        {error && <div className="notice error">{error}</div>}
        {formError && <div className="notice error">{formError}</div>}

        <form onSubmit={handleSubmit} className="form-stack">
          <label>
            Correo electrónico
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              disabled={!firebaseConfigured || submitting}
            />
          </label>

          <label>
            Contraseña
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              disabled={!firebaseConfigured || submitting}
            />
          </label>

          <button className="button primary" type="submit" disabled={!firebaseConfigured || submitting}>
            {submitting ? 'Ingresando…' : 'Ingresar'}
          </button>
        </form>
      </section>
    </div>
  )
}
