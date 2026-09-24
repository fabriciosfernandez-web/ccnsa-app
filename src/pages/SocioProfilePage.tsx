import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { loadSocio, type Socio } from '../data/socios'
import './socio-profile.css'

function formatDate(value?: string) {
  if (!value) return 'No informada'
  const date = new Date(`${value}T00:00:00`)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('es-PY', { dateStyle: 'long' }).format(date)
}

function formatDateTime(value?: string | null) {
  if (!value) return 'Sin registro'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('es-PY', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date)
}

function accessProvider(providerIds: string[]) {
  if (providerIds.includes('google.com')) return 'Google'
  if (providerIds.includes('password')) return 'Correo y contraseña'
  return providerIds[0] || 'Firebase Authentication'
}

export function SocioProfilePage() {
  const { user, profile } = useAuth()
  const [socio, setSocio] = useState<Socio | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    async function load() {
      if (!profile?.socioId) {
        setError('Tu perfil todavía no está vinculado a una ficha de socio.')
        setLoading(false)
        return
      }

      try {
        setError('')
        const record = await loadSocio(profile.socioId)
        if (!record) {
          setError('No encontramos tu ficha de socio.')
          return
        }
        setSocio(record)
      } catch {
        setError('No fue posible cargar tu perfil.')
      } finally {
        setLoading(false)
      }
    }

    void load()
  }, [profile?.socioId])

  const accessEmail = user?.email || profile?.email || ''
  const membershipEmail = socio?.email || ''
  const emailMatches = Boolean(
    accessEmail
    && membershipEmail
    && accessEmail.toLocaleLowerCase('es') === membershipEmail.toLocaleLowerCase('es'),
  )
  const providerIds = user?.providerData.map((item) => item.providerId).filter(Boolean) ?? []
  const provider = accessProvider(providerIds)
  const lastSignIn = user?.metadata.lastSignInTime ?? null

  return (
    <section className="page-stack legacy-page-stack socio-profile-page">
      <header className="legacy-page-header">
        <div>
          <p className="legacy-kicker">Portal del socio</p>
          <h2>Mi perfil</h2>
          <p className="muted">Datos básicos asociados a tu membresía en CCNSA.</p>
        </div>
        {socio && <span className={`status-badge ${socio.estado === 'ACTIVO' ? 'success' : 'neutral'}`}>{socio.estado}</span>}
      </header>

      {error && <div className="notice error">{error}</div>}

      {loading ? (
        <div className="screen-message">Cargando perfil…</div>
      ) : socio && (
        <>
          <article className="panel legacy-panel socio-profile-identity">
            <div className="socio-profile-avatar" aria-hidden="true">
              {socio.nombre.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('')}
            </div>
            <div>
              <p className="legacy-kicker">Socio CCNSA</p>
              <h3>{socio.nombre}</h3>
              <p className="muted">{socio.email || 'Correo electrónico no informado'}</p>
            </div>
          </article>

          <div className="socio-profile-grid">
            <article className="panel legacy-panel">
              <p className="legacy-kicker">Membresía</p>
              <h3>Datos de la ficha</h3>
              <dl className="socio-profile-details">
                <div><dt>Nombre registrado</dt><dd>{socio.nombre}</dd></div>
                <div><dt>Categoría</dt><dd>{socio.categoria === 'CASADO' ? 'Matrimonio' : 'Individual'}</dd></div>
                <div><dt>Estado</dt><dd>{socio.estado}</dd></div>
                <div><dt>Fecha de ingreso</dt><dd>{formatDate(socio.fechaIngreso)}</dd></div>
                <div><dt>Correo de membresía</dt><dd>{membershipEmail || 'No informado'}</dd></div>
                <div><dt>Referencia de socio</dt><dd className="socio-profile-id">{socio.id}</dd></div>
              </dl>
            </article>

            <article className="panel legacy-panel socio-profile-info">
              <p className="legacy-kicker">Cuenta de acceso</p>
              <h3>Tu acceso al portal</h3>
              <dl className="socio-profile-details socio-profile-access-details">
                <div><dt>Correo de acceso</dt><dd>{accessEmail || 'No informado'}</dd></div>
                <div><dt>Perfil</dt><dd>Socio</dd></div>
                <div><dt>Método de acceso</dt><dd>{provider}</dd></div>
                <div><dt>Último ingreso</dt><dd>{formatDateTime(lastSignIn)}</dd></div>
                <div><dt>Vinculación</dt><dd>{profile?.socioId ? 'Cuenta vinculada a tu ficha' : 'Sin vinculación'}</dd></div>
              </dl>

              {accessEmail && membershipEmail && !emailMatches && (
                <div className="notice warning">
                  El correo con el que ingresás al portal es distinto del correo registrado en tu ficha de socio. Esto no afecta tu acceso, pero conviene mantener ambos datos actualizados.
                </div>
              )}

              <div className="cuotas-info-box">
                <strong>Actualización de datos.</strong> Por seguridad, nombre, correo de membresía, categoría y estado se administran desde la gestión institucional. Si necesitás una corrección, comunicate con el Centro.
              </div>

              <div className="socio-profile-actions" aria-label="Accesos del socio">
                <Link className="button primary" to="/socio">Ver estado de cuenta</Link>
                <Link className="button secondary" to="/socio/actividades">Ver actividades</Link>
              </div>
            </article>
          </div>
        </>
      )}
    </section>
  )
}
