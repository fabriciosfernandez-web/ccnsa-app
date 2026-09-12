import { useState, type FormEvent } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'

export function LoginPage() {
  const { user, profile, login, loginWithGoogle, error, firebaseConfigured } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [googleSubmitting, setGoogleSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  if (user && profile) {
    return <Navigate to="/" replace />
  }

  async function handleGoogleLogin() {
    setGoogleSubmitting(true)
    setFormError(null)

    try {
      await loginWithGoogle()
    } catch {
      setFormError('No se pudo iniciar sesión con Google. Intentá nuevamente.')
    } finally {
      setGoogleSubmitting(false)
    }
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
    <div className="login-screen legacy-login-screen">
      <section className="legacy-login-card">
        <div className="legacy-accent" />

        <div className="legacy-brand-block">
          <div className="legacy-logo" aria-hidden="true">CC</div>
          <div>
            <p className="legacy-kicker">Centro Cultural</p>
            <h1>CCNSA</h1>
            <p className="muted">Consulta de cuotas y gestión institucional</p>
          </div>
        </div>

        {!firebaseConfigured && (
          <div className="notice warning">
            Firebase aún no está configurado. Esta pantalla ya puede seguir diseñándose y probándose visualmente.
          </div>
        )}

        {error && <div className="notice error">{error}</div>}
        {formError && <div className="notice error">{formError}</div>}

        <div className="login-actions">
          <button
            className="button google-button"
            type="button"
            onClick={() => void handleGoogleLogin()}
            disabled={!firebaseConfigured || googleSubmitting || submitting}
          >
            <span className="google-mark" aria-hidden="true">G</span>
            {googleSubmitting ? 'Conectando con Google…' : 'Continuar con Google'}
          </button>

          <div className="login-divider"><span>o usar correo y contraseña</span></div>
        </div>

        <form onSubmit={handleSubmit} className="form-stack legacy-form">
          <label>
            Correo electrónico
            <input
              type="email"
              autoComplete="email"
              placeholder="tu@correo.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              disabled={!firebaseConfigured || submitting || googleSubmitting}
            />
          </label>

          <label>
            Contraseña
            <input
              type="password"
              autoComplete="current-password"
              placeholder="Tu contraseña"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              disabled={!firebaseConfigured || submitting || googleSubmitting}
            />
          </label>

          <button className="button primary legacy-primary-button" type="submit" disabled={!firebaseConfigured || submitting || googleSubmitting}>
            {submitting ? 'Ingresando…' : 'Ingresar con correo'}
          </button>
        </form>

        <p className="legacy-login-footnote">Centro Cultural Nuestra Señora de la Asunción</p>
      </section>
    </div>
  )
}
