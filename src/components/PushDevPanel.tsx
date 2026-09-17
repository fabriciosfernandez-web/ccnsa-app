import { useEffect, useState } from 'react'
import { appEnvironment } from '../lib/firebase'
import {
  inspectPushSupport,
  registerPushForManualTest,
  storedVapidKey,
  subscribeForegroundMessages,
  type PushSetupState,
} from '../notifications/webPushDev'

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'No fue posible activar las notificaciones push.'
}

export function PushDevPanel() {
  const [support, setSupport] = useState<PushSetupState | null>(null)
  const [vapidKey, setVapidKey] = useState(storedVapidKey)
  const [token, setToken] = useState('')
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState('')
  const [foregroundMessage, setForegroundMessage] = useState('')

  useEffect(() => {
    let active = true
    void inspectPushSupport().then((value) => {
      if (active) setSupport(value)
    })

    let unsubscribe: (() => void) | undefined
    void subscribeForegroundMessages((payload) => {
      if (!active) return
      const title = payload.notification?.title || 'Notificación push recibida'
      const body = payload.notification?.body || 'FCM entregó un mensaje mientras CCNSA estaba abierto.'
      setForegroundMessage(`${title}${body ? ` · ${body}` : ''}`)
    }).then((fn) => { unsubscribe = fn })

    return () => {
      active = false
      unsubscribe?.()
    }
  }, [])

  if (appEnvironment !== 'dev') return null

  async function enablePush() {
    setBusy(true)
    setError('')
    setCopied(false)
    try {
      const nextToken = await registerPushForManualTest(vapidKey)
      setToken(nextToken)
      setSupport(await inspectPushSupport())
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setBusy(false)
    }
  }

  async function copyToken() {
    if (!token) return
    await navigator.clipboard.writeText(token)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1800)
  }

  const permissionLabel = support?.permission === 'granted'
    ? 'Permitido'
    : support?.permission === 'denied'
      ? 'Bloqueado'
      : support?.permission === 'default'
        ? 'Sin decidir'
        : 'No disponible'

  return (
    <section className="panel legacy-panel push-dev-panel">
      <div className="push-dev-heading">
        <div>
          <p className="legacy-kicker">Prueba DEV · Firebase Cloud Messaging</p>
          <h3>Push real en este navegador</h3>
          <p className="muted">
            Esta prueba no requiere Blaze. Genera un token temporal del navegador para usarlo en “Enviar mensaje de prueba” desde Firebase Console.
          </p>
        </div>
        <span className={`status-badge ${support?.supported ? 'success' : 'neutral'}`}>
          {support === null ? 'Comprobando…' : support.supported ? 'Compatible' : 'No compatible'}
        </span>
      </div>

      <div className="push-dev-status-grid">
        <div><span>HTTPS</span><strong>{support?.secureContext ? 'Sí' : 'No'}</strong></div>
        <div><span>Permiso del navegador</span><strong>{permissionLabel}</strong></div>
        <div><span>Service Worker</span><strong>{typeof navigator !== 'undefined' && 'serviceWorker' in navigator ? 'Disponible' : 'No disponible'}</strong></div>
      </div>

      <label className="push-dev-key">
        Clave pública VAPID
        <input
          value={vapidKey}
          onChange={(event) => setVapidKey(event.target.value)}
          placeholder="Pegá aquí la clave pública de Web Push de Firebase"
          autoComplete="off"
        />
        <small>Es una clave pública de Web Push; se guarda solamente en este navegador para la prueba.</small>
      </label>

      <div className="push-dev-actions">
        <button className="button primary" type="button" onClick={() => void enablePush()} disabled={busy || support?.supported === false}>
          {busy ? 'Activando…' : 'Habilitar push y obtener token'}
        </button>
      </div>

      {error && <div className="notice error"><strong>Push.</strong> {error}</div>}

      {token && (
        <div className="push-token-box">
          <div>
            <span>Token FCM de prueba</span>
            <small>Copialo únicamente en Firebase Console → Messaging → Enviar mensaje de prueba.</small>
          </div>
          <textarea value={token} readOnly rows={4} aria-label="Token FCM de prueba" />
          <button className="button secondary" type="button" onClick={() => void copyToken()}>
            {copied ? 'Copiado' : 'Copiar token'}
          </button>
        </div>
      )}

      {foregroundMessage && (
        <div className="notice socios-success">
          <strong>Push recibido con la app abierta.</strong> {foregroundMessage}
        </div>
      )}

      <div className="push-dev-instructions">
        <strong>Cómo validar el push real</strong>
        <ol>
          <li>Generá una clave Web Push/VAPID en Firebase Console y pegala arriba.</li>
          <li>Habilitá las notificaciones y copiá el token FCM.</li>
          <li>En Firebase Console, creá una notificación y elegí “Enviar mensaje de prueba”.</li>
          <li>Pegá el token y enviá el test. Para ver la notificación del sistema, dejá esta pestaña en segundo plano.</li>
        </ol>
      </div>
    </section>
  )
}
