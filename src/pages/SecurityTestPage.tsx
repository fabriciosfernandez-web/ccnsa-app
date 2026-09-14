import { useState, type FormEvent } from 'react'
import { doc, getDoc } from 'firebase/firestore'
import { useAuth } from '../auth/AuthProvider'
import { db } from '../lib/firebase'

type TestResult =
  | { kind: 'success'; text: string }
  | { kind: 'blocked'; text: string }
  | { kind: 'error'; text: string }
  | null

export function SecurityTestPage() {
  const { profile } = useAuth()
  const [targetId, setTargetId] = useState('')
  const [result, setResult] = useState<TestResult>(null)
  const [loading, setLoading] = useState(false)

  async function runTest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const id = targetId.trim()
    if (!id || !db) return

    setLoading(true)
    setResult(null)

    try {
      const snapshot = await getDoc(doc(db, 'socios', id))
      if (!snapshot.exists()) {
        setResult({ kind: 'error', text: 'La lectura fue permitida, pero ese documento no existe.' })
        return
      }

      setResult({
        kind: 'success',
        text: id === profile?.socioId
          ? 'Lectura permitida correctamente: este es tu propio registro de socio.'
          : 'ATENCIÓN: se pudo leer un socio distinto. La regla de seguridad debe revisarse.',
      })
    } catch (error) {
      const code = typeof error === 'object' && error && 'code' in error
        ? String((error as { code?: unknown }).code ?? '')
        : ''

      if (code.includes('permission-denied')) {
        setResult({
          kind: 'blocked',
          text: 'Bloqueo confirmado: Firestore denegó la lectura de ese socio. La separación de datos funciona a nivel de servidor.',
        })
      } else {
        setResult({ kind: 'error', text: `La prueba produjo un error inesperado${code ? ` (${code})` : ''}.` })
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <section className="page-stack legacy-page-stack">
      <header className="legacy-page-header">
        <div>
          <p className="legacy-kicker">Validación de seguridad</p>
          <h2>Prueba de aislamiento de datos</h2>
          <p className="muted">
            Esta pantalla es temporal. Sirve para comprobar que un usuario SOCIO no puede leer el documento de otro socio aunque conozca su ID.
          </p>
        </div>
        <span className="status-badge neutral">Entorno de desarrollo</span>
      </header>

      <article className="panel legacy-panel" style={{ maxWidth: 760 }}>
        <p className="legacy-kicker">Tu vínculo actual</p>
        <h3>Socio autorizado</h3>
        <p className="muted">Tu usuario está vinculado al siguiente documento:</p>
        <code style={{ display: 'block', marginBottom: 24, overflowWrap: 'anywhere' }}>
          socios/{profile?.socioId || 'sin-socioId'}
        </code>

        <form onSubmit={runTest} className="socios-form">
          <label htmlFor="security-target"><strong>ID del socio que querés intentar leer</strong></label>
          <input
            id="security-target"
            value={targetId}
            onChange={(event) => setTargetId(event.target.value)}
            placeholder="Pegá aquí el ID de otro documento en socios"
            required
          />
          <button className="button primary" type="submit" disabled={loading}>
            {loading ? 'Probando…' : 'Intentar lectura'}
          </button>
        </form>

        {result && (
          <div
            className={result.kind === 'error' || (result.kind === 'success' && targetId.trim() !== profile?.socioId)
              ? 'notice error'
              : 'notice socios-success'}
            style={{ marginTop: 20 }}
          >
            {result.text}
          </div>
        )}
      </article>
    </section>
  )
}
