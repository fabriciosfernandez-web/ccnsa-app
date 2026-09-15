import { useState, type FormEvent } from 'react'
import { useAuth } from '../auth/AuthProvider'
import {
  analyzeMigration2026,
  type MigrationPreview,
} from '../data/migration2026'
import {
  analyzeMigrationSnapshot2026,
  type MigrationSnapshot2026,
} from '../data/migrationSnapshot2026'
import './admin-migracion.css'

const money = (value: number | null) => value === null
  ? '—'
  : `Gs. ${Math.round(value).toLocaleString('es-PY')}`

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message
  return 'No fue posible analizar la planilla.'
}

function snapshotBadge(state: 'LIMPIO' | 'CONCILIADO_CON_AJUSTES' | 'REVISAR') {
  if (state === 'LIMPIO') return 'active'
  return 'neutral'
}

export function AdminMigracionPage() {
  const { user, profile } = useAuth()
  const [preview, setPreview] = useState<MigrationPreview | null>(null)
  const [snapshot, setSnapshot] = useState<MigrationSnapshot2026 | null>(null)
  const [loading, setLoading] = useState(false)
  const [snapshotLoading, setSnapshotLoading] = useState(false)
  const [error, setError] = useState('')
  const [source, setSource] = useState<{ spreadsheet: string; maxRow: number } | null>(null)

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
      setSnapshot(null)
      const result = await analyzeMigration2026(user, spreadsheet, maxRow)
      setPreview(result)
      setSource({ spreadsheet, maxRow })
    } catch (caught) {
      console.error('Migration preview error', caught)
      setError(errorMessage(caught))
    } finally {
      setLoading(false)
    }
  }

  async function buildSnapshot() {
    if (!user || !preview || !source || snapshotLoading) return
    try {
      setSnapshotLoading(true)
      setError('')
      setSnapshot(await analyzeMigrationSnapshot2026(user, source.spreadsheet, preview, source.maxRow))
    } catch (caught) {
      console.error('Migration snapshot error', caught)
      setError(errorMessage(caught))
    } finally {
      setSnapshotLoading(false)
    }
  }

  const snapshotDifference = snapshot
    ? snapshot.totals.deudaReconstruida - snapshot.totals.deudaFuente
    : null

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
          <p className="legacy-kicker">Objetivo de 3A/3B</p>
          <h3>Diagnóstico y reconstrucción antes de importar</h3>
          <p className="muted">Primero validamos la fuente. Después reconstruimos un snapshot de obligaciones, pagos históricos y exoneraciones sin trasladar al sistema nuevo la lógica obsoleta de colores.</p>
          <ul className="migration-checklist">
            <li>Detectar socios y tarifas base.</li>
            <li>Conciliar cobros mensuales con la sumatoria anual.</li>
            <li>Usar los colores solo como adaptador legacy para el mes de cobro.</li>
            <li>Reconocer el rojo de julio como exoneración por retiro anual.</li>
            <li>Separar deuda 2025 y deuda 2026.</li>
            <li>Reproducir exactamente la deuda de cada socio antes de habilitar importación.</li>
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
              <span>Conciliación básica</span>
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
              <p className="legacy-kicker">Adaptador legacy</p>
              <h3>Colores detectados en Enero–Diciembre</h3>
              <p className="muted">Los colores se conservan únicamente para reconstruir el mes histórico de cobro durante esta migración. No formarán parte del modelo operativo futuro. El rojo se trata como exoneración, no como pago.</p>
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
                <p className="legacy-kicker">Vista previa 3A</p>
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

          <article className="panel migration-snapshot-launch">
            <div>
              <p className="legacy-kicker">Fase 3B</p>
              <h3>Construir snapshot conciliado</h3>
              <p className="muted">Lee fórmulas y colores de la misma hoja, reconstruye obligaciones, pagos, exoneraciones y ajustes legacy, y compara el saldo resultante con la Deuda 2026 registrada. Sigue siendo solo lectura.</p>
            </div>
            <button className="button primary" type="button" onClick={() => void buildSnapshot()} disabled={snapshotLoading}>
              {snapshotLoading ? 'Reconstruyendo…' : snapshot ? 'Reconstruir nuevamente' : 'Construir snapshot 3B'}
            </button>
          </article>

          {snapshot && (
            <>
              <div className="metric-grid legacy-metric-grid migration-metrics migration-snapshot-metrics">
                <article className="metric-card legacy-metric-card">
                  <span>Deuda fuente</span>
                  <strong>{money(snapshot.totals.deudaFuente)}</strong>
                  <small>Saldo registrado en la planilla.</small>
                </article>
                <article className="metric-card legacy-metric-card">
                  <span>Deuda reconstruida</span>
                  <strong>{money(snapshot.totals.deudaReconstruida)}</strong>
                  <small>Diferencia: {money(snapshotDifference)}</small>
                </article>
                <article className="metric-card legacy-metric-card">
                  <span>Estado de filas</span>
                  <strong>{snapshot.totals.limpios} / {snapshot.totals.conciliadosConAjustes}</strong>
                  <small>Limpias / conciliadas con ajustes · {snapshot.totals.revisar} para revisar.</small>
                </article>
                <article className="metric-card legacy-metric-card">
                  <span>Exonerado reconstruido</span>
                  <strong>{money(snapshot.totals.exonerado)}</strong>
                  <small>Obligaciones EXENTAS; no se registran como pagos.</small>
                </article>
              </div>

              <div className="migration-detail-grid">
                <article className="panel migration-config-card">
                  <p className="legacy-kicker">Ledger propuesto</p>
                  <h3>Totales reconstruidos</h3>
                  <dl className="migration-definition-list">
                    <div><dt>Cargos normales</dt><dd>{money(snapshot.totals.cargosNormales)}</dd></div>
                    <div><dt>Pagos elegibles</dt><dd>{money(snapshot.totals.pagosElegibles)}</dd></div>
                    <div><dt>Ajustes técnicos de cargo</dt><dd>{money(snapshot.totals.ajustesCargo)}</dd></div>
                    <div><dt>Ajustes técnicos de pago</dt><dd>{money(snapshot.totals.ajustesPago)}</dd></div>
                  </dl>
                </article>
                <article className="panel migration-plan">
                  <p className="legacy-kicker">Criterio</p>
                  <h3>Qué significa “ajuste legacy”</h3>
                  <p className="muted">No es una nueva regla del sistema. Es una marca temporal para los casos donde la planilla demuestra un saldo o cobro, pero no permite asignarlo a un mes o concepto sin inventar datos. Esos casos deben resolverse antes de importar.</p>
                </article>
              </div>

              <article className="panel migration-table-panel">
                <div className="panel-heading-row">
                  <div>
                    <p className="legacy-kicker">Conciliación 3B</p>
                    <h3>Snapshot por socio</h3>
                  </div>
                  <span className="status-badge neutral">Sin escribir en Firestore</span>
                </div>
                <div className="migration-table-wrap">
                  <table className="migration-table migration-snapshot-table">
                    <thead>
                      <tr>
                        <th>Socio</th>
                        <th>Estado</th>
                        <th>Cargos</th>
                        <th>Pagos</th>
                        <th>Exonerado</th>
                        <th>Deuda hoja</th>
                        <th>Reconstruida</th>
                        <th>Diferencia</th>
                        <th>Observaciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...snapshot.members]
                        .sort((a, b) => {
                          const order = { REVISAR: 0, CONCILIADO_CON_AJUSTES: 1, LIMPIO: 2 }
                          return order[a.estado] - order[b.estado] || a.row - b.row
                        })
                        .map((member) => (
                          <tr key={`snapshot-${member.row}`}>
                            <td>
                              <strong>{member.nombre}</strong>
                              <small>Fila {member.row} · {member.obligaciones.length} obligación(es) · {member.movimientos.length} movimiento(s)</small>
                            </td>
                            <td>
                              <span className={`status-badge ${snapshotBadge(member.estado)}`}>{member.estado.replaceAll('_', ' ')}</span>
                            </td>
                            <td>{money(member.totalCargosNormales)}</td>
                            <td>{money(member.totalPagosElegibles)}</td>
                            <td>{money(member.totalExonerado)}</td>
                            <td>{money(member.deudaFuente)}</td>
                            <td>{money(member.deudaReconstruida)}</td>
                            <td>{money(member.diferencia)}</td>
                            <td className="migration-observations">
                              {member.observaciones.length === 0 ? '—' : member.observaciones.join(' ')}
                              {member.formulaDeuda2026 && <small className="migration-formula">{member.formulaDeuda2026}</small>}
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </article>

              <div className="cuotas-info-box migration-next-step">
                <strong>Control previo a importación:</strong> la deuda reconstruida debe coincidir con la fuente y las filas “REVISAR” deben resolverse. Solo después convertiremos el snapshot aprobado en escrituras idempotentes a Firestore.
              </div>
            </>
          )}
        </>
      )}
    </section>
  )
}
