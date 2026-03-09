export default function PageHeader({ title, subtitle, action }) {
  return (
    <div className="flex items-start justify-between mb-8">
      <div>
        <h1 className="font-display text-2xl font-semibold text-cream">{title}</h1>
        {subtitle && <p className="text-muted text-sm mt-1 font-body">{subtitle}</p>}
      </div>
      {action && <div>{action}</div>}
    </div>
  )
}
