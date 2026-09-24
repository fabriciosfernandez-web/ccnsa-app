interface LoadingScreenProps {
  message?: string
}

export function LoadingScreen({ message = 'Preparando tu sesión…' }: LoadingScreenProps) {
  return (
    <div className="ccnsa-loading-screen" role="status" aria-live="polite">
      <div className="ccnsa-loading-mark" aria-hidden="true">
        <span className="ccnsa-loading-halo" />
        <img src="/ccnsa-logo.webp" alt="" />
      </div>
      <div className="ccnsa-loading-copy">
        <span>Centro Cultural</span>
        <strong>CCNSA</strong>
        <small>{message}</small>
      </div>
      <div className="ccnsa-loading-bar" aria-hidden="true">
        <span />
      </div>
    </div>
  )
}
