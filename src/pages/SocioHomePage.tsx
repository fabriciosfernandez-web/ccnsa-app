import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { loadEstadoCuenta, loadSocio, type EstadoCuenta, type Socio } from '../data/socios'
import { firestoreNotificationService } from '../notifications/firestoreNotificationService'
import type { AccountNotification } from '../notifications/types'
import './socio-home.css'

const money = (value: number) => `Gs. ${Math.round(value).toLocaleString('es-PY')}`

function formatDate(value?: string) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('es-PY', { dateStyle: 'medium' }).format(date)
}

export function SocioHomePage() {
  const { profile } = useAuth()
  const socioId = profile?.socioId
  const [socio, setSocio] = useState<Socio | null>(null)
  const [account, setAccount] = useState<EstadoCuenta | null>(null)
  const [notifications, setNotifications] = useState<AccountNotification[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    async function loadPortal() {
      if (!socioId) {
        setError('Tu perfil todavía no está vinculado a una ficha de socio.')
        setLoading(false)
        return
      }

      try {
        setError('')
        const [member, accountState, notices] = await Promise.all([
          loadSocio(socioId),
          loadEstadoCuenta(socioId),
          firestoreNotificationService.listForSocio(socioId),
        ])
        setSocio(member)
        setAccount(accountState)
        setNotifications(notices)
      } catch {
        setError('No fue posible cargar el resumen del portal.')
      } finally {
        setLoading(false)
      }
    }

    void loadPortal()
  }, [socioId])

  const unread = useMemo(
    () => notifications.filter((item) => item.status === 'UNREAD'),
    [notifications],
  )

  const latestNotice = notifications[0]
  const balance = account?.saldoNeto ?? 0
  const accountStatus = balance > 0 ? 'Con saldo pendiente' : balance < 0 ? 'Saldo a favor' : 'Al día'
  const accountBadge = balance <= 0 ? 'success' : 'socio-status-warning'

  return (
    <section className="page-stack legacy-page-stack socio-home">
      <article className="socio-home-hero">
        <div>
          <p className="socio-hero-kicker">Portal del socio · CCNSA</p>
          <h2>Bienvenido, {profile?.displayName}</h2>
          <p>
            Desde acá podés consultar tu membresía, estado de cuenta y avisos del Centro. El portal irá incorporando nuevos servicios institucionales de forma gradual.
          </p>
        </div>
        <img src="/ccnsa-logo.webp" alt="" aria-hidden="true" />
      </article>

      {error && <div className="notice error">{error}</div>}

      {loading ? (
        <div className="screen-message">Cargando portal…</div>
      ) : (
        <>
          <section className="socio-home-grid" aria-label="Resumen del portal">
            <article className="panel legacy-panel socio-home-card">
              <div className="socio-home-card-heading">
                <div>
                  <p className="legacy-kicker">Estado de cuenta</p>
                  <h3>{accountStatus}</h3>
                </div>
                <span className={`status-badge ${accountBadge}`}>{accountStatus}</span>
              </div>
              <strong className="socio-home-value">
                {balance > 0 ? money(balance) : balance < 0 ? money(Math.abs(balance)) : money(0)}
              </strong>
              <p className="muted">
                {balance > 0
                  ? 'Saldo neto pendiente registrado actualmente.'
                  : balance < 0
                    ? 'Saldo neto disponible a tu favor.'
                    : 'No registrás saldo pendiente.'}
              </p>
              <Link className="button secondary inline-button" to="/socio">Ver estado de cuenta</Link>
            </article>

            <article className="panel legacy-panel socio-home-card">
              <div className="socio-home-card-heading">
                <div>
                  <p className="legacy-kicker">Notificaciones</p>
                  <h3>{unread.length === 0 ? 'Todo al día' : `${unread.length} sin leer`}</h3>
                </div>
                <span className={`status-badge ${unread.length > 0 ? 'danger' : 'success'}`}>
                  {unread.length > 0 ? unread.length : '0'}
                </span>
              </div>
              {latestNotice ? (
                <div className="socio-home-latest">
                  <strong>{latestNotice.title}</strong>
                  <small>{latestNotice.message}</small>
                  <small>{formatDate(latestNotice.createdAt)}</small>
                </div>
              ) : (
                <p className="muted">Todavía no tenés avisos registrados.</p>
              )}
              <Link className="button secondary inline-button" to="/socio/notificaciones">Abrir notificaciones</Link>
            </article>

            <article className="panel legacy-panel socio-home-card">
              <div className="socio-home-card-heading">
                <div>
                  <p className="legacy-kicker">Membresía</p>
                  <h3>{socio?.estado === 'ACTIVO' ? 'Membresía activa' : 'Estado de membresía'}</h3>
                </div>
                {socio && <span className={`status-badge ${socio.estado === 'ACTIVO' ? 'success' : 'neutral'}`}>{socio.estado}</span>}
              </div>
              <dl className="socio-home-member-data">
                <div><dt>Categoría</dt><dd>{socio?.categoria === 'CASADO' ? 'Matrimonio' : socio ? 'Individual' : '—'}</dd></div>
                <div><dt>Ingreso</dt><dd>{socio?.fechaIngreso ? formatDate(`${socio.fechaIngreso}T00:00:00`) : 'No informado'}</dd></div>
              </dl>
              <Link className="button secondary inline-button" to="/socio/perfil">Ver mi perfil</Link>
            </article>
          </section>

          <section className="panel legacy-panel socio-home-services">
            <div className="socio-home-services-heading">
              <div>
                <p className="legacy-kicker">Servicios del portal</p>
                <h3>Una sola puerta de entrada a CCNSA</h3>
                <p className="muted">
                  La estructura ya permite incorporar nuevos módulos sin mezclar la información financiera, personal y documental.
                </p>
              </div>
              <span className="status-badge neutral">En evolución</span>
            </div>

            <div className="socio-home-service-grid">
              <article>
                <span className="socio-home-service-icon">A</span>
                <div>
                  <strong>Actividades e inscripciones</strong>
                  <p>Próximamente: agenda institucional, retiros, Academia y otras actividades habilitadas para socios.</p>
                </div>
                <span className="status-badge neutral">En preparación</span>
              </article>

              <article>
                <span className="socio-home-service-icon">L</span>
                <div>
                  <strong>Librería Normativa</strong>
                  <p>Espacio previsto para integrar búsqueda, categorías y acceso a documentos institucionales y normativos.</p>
                </div>
                <span className="status-badge neutral">En preparación</span>
              </article>

              <article>
                <span className="socio-home-service-icon">D</span>
                <div>
                  <strong>Documentos y constancias</strong>
                  <p>Base para futuras constancias, comunicaciones y documentación personal del socio.</p>
                </div>
                <span className="status-badge neutral">Futuro</span>
              </article>
            </div>
          </section>
        </>
      )}
    </section>
  )
}
