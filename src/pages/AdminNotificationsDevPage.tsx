import { useEffect, useState, type FormEvent } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { PushDevPanel } from '../components/PushDevPanel'
import { getPushRecipientStatus, type PushRecipientStatus } from '../notifications/adminPushStatusService'
import { deliverNotificationPushNow } from '../notifications/pushDeliveryService'
import { listSocios, type Socio } from '../data/socios'
import { appEnvironment } from '../lib/firebase'
import {
  createGeneralNotice,
  listRecentPushDeliveries,
} from '../notifications/firestoreNotificationService'
import type { NotificationDelivery } from '../notifications/types'
import './admin-notifications.css'

export function AdminNotificationsDevPage() {
  const { user } = useAuth()
  const [socios, setSocios] = useState<Socio[]>([])
  const [selectedSocioId, setSelectedSocioId] = useState('')
  const [sending, setSending] = useState(false)
  const [recipientStatus, setRecipientStatus] = useState<PushRecipientStatus | null>(null)
  const [loadingRecipientStatus, setLoadingRecipientStatus] = useState(false)
  const [recipientError, setRecipientError] = useState('')
  const [deliveryError, setDeliveryError] = useState('')
  const [deliveries, setDeliveries] = useState<NotificationDelivery[]>([])
  const [loadingDeliveries, setLoadingDeliveries] = useState(true)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    void listSocios()
      .then((items) => {
        if (!active) return
        const activeSocios = items.filter((item) => item.estado === 'ACTIVO')
        setSocios(activeSocios)
        setSelectedSocioId((current) => current || activeSocios[0]?.id || '')
      })
      .catch((caught) => {
        if (!active) return
        setError(caught instanceof Error ? caught.message : 'No fue posible cargar los socios.')
      })
    return () => { active = false }
  }, [])

  async function refreshRecipientStatus(socioId = selectedSocioId) {
    if (!socioId) {
      setRecipientStatus(null)
      return
    }
    setLoadingRecipientStatus(true)
    setRecipientError('')
    setRecipientStatus(null)
    try {
      setRecipientStatus(await getPushRecipientStatus(socioId))
    } catch (caught) {
      setRecipientStatus(null)
      setRecipientError(`No se pudo consultar el backend push: ${caught instanceof Error ? caught.message : 'Error de conexión'}. Revisá el despliegue de Functions.`)
    } finally {
      setLoadingRecipientStatus(false)
    }
  }

  async function refreshDeliveries() {
    setLoadingDeliveries(true)
    setDeliveryError('')
    try {
      setDeliveries(await listRecentPushDeliveries())
    } catch (caught) {
      setDeliveryError(`No se pudieron consultar las entregas: ${caught instanceof Error ? caught.message : 'Error de conexión'}`)
    } finally {
      setLoadingDeliveries(false)
    }
  }

  useEffect(() => {
    void refreshDeliveries()
  }, [])

  useEffect(() => {
    void refreshRecipientStatus(selectedSocioId)
  }, [selectedSocioId])

  if (appEnvironment !== 'dev') return <Navigate to="/admin" replace />

  async function sendGeneralNotice(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!user || !selectedSocioId) return

    const form = event.currentTarget
    const data = new FormData(form)
    const title = String(data.get('title') || '').trim()
    const noticeMessage = String(data.get('message') || '').trim()
    const actionUrl = data.get('actionUrl') === '/socio/notificaciones'
      ? '/socio/notificaciones'
      : '/socio'

    if (!title || !noticeMessage) return

    setSending(true)
    setError('')
    setMessage('')
    try {
      const result = await createGeneralNotice({
        socioId: selectedSocioId,
        title,
        message: noticeMessage,
        actionUrl,
      }, user.uid)

      if (!result.created) {
        setMessage('El socio tiene desactivadas las notificaciones dentro de la app. No se creó el aviso.')
        return
      }

      const socio = socios.find((item) => item.id === selectedSocioId)
      setMessage(`Aviso creado para ${socio?.nombre || 'el socio'} (${result.id}). La recepción push todavía no está confirmada; consultá su entrega abajo.`)
      window.setTimeout(() => { void refreshDeliveries() }, 1500)
      form.reset()
      setSelectedSocioId(selectedSocioId)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'No fue posible crear la notificación.')
    } finally {
      setSending(false)
    }
  }

  return (
    <section className="page-stack legacy-page-stack">
      <header className="legacy-page-header">
        <div>
          <p className="legacy-kicker">Herramientas DEV</p>
          <h2>Notificaciones</h2>
          <p className="muted">
            Probá avisos in-app y diagnosticá el canal push sin afectar el entorno productivo.
          </p>
        </div>
        <span className="status-badge neutral">Entorno de desarrollo</span>
      </header>

      {error && <div className="notice error">{error}</div>}
      {message && <div className="notice socios-success">{message}</div>}

      <section className="panel legacy-panel admin-notice-panel">
        <div className="admin-notice-heading">
          <div>
            <p className="legacy-kicker">Prueba funcional</p>
            <h3>Enviar aviso al portal de un socio</h3>
            <p className="muted">
              Crea una notificación GENERAL_NOTICE real en Firestore y solicita inmediatamente su entrega push por FCM cuando el socio tenga el canal habilitado.
            </p>
          </div>
          <span className="status-badge success">In-app activo</span>
        </div>

        <form className="admin-notice-form" onSubmit={sendGeneralNotice}>
          <label>
            Socio
            <select
              name="socioId"
              value={selectedSocioId}
              onChange={(event) => setSelectedSocioId(event.target.value)}
              disabled={socios.length === 0 || sending}
              required
            >
              {socios.length === 0
                ? <option value="">Sin socios activos</option>
                : socios.map((socio) => (
                  <option key={socio.id} value={socio.id}>{socio.nombre}</option>
                ))}
            </select>
          </label>

          <div className="admin-recipient-status">
            <div>
              <span>Destino push</span>
              <strong>{loadingRecipientStatus
                ? 'Comprobando…'
                : recipientError ? 'Estado no verificado'
                : recipientStatus?.deliverable
                  ? `${recipientStatus.activeDevices} dispositivo(s) activo(s)`
                  : 'Sin entrega push disponible'}</strong>
            </div>
            <span className={`status-badge ${recipientStatus?.deliverable ? 'success' : 'neutral'}`}>
              {loadingRecipientStatus ? 'Comprobando' : recipientError || !recipientStatus ? 'Sin verificar' : recipientStatus?.deliverable ? 'Push listo' : recipientStatus?.pushEnabled ? 'Sin dispositivo' : 'Push desactivado'}
            </span>
            <small>
              {recipientError && <span role="alert">{recipientError} </span>}
              El push se envía únicamente a dispositivos registrados por el socio seleccionado. Si figura “Sin dispositivo”, iniciá sesión como ese socio en el equipo que recibirá los avisos, entrá a Notificaciones y activá push. Cerrar sesión no elimina el registro del dispositivo.
            </small>
          </div>

          <label>
            Título
            <input
              name="title"
              maxLength={80}
              placeholder="Ej.: Estado de cuenta actualizado"
              required
              disabled={sending}
            />
          </label>

          <label className="admin-notice-message">
            Mensaje
            <textarea
              name="message"
              rows={4}
              maxLength={360}
              placeholder="Escribí el aviso que verá el socio."
              required
              disabled={sending}
            />
          </label>

          <label>
            Al tocar el aviso
            <select name="actionUrl" defaultValue="/socio" disabled={sending}>
              <option value="/socio">Abrir estado de cuenta</option>
              <option value="/socio/notificaciones">Abrir notificaciones</option>
            </select>
          </label>

          <div className="admin-notice-actions">
            <button className="button primary" type="submit" disabled={sending || !selectedSocioId}>
              {sending ? 'Enviando…' : 'Enviar aviso de prueba'}
            </button>
            <small>
              Queda trazado en Auditoría como GENERAL_NOTICE_CREATED.
            </small>
          </div>
        </form>
      </section>

      <section className="panel legacy-panel admin-delivery-panel">
        <div className="admin-notice-heading">
          <div>
            <p className="legacy-kicker">Trazabilidad técnica</p>
            <h3>Últimas entregas push</h3>
            <p className="muted">
              SENT indica que FCM aceptó el envío; no confirma que el dispositivo lo mostró. Si no aparece un registro para el aviso creado, el procesamiento del backend no está confirmado.
            </p>
          </div>
          <button className="button secondary inline-button" type="button" onClick={() => void refreshDeliveries()} disabled={loadingDeliveries}>
            {loadingDeliveries ? 'Actualizando…' : 'Actualizar'}
          </button>
        </div>

        {deliveryError && <p className="notice error" role="alert">{deliveryError}</p>}
        {loadingDeliveries ? (
          <div className="screen-message">Cargando entregas…</div>
        ) : deliveries.length === 0 ? (
          <p className="muted">Todavía no hay entregas push registradas.</p>
        ) : (
          <div className="legacy-table-wrap">
            <table className="legacy-table">
              <thead>
                <tr>
                  <th>Estado</th>
                  <th>Socio</th>
                  <th>Aviso</th>
                  <th>Enviados</th>
                  <th>Fallidos</th>
                  <th>Motivo</th>
                  <th>Actualizado</th>
                </tr>
              </thead>
              <tbody>
                {deliveries.map((delivery) => (
                  <tr key={delivery.id || delivery.notificationId}>
                    <td><span className={`status-badge ${delivery.status === 'SENT' ? 'success' : delivery.status === 'FAILED' ? 'danger' : 'neutral'}`}>{delivery.status}</span></td>
                    <td>{delivery.socioId || '—'}</td>
                    <td>{delivery.notificationId}</td>
                    <td>{delivery.successCount ?? '—'}</td>
                    <td>{delivery.failureCount ?? '—'}</td>
                    <td>{delivery.reason || '—'}</td>
                    <td>{delivery.updatedAt ? new Intl.DateTimeFormat('es-PY', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(delivery.updatedAt)) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <details className="admin-push-diagnostics">
        <summary>Diagnóstico técnico local del navegador ADMIN</summary>
        <p className="muted">
          Este panel sirve únicamente para probar FCM en el navegador que estás usando ahora. No selecciona destinatarios ni representa el envío real a socios.
        </p>
        <PushDevPanel />
      </details>
    </section>
  )
}
