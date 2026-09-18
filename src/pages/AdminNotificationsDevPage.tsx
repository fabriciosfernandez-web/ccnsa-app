import { Navigate } from 'react-router-dom'
import { PushDevPanel } from '../components/PushDevPanel'
import { appEnvironment } from '../lib/firebase'

export function AdminNotificationsDevPage() {
  if (appEnvironment !== 'dev') return <Navigate to="/admin" replace />

  return (
    <section className="page-stack legacy-page-stack">
      <header className="legacy-page-header">
        <div>
          <p className="legacy-kicker">Herramientas DEV</p>
          <h2>Notificaciones</h2>
          <p className="muted">
            Diagnóstico de notificaciones del navegador y Firebase Cloud Messaging para este dispositivo.
          </p>
        </div>
      </header>

      <PushDevPanel />
    </section>
  )
}
