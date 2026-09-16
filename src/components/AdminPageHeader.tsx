import type { ReactNode } from 'react'

interface AdminPageHeaderProps {
  eyebrow: string
  title: string
  description: string
  actions?: ReactNode
  meta?: ReactNode
  className?: string
}

export function AdminPageHeader({
  eyebrow,
  title,
  description,
  actions,
  meta,
  className = '',
}: AdminPageHeaderProps) {
  return (
    <header className={`admin-page-header ${className}`.trim()}>
      <div className="admin-page-header-copy">
        <p className="legacy-kicker">{eyebrow}</p>
        <h2>{title}</h2>
        <p className="muted admin-page-description">{description}</p>
        {meta && <div className="admin-page-meta">{meta}</div>}
      </div>
      {actions && <div className="admin-page-actions">{actions}</div>}
    </header>
  )
}
