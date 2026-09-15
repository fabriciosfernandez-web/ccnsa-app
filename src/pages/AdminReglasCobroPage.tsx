import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useAuth } from '../auth/AuthProvider'
import { listSocios, type Socio } from '../data/socios'
import {
  cambiarCategoriaSocio,
  createExcepcionCobro,
  createReglaCobroEspecial,
  generarAporteIngreso,
  generarCargosAnuales,
  listCambiosCategoria,
  listExcepcionesCobro,
  listReglasCobroEspecial,
  setExcepcionCobroActiva,
  setReglaCobroActiva,
  type CambioCategoria,
  type ExcepcionCobro,
  type ReglaCobroEspecial,
} from '../data/reglasCobro'
import './admin-cuotas.css'
import './admin-reglas-cobro.css'

const money = (value: number) => `Gs. ${Math.round(value).toLocaleString('es-PY')}`
const currentPeriod = new Date().toISOString().slice(0, 7)
const currentYear = new Date().getFullYear()

function devErrorMessage(prefix: string, error: unknown) {
  if (import.meta.env.DEV || import.meta.env.MODE === 'development') {
    if (error instanceof Error) return `${prefix} ${error.message}`
  }
  return prefix
}

export function AdminReglasCobroPage() {
  const { user, profile } = useAuth()
  const canConfigure = profile?.role === 'ADMIN'
  const canGenerate = profile?.role === 'ADMIN' || profile?.role === 'TESORERIA'
  const [socios, setSocios] = useState<Socio[]>([])
  const [reglas, setReglas] = useState<ReglaCobroEspecial[]>([])
  const [excepciones, setExcepciones] = useState<ExcepcionCobro[]>([])
  const [cambios, setCambios] = useState<CambioCategoria[]>([])
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function loadData() {
    try {
      const [sociosData, reglasData, excepcionesData, cambiosData] = await Promise.all([
        listSocios(),
        listReglasCobroEspecial(),
        listExcepcionesCobro(),
        listCambiosCategoria(),
      ])
      setSocios(sociosData)
      setReglas(reglasData)
      setExcepciones(excepcionesData)
      setCambios(cambiosData)
    } catch (caught) {
      setError(devErrorMessage('No fue posible cargar las reglas especiales.', caught))
    }
  }

  useEffect(() => { void loadData() }, [])

  const activeRules = reglas.filter((item) => item.activa).length
  const activeExceptions = excepciones.filter((item) => item.activa).length
  const sociosActivos = useMemo(() => socios.filter((item) => item.estado === 'ACTIVO'), [socios])

  async function addRule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!user || !canConfigure) return
    const formElement = event.currentTarget
    const form = new FormData(formElement)
    const tipo = form.get('tipo') === 'INGRESO' ? 'INGRESO' : 'ANUAL'
    const concepto = String(form.get('concepto') || '').trim()
    const importe = Number(form.get('importe') || 0)
    const vigenciaDesde = String(form.get('vigenciaDesde') || currentPeriod)
    const vigenciaHasta = String(form.get('vigenciaHasta') || '') || undefined
    const mesVencimiento = Number(form.get('mesVencimiento') || 1)
    const diaVencimiento = Number(form.get('diaVencimiento') || 10)
    if (!concepto || importe <= 0) return
    if (vigenciaHasta && vigenciaHasta < vigenciaDesde) {
      setError('La vigencia hasta no puede ser anterior a la vigencia desde.')
      return
    }

    try {
      setBusy(true)
      setError('')
      setMessage('')
      await createReglaCobroEspecial({
        concepto,
        tipo,
        categoria: form.get('categoria') === 'CASADO'
          ? 'CASADO'
          : form.get('categoria') === 'TODOS'
            ? 'TODOS'
            : 'SOLTERO',
        importe,
        vigenciaDesde,
        vigenciaHasta,
        mesVencimiento: tipo === 'ANUAL' ? mesVencimiento : undefined,
        diaVencimiento,
        activa: true,
      }, user.uid)
      formElement.reset()
      setMessage('Regla especial creada. Aún no se generaron obligaciones.')
      await loadData()
    } catch (caught) {
      setError(devErrorMessage('No se pudo crear la regla especial.', caught))
    } finally {
      setBusy(false)
    }
  }

  async function addException(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!user || !canConfigure) return
    const formElement = event.currentTarget
    const form = new FormData(formElement)
    const tipo = form.get('tipo') === 'IMPORTE_FIJO' ? 'IMPORTE_FIJO' : 'EXENTO'
    const socioId = String(form.get('socioId') || '')
    const periodoDesde = String(form.get('periodoDesde') || currentPeriod)
    const periodoHasta = String(form.get('periodoHasta') || '') || undefined
    const importe = tipo === 'IMPORTE_FIJO' ? Number(form.get('importe') || 0) : undefined
    const motivo = String(form.get('motivo') || '').trim()
    if (!socioId || !motivo || (tipo === 'IMPORTE_FIJO' && (!importe || importe <= 0))) return
    if (periodoHasta && periodoHasta < periodoDesde) {
      setError('El período hasta no puede ser anterior al período desde.')
      return
    }

    try {
      setBusy(true)
      setError('')
      setMessage('')
      const rawScope = String(form.get('ambito') || 'TODOS')
      const ambito = rawScope === 'MENSUAL' || rawScope === 'ANUAL' || rawScope === 'INGRESO' ? rawScope : 'TODOS'
      await createExcepcionCobro({
        socioId,
        tipo,
        ambito,
        periodoDesde,
        periodoHasta,
        importe,
        motivo,
        activa: true,
      }, user.uid)
      formElement.reset()
      setMessage('Excepción registrada. Se aplicará a obligaciones futuras dentro de su vigencia.')
      await loadData()
    } catch (caught) {
      setError(devErrorMessage('No se pudo registrar la excepción.', caught))
    } finally {
      setBusy(false)
    }
  }

  async function changeCategory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!user || !canConfigure) return
    const formElement = event.currentTarget
    const form = new FormData(formElement)
    const socio = socios.find((item) => item.id === String(form.get('socioId') || ''))
    if (!socio) return
    const categoria = form.get('categoriaNueva') === 'CASADO' ? 'CASADO' : 'SOLTERO'
    const vigenteDesde = String(form.get('vigenteDesde') || currentPeriod)

    try {
      setBusy(true)
      setError('')
      setMessage('')
      await cambiarCategoriaSocio(socio, categoria, vigenteDesde, user.uid)
      setMessage(`Categoría de ${socio.nombre} actualizada con vigencia ${vigenteDesde}.`)
      await loadData()
    } catch (caught) {
      setError(devErrorMessage('No se pudo cambiar la categoría.', caught))
    } finally {
      setBusy(false)
    }
  }

  async function generateAnnual(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!user || !canGenerate) return
    const year = Number(new FormData(event.currentTarget).get('year') || currentYear)
    try {
      setBusy(true)
      setError('')
      setMessage('')
      const result = await generarCargosAnuales(year, user.uid)
      if (result.creadas === 0 && result.omitidas > 0) {
        setMessage(`La anualidad ${year} ya estaba generada. ${result.omitidas} obligación(es) fueron omitida(s) sin duplicar registros.`)
      } else {
        setMessage(`Anualidad ${year}: ${result.creadas} creada(s), ${result.exentas} exenta(s), ${result.omitidas} omitida(s), ${money(result.totalGenerado)} generados y ${money(result.creditoAplicado)} aplicados desde saldos a favor.`)
      }
    } catch (caught) {
      setError(devErrorMessage('No se pudieron generar las anualidades.', caught))
    } finally {
      setBusy(false)
    }
  }

  async function generateEntry(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!user || !canGenerate) return
    const socio = socios.find((item) => item.id === String(new FormData(event.currentTarget).get('socioId') || ''))
    if (!socio) return
    try {
      setBusy(true)
      setError('')
      setMessage('')
      const result = await generarAporteIngreso(socio, user.uid)
      if (result.creadas === 0 && result.omitidas > 0) {
        setMessage(`El aporte de ingreso de ${socio.nombre} ya estaba generado. No se creó un duplicado.`)
      } else {
        setMessage(`Aporte de ingreso de ${socio.nombre}: ${result.creadas} obligación(es) creada(s), ${result.exentas} exenta(s), ${money(result.totalGenerado)} generados.`)
      }
    } catch (caught) {
      setError(devErrorMessage('No se pudo generar el aporte de ingreso.', caught))
    } finally {
      setBusy(false)
    }
  }

  async function toggleRule(rule: ReglaCobroEspecial) {
    if (!user || !canConfigure) return
    try {
      await setReglaCobroActiva(rule.id, !rule.activa, user.uid)
      await loadData()
    } catch (caught) {
      setError(devErrorMessage('No se pudo actualizar la regla.', caught))
    }
  }

  async function toggleException(exception: ExcepcionCobro) {
    if (!user || !canConfigure) return
    try {
      await setExcepcionCobroActiva(exception.id, !exception.activa, user.uid)
      await loadData()
    } catch (caught) {
      setError(devErrorMessage('No se pudo actualizar la excepción.', caught))
    }
  }

  return (
    <section className="page-stack legacy-page-stack">
      <header className="legacy-page-header">
        <div>
          <p className="legacy-kicker">Gestión interna</p>
          <h2>Reglas especiales y excepciones</h2>
          <p className="muted">Fase 2C de prueba: anualidad, aporte de ingreso, excepciones individuales y cambios de categoría con vigencia. No cargues datos reales todavía.</p>
        </div>
        <span className="status-badge neutral">Entorno de desarrollo</span>
      </header>

      {error && <div className="notice error">{error}</div>}
      {message && <div className="notice socios-success">{message}</div>}

      <div className="metric-grid legacy-metric-grid reglas-metrics">
        <article className="metric-card legacy-metric-card"><span>Reglas especiales</span><strong>{reglas.length}</strong><small>{activeRules} activa(s).</small></article>
        <article className="metric-card legacy-metric-card"><span>Excepciones</span><strong>{excepciones.length}</strong><small>{activeExceptions} activa(s).</small></article>
        <article className="metric-card legacy-metric-card"><span>Cambios de categoría</span><strong>{cambios.length}</strong><small>Conservan vigencia histórica.</small></article>
      </div>

      <div className="reglas-grid">
        <form className="panel socios-form" onSubmit={addRule}>
          <div><p className="legacy-kicker">Conceptos no mensuales</p><h3>Nueva regla especial</h3><p className="muted">Configura anualidades o aportes de ingreso sin mezclarlos con la cuota mensual.</p></div>
          <input name="concepto" placeholder="Concepto, ej. Membresía anual" required disabled={!canConfigure || busy} />
          <select name="tipo" defaultValue="ANUAL" disabled={!canConfigure || busy}><option value="ANUAL">Anualidad / membresía</option><option value="INGRESO">Aporte de ingreso</option></select>
          <select name="categoria" defaultValue="TODOS" disabled={!canConfigure || busy}><option value="TODOS">Todas las categorías</option><option value="SOLTERO">Soltero / individual</option><option value="CASADO">Casado</option></select>
          <input name="importe" type="number" min="1" placeholder="Importe" required disabled={!canConfigure || busy} />
          <label className="cuotas-field-label">Vigente desde<input name="vigenciaDesde" type="month" defaultValue={currentPeriod} required disabled={!canConfigure || busy} /></label>
          <label className="cuotas-field-label">Vigente hasta (opcional)<input name="vigenciaHasta" type="month" disabled={!canConfigure || busy} /></label>
          <div className="reglas-inline-fields"><label className="cuotas-field-label">Mes vencimiento anual<input name="mesVencimiento" type="number" min="1" max="12" defaultValue="1" disabled={!canConfigure || busy} /></label><label className="cuotas-field-label">Día<input name="diaVencimiento" type="number" min="1" max="31" defaultValue="10" disabled={!canConfigure || busy} /></label></div>
          <button className="button primary" type="submit" disabled={!canConfigure || busy}>Guardar regla</button>
        </form>

        <div className="panel socios-form">
          <div><p className="legacy-kicker">Generación controlada</p><h3>Cargos especiales</h3><p className="muted">La anualidad se genera masivamente; el aporte de ingreso se genera por socio y es idempotente.</p></div>
          <form className="reglas-inner-form" onSubmit={generateAnnual}>
            <label className="cuotas-field-label">Año de anualidad<input name="year" type="number" min="2020" max="2100" defaultValue={currentYear} disabled={!canGenerate || busy} /></label>
            <button className="button primary" type="submit" disabled={!canGenerate || busy || reglas.filter((item) => item.activa && item.tipo === 'ANUAL').length === 0}>Generar anualidad</button>
          </form>
          <form className="reglas-inner-form" onSubmit={generateEntry}>
            <label className="cuotas-field-label">Socio<select name="socioId" disabled={!canGenerate || busy}>{sociosActivos.map((socio) => <option key={socio.id} value={socio.id}>{socio.nombre}</option>)}</select></label>
            <button className="button primary" type="submit" disabled={!canGenerate || busy || sociosActivos.length === 0 || reglas.filter((item) => item.activa && item.tipo === 'INGRESO').length === 0}>Generar aporte de ingreso</button>
          </form>
          <div className="cuotas-info-box">La estructura actual de la planilla distingue aporte mensual, membresía y aporte de ingreso. Esta fase los modela como obligaciones separadas y auditables, sin migrar aún datos productivos.</div>
        </div>
      </div>

      <div className="reglas-grid">
        <form className="panel socios-form" onSubmit={addException}>
          <div><p className="legacy-kicker">Excepciones individuales</p><h3>Exoneración o importe especial</h3><p className="muted">Afecta únicamente obligaciones que se generen después de registrar la excepción.</p></div>
          <select name="socioId" disabled={!canConfigure || busy}>{sociosActivos.map((socio) => <option key={socio.id} value={socio.id}>{socio.nombre}</option>)}</select>
          <select name="tipo" defaultValue="EXENTO" disabled={!canConfigure || busy}><option value="EXENTO">Exonerar</option><option value="IMPORTE_FIJO">Importe fijo especial</option></select>
          <select name="ambito" defaultValue="MENSUAL" disabled={!canConfigure || busy}><option value="MENSUAL">Cuota mensual</option><option value="ANUAL">Anualidad</option><option value="INGRESO">Aporte de ingreso</option><option value="TODOS">Todos los conceptos automáticos</option></select>
          <input name="importe" type="number" min="1" placeholder="Importe fijo (solo si corresponde)" disabled={!canConfigure || busy} />
          <label className="cuotas-field-label">Desde<input name="periodoDesde" type="month" defaultValue={currentPeriod} required disabled={!canConfigure || busy} /></label>
          <label className="cuotas-field-label">Hasta (opcional)<input name="periodoHasta" type="month" disabled={!canConfigure || busy} /></label>
          <input name="motivo" placeholder="Motivo / respaldo" required disabled={!canConfigure || busy} />
          <button className="button primary" type="submit" disabled={!canConfigure || busy}>Guardar excepción</button>
        </form>

        <form className="panel socios-form" onSubmit={changeCategory}>
          <div><p className="legacy-kicker">Historia del socio</p><h3>Cambio de categoría</h3><p className="muted">La categoría actual cambia, pero las generaciones de períodos anteriores conservan la categoría que correspondía en ese momento.</p></div>
          <select name="socioId" disabled={!canConfigure || busy}>{sociosActivos.map((socio) => <option key={socio.id} value={socio.id}>{socio.nombre} — {socio.categoria}</option>)}</select>
          <select name="categoriaNueva" defaultValue="CASADO" disabled={!canConfigure || busy}><option value="SOLTERO">Soltero / individual</option><option value="CASADO">Casado</option></select>
          <label className="cuotas-field-label">Vigente desde<input name="vigenteDesde" type="month" defaultValue={currentPeriod} required disabled={!canConfigure || busy} /></label>
          <button className="button primary" type="submit" disabled={!canConfigure || busy}>Registrar cambio</button>
          <div className="cuotas-info-box">El cambio queda registrado en <code>categoria_historial</code>. La generación mensual consulta esa historia para determinar qué tarifa correspondía en cada período.</div>
        </form>
      </div>

      <article className="panel cuotas-table-panel">
        <div className="panel-heading-row"><div><p className="legacy-kicker">Configuración</p><h3>Reglas especiales</h3></div><span className="status-badge neutral">{reglas.length}</span></div>
        {reglas.length === 0 ? <p className="muted">Todavía no hay reglas especiales.</p> : <div className="table-wrap"><table><thead><tr><th>Concepto</th><th>Tipo</th><th>Categoría</th><th>Importe</th><th>Vigencia</th><th>Estado</th><th /></tr></thead><tbody>{reglas.map((rule) => <tr key={rule.id}><td>{rule.concepto}</td><td>{rule.tipo}</td><td>{rule.categoria}</td><td>{money(rule.importe)}</td><td>{rule.vigenciaDesde} → {rule.vigenciaHasta || 'sin fin'}</td><td><span className={`status-badge ${rule.activa ? 'success' : 'neutral'}`}>{rule.activa ? 'ACTIVA' : 'INACTIVA'}</span></td><td>{canConfigure && <button className="button secondary cuotas-inline-button" type="button" onClick={() => void toggleRule(rule)}>{rule.activa ? 'Desactivar' : 'Activar'}</button>}</td></tr>)}</tbody></table></div>}
      </article>

      <article className="panel cuotas-table-panel">
        <div className="panel-heading-row"><div><p className="legacy-kicker">Casos particulares</p><h3>Excepciones configuradas</h3></div><span className="status-badge neutral">{excepciones.length}</span></div>
        {excepciones.length === 0 ? <p className="muted">No hay excepciones individuales.</p> : <div className="table-wrap"><table><thead><tr><th>Socio</th><th>Tipo</th><th>Ámbito</th><th>Vigencia</th><th>Motivo</th><th>Estado</th><th /></tr></thead><tbody>{excepciones.map((exception) => <tr key={exception.id}><td>{socios.find((item) => item.id === exception.socioId)?.nombre || exception.socioId}</td><td>{exception.tipo === 'IMPORTE_FIJO' ? `FIJO ${money(exception.importe || 0)}` : 'EXENTO'}</td><td>{exception.ambito}</td><td>{exception.periodoDesde} → {exception.periodoHasta || 'sin fin'}</td><td>{exception.motivo}</td><td><span className={`status-badge ${exception.activa ? 'success' : 'neutral'}`}>{exception.activa ? 'ACTIVA' : 'INACTIVA'}</span></td><td>{canConfigure && <button className="button secondary cuotas-inline-button" type="button" onClick={() => void toggleException(exception)}>{exception.activa ? 'Desactivar' : 'Activar'}</button>}</td></tr>)}</tbody></table></div>}
      </article>
    </section>
  )
}
