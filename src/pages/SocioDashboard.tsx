import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../auth/AuthProvider'
import { loadEstadoCuenta, type EstadoCuenta, type ObligacionCalculada } from '../data/socios'
import { downloadEstadoCuentaPdf } from '../lib/estadoCuentaPdf'
import './socio-dashboard.css'

const money = (value: number) => `Gs. ${Math.round(value).toLocaleString('es-PY')}`
const currentYear = new Date().getFullYear()

type AccountTab = 'RESUMEN' | 'OBLIGACIONES' | 'PAGOS'

function yearFromPeriod(periodo: string) {
  const match = periodo.match(/^(\d{4})/)
  return match ? Number(match[1]) : undefined
}

function statusClass(status: string) {
  if (status === 'PAGADA') return 'success'
  if (status === 'EXENTA') return 'socio-status-exempt'
  if (status === 'PARCIAL' || status === 'PENDIENTE') return 'socio-status-warning'
  if (status === 'ANULADA') return 'danger'
  return 'neutral'
}

function obligationKind(item: ObligacionCalculada) {
  const concept = item.concepto.toLocaleUpperCase('es')
  const year = yearFromPeriod(item.periodo)
  if (year && year < currentYear) return 'Deuda anterior'
  if (/MEMBRES|ANUAL/.test(concept)) return 'Membresía anual'
  if (/INGRESO|ADMISI/.test(concept)) return 'Aporte de ingreso'
  if (/CUOTA|MENSUAL/.test(concept) || /^\d{4}-\d{2}$/.test(item.periodo)) return 'Cuota mensual'
  return 'Otro cargo'
}

function formatPeriod(periodo: string) {
  if (!/^\d{4}-\d{2}$/.test(periodo)) return periodo || '—'
  const [year, month] = periodo.split('-').map(Number)
  return new Intl.DateTimeFormat('es-PY', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(year, month - 1, 1)))
}

