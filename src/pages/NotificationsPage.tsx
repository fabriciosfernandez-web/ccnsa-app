import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { firestoreNotificationService } from '../notifications/firestoreNotificationService'
import type { AccountNotification, NotificationKind, NotificationPreferences } from '../notifications/types'

function formatDate(value: string) {
  return new Intl.DateTimeFormat('es-PY', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

function kindLabel(kind: NotificationKind) {
  if (kind === 'PAYMENT_POSTED') return 'Pago registrado'
  if (kind === 'OBLIGATION_POSTED') return 'Nueva obligación'
  if (kind === 'ACCOUNT_STATEMENT_READY') return 'Estado de cuenta'
  if (kind === 'OVERDUE_REMINDER') return 'Recordatorio'
  return 'Aviso'
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'No fue posible completar la operación.'
}

export function NotificationsPage() {
  const { profile } = useAuth()
  const socioId = profile?.socioId
  const [items, setItems] = useState<AccountNotification[]>([])
  const [preferences, setPreferences] = useState<NotificationPreferences | null>(null)
  const [loading, setLoading] = useState(true)
  const [savingPreference, setSavingPreference] = useState<string | null>(null)
  const [error, setError] = useState('')

  async function refresh() {
    if (!socioId) {
      setError('Tu perfil todavía no está vinculado a una ficha de socio.')
      setLoading(false)
      return
    }
    try {
      setError('')
      const [notifications, nextPreferences] = await Promise.all([
        firestoreNotificationService.listForSocio(socioId),
        firestoreNotificationService.getPreferences(socioId),
      ])
      setItems(notifications)
      setPreferences(nextPreferences)
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void refresh()
  }, [socioId])

  const unreadCount = useMemo(
    () => items.filter((item) => item.status === 'UNREAD').length,
    [items],
  )

  async function markAsRead(notificationId: string) {
    if (!socioId) return
    try {
      setError('')
      await firestoreNotificationService.markAsRead(notificationId, socioId)
      setItems((current) => current.map((item) => (
        item.id === notificationId
          ? { ...item, status: 'READ', readAt: new Date().toISOString() }
          : item
      )))
    } catch (caught) {
      setError(errorMessage(caught))
    }
  }

  async function togglePreference(key: keyof Omit<NotificationPreferences, 'socioId'>) {
    if (!preferences) return
    const previous = preferences
    const next = { ...preferences, [key]: !preferences[key] }
    setPreferences(next)
    setSavingPreference(key)
    try {
      setError('')
      await firestoreNotificationService.savePreferences(next)
    } catch (caught) {
      setPreferences(previous)
      setError(errorMessage(caught))
    } finally {
      setSavingPreference(null)
    }
  }

  return (
    <section className="page-stack legacy-page-stack">
      <header className="legacy-page-header">
        <div>
          <p className="legacy-kicker">Portal del socio</p>
          <h2>Notificaciones</h2>
          <p className="muted">
            {loading
              ? 'Cargando tus avisos…'
              : unreadCount === 0
                ? 'No tenés notificaciones pendientes.'
                : `Tenés ${unreadCount} notificación${unreadCount === 1 ? '' : 'es'} sin leer.`}
          </p>
        </div>
        <span className={`status-badge ${unreadCount > 0 ? 'danger' : 'success'}`}>
          {loading ? 'Cargando' : unreadCount > 0 ? `${unreadCount} sin leer` : 'Todo al día'}
        </span>
      </header>

      {error && <div className="notice error"><strong>Notificaciones.</strong> {error}</div>}

      <section className="notification-list" aria-label="Notificaciones de cuenta">
        {loading ? (
          <div className="screen-message">Cargando notificaciones…</div>
        ) : items.length === 0 ? (
          <article className="panel legacy-panel">
            <p className="legacy-kicker">Centro de avisos</p>
            <h3>Sin notificaciones por ahora</h3>
            <p className="muted">Los pagos y nuevas obligaciones registrados por el Comité de Finanzas aparecerán aquí automáticamente.</p>
          </article>
        ) : items.map((item) => (
          <article key={item.id} className={`notification-card ${item.status === 'UNREAD' ? 'unread' : ''}`}>
            <div className="notification-card-header">
              <div>
                <span className="notification-kind">{kindLabel(item.kind)}</span>
                <h3>{item.title}</h3>
              </div>
              {item.status === 'UNREAD' && <span className="unread-dot" aria-label="Sin leer" />}
            </div>

            <p>{item.message}</p>
            <small>{formatDate(item.createdAt)}</small>

            <div className="socio-actions">
              {item.status === 'UNREAD' && (
                <button className="button secondary inline-button" type="button" onClick={() => void markAsRead(item.id)}>
                  Marcar como leída
                </button>
              )}
              {item.actionUrl && <Link className="button secondary inline-button" to={item.actionUrl}>Ver estado de cuenta</Link>}
            </div>
          </article>
        ))}
      </section>

      {preferences && (
        <section className="panel legacy-panel notification-preferences">
          <div>
            <p className="legacy-kicker">Preferencias</p>
            <h3>Qué avisos querés recibir</h3>
            <p className="muted">
              Estas preferencias ya se guardan en tu perfil. El canal dentro de la aplicación está conectado; correo y push quedan preparados para una etapa posterior.
            </p>
          </div>

          <label>
            <input type="checkbox" checked={preferences.inApp} disabled={Boolean(savingPreference)} onChange={() => void togglePreference('inApp')} />
            Notificaciones dentro de la aplicación
          </label>
          <label>
            <input type="checkbox" checked={preferences.paymentConfirmations} disabled={Boolean(savingPreference)} onChange={() => void togglePreference('paymentConfirmations')} />
            Confirmaciones cuando el Comité de Finanzas registre un pago
          </label>
          <label>
            <input type="checkbox" checked={preferences.overdueReminders} disabled={Boolean(savingPreference)} onChange={() => void togglePreference('overdueReminders')} />
            Recordatorios de obligaciones vencidas
          </label>
          <label>
            <input type="checkbox" checked={preferences.monthlyStatements} disabled={Boolean(savingPreference)} onChange={() => void togglePreference('monthlyStatements')} />
            Avisarme cuando esté disponible un nuevo estado de cuenta
          </label>

          <div className="cuotas-info-box">
            <strong>Canales externos.</strong> Correo electrónico y notificaciones push todavía no realizan envíos reales. Se conectarán a un proveedor/backend antes de habilitarlos.
          </div>
        </section>
      )}
    </section>
  )
}
