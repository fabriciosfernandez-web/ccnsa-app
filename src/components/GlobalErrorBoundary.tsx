import { Component, type ErrorInfo, type ReactNode } from 'react'
import { buildInfo, buildLabel } from '../buildInfo'

interface Props {
  children: ReactNode
}

interface State {
  failed: boolean
  source: 'react' | 'runtime' | 'promise' | null
}

export class GlobalErrorBoundary extends Component<Props, State> {
  state: State = { failed: false, source: null }

  private handleRuntimeError = () => {
    this.setState({ failed: true, source: 'runtime' })
  }

  private handleUnhandledRejection = () => {
    this.setState({ failed: true, source: 'promise' })
  }

  static getDerivedStateFromError(): State {
    return { failed: true, source: 'react' }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('CCNSA render error', {
      message: error.message,
      componentStack: info.componentStack,
      build: buildInfo.shortSha,
    })
  }

  componentDidMount() {
    window.addEventListener('error', this.handleRuntimeError)
    window.addEventListener('unhandledrejection', this.handleUnhandledRejection)
  }

  componentWillUnmount() {
    window.removeEventListener('error', this.handleRuntimeError)
    window.removeEventListener('unhandledrejection', this.handleUnhandledRejection)
  }

  private retry = () => {
    window.location.reload()
  }

  private goHome = () => {
    window.location.assign('/')
  }

  render() {
    if (!this.state.failed) return this.props.children

    return (
      <main className="ccnsa-error-screen">
        <section className="ccnsa-error-card" role="alert">
          <img src="/ccnsa-logo.webp" alt="CCNSA" className="ccnsa-error-logo" />
          <p className="ccnsa-error-kicker">Centro Cultural CCNSA</p>
          <h1>Ocurrió un inconveniente</h1>
          <p>
            No pudimos completar esta pantalla. Podés reintentar o volver al inicio.
            Si el problema continúa, el identificador de versión permite ubicar exactamente
            qué compilación estaba en uso.
          </p>
          <div className="ccnsa-error-actions">
            <button className="button primary" type="button" onClick={this.retry}>Reintentar</button>
            <button className="button secondary" type="button" onClick={this.goHome}>Volver al inicio</button>
          </div>
          <small className="ccnsa-error-reference">
            Referencia: {buildInfo.environment.toUpperCase()} · {buildLabel}
            {this.state.source ? ` · ${this.state.source}` : ''}
          </small>
        </section>
      </main>
    )
  }
}
