import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useAuth, userRoleLabel, type UserRole } from '../auth/AuthProvider'
import { listUserAccessAccounts, updateUserAccess, type AdminUserAccess } from '../data/adminUsers'
import { listSocios, type Socio } from '../data/socios'
import './admin-users.css'

const roles: UserRole[] = ['SOCIO', 'TESORERIA', 'CONSULTA', 'ADMIN']

function providerLabel(providerIds: string[]) {
  if (providerIds.includes('google.com')) return 'Google'
  if (providerIds.includes('password')) return 'Correo y contraseña'
  return providerIds[0] || 'Firebase Auth'
}

function formatDate(value: string | null) {
  if (!value) return 'Sin registro'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('es-PY', { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}

function accessBadge(account: AdminUserAccess) {
  if (!account.linked) return { label: 'Sin vincular', className: 'neutral' }
  if (!account.active) return { label: 'Inactivo', className: 'danger' }
  return { label: 'Activo', className: 'success' }
}

export function AdminUsersPage() {
  const { user } = useAuth()
  const [accounts, setAccounts] = useState<AdminUserAccess[]>([])
  const [socios, setSocios] = useState<Socio[]>([])
  const [selectedUid, setSelectedUid] = useState('')
  const [search, setSearch] = useState('')
  const [role, setRole] = useState<UserRole>('SOCIO')
  const [socioId, setSocioId] = useState('')
  const [active, setActive] = useState(true)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  async function load() {
    setLoading(true)
    setError('')
    try {
      const [nextAccounts, nextSocios] = await Promise.all([
        listUserAccessAccounts(),
        listSocios(),
      ])
      setAccounts(nextAccounts)
      setSocios(nextSocios)
      setSelectedUid((current) => current && nextAccounts.some((item) => item.uid === current)
        ? current
        : nextAccounts[0]?.uid || '')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'No fue posible cargar los usuarios.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const selected = accounts.find((item) => item.uid === selectedUid) ?? null

  useEffect(() => {
    if (!selected) return
    setRole(selected.role ?? 'SOCIO')
    setSocioId(selected.socioId ?? '')
    setActive(selected.linked ? selected.active : true)
    setMessage('')
    setError('')
  }, [selectedUid, selected?.uid])

  const filtered = useMemo(() => {
    const term = search.trim().toLocaleLowerCase('es')
    if (!term) return accounts
    return accounts.filter((item) => (
      item.displayName.toLocaleLowerCase('es').includes(term)
      || (item.email ?? '').toLocaleLowerCase('es').includes(term)
      || item.uid.toLocaleLowerCase('es').includes(term)
    ))
  }, [accounts, search])

  const stats = useMemo(() => ({
    total: accounts.length,
    activos: accounts.filter((item) => item.linked && item.active).length,
    sinVincular: accounts.filter((item) => !item.linked).length,
  }), [accounts])

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selected || !user) return
    if (role === 'SOCIO' && !socioId) {
      setError('Seleccioná el socio que corresponde a esta cuenta.')
      return
    }

    setSaving(true)
    setMessage('')
    setError('')
    try {
      const updated = await updateUserAccess({
        uid: selected.uid,
        role,
        socioId: role === 'SOCIO' ? socioId : undefined,
        active,
      })
      setAccounts((items) => items.map((item) => item.uid === updated.uid ? updated : item))
      setMessage(`Acceso actualizado para ${updated.displayName}.`)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'No fue posible actualizar el acceso.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="page-stack legacy-page-stack admin-users-page">
      <header className="legacy-page-header">
        <div>
          <p className="legacy-kicker">Configuración</p>
          <h2>Usuarios y accesos</h2>
          <p className="muted">
            Vinculá cuentas autenticadas con socios, asigná roles y habilitá o deshabilitá el acceso sin editar Firebase manualmente.
          </p>
        </div>
        <button className="button secondary" type="button" onClick={() => void load()} disabled={loading}>
          {loading ? 'Actualizando…' : 'Actualizar'}
        </button>
      </header>

      {error && <div className="notice error">{error}</div>}
      {message && <div className="notice socios-success">{message}</div>}

      <div className="metric-grid legacy-metric-grid admin-users-kpis">
        <article className="metric-card legacy-metric-card"><span>Cuentas Auth</span><strong>{loading ? '—' : stats.total}</strong><small>Cuentas detectadas en Firebase Authentication.</small></article>
        <article className="metric-card legacy-metric-card"><span>Accesos activos</span><strong>{loading ? '—' : stats.activos}</strong><small>Perfiles habilitados para ingresar a CCNSA.</small></article>
        <article className="metric-card legacy-metric-card"><span>Sin vincular</span><strong>{loading ? '—' : stats.sinVincular}</strong><small>Se autenticaron, pero todavía no tienen perfil CCNSA.</small></article>
      </div>

      <div className="admin-users-layout">
        <aside className="panel legacy-panel admin-users-list-panel">
          <div className="admin-users-list-heading">
            <div>
              <p className="legacy-kicker">Firebase Authentication</p>
              <h3>Cuentas</h3>
            </div>
            <span className="status-badge neutral">{filtered.length}</span>
          </div>

          <input
            className="admin-users-search"
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar por nombre, correo o UID"
          />

          <div className="admin-users-list">
            {loading ? (
              <div className="screen-message">Cargando usuarios…</div>
            ) : filtered.length === 0 ? (
              <p className="muted">No se encontraron cuentas.</p>
            ) : filtered.map((account) => {
              const badge = accessBadge(account)
              return (
                <button
                  key={account.uid}
                  type="button"
                  className={`admin-user-row ${selectedUid === account.uid ? 'selected' : ''}`}
                  onClick={() => setSelectedUid(account.uid)}
                >
                  <span className="admin-user-row-copy">
                    <strong>{account.displayName}</strong>
                    <small>{account.email || 'Sin correo'}</small>
                  </span>
                  <span className={`status-badge ${badge.className}`}>{badge.label}</span>
                </button>
              )
            })}
          </div>
        </aside>

        <div className="admin-users-detail">
          {!selected ? (
            <article className="panel legacy-panel">
              <h3>Seleccioná una cuenta</h3>
              <p className="muted">Elegí una cuenta autenticada para configurar su acceso.</p>
            </article>
          ) : (
            <>
              <article className="panel legacy-panel admin-user-summary">
                <div>
                  <p className="legacy-kicker">Cuenta seleccionada</p>
                  <h3>{selected.displayName}</h3>
                  <p className="muted">{selected.email || 'Sin correo registrado'}</p>
                </div>
                <div className="admin-user-meta-grid">
                  <div><span>Proveedor</span><strong>{providerLabel(selected.providerIds)}</strong></div>
                  <div><span>Último ingreso</span><strong>{formatDate(selected.lastSignInAt)}</strong></div>
                  <div><span>Rol actual</span><strong>{selected.role ? userRoleLabel(selected.role) : 'Sin perfil'}</strong></div>
                  <div><span>UID</span><code title={selected.uid}>{selected.uid}</code></div>
                </div>
              </article>

              <form className="panel legacy-panel admin-user-editor" onSubmit={save}>
                <div>
                  <p className="legacy-kicker">Permisos</p>
                  <h3>Configurar acceso</h3>
                  <p className="muted">
                    Para una cuenta de socio, la vinculación determina qué estado de cuenta, actividades y notificaciones puede consultar.
                  </p>
                </div>

                <label>
                  Rol
                  <select value={role} onChange={(event) => setRole(event.target.value as UserRole)} disabled={saving}>
                    {roles.map((item) => <option key={item} value={item}>{userRoleLabel(item)}</option>)}
                  </select>
                </label>

                {role === 'SOCIO' && (
                  <label>
                    Socio vinculado
                    <select value={socioId} onChange={(event) => setSocioId(event.target.value)} required disabled={saving}>
                      <option value="">Seleccionar socio…</option>
                      {socios.map((socio) => (
                        <option key={socio.id} value={socio.id} disabled={socio.estado !== 'ACTIVO'}>
                          {socio.nombre}{socio.estado !== 'ACTIVO' ? ' · INACTIVO' : ''}
                        </option>
                      ))}
                    </select>
                  </label>
                )}

                <label className="admin-user-active-toggle">
                  <input type="checkbox" checked={active} onChange={(event) => setActive(event.target.checked)} disabled={saving} />
                  <span>
                    <strong>Acceso habilitado</strong>
                    <small>Si lo desactivás, la cuenta seguirá existiendo en Firebase Authentication pero no podrá entrar a CCNSA.</small>
                  </span>
                </label>

                {selected.uid === user.uid && (
                  <div className="notice warning">
                    Tu propia cuenta ADMIN está protegida: no podés desactivarla ni quitarle el rol Administrador desde esta pantalla.
                  </div>
                )}

                <div className="admin-user-editor-actions">
                  <button className="button primary" type="submit" disabled={saving || selected.authDisabled}>
                    {saving ? 'Guardando…' : selected.linked ? 'Guardar cambios' : 'Vincular y habilitar'}
                  </button>
                  {selected.authDisabled && <small className="muted">Esta cuenta está deshabilitada en Firebase Authentication.</small>}
                </div>
              </form>

              <article className="panel legacy-panel admin-users-help">
                <p className="legacy-kicker">Alta de un nuevo usuario</p>
                <h3>Flujo recomendado</h3>
                <p>
                  La persona inicia sesión una vez con Google. Aunque todavía no tenga perfil CCNSA, su cuenta queda registrada en Firebase Authentication.
                  Después aparece aquí y un ADMIN puede vincularla con el socio correspondiente y habilitarla.
                </p>
              </article>
            </>
          )}
        </div>
      </div>
    </section>
  )
}
