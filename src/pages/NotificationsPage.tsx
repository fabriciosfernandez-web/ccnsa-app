import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import {
  disableCurrentPushDevice,
  registerPushDevice,
} from '../notifications/pushSubscriptionService'
import {
  firestoreNotificationService,
  markAllNotificationsAsRead,
  subscribeNotificationsForSocio,
} from '../notifications/firestoreNotificationService'
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

function actionLabel(actionUrl?: string) {
  if (actionUrl === '/socio/notificaciones') return 'Abrir notificaciones'
  if (actionUrl === '/socio/actividades') return 'Ver actividad'
  return 'Ver estado de cuenta'
}

export function NotificationsPage() {
  const { user, profile } = useAuth()
  const socioId = profile?.socioId
  const [items, setItems] = useState<AccountNotification[]>([])
  const [preferences, setPreferences] = useState<NotificationPreferences | null>(null)
  const [loading, setLoading] = useState(true)
  const [savingPreference, setSavingPreference] = useState<string | null>(null)
  const [markingAll, setMarkingAll] = useState(false)
  const [pushBusy, setPushBusy] = useState(false)
  const [devicePushEnabled, setDevicePushEnabled] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!socioId) {
      setError('Tu perfil todavía no está vinculado a una ficha de socio.')
      setLoading(false)
      return
    }

    setLoading(true)
    setError('')

    const unsubscribe = subscribeNotificationsForSocio(
      socioId,
      (notifications) => {
        setItems(notifications)
        setLoading(false)
      },
      (caught) => {
        setError(errorMessage(caught))
        setLoading(false)
      },
    )

    void firestoreNotificationService.getPreferences(socioId)
      .then(setPreferences)
      .catch((caught) => setError(errorMessage(caught)))

    return unsubscribe
  }, [socioId])

  const unreadCount = useMemo(
    () => items.filter((item) => item.status === 'UNREAD').length,
    [items],
  )

  useEffect(() => {
    setDevicePushEnabled(false)
    if (!preferences?.push || !socioId || !user || typeof Notification === 'undefined' || Notification.permission !== 'granted') return
    let active = true

    async function revalidatePushDevice() {
      try {
        await registerPushDevice(socioId!, user!.uid)
        if (active) setDevicePushEnabled(true)
      } catch (caught) {
        if (active) {
          setDevicePushEnabled(false)
          setError(`No se pudo verificar el registro push: ${errorMessage(caught)}`)
        }
      }
    }

    void revalidatePushDevice()
    return () => { active = false }
  }, [preferences?.push, socioId, user])

  async function markAsRead(notificationId: string) {
    if (!socioId) return
    try {
      setError('')
      await firestoreNotificationService.markAsRead(notificationId, socioId)
    } catch (caught) {
      setError(errorMessage(caught))
    }
  }

  async function markAllAsRead() {
    if (!socioId || unreadCount === 0) return
    try {
      setError('')
      setMarkingAll(true)
      await markAllNotificationsAsRead(socioId)
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setMarkingAll(false)
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

  async function enablePushForDevice() {
    if (!preferences || !socioId || !user) return
    setPushBusy(true)
    setError('')
    try {
      await registerPushDevice(socioId, user.uid)
      const next = { ...preferences, push: true }
      await firestoreNotificationService.savePreferences(next)
      setPreferences(next)
      setDevicePushEnabled(true)
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setPushBusy(false)
    }
  }

  async function disablePushForDevice() {
    if (!preferences || !socioId || !user) return
    setPushBusy(true)
    setError('')
    try {
      const next = { ...preferences, push: false }
      await firestoreNotificationService.savePreferences(next)
      await disableCurrentPushDevice()
      setPreferences(next)
      setDevicePushEnabled(false)
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setPushBusy(false)
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
                ? 'No tenés notificaciones sin leer.'
                : `Tenés ${unreadCount} notificación${unreadCount === 1 ? '' : 'es'} sin leer.`}
          </p>
        </div>
        <div className="socio-actions">
          {unreadCount > 0 && (
            <button className="button secondary" type="button" onClick={() => void markAllAsRead()} disabled={markingAll}>
              {markingAll ? 'Actualizando…' : 'Marcar todas como leídas'}
            </button>
          )}
          <span className={`status-badge ${unreadCount > 0 ? 'danger' : 'success'}`}>
            {loading ? 'Cargando' : unreadCount > 0 ? `${unreadCount} sin leer` : 'Todo leído'}
          </span>
        </div>
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
              {item.actionUrl && <Link className="button secondary inline-button" to={item.actionUrl}>{actionLabel(item.actionUrl)}</Link>}
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
              Las preferencias se guardan en tu perfil. Los avisos dentro de la aplicación se actualizan en tiempo real y, cuando registrás este dispositivo, también pueden mostrarse como notificaciones del sistema. El correo electrónico permanece pendiente para una etapa posterior.
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
            <strong>Notificaciones en este dispositivo.</strong>{' '}
            {preferences.push && devicePushEnabled
              ? 'Este dispositivo está registrado para recibir avisos aunque CCNSA no esté abierta.'
              : 'Podés registrar este dispositivo para recibir avisos del sistema cuando la aplicación esté en segundo plano o cerrada.'}
            <div className="socio-actions" style={{ marginTop: 10 }}>
              {preferences.push && devicePushEnabled ? (
                <button className="button secondary inline-button" type="button" onClick={() => void disablePushForDevice()} disabled={pushBusy}>
                  {pushBusy ? 'Actualizando…' : 'Desactivar push'}
                </button>
              ) : (
                <button className="button primary inline-button" type="button" onClick={() => void enablePushForDevice()} disabled={pushBusy}>
                  {pushBusy ? 'Activando…' : 'Activar push en este dispositivo'}
                </button>
              )}
            </div>
          </div>
        </section>
      )}
    </section>
  )
}
