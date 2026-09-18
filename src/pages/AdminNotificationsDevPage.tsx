import { useEffect, useState, type FormEvent } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { PushDevPanel } from '../components/PushDevPanel'
import { listSocios, type Socio } from '../data/socios'
import { appEnvironment } from '../lib/firebase'
import { createGeneralNotice } from '../notifications/firestoreNotificationService'
import './admin-notifications.css'

export function AdminNotificationsDevPage() {
  const { user } = useAuth()
  const [socios, setSocios] = useState<Socio[]>([])
  const [selectedSocioId, setSelectedSocioId] = useState('')
  const [sending, setSending] = useState(false)
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
      setMessage(`Aviso enviado a ${socio?.nombre || 'el socio'}. Ya debería aparecer en su centro de notificaciones.`)
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
              Crea una notificación GENERAL_NOTICE real en Firestore y respeta la preferencia in-app del socio.
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

      <PushDevPanel />
    </section>
  )
}
