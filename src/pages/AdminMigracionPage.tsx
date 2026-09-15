import { useState, type FormEvent } from 'react'
import { useAuth } from '../auth/AuthProvider'
import {
  analyzeMigration2026,
  type MigrationPreview,
} from '../data/migration2026'
import './admin-migracion.css'

const money = (value: number | null) => value === null
  ? '—'
  : `Gs. ${Math.round(value).toLocaleString('es-PY')}`

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message
  return 'No fue posible analizar la planilla.'
}

export function AdminMigracionPage() {
  const { user, profile } = useAuth()
  const [preview, setPreview] = useState<MigrationPreview | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function analyze(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!user || profile?.role !== 'ADMIN' || loading) return

    const form = new FormData(event.currentTarget)
    const spreadsheet = String(form.get('spreadsheet') || '').trim()
    const maxRow = Number(form.get('maxRow') || 60)

    try {
      setLoading(true)
      setError('')
      setPreview(null)
      setPreview(await analyzeMigration2026(user, spreadsheet, maxRow))
    } catch (caught) {
      console.error('Migration preview error', caught)
      setError(errorMessage(caught))
    } finally {
      setLoading(false)
    }
  }

  return (
    <section className="page-stack legacy-page-stack migration-page">
      <header className="legacy-page-header">
        <div>
          <p className="legacy-kicker">Fase 3 · Migración</p>
          <h2>Preconciliación de Lista de miembros 2026</h2>
          <p className="muted">Analiza la hoja productiva en modo solo lectura antes de crear un solo registro en Firestore.</p>
        </div>
        <span className="status-badge neutral">Solo lectura</span>
      </header>

      <div className="notice socios-success migration-safety">
        <strong>Modo seguro:</strong> esta pantalla no modifica Google Sheets ni escribe datos en Firestore. Tampoco consulta las columnas de username y password (E:F).
      </div>

      {error && (
        <div className="notice error">
          <strong>No se pudo completar el análisis.</strong> {error}
          {error.toLowerCase().includes('api') && (
            <div className="migration-error-help">Si Google indica que la API no está habilitada, activá Google Sheets API para el proyecto CCNSA Web Dev y volvé a intentar.</div>
          )}
        </div>
      )}

      <div className="migration-top-grid">
        <form className="panel socios-form migration-source" onSubmit={analyze}>
          <div>
            <p className="legacy-kicker">Fuente</p>
            <h3>Conectar Google Sheet</h3>
            <p className="muted">Pegá el enlace de <strong>Lista de miembros 2026</strong>. Google pedirá autorización de solo lectura.</p>
          </div>
          <label className="cuotas-field-label">
            URL o ID de la planilla
            <input
              name="spreadsheet"
              placeholder="https://docs.google.com/spreadsheets/d/..."
              autoComplete="off"
              required
              disabled={loading}
            />
          </label>
          <label className="cuotas-field-label">
            Analizar hasta la fila
            <input name="maxRow" type="number" min="10" max="500" defaultValue="60" required disabled={loading} />
          </label>
          <button className="button primary" type="submit" disabled={loading}>
            {loading ? 'Analizando…' : 'Conectar y analizar'}
          </button>
          <small className="muted">El permiso solicitado es <code>spreadsheets.readonly</code>. Los datos permanecen en esta sesión del navegador.</small>
        </form>

        <article className="panel migration-plan">
          <p className="legacy-kicker">Objetivo de 3A</p>
          <h3>Diagnóstico antes de importar</h3>
          <p className="muted">Primero debemos demostrar que el modelo nuevo puede reconstruir la base actual sin perder información ni interpretar colores de forma arbitraria.</p>
          <ul className="migration-checklist">
            <li>Detectar socios y tarifas base.</li>
            <li>Conciliar cobros mensuales con la sumatoria anual.</li>
            <li>Proponer SOLTERO/CASADO de forma conservadora.</li>
            <li>Inventariar colores y celdas vacías sin asignarles significado todavía.</li>
            <li>Separar deuda 2025 y deuda 2026.</li>
          </ul>
        </article>
      </div>

      {preview && (
        <>
          <div className="notice migration-readonly-result">
            Análisis completado sobre <strong>{preview.title}</strong> / pestaña <strong>{preview.sheetName}</strong>. No se escribió ningún dato.
          </div>

          <div className="metric-grid legacy-metric-grid migration-metrics">
            <article className="metric-card legacy-metric-card">
              <span>Socios detectados</span>
              <strong>{preview.members.length}</strong>
              <small>Filas con nombre dentro del rango analizado.</small>
            </article>
            <article className="metric-card legacy-metric-card">
              <span>Categoría propuesta</span>
              <strong>{preview.categorias.soltero} / {preview.categorias.casado}</strong>
              <small>Soltero / Casado · {preview.categorias.revisar} para revisar.</small>
            </article>
            <article className="metric-card legacy-metric-card">
              <span>Cobros mensuales 2026</span>
              <strong>{money(preview.totalCobradoMensual)}</strong>
              <small>Suma de importes numéricos Enero–Diciembre.</small>
            </article>
            <article className="metric-card legacy-metric-card">
              <span>Conciliación</span>
              <strong>{preview.sumatoriaMismatches}</strong>
              <small>Fila(s) donde meses ≠ Sumatoria Anual.</small>
            </article>
          </div>

          <div className="migration-detail-grid">
            <article className="panel migration-config-card">
              <p className="legacy-kicker">Parámetros detectados</p>
              <h3>Tarifas de la hoja</h3>
              <dl className="migration-definition-list">
                <div><dt>Aporte soltero</dt><dd>{money(preview.tariffs.aporteSoltero)}</dd></div>
                <div><dt>Aporte casado</dt><dd>{money(preview.tariffs.aporteCasado)}</dd></div>
                <div><dt>Membresía</dt><dd>{money(preview.tariffs.membresia)}</dd></div>
                <div><dt>Ingreso</dt><dd>{money(preview.tariffs.ingreso)}</dd></div>
                <div><dt>Deuda 2026 registrada</dt><dd>{money(preview.totalDeuda2026)}</dd></div>
                <div><dt>Deuda 2025 registrada</dt><dd>{money(preview.totalDeuda2025)}</dd></div>
              </dl>
            </article>

            <article className="panel migration-color-card">
              <p className="legacy-kicker">Diagnóstico de formato</p>
              <h3>Colores detectados en Enero–Diciembre</h3>
              <p className="muted">Todavía no interpretamos un color como pago, mora o exoneración. Primero validamos la leyenda real de la planilla.</p>
              <div className="migration-colors">
                {preview.colorStats.map((stat) => (
                  <div className="migration-color-row" key={stat.color}>
                    <span
                      className="migration-swatch"
                      style={stat.color.startsWith('#') ? { backgroundColor: stat.color } : undefined}
                      aria-hidden="true"
                    />
                    <code>{stat.color}</code>
                    <span>{stat.total} celdas</span>
                    <small>{stat.conValor} con valor · {stat.vacias} vacías</small>
                  </div>
                ))}
              </div>
            </article>
          </div>

          <article className="panel migration-table-panel">
            <div className="panel-heading-row">
              <div>
                <p className="legacy-kicker">Vista previa</p>
                <h3>Mapeo propuesto por socio</h3>
              </div>
              <span className="status-badge neutral">Sin importar</span>
            </div>
            <div className="migration-table-wrap">
              <table className="migration-table">
                <thead>
                  <tr>
                    <th>Fila</th>
                    <th>Socio</th>
                    <th>Categoría propuesta</th>
                    <th>Cobrado meses</th>
                    <th>Sumatoria hoja</th>
                    <th>Deuda 2026</th>
                    <th>Deuda 2025</th>
                    <th>Observaciones</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.members.map((member) => (
                    <tr key={`${member.row}-${member.numero}`}>
                      <td>{member.row}</td>
                      <td>
                        <strong>{member.nombre}</strong>
                        <small>{member.rango || 'Sin rango'} · {member.mesesConImporte} mes(es) con importe</small>
                      </td>
                      <td>
                        <span className={`status-badge ${member.categoriaPropuesta === 'REVISAR' ? 'neutral' : 'active'}`}>
                          {member.categoriaPropuesta}
                        </span>
                      </td>
                      <td>{money(member.cobradoMensual)}</td>
                      <td>{money(member.sumatoriaHoja)}</td>
                      <td>{money(member.deuda2026)}</td>
                      <td>{money(member.deuda2025)}</td>
                      <td className="migration-observations">
                        {member.observaciones.length === 0 ? '—' : member.observaciones.join(' ')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </article>

          <div className="cuotas-info-box migration-next-step">
            <strong>Siguiente control:</strong> validar la leyenda de colores y revisar las filas marcadas como REVISAR. Solo después construiremos el snapshot de migración y la conciliación contra Firestore.
          </div>
        </>
      )}
    </section>
  )
}
