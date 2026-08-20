import { Link } from 'react-router-dom'

export function ForbiddenPage() {
  return (
    <div className="screen-message">
      <div className="panel compact-panel">
        <p className="eyebrow">Acceso restringido</p>
        <h2>No tenés permisos para ver esta sección.</h2>
        <p className="muted">El acceso se determina por el rol asociado a tu cuenta.</p>
        <Link className="button primary inline-button" to="/">
          Volver al inicio
        </Link>
      </div>
    </div>
  )
}
