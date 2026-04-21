import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard,
  FlaskConical,
  Package,
  Leaf,
  Layers,
  Wrench,
  FolderOpen,
  FileText
} from 'lucide-react'

const nav = [
  { to: '/assortments', label: 'Ассортименты', icon: Layers },
  { to: '/dashboard',   label: 'Дашборд',      icon: LayoutDashboard },
  { to: '/recipes',     label: 'Рецепты',       icon: FlaskConical },
  { to: '/skus',        label: 'SKU',           icon: Package },
  { to: '/materials',   label: 'Сырьё',         icon: Leaf },
  { to: '/constructor', label: 'Конструктор',   icon: Wrench },
  { to: '/project',     label: 'Проект',        icon: FolderOpen },
  { to: '/pricelists',  label: 'Прайс лист',    icon: FileText },
]

export default function Layout({ children }) {
  return (
    <div className="flex h-screen overflow-hidden">
      <aside className="w-60 flex-shrink-0 bg-forest border-r border-forest-light/40 flex flex-col">
        <div className="px-6 py-6 border-b border-forest-light/40">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gold/20 flex items-center justify-center">
              <Leaf size={16} className="text-gold" />
            </div>
            <div>
              <div className="font-display font-semibold text-cream text-sm leading-tight">FTC</div>
              <div className="text-muted text-xs">Производство</div>
            </div>
          </div>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1">
          {nav.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-body transition-all ${
                  isActive
                    ? 'bg-gold/15 text-gold border border-gold/20'
                    : 'text-muted hover:text-cream hover:bg-forest-light/50'
                }`
              }
            >
              <Icon size={16} />
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="px-6 py-4 border-t border-forest-light/40">
          <div className="text-muted text-xs font-mono">v0.3.0</div>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto bg-forest-dark">
        {children}
      </main>
    </div>
  )
}