export function SocioDashboard() {
  const { profile } = useAuth()
  const [account, setAccount] = useState<EstadoCuenta | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [activeTab, setActiveTab] = useState<AccountTab>('RESUMEN')

  useEffect(() => {
    async function loadAccount() {
      if (!profile?.socioId) {
        setError('Tu perfil todavía no está vinculado a una ficha de socio.')
        setLoading(false)
        return
      }

      try {
        setError('')
        setAccount(await loadEstadoCuenta(profile.socioId))
      } catch {
        setError('No fue posible cargar tu estado de cuenta.')
      } finally {
        setLoading(false)
      }
    }

    void loadAccount()
  }, [profile?.socioId])

  const ultimoPago = account?.pagos.find((item) => item.estado !== 'ANULADO')
  const saldoFavor = account?.saldoFavor ?? 0
  const saldoNeto = account?.saldoNeto ?? 0
  const badgeText = saldoNeto > 0 ? 'Con saldo pendiente' : saldoNeto < 0 ? 'Saldo a favor' : 'Al día'
  const badgeClass = saldoNeto <= 0 ? 'success' : 'socio-status-warning'

  const deudaActual = useMemo(
    () => account?.obligaciones
      .filter((item) => yearFromPeriod(item.periodo) === currentYear)
      .reduce((sum, item) => sum + item.saldoPendiente, 0) ?? 0,
    [account],
  )

  const deudaAnterior = useMemo(
    () => account?.obligaciones
      .filter((item) => {
        const year = yearFromPeriod(item.periodo)
        return year !== undefined && year < currentYear
      })
      .reduce((sum, item) => sum + item.saldoPendiente, 0) ?? 0,
    [account],
  )

  const currentObligations = useMemo(
    () => account?.obligaciones.filter((item) => yearFromPeriod(item.periodo) === currentYear) ?? [],
    [account],
  )

  const specialObligations = useMemo(
    () => currentObligations.filter((item) => obligationKind(item) !== 'Cuota mensual'),
    [currentObligations],
  )

  const monthlyObligations = useMemo(
    () => currentObligations.filter((item) => obligationKind(item) === 'Cuota mensual'),
    [currentObligations],
  )

  const obligationById = useMemo(
    () => new Map(account?.obligaciones.map((item) => [item.id, item]) ?? []),
    [account],
  )

  const applicationsByPayment = useMemo(() => {
    const result = new Map<string, string[]>()
    for (const application of account?.aplicaciones ?? []) {
      const obligation = obligationById.get(application.obligacionId)
      if (!obligation) continue
      const target = `${obligation.concepto || 'Obligación'} · ${formatPeriod(obligation.periodo)} · ${money(application.importe)}`
      result.set(application.pagoId, [...(result.get(application.pagoId) ?? []), target])
    }
    return result
  }, [account, obligationById])

  function downloadPdf() {
    if (!account || !profile) return
    void downloadEstadoCuentaPdf({
      socioNombre: profile.displayName,
      account,
    })
  }

  return (
    <section className="page-stack legacy-page-stack socio-portal">
      <article className="socio-hero">
        <div className="socio-hero-copy">
          <p className="socio-hero-kicker">Portal del socio · CCNSA</p>
          <h2>Hola, {profile?.displayName}</h2>
          <p>Tu estado de cuenta reúne cuotas, cargos especiales, pagos, aplicaciones y saldos disponibles en un único lugar.</p>
        </div>
        <div className="socio-hero-balance">
          <span>Situación de cuenta</span>
          <strong>{saldoNeto > 0 ? money(saldoNeto) : saldoNeto < 0 ? money(Math.abs(saldoNeto)) : money(0)}</strong>
          <small>{saldoNeto > 0 ? 'Saldo neto pendiente' : saldoNeto < 0 ? 'Saldo neto a tu favor' : 'No registrás saldo pendiente'}</small>
          <span className={`status-badge ${badgeClass}`}>{badgeText}</span>
        </div>
      </article>

      {error && <div className="notice error">{error}</div>}

      <div className="socio-toolbar">
        <div className="socio-tabs" role="tablist" aria-label="Secciones del estado de cuenta">
          <button className={`socio-tab ${activeTab === 'RESUMEN' ? 'active' : ''}`} type="button" role="tab" aria-selected={activeTab === 'RESUMEN'} onClick={() => setActiveTab('RESUMEN')}>Resumen</button>
          <button className={`socio-tab ${activeTab === 'OBLIGACIONES' ? 'active' : ''}`} type="button" role="tab" aria-selected={activeTab === 'OBLIGACIONES'} onClick={() => setActiveTab('OBLIGACIONES')}>Obligaciones</button>
          <button className={`socio-tab ${activeTab === 'PAGOS' ? 'active' : ''}`} type="button" role="tab" aria-selected={activeTab === 'PAGOS'} onClick={() => setActiveTab('PAGOS')}>Pagos</button>
        </div>
        <button className="button primary" type="button" onClick={downloadPdf} disabled={loading || !account}>
          Descargar estado PDF
        </button>
      </div>

      {loading ? (
        <div className="screen-message">Cargando estado de cuenta…</div>
      ) : account && (
        <>
          {activeTab === 'RESUMEN' && (
            <>
              <div className="metric-grid legacy-metric-grid socio-metrics">
                <article className="metric-card legacy-metric-card">
                  <span>Pendiente {currentYear}</span>
                  <strong>{money(deudaActual)}</strong>
                  <small>Cuotas y cargos vigentes del ejercicio.</small>
                </article>
                <article className="metric-card legacy-metric-card">
                  <span>Deuda anterior</span>
                  <strong>{money(deudaAnterior)}</strong>
                  <small>Saldo pendiente de ejercicios anteriores.</small>
                </article>
                <article className="metric-card legacy-metric-card">
                  <span>Saldo a favor</span>
                  <strong>{money(saldoFavor)}</strong>
                  <small>Crédito aún no aplicado a obligaciones.</small>
                </article>
                <article className="metric-card legacy-metric-card">
                  <span>Último pago</span>
                  <strong>{ultimoPago ? money(ultimoPago.importe) : '—'}</strong>
                  <small>{ultimoPago ? `${ultimoPago.fecha}${ultimoPago.referencia ? ` · Ref. ${ultimoPago.referencia}` : ''}` : 'Sin pagos registrados.'}</small>
                </article>
              </div>

              <div className="socio-summary-grid">
                <article className="panel legacy-panel">
                  <div className="socio-section-heading">
                    <div>
                      <p className="legacy-kicker">Ejercicio {currentYear}</p>
                      <h3>Situación de obligaciones</h3>
                      <p className="muted">Cuotas mensuales, membresía, aporte de ingreso y otras obligaciones se muestran sin mezclar sus estados.</p>
                    </div>
                    <span className="status-badge neutral">{currentObligations.length} registro(s)</span>
                  </div>

                  <div className="socio-account-list">
                    <div className="socio-account-row">
                      <div><strong>Cuotas mensuales</strong><small>{monthlyObligations.filter((item) => item.estadoCalculado === 'PAGADA').length} pagada(s) · {monthlyObligations.filter((item) => item.estadoCalculado === 'EXENTA').length} exenta(s)</small></div>
                      <div className="socio-account-amount"><strong>{money(monthlyObligations.reduce((sum, item) => sum + item.saldoPendiente, 0))}</strong><small>pendiente</small></div>
                    </div>
                    {specialObligations.map((item) => (
                      <div className="socio-account-row" key={item.id}>
                        <div><strong>{item.concepto || obligationKind(item)}</strong><small>{obligationKind(item)} · {formatPeriod(item.periodo)} · {item.estadoCalculado}</small></div>
                        <div className="socio-account-amount"><strong>{money(item.saldoPendiente)}</strong><small>{item.estadoCalculado === 'EXENTA' ? 'exonerado' : 'pendiente'}</small></div>
                      </div>
                    ))}
                    {deudaAnterior > 0 && (
                      <div className="socio-account-row">
                        <div><strong>Saldo de ejercicios anteriores</strong><small>Se mantiene separado del ejercicio {currentYear} para facilitar la conciliación.</small></div>
                        <div className="socio-account-amount"><strong>{money(deudaAnterior)}</strong><small>pendiente</small></div>
                      </div>
                    )}
                  </div>
                </article>

                <article className="panel legacy-panel socio-recent-card">
                  <p className="legacy-kicker">Últimos movimientos</p>
                  <h3>Pagos recientes</h3>
                  <div className="socio-payment-list">
                    {account.pagos.filter((item) => item.estado !== 'ANULADO').slice(0, 3).map((item) => (
                      <div className="socio-payment-row" key={item.id}>
                        <div><strong>{item.fecha || 'Sin fecha'}</strong><small>{item.medioPago || 'Medio no informado'}{item.referencia ? ` · Ref. ${item.referencia}` : ''}</small></div>
                        <div className="socio-payment-amount"><strong>{money(item.importe)}</strong><small>{item.saldoDisponible > 0 ? `${money(item.saldoDisponible)} a favor` : 'aplicado'}</small></div>
                      </div>
                    ))}
                    {account.pagos.filter((item) => item.estado !== 'ANULADO').length === 0 && <p className="muted">Sin pagos registrados.</p>}
                  </div>
                  <button className="button secondary inline-button" type="button" onClick={() => setActiveTab('PAGOS')}>Ver todos los pagos</button>
                </article>
              </div>
            </>
          )}

          {activeTab === 'OBLIGACIONES' && (
            <article className="panel legacy-panel">
              <div className="socio-section-heading">
                <div><p className="legacy-kicker">Estado de cuenta</p><h3>Detalle de obligaciones</h3><p className="muted">Las obligaciones exentas o anuladas se conservan visibles, pero no integran el saldo pendiente.</p></div>
                <span className="status-badge neutral">{account.obligaciones.length} registro(s)</span>
              </div>
              <div className="legacy-table-wrap">
                <table className="legacy-table socio-table">
                  <thead><tr><th>Periodo</th><th>Concepto</th><th>Importe</th><th>Aplicado</th><th>Pendiente</th><th>Estado</th></tr></thead>
                  <tbody>
                    {account.obligaciones.length === 0 ? (
                      <tr><td colSpan={6}>Sin obligaciones registradas.</td></tr>
                    ) : account.obligaciones.map((item) => (
                      <tr key={item.id}>
                        <td>{formatPeriod(item.periodo)}</td>
                        <td className="socio-obligation-concept"><strong>{item.concepto || 'Obligación'}</strong><small>{obligationKind(item)}{item.fechaVencimiento ? ` · vence ${item.fechaVencimiento}` : ''}</small></td>
                        <td>{money(item.importe)}</td>
                        <td>{money(item.importeAplicado)}</td>
                        <td>{money(item.saldoPendiente)}</td>
                        <td><span className={`status-badge ${statusClass(item.estadoCalculado)}`}>{item.estadoCalculado}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </article>
          )}

          {activeTab === 'PAGOS' && (
            <article className="panel legacy-panel">
              <div className="socio-section-heading">
                <div><p className="legacy-kicker">Movimientos</p><h3>Historial de pagos y aplicaciones</h3><p className="muted">Cada pago muestra cuánto fue aplicado, cuánto permanece como crédito y su referencia o comprobante cuando fue informado.</p></div>
                <span className="status-badge neutral">{account.pagos.length} registro(s)</span>
              </div>
              <div className="legacy-table-wrap">
                <table className="legacy-table socio-table">
                  <thead><tr><th>Fecha</th><th>Pago</th><th>Aplicado</th><th>Saldo disponible</th><th>Aplicado a</th><th>Referencia</th><th>Estado</th></tr></thead>
                  <tbody>
                    {account.pagos.length === 0 ? (
                      <tr><td colSpan={7}>Sin pagos registrados.</td></tr>
                    ) : account.pagos.map((item) => {
                      const destinations = applicationsByPayment.get(item.id) ?? []
                      return (
                        <tr key={item.id}>
                          <td>{item.fecha || '—'}</td>
                          <td className="socio-payment-detail"><strong>{money(item.importe)}</strong><small>{item.medioPago || 'Medio no informado'}</small></td>
                          <td>{money(item.importeAplicado)}</td>
                          <td>{money(item.saldoDisponible)}</td>
                          <td className="socio-payment-detail">{destinations.length === 0 ? <span className="socio-zero-note">Sin aplicación: saldo a favor</span> : <>{destinations.slice(0, 2).map((destination) => <small key={destination}>{destination}</small>)}{destinations.length > 2 && <small>+ {destinations.length - 2} aplicación(es)</small>}</>}</td>
                          <td>{item.referencia ? <span className="socio-reference">{item.referencia}</span> : '—'}</td>
                          <td><span className={`status-badge ${item.estado === 'ANULADO' ? 'danger' : 'success'}`}>{item.estado}</span></td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </article>
          )}
        </>
      )}
    </section>
  )
}
