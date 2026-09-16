import { useState, type FormEvent } from 'react'
import { useAuth } from '../auth/AuthProvider'
import { analyzeMigration2026, type MigrationPreview } from '../data/migration2026'
import { analyzeMigrationSnapshot2026, type MigrationSnapshot2026 } from '../data/migrationSnapshot2026'
import { buildMigrationDryRun2026, type MigrationDryRun2026 } from '../data/migrationDryRun2026'
import { runMigrationPreflight2026, type MigrationPreflight2026 } from '../data/migrationPreflight2026'
import './admin-migracion.css'

const DEFAULT_SHEET = 'https://docs.google.com/spreadsheets/d/1REWfqtMAjemajR3Av1fchmIzzqKK8MBr6KfF1pNh_RA/edit'

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message
  return 'No fue posible completar el preflight.'
}

export function AdminMigracionPreflightPage() {
  const { user, profile } = useAuth()
  const [preview, setPreview] = useState<MigrationPreview | null>(null)
  const [snapshot, setSnapshot] = useState<MigrationSnapshot2026 | null>(null)
  const [dryRun, setDryRun] = useState<MigrationDryRun2026 | null>(null)
  const [preflight, setPreflight] = useState<MigrationPreflight2026 | null>(null)
  const [source, setSource] = useState<{ spreadsheet: string; maxRow: number } | null>(null)
  const [loading, setLoading] = useState<'SOURCE' | 'SNAPSHOT' | 'PREFLIGHT' | null>(null)
  const [error, setError] = useState('')

  async function refreshSource(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!user || profile?.role !== 'ADMIN' || loading) return
    const form = new FormData(event.currentTarget)
    const spreadsheet = String(form.get('spreadsheet') || '').trim()
    const maxRow = Number(form.get('maxRow') || 60)

    try {
      setLoading('SOURCE')
      setError('')
      setPreview(null)
      setSnapshot(null)
      setDryRun(null)
      setPreflight(null)
      const result = await analyzeMigration2026(user, spreadsheet, maxRow)
      setPreview(result)
      setSource({ spreadsheet, maxRow })
    } catch (caught) {
      console.error('Migration preflight source error', caught)
      setError(errorMessage(caught))
    } finally {
      setLoading(null)
    }
  }

  async function refreshSnapshot() {
    if (!user || !preview || !source || loading) return
    try {
      setLoading('SNAPSHOT')
      setError('')
      setDryRun(null)
      setPreflight(null)
      const result = await analyzeMigrationSnapshot2026(user, source.spreadsheet, preview, source.maxRow)
      setSnapshot(result)
    } catch (caught) {
      console.error('Migration preflight snapshot error', caught)
      setError(errorMessage(caught))
    } finally {
      setLoading(null)
    }
  }

  async function runPreflight() {
    if (!preview || !snapshot || loading) return
    try {
      setLoading('PREFLIGHT')
      setError('')
      setPreflight(null)
      const plan = buildMigrationDryRun2026(preview, snapshot)
      setDryRun(plan)
      if (plan.status !== 'LISTO') throw new Error(`El dry-run fresco quedó BLOQUEADO: ${plan.blockers.join(' ')}`)
      setPreflight(await runMigrationPreflight2026(plan))
    } catch (caught) {
      console.error('Migration Firestore preflight error', caught)
      setError(errorMessage(caught))
    } finally {
      setLoading(null)
    }
  }

  const snapshotReady = Boolean(
    snapshot
    && Math.abs(snapshot.totals.deudaReconstruida - snapshot.totals.deudaObjetivoMigracion) <= 0.5
    && snapshot.totals.revisar === 0
    && snapshot.totals.ajustesCargo <= 0.5
    && snapshot.totals.ajustesPago <= 0.5,
  )

  return (
    <section className="page-stack legacy-page-stack migration-page">
      <header className="legacy-page-header">
        <div>
          <p className="legacy-kicker">Fase 3D · Preflight</p>
          <h2>Control final antes de habilitar importación</h2>
          <p className="muted">Revalida la fuente y contrasta el plan determinístico contra Firestore. Este paso solo lee datos.</p>
        </div>
        <span className="status-badge neutral">Solo lectura</span>
      </header>

      <div className="notice socios-success migration-safety">
        <strong>Sin escrituras:</strong> este preflight no modifica Google Sheets, Firestore ni Firebase Authentication. La escritura real continúa deshabilitada.
      </div>

      {error && <div className="notice error"><strong>Preflight detenido.</strong> {error}</div>}

      <div className="migration-top-grid">
        <form className="panel socios-form migration-source" onSubmit={refreshSource}>
          <div>
            <p className="legacy-kicker">Paso 1</p>
            <h3>Revalidar fuente productiva</h3>
            <p className="muted">Lee nuevamente la hoja para que el fingerprint parta del estado actual y no de una captura anterior.</p>
          </div>
          <label className="cuotas-field-label">
            URL o ID de la planilla
            <input name="spreadsheet" defaultValue={DEFAULT_SHEET} required disabled={Boolean(loading)} />
          </label>
          <label className="cuotas-field-label">
            Analizar hasta la fila
            <input name="maxRow" type="number" min="10" max="500" defaultValue="60" required disabled={Boolean(loading)} />
          </label>
          <button className="button primary" type="submit" disabled={Boolean(loading)}>
            {loading === 'SOURCE' ? 'Revalidando…' : preview ? 'Revalidar nuevamente' : 'Revalidar fuente'}
          </button>
          {preview && <small className="muted">Fuente actual: {preview.members.length} registros históricos · deuda 2026 registrada Gs. {Math.round(preview.totalDeuda2026).toLocaleString('es-PY')}.</small>}
        </form>

        <article className="panel migration-plan">
          <p className="legacy-kicker">Paso 2</p>
          <h3>Reconstruir 3B fresco</h3>
          <p className="muted">Vuelve a reconstruir obligaciones, pagos, exoneraciones y ajustes validados desde la lectura recién realizada.</p>
          <button className="button primary" type="button" onClick={() => void refreshSnapshot()} disabled={!preview || Boolean(loading)}>
            {loading === 'SNAPSHOT' ? 'Reconstruyendo…' : snapshot ? 'Reconstruir nuevamente' : 'Construir snapshot fresco'}
          </button>
          {snapshot && (
            <small className="muted">
              Objetivo Gs. {Math.round(snapshot.totals.deudaObjetivoMigracion).toLocaleString('es-PY')} · reconstruida Gs. {Math.round(snapshot.totals.deudaReconstruida).toLocaleString('es-PY')} · {snapshot.totals.revisar} para revisar.
            </small>
          )}
        </article>
      </div>

      <article className="panel migration-snapshot-launch migration-dryrun-launch">
        <div>
          <p className="legacy-kicker">Paso 3</p>
          <h3>Ejecutar preflight contra Firestore</h3>
          <p className="muted">Genera nuevamente el plan 3C, recalcula su fingerprint y comprueba IDs determinísticos, identidades duplicadas y rastros de migraciones previas.</p>
          {!snapshotReady && <small className="migration-blocked-copy">Disponible cuando el snapshot fresco tenga diferencia 0, 0 REVISAR y 0 ajustes técnicos.</small>}
        </div>
        <button className="button primary" type="button" onClick={() => void runPreflight()} disabled={!snapshotReady || Boolean(loading)}>
          {loading === 'PREFLIGHT' ? 'Verificando Firestore…' : preflight ? 'Ejecutar nuevamente' : 'Ejecutar preflight'}
        </button>
      </article>

      {preflight && dryRun && (
        <>
          <div className={`notice ${preflight.status === 'LISTO' ? 'socios-success' : 'error'} migration-dryrun-status`}>
            <strong>Preflight {preflight.status}.</strong> Fingerprint fresco <code>{preflight.fingerprint}</code>. No se escribió ningún documento.
          </div>

          <div className="metric-grid legacy-metric-grid migration-metrics migration-dryrun-metrics">
            <article className="metric-card legacy-metric-card">
              <span>Planificados / IDs libres</span>
              <strong>{preflight.plannedDocuments} / {preflight.freeIds}</strong>
              <small>{preflight.compatibleExisting} existentes compatibles con reanudación.</small>
            </article>
            <article className="metric-card legacy-metric-card">
              <span>Colisiones duras</span>
              <strong>{preflight.collisions.filter((item) => !item.compatibleResume).length}</strong>
              <small>IDs existentes que no acreditan este fingerprint.</small>
            </article>
            <article className="metric-card legacy-metric-card">
              <span>Conflictos de identidad</span>
              <strong>{preflight.identityConflicts.length}</strong>
              <small>Número de socio o nombre ya presente con otro ID.</small>
            </article>
            <article className="metric-card legacy-metric-card">
              <span>Rastros de migración</span>
              <strong>{preflight.existingMigrationDocuments}</strong>
              <small>Audit matching: {preflight.priorMatchingAuditEntries}.</small>
            </article>
          </div>

          <div className="migration-detail-grid">
            <article className="panel migration-config-card">
              <p className="legacy-kicker">Firestore actual</p>
              <h3>Documentos existentes por colección</h3>
              <dl className="migration-definition-list">
                <div><dt>socios</dt><dd>{preflight.existingCollectionCounts.socios}</dd></div>
                <div><dt>obligaciones</dt><dd>{preflight.existingCollectionCounts.obligaciones}</dd></div>
                <div><dt>pagos</dt><dd>{preflight.existingCollectionCounts.pagos}</dd></div>
                <div><dt>aplicaciones_pago</dt><dd>{preflight.existingCollectionCounts.aplicaciones_pago}</dd></div>
                <div><dt>excepciones_cobro</dt><dd>{preflight.existingCollectionCounts.excepciones_cobro}</dd></div>
                <div><dt>categoria_historial</dt><dd>{preflight.existingCollectionCounts.categoria_historial}</dd></div>
              </dl>
            </article>

            <article className="panel migration-plan">
              <p className="legacy-kicker">Resultado</p>
              <h3>Salvaguardas del preflight</h3>
              {preflight.blockers.length === 0 ? (
                <p className="muted">No se detectaron bloqueos. El plan sigue siendo candidato para una futura importación idempotente.</p>
              ) : (
                <ul className="migration-checklist">{preflight.blockers.map((item) => <li key={item}>{item}</li>)}</ul>
              )}
              {preflight.warnings.length > 0 && <ul className="migration-checklist">{preflight.warnings.map((item) => <li key={item}>{item}</li>)}</ul>}
            </article>
          </div>

          {(preflight.collisions.length > 0 || preflight.identityConflicts.length > 0) && (
            <article className="panel migration-table-panel">
              <div className="panel-heading-row">
                <div>
                  <p className="legacy-kicker">Excepciones detectadas</p>
                  <h3>Colisiones e identidades existentes</h3>
                </div>
                <span className="status-badge neutral">Revisión requerida</span>
              </div>
              <div className="migration-table-wrap">
                <table className="migration-table">
                  <thead><tr><th>Tipo</th><th>Socio</th><th>ID planificado</th><th>ID existente</th><th>Motivo</th></tr></thead>
                  <tbody>
                    {preflight.collisions.map((item) => (
                      <tr key={`collision-${item.collection}-${item.id}`}>
                        <td>{item.compatibleResume ? 'REANUDABLE' : 'COLISIÓN'}</td>
                        <td>{item.memberName}</td>
                        <td><code>{item.collection}/{item.id}</code></td>
                        <td><code>{item.collection}/{item.id}</code></td>
                        <td>{item.reason}</td>
                      </tr>
                    ))}
                    {preflight.identityConflicts.map((item) => (
                      <tr key={`identity-${item.plannedSocioId}-${item.existingSocioId}`}>
                        <td>IDENTIDAD</td>
                        <td>{item.memberName}</td>
                        <td><code>socios/{item.plannedSocioId}</code></td>
                        <td><code>socios/{item.existingSocioId}</code></td>
                        <td>{item.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </article>
          )}

          <div className="cuotas-info-box migration-next-step">
            <strong>Importación real sigue deshabilitada.</strong> Si este preflight queda LISTO, el próximo cambio será implementar el ejecutor idempotente con actorUid, audit_log y revalidación del fingerprint inmediatamente antes del primer batch.
          </div>
        </>
      )}
    </section>
  )
}
