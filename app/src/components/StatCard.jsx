export default function StatCard({ label, value, sub, accent }) {
  return (
    <div className="card flex flex-col gap-2">
      <div className="text-muted text-xs font-body uppercase tracking-widest">{label}</div>
      <div className={`font-display text-3xl font-semibold ${accent ? 'text-gold' : 'text-cream'}`}>
        {value ?? <span className="text-forest-light animate-pulse">—</span>}
      </div>
      {sub && <div className="text-muted text-xs font-mono">{sub}</div>}
    </div>
  )
}
