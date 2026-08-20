import { useAuth } from '../auth/AuthProvider'

export function SocioDashboard() {
  const { profile } = useAuth()

  return (
    <section className="page-stack">
      <header className="page-header">
        <div>
          <p className="eyebrow">Portal del socio</p>
          <h2>Hola, {profile?.displayName}</h2>
          <p className="muted">Esta primera fase deja preparado el portal para consultar obligaciones, pagos y saldo.</p>
        </div>
      </header>

      <div className="metric-grid">
        <article className="metric-card">
          <span>Saldo pendiente</span>
          <strong>—</strong>
          <small>Se calculará desde obligaciones menos pagos aplicados.</small>
        </article>
        <article className="metric-card">
          <span>Último pago</span>
          <strong>—</strong>
          <small>Sin datos migrados todavía.</small>
        </article>
        <article className="metric-card">
          <span>Estado</span>
          <strong>Preparado</strong>
          <small>Acceso limitado al socio vinculado a esta cuenta.</small>
        </article>
      </div>

      <article className="panel">
        <h3>Próximo hito</h3>
        <p>Conectar las colecciones de obligaciones y pagos, y reemplazar estos indicadores por información real de Firestore.</p>
      </article>
    </section>
  )
}
