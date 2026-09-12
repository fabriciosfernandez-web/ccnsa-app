import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../auth/AuthProvider'
import { mockNotificationService } from '../notifications/mockNotificationService'
import type { AccountNotification, NotificationPreferences } from '../notifications/types'

function formatDate(value: string) {
  return new Intl.DateTimeFormat('es-PY', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

export function NotificationsPage() {
  const { profile } = useAuth()
  const socioId = profile?.socioId ?? 'SOCIO-DEMO'
  const [items, setItems] = useState<AccountNotification[]>([])
  const [preferences, setPreferences] = useState<NotificationPreferences | null>(null)

  useEffect(() => {
    void Promise.all([
      mockNotificationService.listForSocio(socioId),
      mockNotificationService.getPreferences(socioId),
    ]).then(([notifications, nextPreferences]) => {
      setItems(notifications)
      setPreferences(nextPreferences)
    })
  }, [socioId])

  const unreadCount = useMemo(
    () => items.filter((item) => item.status === 'UNREAD').length,
    [items],
  )

  async function markAsRead(notificationId: string) {
    await mockNotificationService.markAsRead(notificationId, socioId)
    setItems(await mockNotificationService.listForSocio(socioId))
  }

  async function togglePreference(key: keyof Omit<NotificationPreferences, 'socioId'>) {
    if (!preferences) return
    const next = { ...preferences, [key]: !preferences[key] }
    setPreferences(next)
    await mockNotificationService.savePreferences(next)
  }

  return (
    <div className="page-stack">
      <header className="page-header">
        <div>
          <p className="eyebrow">Estado de cuenta</p>
          <h2>Notificaciones</h2>
          <p className="muted">
            {unreadCount === 0
              ? 'No tenés notificaciones pendientes.'
              : `Tenés ${unreadCount} notificación${unreadCount === 1 ? '' : 'es'} sin leer.`}
          </p>
        </div>
      </header>

      <section className="notification-list" aria-label="Notificaciones de cuenta">
        {items.map((item) => (
          <article key={item.id} className={`notification-card ${item.status === 'UNREAD' ? 'unread' : ''}`}>
            <div className="notification-card-header">
              <div>
                <span className="notification-kind">{item.kind.replaceAll('_', ' ')}</span>
                <h3>{item.title}</h3>
              </div>
              {item.status === 'UNREAD' && <span className="unread-dot" aria-label="Sin leer" />}
            </div>

            <p>{item.message}</p>
            <small>{formatDate(item.createdAt)}</small>

            {item.status === 'UNREAD' && (
              <button className="button secondary inline-button" type="button" onClick={() => void markAsRead(item.id)}>
                Marcar como leída
              </button>
            )}
          </article>
        ))}
      </section>

      {preferences && (
        <section className="panel notification-preferences">
          <div>
            <p className="eyebrow">Preferencias</p>
            <h3>Cómo querés recibir avisos</h3>
            <p className="muted">
              En esta fase las preferencias son de demostración. Los canales reales se conectarán después sin cambiar esta interfaz.
            </p>
          </div>

          <label>
            <input type="checkbox" checked={preferences.inApp} onChange={() => void togglePreference('inApp')} />
            Notificaciones dentro de la aplicación
          </label>
          <label>
            <input type="checkbox" checked={preferences.email} onChange={() => void togglePreference('email')} />
            Correo electrónico
          </label>
          <label>
            <input type="checkbox" checked={preferences.push} onChange={() => void togglePreference('push')} />
            Notificaciones push
          </label>
          <label>
            <input
              type="checkbox"
              checked={preferences.monthlyStatements}
              onChange={() => void togglePreference('monthlyStatements')}
            />
            Avisarme cuando esté disponible un nuevo estado de cuenta
          </label>
          <label>
            <input
              type="checkbox"
              checked={preferences.paymentConfirmations}
              onChange={() => void togglePreference('paymentConfirmations')}
            />
            Confirmaciones de pagos registrados
          </label>
          <label>
            <input
              type="checkbox"
              checked={preferences.overdueReminders}
              onChange={() => void togglePreference('overdueReminders')}
            />
            Recordatorios de obligaciones vencidas
          </label>
        </section>
      )}
    </div>
  )
}
