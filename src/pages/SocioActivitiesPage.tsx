import { useEffect, useMemo, useState } from 'react'
import { loadSocioActividades, type Actividad, type ActividadTipo } from '../data/actividades'
import './socio-activities.css'

function typeLabel(tipo: ActividadTipo) {
  if (tipo === 'RETIRO') return 'Retiro'
  if (tipo === 'SAN_JUAN') return 'San Juan'
  if (tipo === 'CLUB_DAMAS') return 'Club de Damas'
  if (tipo === 'ACADEMIA') return 'Academia'
  return 'Actividad'
}

function formatDate(value?: string) {
  if (!value) return 'Fecha a confirmar'
  const date = new Date(`${value}T00:00:00`)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('es-PY', {
    weekday: 'short',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date)
}

function dateRange(item: Actividad) {
  if (!item.fechaFin || item.fechaFin === item.fechaInicio) return formatDate(item.fechaInicio)
  return `${formatDate(item.fechaInicio)} — ${formatDate(item.fechaFin)}`
}

export function SocioActivitiesPage() {
  const [items, setItems] = useState<Actividad[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    void loadSocioActividades()
      .then((activities) => {
        if (active) setItems(activities)
      })
      .catch(() => {
        if (active) setError('No fue posible cargar las actividades.')
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => { active = false }
  }, [])

  const activeItems = useMemo(
    () => items.filter((item) => item.estado === 'ACTIVA'),
    [items],
  )
  const plannedItems = useMemo(
    () => items.filter((item) => item.estado === 'PLANIFICADA'),
    [items],
  )

  return (
    <section className="page-stack legacy-page-stack socio-activities">
      <header className="legacy-page-header">
        <div>
          <p className="legacy-kicker">Portal del socio</p>
          <h2>Actividades</h2>
          <p className="muted">
            Agenda institucional visible para socios. Acá aparecerán las actividades activas y planificadas por el Centro.
          </p>
        </div>
        <span className="status-badge neutral">{loading ? 'Cargando…' : `${items.length} actividad(es)`}</span>
      </header>

      {error && <div className="notice error">{error}</div>}

      {loading ? (
        <div className="screen-message">Cargando actividades…</div>
      ) : items.length === 0 ? (
        <article className="panel legacy-panel">
          <p className="legacy-kicker">Agenda CCNSA</p>
          <h3>Sin actividades publicadas por ahora</h3>
          <p className="muted">Cuando se programe una nueva actividad institucional, aparecerá en este espacio.</p>
        </article>
      ) : (
        <>
          {activeItems.length > 0 && (
            <section className="socio-activity-section">
              <div className="socio-activity-section-heading">
                <div>
                  <p className="legacy-kicker">En curso</p>
                  <h3>Actividades activas</h3>
                </div>
                <span className="status-badge success">{activeItems.length}</span>
              </div>
              <div className="socio-activity-grid">
                {activeItems.map((item) => <ActivityCard key={item.id} item={item} />)}
              </div>
            </section>
          )}

          {plannedItems.length > 0 && (
            <section className="socio-activity-section">
              <div className="socio-activity-section-heading">
                <div>
                  <p className="legacy-kicker">Próximamente</p>
                  <h3>Actividades planificadas</h3>
                </div>
                <span className="status-badge neutral">{plannedItems.length}</span>
              </div>
              <div className="socio-activity-grid">
                {plannedItems.map((item) => <ActivityCard key={item.id} item={item} />)}
              </div>
            </section>
          )}

          <article className="panel legacy-panel socio-activity-next">
            <div>
              <p className="legacy-kicker">Siguiente etapa</p>
              <h3>Inscripciones desde el portal</h3>
              <p className="muted">
                La agenda ya queda disponible para consulta. El próximo paso será habilitar inscripción y confirmación de asistencia cuando corresponda a cada actividad.
              </p>
            </div>
            <span className="status-badge neutral">En preparación</span>
          </article>
        </>
      )}
    </section>
  )
}

function ActivityCard({ item }: { item: Actividad }) {
  return (
    <article className="panel legacy-panel socio-activity-card">
      <div className="socio-activity-card-top">
        <span className="socio-activity-type">{typeLabel(item.tipo)}</span>
        <span className={`status-badge ${item.estado === 'ACTIVA' ? 'success' : 'neutral'}`}>
          {item.estado === 'ACTIVA' ? 'Activa' : 'Planificada'}
        </span>
      </div>
      <div>
        <h3>{item.nombre}</h3>
        <p className="socio-activity-date">{dateRange(item)}</p>
      </div>
      <p className="muted socio-activity-description">
        {item.descripcion || 'Más información será comunicada por el Centro.'}
      </p>
    </article>
  )
}
