import { useEffect, useState, type FormEvent } from 'react'
import { useAuth } from '../auth/AuthProvider'
import {
  createTarifaCuota,
  generarCuotasPeriodo,
  listTarifasCuota,
  setTarifaCuotaActiva,
  type TarifaCuota,
} from '../data/tarifas'
import {
  analizarConciliacionMasiva,
  conciliarRegistrosPreviosMasivo,
  type ConciliacionMasivaPreview,
} from '../data/reconciliacion'
import './admin-cuotas.css'

const money = (value: number) => `Gs. ${Math.round(value).toLocaleString('es-PY')}`
const currentPeriod = new Date().toISOString().slice(0, 7)

function devErrorMessage(prefix: string, error: unknown) {
  if (import.meta.env.DEV || import.meta.env.MODE === 'development') {
    if (error instanceof Error) return `${prefix} ${error.message}`
  }
  return prefix
}

export function AdminCuotasPage() {
  const { user, profile } = useAuth()
  const canConfigure = profile?.role === 'ADMIN'
  const canGenerate = profile?.role === 'ADMIN' || profile?.role === 'TESORERIA'
  const [tarifas, setTarifas] = useState<TarifaCuota[]>([])
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [generating, setGenerating] = useState(false)
  const [reconciliationPreview, setReconciliationPreview] = useState<ConciliacionMasivaPreview | null>(null)
  const [reconciliationBusy, setReconciliationBusy] = useState<'PREVIEW' | 'RUN' | null>(null)

  async function loadTarifas() {
    try {
      setTarifas(await listTarifasCuota())
    } catch (caught) {
      setError(devErrorMessage('No fue posible cargar las tarifas.', caught))
    }
  }

  useEffect(() => { void loadTarifas() }, [])

  async function addTarifa(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!user || !canConfigure) return
    const formElement = event.currentTarget
    const form = new FormData(formElement)
    const concepto = String(form.get('concepto') || '').trim()
    const importe = Number(form.get('importe') || 0)
    const vigenciaDesde = String(form.get('vigenciaDesde') || currentPeriod)
    const vigenciaHasta = String(form.get('vigenciaHasta') || '') || undefined
    const diaVencimiento = Number(form.get('diaVencimiento') || 10)

    if (!concepto || importe <= 0 || diaVencimiento < 1 || diaVencimiento > 31) return
    if (vigenciaHasta && vigenciaHasta < vigenciaDesde) {
      setError('La vigencia hasta no puede ser anterior a la vigencia desde.')
      return
    }

    try {
      setError('')
      setMessage('')
      await createTarifaCuota({
        concepto,
        categoria: form.get('categoria') === 'CASADO'
          ? 'CASADO'
          : form.get('categoria') === 'TODOS'
            ? 'TODOS'
            : 'SOLTERO',
        importe,
        vigenciaDesde,
        vigenciaHasta,
        diaVencimiento,
        activa: true,
      }, user.uid)
      formElement.reset()
      setMessage('Tarifa creada. Todavía no se generó ninguna obligación.')
      await loadTarifas()
    } catch (caught) {
      console.error('Error creating tariff', caught)
      setError(devErrorMessage('No se pudo crear la tarifa.', caught))
    }
  }

  async function toggleTarifa(tarifa: TarifaCuota) {
    if (!user || !canConfigure) return
    try {
      setError('')
      setMessage('')
      await setTarifaCuotaActiva(tarifa.id, !tarifa.activa, user.uid)
      setMessage(tarifa.activa ? 'Tarifa desactivada.' : 'Tarifa activada.')
      await loadTarifas()
    } catch (caught) {
      console.error('Error toggling tariff', caught)
      setError(devErrorMessage('No se pudo actualizar la tarifa.', caught))
    }
  }

  async function generatePeriod(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!user || !canGenerate || generating) return
    const form = new FormData(event.currentTarget)
    const periodo = String(form.get('periodo') || currentPeriod)

    try {
      setGenerating(true)
      setError('')
      setMessage('')
      const result = await generarCuotasPeriodo(periodo, user.uid)

      if (result.creadas === 0 && result.omitidas > 0) {
        setMessage(
          `El período ${periodo} ya estaba generado para los socios alcanzados por las tarifas vigentes. No se crearon duplicados: ${result.omitidas} obligación(es) fueron omitida(s).`,
        )
      } else {
        setMessage(
          `Generación ${periodo}: ${result.creadas} obligación(es) creada(s), ${result.exentas} exenta(s), ${result.ajustadas} con importe especial, ${result.omitidas} omitida(s) por existir previamente, ${money(result.totalGenerado)} generados y ${money(result.creditoAplicado)} cubiertos automáticamente con saldos a favor.`,
        )
      }
    } catch (caught) {
      console.error('Error generating monthly obligations', caught)
      setError(devErrorMessage('No se pudieron generar las cuotas.', caught))
    } finally {
      setGenerating(false)
    }
  }

  async function previewBulkReconciliation() {
    if (!canGenerate || reconciliationBusy) return
    try {
      setReconciliationBusy('PREVIEW')
      setError('')
      setMessage('')
      setReconciliationPreview(await analizarConciliacionMasiva())
    } catch (caught) {
      console.error('Error previewing bulk reconciliation', caught)
      setError(devErrorMessage('No se pudo analizar la conciliación masiva.', caught))
    } finally {
      setReconciliationBusy(null)
    }
  }

  async function runBulkReconciliation() {
    if (!user || !canGenerate || !reconciliationPreview || reconciliationPreview.totalSocios === 0 || reconciliationBusy) return
    try {
      setReconciliationBusy('RUN')
      setError('')
      setMessage('')
      const result = await conciliarRegistrosPreviosMasivo(user.uid)
      setMessage(
        result.errores.length === 0
          ? `Conciliación masiva completada: ${result.sociosProcesados} socio(s), ${result.cantidadAplicaciones} aplicación(es) y ${money(result.importeConciliado)} conciliados.`
          : `Conciliación parcial: ${result.sociosProcesados} socio(s) procesados y ${result.errores.length} error(es). Revisá antes de reintentar.`,
      )
      setReconciliationPreview(await analizarConciliacionMasiva())
    } catch (caught) {
      console.error('Error running bulk reconciliation', caught)
      setError(devErrorMessage('No se pudo completar la conciliación masiva.', caught))
    } finally {
      setReconciliationBusy(null)
    }
  }

  const activeCount = tarifas.filter((tarifa) => tarifa.activa).length

  return (
    <section className="page-stack legacy-page-stack">
      <header className="legacy-page-header">
        <div>
          <p className="legacy-kicker">Gestión interna</p>
          <h2>Tarifas y generación de cuotas</h2>
          <p className="muted">Fase 2C de prueba: tarifas mensuales, excepciones y cambios históricos de categoría. No cargues datos reales todavía.</p>
        </div>
        <span className="status-badge neutral">Entorno de desarrollo</span>
      </header>

      {error && <div className="notice error">{error}</div>}
      {message && <div className="notice socios-success">{message}</div>}

      <div className="metric-grid legacy-metric-grid cuotas-metrics">
        <article className="metric-card legacy-metric-card">
          <span>Tarifas configuradas</span>
          <strong>{tarifas.length}</strong>
          <small>{activeCount} activa(s).</small>
        </article>
        <article className="metric-card legacy-metric-card">
          <span>Período sugerido</span>
          <strong className="cuotas-period">{currentPeriod}</strong>
          <small>Podés generar otro período manualmente.</small>
        </article>
        <article className="metric-card legacy-metric-card">
          <span>Modo</span>
          <strong className="cuotas-mode">Controlado</strong>
          <small>La generación se inicia desde este panel.</small>
        </article>
      </div>

      <div className="cuotas-grid">
        <form className="panel socios-form" onSubmit={addTarifa}>
          <div>
            <p className="legacy-kicker">Configuración</p>
            <h3>Nueva tarifa mensual</h3>
            <p className="muted">Una tarifa define cuánto corresponde cobrar a una categoría desde una vigencia determinada.</p>
          </div>
          <input name="concepto" placeholder="Concepto, ej. Cuota social" required disabled={!canConfigure} />
          <select name="categoria" defaultValue="SOLTERO" disabled={!canConfigure}>
            <option value="SOLTERO">Soltero / individual</option>
            <option value="CASADO">Casado</option>
            <option value="TODOS">Todas las categorías</option>
          </select>
          <input name="importe" type="number" min="1" placeholder="Importe mensual" required disabled={!canConfigure} />
          <label className="cuotas-field-label">
            Vigente desde
            <input name="vigenciaDesde" type="month" defaultValue={currentPeriod} required disabled={!canConfigure} />
          </label>
          <label className="cuotas-field-label">
            Vigente hasta (opcional)
            <input name="vigenciaHasta" type="month" disabled={!canConfigure} />
          </label>
          <label className="cuotas-field-label">
            Día de vencimiento
            <input name="diaVencimiento" type="number" min="1" max="31" defaultValue="10" required disabled={!canConfigure} />
          </label>
          <button className="button primary" type="submit" disabled={!canConfigure}>Guardar tarifa</button>
          {!canConfigure && <small className="muted">Solo ADMIN puede crear o modificar tarifas.</small>}
        </form>

        <form className="panel socios-form cuotas-generate-panel" onSubmit={generatePeriod}>
          <div>
            <p className="legacy-kicker">Proceso mensual</p>
            <h3>Generar obligaciones</h3>
            <p className="muted">Crea una obligación por cada socio activo al que le corresponda una tarifa vigente. Si repetís el proceso, los registros ya generados se omiten.</p>
          </div>
          <label className="cuotas-field-label">
            Período a generar
            <input name="periodo" type="month" defaultValue={currentPeriod} required disabled={!canGenerate || generating} />
          </label>
          <button className="button primary" type="submit" disabled={!canGenerate || generating || activeCount === 0}>
            {generating ? 'Generando…' : 'Generar cuotas del período'}
          </button>
          <small className="muted">Los saldos a favor existentes se aplican automáticamente al crear cada obligación.</small>
          <div className="cuotas-info-box">
            En el plan Spark no usamos todavía tareas programadas de servidor. Esta ejecución controlada evita costos y permite revisar el resultado antes de automatizarla en una fase posterior.
          </div>
        </form>
      </div>

      <article className="panel cuotas-table-panel">
        <div className="panel-heading-row">
          <div>
            <p className="legacy-kicker">Conciliación histórica</p>
            <h3>Aplicar saldos a favor pendientes</h3>
            <p className="muted">Primero analiza todas las cuentas sin escribir datos. Si detecta pagos disponibles y obligaciones pendientes del mismo socio, muestra el impacto antes de ejecutar.</p>
          </div>
          <span className="status-badge neutral">{reconciliationPreview ? `${reconciliationPreview.totalSocios} cuenta(s)` : 'Sin analizar'}</span>
        </div>

        <div className="cuotas-info-box">
          La conciliación no modifica pagos ni obligaciones originales: crea aplicaciones entre registros existentes y deja trazabilidad en <code>audit_log</code>.
        </div>

        {reconciliationPreview && (
          <div className="metric-grid legacy-metric-grid cuotas-metrics">
            <article className="metric-card legacy-metric-card">
              <span>Socios a conciliar</span>
              <strong>{reconciliationPreview.totalSocios}</strong>
              <small>Cuentas con deuda y saldo a favor compatibles.</small>
            </article>
            <article className="metric-card legacy-metric-card">
              <span>Aplicaciones previstas</span>
              <strong>{reconciliationPreview.totalAplicaciones}</strong>
              <small>Relaciones pago → obligación que se crearían.</small>
            </article>
            <article className="metric-card legacy-metric-card">
              <span>Importe conciliable</span>
              <strong>{money(reconciliationPreview.importeConciliable)}</strong>
              <small>Importe total que dejaría de figurar simultáneamente como deuda y crédito.</small>
            </article>
          </div>
        )}

        <div className="panel-heading-row">
          <button className="button secondary" type="button" onClick={() => void previewBulkReconciliation()} disabled={!canGenerate || Boolean(reconciliationBusy)}>
            {reconciliationBusy === 'PREVIEW' ? 'Analizando…' : reconciliationPreview ? 'Actualizar análisis' : 'Analizar conciliación'}
          </button>
          {reconciliationPreview && reconciliationPreview.totalSocios > 0 && (
            <button className="button primary" type="button" onClick={() => void runBulkReconciliation()} disabled={!canGenerate || Boolean(reconciliationBusy)}>
              {reconciliationBusy === 'RUN' ? 'Conciliando…' : `Conciliar ${reconciliationPreview.totalSocios} socio(s)`}
            </button>
          )}
        </div>
      </article>

      <article className="panel cuotas-table-panel">
        <div className="panel-heading-row">
          <div>
            <p className="legacy-kicker">Reglas vigentes</p>
            <h3>Tarifas configuradas</h3>
          </div>
          <span className="status-badge neutral">{tarifas.length}</span>
        </div>

        {tarifas.length === 0 ? (
          <p className="muted">Todavía no hay tarifas. Creá una tarifa ficticia para probar la generación mensual.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Concepto</th>
                  <th>Categoría</th>
                  <th>Importe</th>
                  <th>Vigencia</th>
                  <th>Vence</th>
                  <th>Estado</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {tarifas.map((tarifa) => (
                  <tr key={tarifa.id}>
                    <td>{tarifa.concepto}</td>
                    <td>{tarifa.categoria}</td>
                    <td>{money(tarifa.importe)}</td>
                    <td>{tarifa.vigenciaDesde} → {tarifa.vigenciaHasta || 'sin fin'}</td>
                    <td>día {tarifa.diaVencimiento}</td>
                    <td><span className={`status-badge ${tarifa.activa ? 'success' : 'neutral'}`}>{tarifa.activa ? 'ACTIVA' : 'INACTIVA'}</span></td>
                    <td>
                      {canConfigure && (
                        <button className="button secondary cuotas-inline-button" type="button" onClick={() => void toggleTarifa(tarifa)}>
                          {tarifa.activa ? 'Desactivar' : 'Activar'}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </article>
    </section>
  )
}
