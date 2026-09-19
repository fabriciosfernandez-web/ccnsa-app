import { useEffect, useState } from 'react'
import { useAuth } from '../auth/AuthProvider'
import { loadSocio, type Socio } from '../data/socios'
import './socio-profile.css'

function formatDate(value?: string) {
  if (!value) return 'No informada'
  const date = new Date(`${value}T00:00:00`)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('es-PY', { dateStyle: 'long' }).format(date)
}

export function SocioProfilePage() {
  const { profile } = useAuth()
  const [socio, setSocio] = useState<Socio | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    async function load() {
      if (!profile?.socioId) {
        setError('Tu perfil todavía no está vinculado a una ficha de socio.')
        setLoading(false)
        return
      }

      try {
        setError('')
        const record = await loadSocio(profile.socioId)
        if (!record) {
          setError('No encontramos tu ficha de socio.')
          return
        }
        setSocio(record)
      } catch {
        setError('No fue posible cargar tu perfil.')
      } finally {
        setLoading(false)
      }
    }

    void load()
  }, [profile?.socioId])

  return (
    <section className="page-stack legacy-page-stack socio-profile-page">
      <header className="legacy-page-header">
        <div>
          <p className="legacy-kicker">Portal del socio</p>
          <h2>Mi perfil</h2>
          <p className="muted">Datos básicos asociados a tu membresía en CCNSA.</p>
        </div>
        {socio && <span className={`status-badge ${socio.estado === 'ACTIVO' ? 'success' : 'neutral'}`}>{socio.estado}</span>}
      </header>

      {error && <div className="notice error">{error}</div>}

      {loading ? (
        <div className="screen-message">Cargando perfil…</div>
      ) : socio && (
        <>
          <article className="panel legacy-panel socio-profile-identity">
            <div className="socio-profile-avatar" aria-hidden="true">
              {socio.nombre.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('')}
            </div>
            <div>
              <p className="legacy-kicker">Socio CCNSA</p>
              <h3>{socio.nombre}</h3>
              <p className="muted">{socio.email || 'Correo electrónico no informado'}</p>
            </div>
          </article>

          <div className="socio-profile-grid">
            <article className="panel legacy-panel">
              <p className="legacy-kicker">Membresía</p>
              <h3>Datos de la ficha</h3>
              <dl className="socio-profile-details">
                <div><dt>Categoría</dt><dd>{socio.categoria === 'CASADO' ? 'Matrimonio' : 'Individual'}</dd></div>
                <div><dt>Estado</dt><dd>{socio.estado}</dd></div>
                <div><dt>Fecha de ingreso</dt><dd>{formatDate(socio.fechaIngreso)}</dd></div>
                <div><dt>Identificador</dt><dd className="socio-profile-id">{socio.id}</dd></div>
              </dl>
            </article>

            <article className="panel legacy-panel socio-profile-info">
              <p className="legacy-kicker">Información</p>
              <h3>Actualización de datos</h3>
              <p className="muted">
                Por seguridad, los datos de membresía todavía se administran desde la gestión institucional. Si necesitás corregir tu nombre, correo o categoría, comunicate con el Centro.
              </p>
              <div className="cuotas-info-box">
                <strong>Próxima etapa.</strong> Este espacio puede incorporar datos de contacto editables, documentos, actividades e inscripciones sin mezclar esa información con el estado de cuenta.
              </div>
            </article>
          </div>
        </>
      )}
    </section>
  )
}
