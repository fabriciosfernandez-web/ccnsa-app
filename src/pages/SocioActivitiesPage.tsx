import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../auth/AuthProvider'
import {
  loadSocioActividades,
  loadSocioActivityRegistrations,
  setSocioActivityRegistration,
  type Actividad,
  type ActividadInscripcion,
  type ActividadTipo,
} from '../data/actividades'
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
  const { user, profile } = useAuth()
  const [items, setItems] = useState<Actividad[]>([])
  const [registrations, setRegistrations] = useState<ActividadInscripcion[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  useEffect(() => {
    let active = true
    if (!profile?.socioId || !user) {
      setError('Tu perfil todavía no está vinculado correctamente a una ficha de socio.')
      setLoading(false)
      return () => { active = false }
    }

    void Promise.all([
      loadSocioActividades(),
      loadSocioActivityRegistrations(profile.socioId, user.uid),
    ])
      .then(([activities, currentRegistrations]) => {
        if (!active) return
        setItems(activities)
        setRegistrations(currentRegistrations)
      })
      .catch(() => {
        if (active) setError('No fue posible cargar las actividades.')
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => { active = false }
  }, [profile?.socioId, user])

  const activeItems = useMemo(
    () => items.filter((item) => item.estado === 'ACTIVA'),
    [items],
  )
  const plannedItems = useMemo(
    () => items.filter((item) => item.estado === 'PLANIFICADA'),
    [items],
  )

  const registrationByActivity = useMemo(
    () => new Map(registrations.map((item) => [item.actividadId, item])),
    [registrations],
  )

  async function changeRegistration(item: Actividad, next: 'CONFIRMADA' | 'CANCELADA', acompanantes = 0) {
    if (!user || !profile?.socioId || busyId) return
    setBusyId(item.id)
    setError('')
    setSuccess('')
    try {
      const result = await setSocioActivityRegistration(item, {
        socioId: profile.socioId,
        uid: user.uid,
        nombre: profile.displayName,
      }, next, acompanantes)
      setRegistrations((current) => {
        const remaining = current.filter((entry) => entry.actividadId !== item.id)
        return [...remaining, {
          id: result.id,
          actividadId: item.id,
          actividadNombre: item.nombre,
          socioId: profile.socioId!,
          uid: user.uid,
          socioNombre: profile.displayName,
          estado: result.estado,
          acompanantes: result.acompanantes,
          estadoPago: result.estadoPago,
          asistencia: result.asistencia,
          importeInscripcion: result.importeInscripcion,
        }]
      })
      setItems((current) => current.map((activity) => activity.id === item.id
        ? { ...activity, cuposOcupados: result.cuposOcupados }
        : activity))
      setSuccess(next === 'CANCELADA'
        ? `Tu inscripción a “${item.nombre}” quedó cancelada.`
        : result.estado === 'ESPERA'
          ? `No quedan cupos disponibles. Quedaste en lista de espera para “${item.nombre}”.`
          : `Tu asistencia a “${item.nombre}” quedó confirmada.`)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'No fue posible actualizar tu inscripción.')
    } finally {
      setBusyId('')
    }
  }

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
      {success && <div className="notice socios-success">{success}</div>}

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
                {activeItems.map((item) => <ActivityCard key={item.id} item={item} registration={registrationByActivity.get(item.id)} busy={busyId === item.id} onChange={changeRegistration} />)}
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
                {plannedItems.map((item) => <ActivityCard key={item.id} item={item} registration={registrationByActivity.get(item.id)} busy={busyId === item.id} onChange={changeRegistration} />)}
              </div>
            </section>
          )}

          <article className="panel legacy-panel socio-activity-next">
            <div>
              <p className="legacy-kicker">Inscripciones</p>
              <h3>Confirmá tu asistencia desde el portal</h3>
              <p className="muted">
                Podés confirmar o cancelar tu inscripción mientras la actividad se encuentre activa o planificada. El equipo organizador verá el estado actualizado desde Administración.
              </p>
            </div>
            <span className="status-badge success">Disponible</span>
          </article>
        </>
      )}
    </section>
  )
}

function ActivityCard({
  item,
  registration,
  busy,
  onChange,
}: {
  item: Actividad
  registration?: ActividadInscripcion
  busy: boolean
  onChange: (item: Actividad, next: 'CONFIRMADA' | 'CANCELADA', acompanantes?: number) => Promise<void>
}) {
  const confirmed = registration?.estado === 'CONFIRMADA'
  const waiting = registration?.estado === 'ESPERA'
  const [companions, setCompanions] = useState(registration?.acompanantes ?? 0)
  const available = item.cupo ? Math.max(0, item.cupo - item.cuposOcupados) : undefined

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

      <div className="socio-activity-meta">
        <span>{item.cupo ? `${available} de ${item.cupo} lugar(es) disponibles` : 'Sin límite de cupos'}</span>
        <span>{item.costoInscripcion > 0 ? `Inscripción: Gs. ${Math.round(item.costoInscripcion).toLocaleString('es-PY')}` : 'Sin costo de inscripción'}</span>
        {item.permiteAcompanantes && <span>Hasta {item.maxAcompanantes} acompañante(s)</span>}
      </div>

      {!confirmed && !waiting && item.permiteAcompanantes && item.maxAcompanantes > 0 && (
        <label className="socio-activity-companions">
          Acompañantes
          <select value={companions} onChange={(event) => setCompanions(Number(event.target.value))} disabled={busy}>
            {Array.from({ length: item.maxAcompanantes + 1 }, (_, index) => (
              <option key={index} value={index}>{index}</option>
            ))}
          </select>
        </label>
      )}

      <div className="socio-activity-registration">
        {confirmed ? (
          <>
            <span className="status-badge success">Asistencia confirmada</span>
            {registration && registration.acompanantes > 0 && <span className="status-badge neutral">+ {registration.acompanantes} acompañante(s)</span>}
            {registration?.estadoPago === 'PENDIENTE' && <span className="status-badge neutral">Pago pendiente</span>}
            {registration?.estadoPago === 'PAGADO' && <span className="status-badge success">Pagado</span>}
            {registration?.asistencia === 'PRESENTE' && <span className="status-badge success">Presente</span>}
            {registration?.asistencia === 'AUSENTE' && <span className="status-badge danger">Ausente</span>}
            <button className="button secondary inline-button" type="button" disabled={busy} onClick={() => void onChange(item, 'CANCELADA', registration?.acompanantes ?? 0)}>
              {busy ? 'Actualizando…' : 'Cancelar inscripción'}
            </button>
          </>
        ) : waiting ? (
          <>
            <span className="status-badge neutral">Lista de espera</span>
            {registration && registration.acompanantes > 0 && <span className="status-badge neutral">+ {registration.acompanantes} acompañante(s)</span>}
            <button className="button secondary inline-button" type="button" disabled={busy} onClick={() => void onChange(item, 'CANCELADA', registration?.acompanantes ?? 0)}>
              {busy ? 'Actualizando…' : 'Salir de la lista de espera'}
            </button>
          </>
        ) : (
          <>
            {registration?.estado === 'CANCELADA' && <span className="status-badge neutral">Inscripción cancelada</span>}
            <button className="button primary inline-button" type="button" disabled={busy} onClick={() => void onChange(item, 'CONFIRMADA', companions)}>
              {busy ? 'Confirmando…' : item.cupo && available === 0 ? 'Anotarme en lista de espera' : 'Confirmar asistencia'}
            </button>
          </>
        )}
      </div>
    </article>
  )
}
